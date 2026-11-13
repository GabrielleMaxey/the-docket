import { setTimeout as delay } from "node:timers/promises";
import {
  buildDatabricksCredentials,
  normalizeDatabricksHost,
} from "./llmClient.mjs";
import { DEVELOPER_ROLE_MESSAGE } from "../../shared/databricksSetupGuide.mjs";

const IDENTITY_PATH = "/api/2.0/preview/scim/v2/Me";
const SERVING_ENDPOINTS_PATH = "/api/2.0/serving-endpoints";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_DELAYS_MS = [1000, 2000];

export const redactToken = (text, token) => {
  const secret = String(token || "");
  const value = String(text ?? "");
  return secret ? value.split(secret).join("<redacted>") : value;
};

// Returns an https origin (no path, query or fragment) or null when the input is not a
// workspace hostname.
export const cleanHostInput = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw || /^http:\/\//i.test(raw)) {
    return null;
  }
  let url;
  try {
    url = new URL(normalizeDatabricksHost(raw));
  } catch {
    return null;
  }
  const hasDomainShape =
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) &&
    !/^[0-9.]+$/.test(url.hostname);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !hasDomainShape
  ) {
    return null;
  }
  return normalizeDatabricksHost(url.origin);
};

// Returns the trimmed endpoint name or null when it is empty or has spaces or slashes.
export const cleanEndpointInput = (value) => {
  const name = String(value ?? "").trim();
  return name && !/[\s/]/.test(name) ? name : null;
};

export const cleanTokenInput = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();

// Sends one request per attempt with a hard timeout that does not depend on fetchImpl
// honoring the abort signal. Redirects are never followed so the token is not forwarded.
// Retries only HTTP 429/5xx. Resolves to { status, text } or { error: "timeout" | "network" }.
const sendWithRetry = async ({
  fetchImpl,
  url,
  init,
  timeoutMs,
  retryDelaysMs,
  sleep,
}) => {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    let timer;
    const timedOut = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ error: "timeout" });
      }, timeoutMs);
    });
    const exchange = (async () => {
      const response = await fetchImpl(url, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
      });
      return { status: response.status, text: await response.text() };
    })().catch(() => ({ error: "network" }));
    const outcome = await Promise.race([exchange, timedOut]);
    clearTimeout(timer);

    const retryable =
      outcome.status === 429 || (outcome.status >= 500 && outcome.status <= 599);
    if (!retryable || attempt >= retryDelaysMs.length) {
      return outcome;
    }
    await sleep(retryDelaysMs[attempt]);
  }
};

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isRedirect = (status) => status >= 300 && status < 400;

export const listServingEndpoints = async ({
  host,
  token,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) => {
  const base = normalizeDatabricksHost(host);
  const secret = String(token || "").trim();
  if (!base || !secret) {
    return [];
  }
  const outcome = await sendWithRetry({
    fetchImpl,
    url: `${base}${SERVING_ENDPOINTS_PATH}`,
    init: { method: "GET", headers: { Authorization: `Bearer ${secret}` } },
    timeoutMs,
    retryDelaysMs: [],
    sleep: delay,
  });
  if (outcome.status !== 200) {
    return [];
  }
  const endpoints = parseJson(outcome.text)?.endpoints;
  if (!Array.isArray(endpoints)) {
    return [];
  }
  return endpoints
    .map((entry) => (typeof entry?.name === "string" ? entry.name : ""))
    .filter(Boolean);
};

const check = (name, status, code, message) => ({ name, status, code, message });

export const checkDatabricksAccess = async ({
  host,
  token,
  endpoint,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleep = delay,
}) => {
  const secret = String(token || "").trim();
  const base = normalizeDatabricksHost(host);
  const redact = (text) => redactToken(text, secret);
  const finish = ({ ok, user = null, code = null, message, checks }) => ({
    ok,
    user: user === null ? null : redact(user),
    code,
    message: redact(message),
    checks: checks.map((c) => ({ ...c, message: redact(c.message) })),
  });

  const skippedModel = (code, message) =>
    check("model", "skipped", code, message);
  const identityFailure = (code, message) =>
    finish({
      ok: false,
      code,
      message,
      checks: [
        check("identity", "failed", code, message),
        skippedModel(null, "Skipped because the token check failed."),
      ],
    });

  if (!base) {
    return identityFailure("host_missing", "No workspace address was provided.");
  }
  if (!secret) {
    return identityFailure("token_missing", "No token was provided.");
  }

  const request = (url, init) =>
    sendWithRetry({
      fetchImpl,
      url,
      init: {
        ...init,
        headers: { Authorization: `Bearer ${secret}`, ...init.headers },
      },
      timeoutMs,
      retryDelaysMs,
      sleep,
    });

  const identity = await request(`${base}${IDENTITY_PATH}`, { method: "GET" });
  if (identity.error === "timeout") {
    return identityFailure(
      "timeout",
      `Databricks did not respond within ${Math.round(timeoutMs / 1000)} seconds. Check your network/VPN and try again.`,
    );
  }
  if (identity.error) {
    return identityFailure(
      "unreachable",
      `Cannot reach \`${base}\`. Check the host value and your network/VPN.`,
    );
  }
  if (identity.status === 401) {
    return identityFailure(
      "token_rejected",
      "Databricks rejected this token (expired, revoked or mistyped). Create a new one.",
    );
  }
  if (identity.status === 403) {
    return identityFailure("no_api_access", DEVELOPER_ROLE_MESSAGE);
  }
  if (isRedirect(identity.status)) {
    return identityFailure(
      "redirected",
      "Databricks redirected the request to another address, so it was not followed and the token was not sent there. Check the host value.",
    );
  }
  const profile = identity.status === 200 ? parseJson(identity.text) : null;
  const user =
    profile && typeof profile === "object"
      ? profile.displayName || profile.userName || null
      : null;
  if (!user) {
    return identityFailure(
      "unexpected_response",
      `Databricks returned an unexpected response (HTTP ${identity.status}). Check the host value.`,
    );
  }

  const identityOk = check("identity", "ok", null, `Connected as ${user}.`);
  const modelName = String(endpoint || "").trim();
  if (!modelName) {
    const model = skippedModel(
      "endpoint_missing",
      "No model endpoint was provided, so the model check was skipped.",
    );
    return finish({
      ok: true,
      user,
      message: identityOk.message,
      checks: [identityOk, model],
    });
  }

  const credentials = buildDatabricksCredentials({
    host: base,
    token: secret,
    endpoint: modelName,
  });
  const modelResult = await request(`${credentials.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: credentials.model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    }),
  });

  let model;
  if (modelResult.status >= 200 && modelResult.status < 300) {
    model = check("model", "ok", null, `Model endpoint \`${modelName}\` responded.`);
  } else if (modelResult.status === 403 || modelResult.status === 404) {
    model = check(
      "model",
      "warning",
      "model_unavailable",
      `Token works, but the model endpoint \`${modelName}\` isn't available to you.`,
    );
  } else {
    const detail =
      modelResult.error === "timeout"
        ? "the request timed out"
        : modelResult.error
          ? "the request failed"
          : `HTTP ${modelResult.status}`;
    model = check(
      "model",
      "warning",
      "model_failed",
      `Token works, but the model check on \`${modelName}\` failed (${detail}).`,
    );
  }

  return finish({
    ok: true,
    user,
    message: model.status === "ok" ? `${identityOk.message} ${model.message}` : model.message,
    checks: [identityOk, model],
  });
};
