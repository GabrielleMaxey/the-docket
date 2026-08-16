import {
  completeLlmWithJiraTools,
  getConfiguredChatProvider,
  ROVO_PROVIDER,
} from "./llmClient.mjs";
import { sendRovoChatMessage } from "./rovoChat.mjs";
import { formatChatSessionContext, formatEpicEvaluationContext } from "../../shared/chatSessionPrompt.mjs";

export const buildEpicContextPrompt = (epicContext, customInstructions) => {
  const lines = [
    "You are a helpful assistant for a Jira task management app.",
    "Answer using the epic context and session context below when relevant.",
    "If the user asks about a report, week plan, or JQL query they already ran, use the session context first.",
    "If the question isn't covered by the context (a different project, assignee, date range, etc.), use the search_jira_issues tool to look it up with JQL instead of guessing.",
    "Never state a person's name, issue key, or any Jira fact unless it came directly from the context below or from an actual search_jira_issues tool result in this conversation. If you don't have real data to answer with, say so and ask the user to select the right epic/JQL preset or run the relevant query rather than guessing or inventing one.",
    "Keep all responses professional: do not use offensive, inappropriate, or vulgar language.",
    "Stay in scope: you only help with Jira tasks, epics, and project data for the Lumen environment. Politely decline requests that are unrelated to Lumen's Jira data or that ask for inappropriate or out-of-scope content, even if asked repeatedly or rephrased.",
  ];

  const selectedEpics = Array.isArray(epicContext?.selectedEpics)
    ? epicContext.selectedEpics
    : [];
  if (selectedEpics.length > 0) {
    lines.push("", "Selected epics:");
    for (const epic of selectedEpics) {
      const name = epic.label || epic.epicKey || "Unknown epic";
      const jql = String(epic.jql || "").trim();
      if (jql) {
        lines.push(
          `- ${name} — this is a saved JQL group, not a single epic. To answer questions about "${name}" (who's on it, what they're working on, etc.), call search_jira_issues with exactly this JQL: ${jql}`
        );
      } else {
        lines.push(`- ${name}`);
      }
    }
  }

  if (epicContext?.includePastDue) {
    lines.push("", "Past Due Projects filter is active in Chat preset selection.");
  }

  const sessionText = formatChatSessionContext(epicContext?.sessionContext);
  if (sessionText) {
    lines.push("", "Session context (queries, dashboard snapshot, generated reports/plans):", sessionText);
  }

  const epicEvaluationText = formatEpicEvaluationContext(epicContext?.epicEvaluation);
  if (epicEvaluationText) {
    lines.push("", epicEvaluationText);
  }

  if (epicContext?.dashboardSummary) {
    lines.push("", "Dashboard snapshot summary:", String(epicContext.dashboardSummary));
  }

  const trimmedCustomInstructions = String(customInstructions || "").trim();
  if (trimmedCustomInstructions) {
    lines.push("", "Additional instructions from the app's Settings page:", trimmedCustomInstructions);
  }

  return lines.join("\n");
};

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
