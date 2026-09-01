import {
  JIRA_SEARCH_TOOL_NAME,
  JIRA_SEARCH_TOOL_DESCRIPTION,
  JIRA_SEARCH_TOOL_PARAMETERS,
  executeJiraSearch,
} from "./jiraSearchTool.mjs";

const MAX_TOOL_ROUNDS = 3;
const SUPPORTED_PROVIDERS = new Set(["openai", "anthropic", "ollama"]);
const LLM_PROVIDER_ORDER = ["anthropic", "openai", "ollama"];

export const ROVO_PROVIDER = "rovo";

export const getConfiguredLlmProvider = () => {
  const provider = String(process.env.CHAT_PROVIDER || "").trim().toLowerCase();
  if (SUPPORTED_PROVIDERS.has(provider)) {
    return provider;
  }
  return null;
};

export const getConfiguredReportProvider = () => {
  const provider = String(process.env.REPORT_PROVIDER || "").trim().toLowerCase();
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

  for (const provider of LLM_PROVIDER_ORDER) {
    if (isLlmCredentialReady(provider)) {
      return provider;
    }
  }

  return "disabled";
};

export const resolveFirstReadyReportProvider = () => {
  const reportProvider = getConfiguredReportProvider();
  if (reportProvider && isReportProviderReady(reportProvider)) {
    return reportProvider;
  }

  const chatProvider = getConfiguredLlmProvider();
  if (chatProvider && isReportProviderReady(chatProvider)) {
    return chatProvider;
  }

  for (const provider of LLM_PROVIDER_ORDER) {
    if (isReportProviderReady(provider)) {
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

const isReportProviderReady = (provider) => {
  switch (provider) {
    case "openai":
      return Boolean(process.env.REPORT_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
    case "anthropic":
      return Boolean(process.env.REPORT_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
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

const getOpenAiCredentials = ({ forReports = false } = {}) => {
  const defaultApiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const reportApiKey = String(process.env.REPORT_OPENAI_API_KEY || "").trim();
  const apiKey = forReports && reportApiKey ? reportApiKey : defaultApiKey;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the proxy host");
  }

  const defaultBaseUrl = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const reportBaseUrl = String(process.env.REPORT_OPENAI_BASE_URL || "").trim().replace(/\/$/, "");
  const baseUrl = forReports && reportBaseUrl ? reportBaseUrl : defaultBaseUrl;

  const chatModel = String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  const reportModel = String(process.env.REPORT_OPENAI_MODEL || "").trim();
  const model = forReports && reportModel ? reportModel : chatModel;

  return { apiKey, baseUrl, model };
};

const getAnthropicCredentials = ({ forReports = false } = {}) => {
  const defaultApiKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
  const reportApiKey = String(process.env.REPORT_ANTHROPIC_API_KEY || "").trim();
  const apiKey = forReports && reportApiKey ? reportApiKey : defaultApiKey;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the proxy host");
  }

  const defaultBaseUrl = String(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const reportBaseUrl = String(process.env.REPORT_ANTHROPIC_BASE_URL || "").trim().replace(/\/$/, "");
  const baseUrl = forReports && reportBaseUrl ? reportBaseUrl : defaultBaseUrl;

  const chatModel = String(process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6").trim();
  const reportModel = String(process.env.REPORT_ANTHROPIC_MODEL || "").trim();
  const model = forReports && reportModel ? reportModel : chatModel;

  return { apiKey, baseUrl, model };
};

const getOllamaConfig = ({ forReports = false } = {}) => {
  const baseUrl = String(process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const chatModel = String(process.env.OLLAMA_MODEL || "llama3.2").trim();
  const reportModel = String(process.env.OLLAMA_REPORT_MODEL || "").trim();
  const model = forReports && reportModel ? reportModel : chatModel;
  return { baseUrl, model };
};

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

const describeReportLlmTarget = (provider) => {
  try {
    if (provider === "ollama") {
      return getOllamaConfig({ forReports: true });
    }
    if (provider === "openai") {
      const { model, baseUrl } = getOpenAiCredentials({ forReports: true });
      return { model, baseUrl };
    }
    if (provider === "anthropic") {
      const { model, baseUrl } = getAnthropicCredentials({ forReports: true });
      return { model, baseUrl };
    }
  } catch {
    return { model: "", baseUrl: "" };
  }
  return { model: "", baseUrl: "" };
};

export const formatUnableToGenerateReportError = (provider, error) => {
  const raw = error instanceof Error ? error.message : String(error || "");
  const { model, baseUrl } = describeReportLlmTarget(provider);
  const modelLabel = model || "configured";

  if (!provider || provider === "disabled") {
    return "Unable to generate report. No report model is configured.";
  }

  const modelUnavailable =
    /unreachable|ECONNREFUSED|ENOTFOUND|ECONNRESET|fetch failed|not found|does not exist|unknown model|model .*not/i.test(
      raw
    );

  if (modelUnavailable) {
    const hint =
      provider === "ollama" && baseUrl
        ? ` Start Ollama at ${baseUrl}, or configure a different report provider.`
        : "";
    return `Unable to generate report. The ${modelLabel} model is not available.${hint}`;
  }

  return `Unable to generate report. ${raw}`;
};

const fetchOrThrow = async (url, options, label) => {
  try {
    return await fetch(url, options);
  } catch (error) {
    const cause = error?.cause;
    const code = cause?.code || "";
    const detail = String(cause?.message || error?.message || "fetch failed");
    throw new Error(`${label || "LLM"} unreachable at ${url}: ${detail}${code ? ` (${code})` : ""}`);
  }
};

const callOpenAiMessages = async ({ apiKey, baseUrl, model, messages, maxTokens, tools }) => {
  const response = await fetchOrThrow(`${baseUrl}/chat/completions`, {
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
  }, "OpenAI");

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenAI request failed");
  }

  return data;
};

const callAnthropicMessages = async ({ apiKey, baseUrl, model, systemPrompt, messages, maxTokens, tools }) => {
  const response = await fetchOrThrow(`${baseUrl}/v1/messages`, {
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
  }, "Anthropic");

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Anthropic request failed");
  }

  return data;
};

const callOllamaChat = async ({ systemPrompt, userMessage, maxTokens, forReports = false }) => {
  const { baseUrl, model } = getOllamaConfig({ forReports });
  const response = await fetchOrThrow(`${baseUrl}/api/chat`, {
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
  }, "Ollama");

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

const completeOpenAiText = async ({ systemPrompt, userMessage, maxTokens, forReports = false }) => {
  const { apiKey, baseUrl, model } = getOpenAiCredentials({ forReports });
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

const completeAnthropicText = async ({ systemPrompt, userMessage, maxTokens, forReports = false }) => {
  const { apiKey, baseUrl, model } = getAnthropicCredentials({ forReports });
  const data = await callAnthropicMessages({
    apiKey,
    baseUrl,
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
  const { apiKey, baseUrl, model } = getAnthropicCredentials();
  const messages = [{ role: "user", content: userMessage }];
  const tools = jiraRequest ? [buildAnthropicJiraTool()] : undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const data = await callAnthropicMessages({
      apiKey,
      baseUrl,
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

const buildProviderError = (provider, { forReports = false } = {}) => {
  if (forReports) {
    return `No report LLM configured. Set REPORT_PROVIDER or CHAT_PROVIDER to anthropic, openai, or ollama with matching credentials in .env. OpenAI-compatible endpoints (Databricks, Azure, LiteLLM, vLLM) use CHAT_PROVIDER=openai or REPORT_PROVIDER=openai with OPENAI_BASE_URL or REPORT_OPENAI_BASE_URL.`;
  }

  return "Chat is disabled. Set CHAT_PROVIDER to anthropic, openai, ollama, or rovo in .env (or leave unset and configure provider credentials).";
};

export const completeLlmText = async ({
  systemPrompt,
  userMessage,
  maxTokens = 1024,
  provider: providerOverride,
  defaultProvider = "disabled",
  forReports = false,
}) => {
  const provider = providerOverride || resolveLlmProvider(defaultProvider);
  const userContent = String(userMessage || "").trim();
  if (!userContent) {
    throw new Error("Message is required");
  }

  switch (provider) {
    case "anthropic":
      return completeAnthropicText({ systemPrompt, userMessage: userContent, maxTokens, forReports });
    case "openai":
      return completeOpenAiText({ systemPrompt, userMessage: userContent, maxTokens, forReports });
    case "ollama":
      return callOllamaChat({
        systemPrompt,
        userMessage: userContent,
        maxTokens,
        forReports,
      });
    default:
      throw new Error(buildProviderError(provider, { forReports }));
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
      throw new Error(buildProviderError(provider));
  }
};
