import crypto from "crypto";
import { sendChatMessage } from "../lib/chatProviders.mjs";
import {
  getConfiguredChatProvider,
  isChatProviderReady,
  ROVO_PROVIDER,
} from "../lib/llmClient.mjs";

const DEFAULT_SESSION_ID = "default";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const pendingOAuthStates = new Map();

const parseOAuthTokens = (raw) => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
};

const getOAuthConfig = () => {
  const clientId = String(process.env.ATLASSIAN_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.ATLASSIAN_OAUTH_CLIENT_SECRET || "").trim();
  const redirectUri =
    String(process.env.CHAT_OAUTH_REDIRECT_URI || "").trim() ||
    `http://localhost:${process.env.API_PORT || 8787}/api/chat/auth/callback`;

  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret) };
};

export const registerChatRoutes = (app, { db, jiraRequest }) => {
  const getSessionStmt = db.prepare("SELECT * FROM chat_sessions WHERE id = ?");
  const getCustomInstructionsStmt = db.prepare(
    "SELECT value FROM app_settings WHERE key = 'chat_custom_instructions'"
  );
  const upsertSessionStmt = db.prepare(`
    INSERT INTO chat_sessions (id, provider, oauth_tokens, updated_at)
    VALUES (@id, @provider, @oauthTokens, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      oauth_tokens = excluded.oauth_tokens,
      updated_at = CURRENT_TIMESTAMP
  `);
  const deleteSessionStmt = db.prepare("DELETE FROM chat_sessions WHERE id = ?");

  const readSession = () => {
    const row = getSessionStmt.get(DEFAULT_SESSION_ID);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      provider: String(row.provider || "").trim(),
      oauthTokens: parseOAuthTokens(row.oauth_tokens),
      updatedAt: row.updated_at,
    };
  };

  app.get("/api/chat/status", (_req, res) => {
    const provider = getConfiguredChatProvider();
    const oauth = getOAuthConfig();
    const session = readSession();
    const oauthConnected = Boolean(session?.oauthTokens?.access_token || session?.oauthTokens?.accessToken);
    const ready = isChatProviderReady(provider, { oauthConnected });

    return res.json({
      provider,
      ready,
      oauthConfigured: provider === ROVO_PROVIDER ? oauth.configured : false,
      oauthConnected: provider === ROVO_PROVIDER ? oauthConnected : false,
    });
  });

  app.get("/api/chat/auth/start", (req, res) => {
    const oauth = getOAuthConfig();
    if (!oauth.configured) {
      return res.status(400).json({
        error: "Atlassian OAuth is not configured on the proxy host",
        hint: "Set ATLASSIAN_OAUTH_CLIENT_ID and ATLASSIAN_OAUTH_CLIENT_SECRET in .env",
      });
    }

    const state = crypto.randomBytes(16).toString("hex");
    pendingOAuthStates.set(state, Date.now() + OAUTH_STATE_TTL_MS);

    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: oauth.clientId,
      scope: "read:jira-work write:jira-work offline_access search:rovo:mcp read:me",
      redirect_uri: oauth.redirectUri,
      state,
      response_type: "code",
      prompt: "consent",
    });

    const authorizeUrl = `https://auth.atlassian.com/authorize?${params.toString()}`;
    const wantsJson = String(req.query.format || "").toLowerCase() === "json";

    if (wantsJson) {
      return res.json({ authorizeUrl, state });
    }

    return res.redirect(authorizeUrl);
  });

  app.get("/api/chat/auth/callback", async (req, res) => {
    const oauth = getOAuthConfig();
    const code = String(req.query.code || "").trim();
    const state = String(req.query.state || "").trim();
    const error = String(req.query.error || "").trim();

    if (error) {
      return res.status(400).send(`Atlassian sign-in failed: ${error}`);
    }

    const expiresAt = pendingOAuthStates.get(state);
    pendingOAuthStates.delete(state);
    if (!expiresAt || Date.now() > expiresAt) {
      return res.status(400).send("Invalid or expired OAuth state. Try signing in again.");
    }

    if (!code || !oauth.configured) {
      return res.status(400).send("Missing OAuth code or OAuth is not configured.");
    }

    try {
      const tokenResponse = await fetch("https://auth.atlassian.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: oauth.clientId,
          client_secret: oauth.clientSecret,
          code,
          redirect_uri: oauth.redirectUri,
        }),
      });

      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok) {
        return res
          .status(tokenResponse.status)
          .send(tokens?.error_description || tokens?.message || "Token exchange failed");
      }

      upsertSessionStmt.run({
        id: DEFAULT_SESSION_ID,
        provider: ROVO_PROVIDER,
        oauthTokens: JSON.stringify(tokens),
      });

      return res.send(
        "<html><body><p>Signed in with Atlassian. You can close this window and return to Chat.</p></body></html>"
      );
    } catch (callbackError) {
      return res.status(500).send(
        callbackError instanceof Error ? callbackError.message : "OAuth callback failed"
      );
    }
  });

  app.post("/api/chat/auth/signout", (_req, res) => {
    deleteSessionStmt.run(DEFAULT_SESSION_ID);
    return res.json({ ok: true });
  });

  app.post("/api/chat", async (req, res) => {
    const message = String(req.body?.message || "").trim();
    const epicContext = req.body?.epicContext || {};

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const provider = getConfiguredChatProvider();
    if (provider === "disabled") {
      return res.status(503).json({
        error: "Chat is disabled",
        hint: "Set CHAT_PROVIDER to anthropic, openai, ollama, or rovo with matching credentials in .env.",
      });
    }

    try {
      const session = readSession();
      const customInstructions = getCustomInstructionsStmt.get()?.value || "";
      const result = await sendChatMessage({
        message,
        epicContext,
        oauthTokens: session?.oauthTokens,
        jiraRequest,
        customInstructions,
      });

      return res.json({
        reply: result.reply,
        provider: result.provider,
        note: result.note || null,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      console.error("[chat] request failed:", detail, error);
      return res.status(500).json({
        error: "Chat request failed",
        message: detail,
      });
    }
  });
};
