import {
  completeLlmWithJiraTools,
  getConfiguredChatProvider,
  ROVO_PROVIDER,
} from "./llmClient.mjs";
import { sendRovoChatMessage } from "./rovoChat.mjs";
import { buildEpicContextPrompt } from "./aiInstructions.mjs";
import { AI_PATH_MANAGED } from "./aiPath.mjs";

export const sendChatWithProvider = async ({
  provider,
  message,
  epicContext,
  jiraRequest,
  customInstructions,
  oauthTokens,
  aiPath,
}) => {
  const systemPrompt = buildEpicContextPrompt(epicContext, customInstructions);
  const userMessage = String(message || "").trim();
  if (!userMessage) {
    throw new Error("Message is required");
  }

  if (provider === ROVO_PROVIDER && aiPath !== AI_PATH_MANAGED) {
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
    aiPath,
  });

  return { reply: text, provider: aiPath === AI_PATH_MANAGED ? AI_PATH_MANAGED : provider };
};

export const sendChatMessage = async ({
  message,
  epicContext,
  providerOverride,
  aiPath,
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
    aiPath,
  });
};
