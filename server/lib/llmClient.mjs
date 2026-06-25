import {
  JIRA_SEARCH_TOOL_NAME,
  JIRA_SEARCH_TOOL_DESCRIPTION,
  JIRA_SEARCH_TOOL_PARAMETERS,
  executeJiraSearch,
} from "./jiraSearchTool.mjs";

const MAX_TOOL_ROUNDS = 3;
const SUPPORTED_PROVIDERS = new Set(["openai", "anthropic", "ollama"]);
const REPORT_PROVIDERS = ["anthropic", "openai"];

export const ROVO_PROVIDER = "rovo";

export const getConfiguredLlmProvider = () => {
  const provider = String(process.env.CHAT_PROVIDER || "").trim().toLowerCase();
  if (SUPPORTED_PROVIDERS.has(provider)) {
    return provider;
  }
  return null;
};

export const getConfiguredChatProvider = () => {
  const provider = String(process.env.CHAT_PROVIDER || "").trim().toLowerCase();
  if (!provider) {
    return "disabled";
  }
  if (provider === "disabled") {
    return "disabled";
  }
  if (provider === ROVO_PROVIDER) {
    return ROVO_PROVIDER;
  }
  if (SUPPORTED_PROVIDERS.has(provider)) {
    return provider;
  }
  return "disabled";
};

export const resolveLlmProvider = (defaultWhenUnset = "disabled") => {
  const configured = getConfiguredLlmProvider();
  if (configured) {
    return configured;
  }

  const fallback = String(defaultWhenUnset || "disabled").trim().toLowerCase();
  return SUPPORTED_PROVIDERS.has(fallback) ? fallback : "disabled";
};

export const resolveFirstReadyLlmProvider = () => {
  const configured = getConfiguredLlmProvider();
  if (configured && isLlmCredentialReady(configured)) {
    return configured;
  }

  for (const provider of ["anthropic", "openai", "ollama"]) {
    if (isLlmCredentialReady(provider)) {
      return provider;
    }
  }

  return "disabled";
};

export const resolveFirstReadyReportProvider = () => {
  const configured = getConfiguredLlmProvider();
  if (configured && configured !== "ollama" && isLlmCredentialReady(configured)) {
    return configured;
  }

  for (const provider of REPORT_PROVIDERS) {
    if (isLlmCredentialReady(provider)) {
      return provider;
    }
  }

  return "disabled";
};

const isLlmCredentialReady = (provider) => {
  switch (provider) {
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY);
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case "ollama":
      return Boolean(process.env.OLLAMA_BASE_URL);
    default:
      return false;
  }
};

export const isChatProviderReady = (provider, { oauthConnected = false } = {}) => {
  switch (provider) {
    case ROVO_PROVIDER:
      return oauthConnected || hasAnyLlmFallback();
    case "openai":
    case "anthropic":
    case "ollama":
      return isLlmCredentialReady(provider);
    default:
      return false;
  }
};

const hasAnyLlmFallback = () =>
  isLlmCredentialReady("anthropic") ||
  isLlmCredentialReady("openai") ||
  isLlmCredentialReady("ollama");

/** @deprecated Use isChatProviderReady */
export const isLlmProviderReady = (provider) => isLlmCredentialReady(provider);

export const extractAssistantText = (data) => {
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

const getOpenAiCredentials = () => {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the proxy host");
  }

  const baseUrl = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  return {
    apiKey,
    baseUrl,
    model: String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim(),
  };
};

const getAnthropicCredentials = () => {
  const apiKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the proxy host");
  }

  return {
    apiKey,
    model: String(process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6").trim(),
  };
};

const getOllamaConfig = () => ({
  baseUrl: String(process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, ""),
  model: String(process.env.OLLAMA_MODEL || "llama3.2").trim(),
});

const buildOpenAiJiraTool = () => ({
  type: "function",
  function: {
    name: JIRA_SEARCH_TOOL_NAME,
    description: JIRA_SEARCH_TOOL_DESCRIPTION,
    parameters: JIRA_SEARCH_TOOL_PARAMETERS,
  },
});

const buildAnthropicJiraTool = () => ({
  name: JIRA_SEARCH_TOOL_NAME,
  description: JIRA_SEARCH_TOOL_DESCRIPTION,
  input_schema: JIRA_SEARCH_TOOL_PARAMETERS,
});

const runJiraTool = ({ jiraRequest, args }) =>
  executeJiraSearch({ jiraRequest, jql: args?.jql, maxResults: args?.maxResults });

const callOpenAiMessages = async ({ apiKey, baseUrl, model, messages, maxTokens, tools }) => {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(tools ? { tools, tool_choice: "auto" } : {}),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenAI request failed");
  }

  return data;
};

const callAnthropicMessages = async ({ apiKey, model, systemPrompt, messages, maxTokens, tools }) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      ...(tools ? { tools } : {}),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Anthropic request failed");
  }

  return data;
};

const callOllamaChat = async ({ systemPrompt, userMessage, maxTokens }) => {
  const { baseUrl, model } = getOllamaConfig();
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
      ...(maxTokens ? { options: { num_predict: maxTokens } } : {}),
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

  return text;
};

const completeOpenAiText = async ({ systemPrompt, userMessage, maxTokens }) => {
  const { apiKey, baseUrl, model } = getOpenAiCredentials();
  const data = await callOpenAiMessages({
    apiKey,
    baseUrl,
    model,
    maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const text = extractAssistantText(data);
  if (!text) {
    throw new Error("OpenAI returned an empty response");
  }

  return text;
};

const completeAnthropicText = async ({ systemPrompt, userMessage, maxTokens }) => {
  const { apiKey, model } = getAnthropicCredentials();
  const data = await callAnthropicMessages({
    apiKey,
    model,
    systemPrompt,
    maxTokens,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = extractAssistantText(data);
  if (!text) {
    throw new Error("Anthropic returned an empty response");
  }

  return text;
};

const completeOpenAiWithJiraTools = async ({ systemPrompt, userMessage, maxTokens, jiraRequest }) => {
  const { apiKey, baseUrl, model } = getOpenAiCredentials();
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];
  const tools = jiraRequest ? [buildOpenAiJiraTool()] : undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const data = await callOpenAiMessages({ apiKey, baseUrl, model, messages, maxTokens, tools });
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

const completeAnthropicWithJiraTools = async ({ systemPrompt, userMessage, maxTokens, jiraRequest }) => {
  const { apiKey, model } = getAnthropicCredentials();
  const messages = [{ role: "user", content: userMessage }];
  const tools = jiraRequest ? [buildAnthropicJiraTool()] : undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const data = await callAnthropicMessages({
      apiKey,
      model,
      systemPrompt,
      maxTokens,
      messages,
      tools,
    });

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

const buildProviderError = (provider, { allowOllama, forReports }) => {
  if (forReports && provider === "ollama") {
    return "Report generation is not supported with the Ollama provider. Set CHAT_PROVIDER to anthropic or openai in .env.";
  }

  if (!allowOllama && provider === "ollama") {
    return "Report generation is not supported with the Ollama provider. Set CHAT_PROVIDER to anthropic or openai in .env.";
  }

  if (forReports) {
    return `No report LLM configured. Set CHAT_PROVIDER to anthropic or openai with the matching API key in .env.`;
  }

  return "Chat is disabled. Set CHAT_PROVIDER to anthropic, openai, ollama, or rovo in .env (or leave unset and configure provider credentials).";
};

export const completeLlmText = async ({
  systemPrompt,
  userMessage,
  maxTokens = 1024,
  provider: providerOverride,
  defaultProvider = "disabled",
  allowOllama = true,
  forReports = false,
}) => {
  const provider = providerOverride || resolveLlmProvider(defaultProvider);
  const userContent = String(userMessage || "").trim();
  if (!userContent) {
    throw new Error("Message is required");
  }

  switch (provider) {
    case "anthropic":
      return completeAnthropicText({ systemPrompt, userMessage: userContent, maxTokens });
    case "openai":
      return completeOpenAiText({ systemPrompt, userMessage: userContent, maxTokens });
    case "ollama":
      if (!allowOllama) {
        throw new Error(buildProviderError(provider, { allowOllama, forReports }));
      }
      return callOllamaChat({ systemPrompt, userMessage: userContent, maxTokens });
    default:
      throw new Error(buildProviderError(provider, { allowOllama, forReports }));
  }
};

export const completeLlmWithJiraTools = async ({
  systemPrompt,
  userMessage,
  maxTokens = 1024,
  provider: providerOverride,
  jiraRequest,
}) => {
  const provider = providerOverride || resolveLlmProvider("disabled");
  const userContent = String(userMessage || "").trim();
  if (!userContent) {
    throw new Error("Message is required");
  }

  switch (provider) {
    case "openai":
      return completeOpenAiWithJiraTools({
        systemPrompt,
        userMessage: userContent,
        maxTokens,
        jiraRequest,
      });
    case "anthropic":
      return completeAnthropicWithJiraTools({
        systemPrompt,
        userMessage: userContent,
        maxTokens,
        jiraRequest,
      });
    case "ollama":
      return callOllamaChat({ systemPrompt, userMessage: userContent, maxTokens });
    default:
      throw new Error(buildProviderError(provider, { allowOllama: true, forReports: false }));
  }
};
