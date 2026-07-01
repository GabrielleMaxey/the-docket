import { callRovoSearch } from "./rovoMcpClient.mjs";
import { createLogger } from "./logger.mjs";
const log = createLogger("rovo");

import {
  completeLlmWithJiraTools,
  resolveFirstReadyLlmProvider,
} from "./llmClient.mjs";

const hasLlmFallback = () =>
  Boolean(process.env.ANTHROPIC_API_KEY) ||
  Boolean(process.env.OPENAI_API_KEY) ||
  Boolean(process.env.OLLAMA_BASE_URL);

export const sendRovoChatMessage = async ({
  systemPrompt,
  message,
  oauthTokens,
  jiraRequest,
}) => {
  const userMessage = String(message || "").trim();
  if (!userMessage) {
    throw new Error("Message is required");
  }

  const accessToken = oauthTokens?.access_token || oauthTokens?.accessToken;
  const rovoQuery = [systemPrompt, "", `User question: ${userMessage}`].join("\n").trim();

  if (accessToken) {
    try {
      const reply = await callRovoSearch({ accessToken, query: rovoQuery });
      return { reply, provider: "rovo" };
    } catch (rovoError) {
      const detail = rovoError instanceof Error ? rovoError.message : String(rovoError);
      log.warn("Rovo MCP request failed", detail);
      if (!hasLlmFallback()) {
        throw new Error(
          `Rovo MCP failed (${detail}). Sign in with Atlassian or configure an LLM fallback (ANTHROPIC_API_KEY, OPENAI_API_KEY, or Ollama).`
        );
      }
    }
  } else if (!hasLlmFallback()) {
    throw new Error(
      "Sign in with Atlassian to use Rovo chat, or configure an LLM fallback on the proxy host."
    );
  }

  const fallbackProvider = resolveFirstReadyLlmProvider();
  if (fallbackProvider === "disabled") {
    throw new Error(
      "Sign in with Atlassian to use Rovo chat, or configure an LLM fallback on the proxy host."
    );
  }

  const reply = await completeLlmWithJiraTools({
    provider: fallbackProvider,
    systemPrompt,
    userMessage,
    jiraRequest,
  });

  return {
    reply,
    provider: "rovo",
    note: accessToken
      ? "Rovo MCP unavailable; answered via configured LLM fallback."
      : "Not signed in to Atlassian; answered via configured LLM fallback.",
  };
};
