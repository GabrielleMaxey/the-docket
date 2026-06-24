import { callRovoSearch } from "./rovoMcpClient.mjs";
import {
  JIRA_SEARCH_TOOL_NAME,
  JIRA_SEARCH_TOOL_DESCRIPTION,
  JIRA_SEARCH_TOOL_PARAMETERS,
  executeJiraSearch,
} from "./jiraSearchTool.mjs";

// Safety cap on how many tool-call round trips a single chat message can
// trigger, so a confused model can't loop forever burning API calls.
const MAX_TOOL_ROUNDS = 3;

const hasConfiguredApiKey = (value) => {
  const key = String(value || "").trim();
  if (!key) {
    return false;
  }

  return !/^sk-[.\s]*$/i.test(key) && key.length > 12;
};

export const buildEpicContextPrompt = (epicContext, customInstructions) => {
  // These lines are the app's built-in defaults — they always apply, for
  // every user, regardless of what anyone adds in Settings → Chat instructions.
  const lines = [
    "You are a helpful assistant for a Jira task management app.",
    "Answer using the epic context below when relevant.",
    "If the question isn't covered by the epic context (a different project, assignee, date range, etc.), use the search_jira_issues tool to look it up with JQL instead of guessing.",
    "Never state a person's name, issue key, or any Jira fact unless it came directly from the epic context below or from an actual search_jira_issues tool result in this conversation. If you don't have real data to answer with, say so and ask the user to select the right epic/JQL preset rather than guessing or inventing one.",
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
    lines.push("", "Past Due Projects filter is active.");
  }

  if (epicContext?.dashboardSummary) {
    lines.push("", "Dashboard snapshot summary:", String(epicContext.dashboardSummary));
  }

  // User-added instructions (Settings → Chat instructions) go last, after the
  // built-in defaults and the epic context, so they read as "on top of"
  // everything else rather than competing with it.
  const trimmedCustomInstructions = String(customInstructions || "").trim();
  if (trimmedCustomInstructions) {
    lines.push("", "Additional instructions from the app's Settings page:", trimmedCustomInstructions);
  }

  return lines.join("\n");
};

const extractAssistantText = (data) => {
  if (typeof data === "string") {
    return data.trim();
  }

  const openAiText = data?.choices?.[0]?.message?.content;
  if (typeof openAiText === "string") {
    return openAiText.trim();
  }

  const anthropicText = data?.content?.[0]?.text;
  if (typeof anthropicText === "string") {
    return anthropicText.trim();
  }

  const ollamaText = data?.message?.content;
  if (typeof ollamaText === "string") {
    return ollamaText.trim();
  }

  return "";
};

export const getConfiguredChatProvider = () => {
  const provider = String(process.env.CHAT_PROVIDER || "disabled").trim().toLowerCase();
  if (provider === "rovo" || provider === "openai" || provider === "anthropic" || provider === "ollama") {
    return provider;
  }
  return "disabled";
};

const buildJiraToolDefinition = () => ({
  name: JIRA_SEARCH_TOOL_NAME,
  description: JIRA_SEARCH_TOOL_DESCRIPTION,
  parameters: JIRA_SEARCH_TOOL_PARAMETERS,
});

const runJiraTool = ({ jiraRequest, args }) =>
  executeJiraSearch({ jiraRequest, jql: args?.jql, maxResults: args?.maxResults });

const runOpenAiWithTools = async ({ systemPrompt, userMessage, apiKey, model, jiraRequest }) => {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const tools = jiraRequest
    ? [{ type: "function", function: buildJiraToolDefinition() }]
    : undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        ...(tools ? { tools, tool_choice: "auto" } : {}),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || "OpenAI request failed");
    }

    const choiceMessage = data?.choices?.[0]?.message;
    const toolCalls = Array.isArray(choiceMessage?.tool_calls) ? choiceMessage.tool_calls : [];

    if (toolCalls.length === 0 || !jiraRequest || round === MAX_TOOL_ROUNDS) {
      const text = extractAssistantText(data);
      if (!text) {
        throw new Error("OpenAI returned an empty response");
      }
      return text;
    }

    messages.push(choiceMessage);

    for (const toolCall of toolCalls) {
      let args = {};
      try {
        args = JSON.parse(toolCall.function?.arguments || "{}");
      } catch {
        args = {};
      }

      const result =
        toolCall.function?.name === JIRA_SEARCH_TOOL_NAME
          ? await runJiraTool({ jiraRequest, args })
          : { error: `Unknown tool: ${toolCall.function?.name}` };

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error("OpenAI did not return a final response after tool calls");
};

const runAnthropicWithTools = async ({ systemPrompt, userMessage, apiKey, model, jiraRequest }) => {
  const messages = [{ role: "user", content: userMessage }];

  const tools = jiraRequest
    ? [
        {
          name: JIRA_SEARCH_TOOL_NAME,
          description: JIRA_SEARCH_TOOL_DESCRIPTION,
          input_schema: JIRA_SEARCH_TOOL_PARAMETERS,
        },
      ]
    : undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        ...(tools ? { tools } : {}),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || "Anthropic request failed");
    }

    const content = Array.isArray(data?.content) ? data.content : [];
    const toolUseBlocks = content.filter((block) => block.type === "tool_use");
    const hasToolCalls = data?.stop_reason === "tool_use" && toolUseBlocks.length > 0;

    if (!hasToolCalls || !jiraRequest || round === MAX_TOOL_ROUNDS) {
      const text = extractAssistantText(data);
      if (!text) {
        throw new Error("Anthropic returned an empty response");
      }
      return text;
    }

    messages.push({ role: "assistant", content });

    const toolResults = [];
    for (const block of toolUseBlocks) {
      const result =
        block.name === JIRA_SEARCH_TOOL_NAME
          ? await runJiraTool({ jiraRequest, args: block.input })
          : { error: `Unknown tool: ${block.name}` };

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("Anthropic did not return a final response after tool calls");
};

export const sendChatWithProvider = async ({ provider, message, epicContext, jiraRequest, customInstructions }) => {
  const systemPrompt = buildEpicContextPrompt(epicContext, customInstructions);
  const userMessage = String(message || "").trim();
  if (!userMessage) {
    throw new Error("Message is required");
  }

  switch (provider) {
    case "openai": {
      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured on the proxy host");
      }

      const model = String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
      const text = await runOpenAiWithTools({ systemPrompt, userMessage, apiKey, model, jiraRequest });
      return { reply: text, provider: "openai" };
    }
    case "anthropic": {
      const apiKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not configured on the proxy host");
      }

      // claude-3-5-haiku-latest was retired by Anthropic; current default
      // is Sonnet 4.6. Override with ANTHROPIC_MODEL in .env if you'd rather
      // use a different model (e.g. claude-haiku-4-5-20251001 for lower
      // cost/latency on simpler questions).
      const model = String(process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6").trim();
      const text = await runAnthropicWithTools({ systemPrompt, userMessage, apiKey, model, jiraRequest });
      return { reply: text, provider: "anthropic" };
    }
    case "ollama": {
      const baseUrl = String(process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
      const model = String(process.env.OLLAMA_MODEL || "llama3.2").trim();

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Ollama request failed");
      }

      const text = extractAssistantText(data);
      if (!text) {
        throw new Error("Ollama returned an empty response");
      }
      return { reply: text, provider: "ollama" };
    }
    case "rovo":
    case "disabled":
    default:
      throw new Error(
        "Chat provider is disabled. Set CHAT_PROVIDER to openai, anthropic, or ollama on the proxy host, or sign in with Atlassian when Rovo OAuth is configured."
      );
  }
};

export const sendChatMessage = async ({ message, epicContext, oauthTokens, providerOverride, jiraRequest, customInstructions }) => {
  const configured = providerOverride || getConfiguredChatProvider();

  if (configured === "rovo") {
    const accessToken = oauthTokens?.access_token || oauthTokens?.accessToken;
    const attemptErrors = [];

    if (accessToken) {
      try {
        const query = [buildEpicContextPrompt(epicContext, customInstructions), "", `User question: ${message}`]
          .join("\n")
          .trim();
        const reply = await callRovoSearch({ accessToken, query });
        return { reply, provider: "rovo" };
      } catch (mcpError) {
        const detail = mcpError instanceof Error ? mcpError.message : String(mcpError);
        attemptErrors.push(`Rovo MCP: ${detail}`);
        console.warn("[chat] Rovo MCP request failed:", detail);
      }
    }

    for (const fallback of ["openai", "anthropic", "ollama"]) {
      const hasKey =
        (fallback === "openai" && hasConfiguredApiKey(process.env.OPENAI_API_KEY)) ||
        (fallback === "anthropic" && hasConfiguredApiKey(process.env.ANTHROPIC_API_KEY)) ||
        (fallback === "ollama" && process.env.OLLAMA_BASE_URL);

      if (!hasKey) {
        continue;
      }

      try {
        const result = await sendChatWithProvider({ provider: fallback, message, epicContext, jiraRequest, customInstructions });
        return {
          ...result,
          provider: "rovo",
          note: "Rovo MCP tool call unavailable; answered via configured LLM fallback.",
        };
      } catch (fallbackError) {
        const detail = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        attemptErrors.push(`${fallback}: ${detail}`);
        console.warn(`[chat] ${fallback} fallback failed:`, detail);
      }
    }

    if (!accessToken) {
      throw new Error("Sign in with Atlassian to use Rovo chat, or configure an LLM fallback on the proxy host.");
    }

    const attempts = attemptErrors.length > 0 ? ` Attempts: ${attemptErrors.join("; ")}` : "";
    throw new Error(
      `Rovo MCP is not reachable and no LLM fallback succeeded.${attempts} Configure OPENAI_API_KEY, ANTHROPIC_API_KEY, or a running Ollama instance.`
    );
  }

  return sendChatWithProvider({ provider: configured, message, epicContext, jiraRequest, customInstructions });
};
