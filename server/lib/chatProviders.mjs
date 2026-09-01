import {
  completeLlmWithJiraTools,
  getConfiguredChatProvider,
  ROVO_PROVIDER,
} from "./llmClient.mjs";
import { sendRovoChatMessage } from "./rovoChat.mjs";
import { buildEpicContextPrompt } from "./aiInstructions.mjs";

export const sendChatWithProvider = async ({
  provider,
  message,
  epicContext,
  jiraRequest,
  customInstructions,
  oauthTokens,
}) => {
  const systemPrompt = buildEpicContextPrompt(epicContext, customInstructions);
  const userMessage = String(message || "").trim();
  if (!userMessage) {
    throw new Error("Message is required");
  }

  if (provider === ROVO_PROVIDER) {
    return sendRovoChatMessage({
      systemPrompt,
      message: userMessage,
      oauthTokens,
      jiraRequest,
    });
  }

  const text = await completeLlmWithJiraTools({
    provider,
    systemPrompt,
    userMessage,
    jiraRequest,
  });

  return { reply: text, provider };
};

export const sendChatMessage = async ({
  message,
  epicContext,
  providerOverride,
  jiraRequest,
  customInstructions,
  oauthTokens,
}) => {
  const configured = providerOverride || getConfiguredChatProvider();
  return sendChatWithProvider({
    provider: configured,
    message,
    epicContext,
    jiraRequest,
    customInstructions,
    oauthTokens,
  });
};
