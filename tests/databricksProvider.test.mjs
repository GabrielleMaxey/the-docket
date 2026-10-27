import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  completeLlmText,
  completeLlmWithJiraTools,
  extractAssistantText,
  getConfiguredLlmProvider,
  isChatProviderReady,
  resolveFirstReadyLlmProvider,
  resolveFirstReadyReportProvider,
} from "../server/lib/llmClient.mjs";

const ENV_NAMES = [
  "CHAT_PROVIDER",
  "REPORT_PROVIDER",
  "DATABRICKS_HOST",
  "DATABRICKS_TOKEN",
  "DATABRICKS_ENDPOINT",
  "REPORT_DATABRICKS_ENDPOINT",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OLLAMA_BASE_URL",
];

let savedEnv;
let savedFetch;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  savedFetch = globalThis.fetch;
  for (const name of ENV_NAMES) delete process.env[name];
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  globalThis.fetch = savedFetch;
});

const configureDatabricks = (overrides = {}) => {
  Object.assign(process.env, {
    CHAT_PROVIDER: "databricks",
    DATABRICKS_HOST: "https://example.cloud.databricks.com/",
    DATABRICKS_TOKEN: "dapi-test",
    DATABRICKS_ENDPOINT: "chat-endpoint",
    ...overrides,
  });
};

const jsonResponse = (body, init) => new Response(JSON.stringify(body), init);

describe("databricks provider readiness", () => {
  it("requires host, token, and model", () => {
    assert.equal(isChatProviderReady("databricks"), false);
    configureDatabricks({ DATABRICKS_ENDPOINT: "" });
    assert.equal(isChatProviderReady("databricks"), false);
    process.env.DATABRICKS_ENDPOINT = "chat-endpoint";
    assert.equal(isChatProviderReady("databricks"), true);
    assert.equal(getConfiguredLlmProvider(), "databricks");
  });

  it("is picked as a fallback when CHAT_PROVIDER is unset", () => {
    configureDatabricks();
    delete process.env.CHAT_PROVIDER;
    assert.equal(resolveFirstReadyLlmProvider(), "databricks");
    assert.equal(resolveFirstReadyReportProvider(), "databricks");
  });
});

describe("databricks completions", () => {
  it("calls the serving-endpoints chat route with the endpoint name and bearer token", async () => {
    configureDatabricks();
    let seen;
    globalThis.fetch = async (url, options) => {
      seen = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({ choices: [{ message: { content: " hello " }, finish_reason: "stop" }] });
    };
    const text = await completeLlmText({ systemPrompt: "sys", userMessage: "hi", provider: "databricks" });
    assert.equal(text, "hello");
    assert.equal(seen.url, "https://example.cloud.databricks.com/serving-endpoints/chat/completions");
    assert.equal(seen.options.headers.Authorization, "Bearer dapi-test");
    assert.equal(seen.body.model, "chat-endpoint");
  });

  it("accepts a bare hostname and a pasted /serving-endpoints suffix", async () => {
    configureDatabricks({ DATABRICKS_HOST: "example.cloud.databricks.com/serving-endpoints/" });
    let url;
    globalThis.fetch = async (u) => {
      url = u;
      return jsonResponse({ choices: [{ message: { content: "ok" } }] });
    };
    await completeLlmText({ systemPrompt: "s", userMessage: "u", provider: "databricks" });
    assert.equal(url, "https://example.cloud.databricks.com/serving-endpoints/chat/completions");
  });

  it("uses REPORT_DATABRICKS_ENDPOINT only for reports", async () => {
    configureDatabricks({ REPORT_DATABRICKS_ENDPOINT: "report-endpoint" });
    const models = [];
    globalThis.fetch = async (_url, options) => {
      models.push(JSON.parse(options.body).model);
      return jsonResponse({ choices: [{ message: { content: "ok" } }] });
    };
    await completeLlmText({ systemPrompt: "s", userMessage: "u", provider: "databricks" });
    await completeLlmText({ systemPrompt: "s", userMessage: "u", provider: "databricks", forReports: true });
    assert.deepEqual(models, ["chat-endpoint", "report-endpoint"]);
  });

  it("labels errors as Databricks", async () => {
    configureDatabricks();
    globalThis.fetch = async () => jsonResponse({ message: "PERMISSION_DENIED" }, { status: 403 });
    await assert.rejects(
      completeLlmText({ systemPrompt: "s", userMessage: "u", provider: "databricks" }),
      /PERMISSION_DENIED/
    );
    globalThis.fetch = async () => jsonResponse({ choices: [{ message: { content: "" } }] });
    await assert.rejects(
      completeLlmText({ systemPrompt: "s", userMessage: "u", provider: "databricks" }),
      /Databricks returned an empty response/
    );
  });

  it("runs the Jira tool loop against Databricks", async () => {
    configureDatabricks();
    const calls = [];
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (calls.length === 1) {
        return jsonResponse({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  { id: "t1", type: "function", function: { name: "search_jira_issues", arguments: JSON.stringify({ jql: "project = ODI" }) } },
                ],
              },
            },
          ],
        });
      }
      return jsonResponse({ choices: [{ message: { content: "Found it." } }] });
    };
    const jiraRequest = async () => ({ ok: true, status: 200, data: { issues: [] } });
    const text = await completeLlmWithJiraTools({
      systemPrompt: "s",
      userMessage: "what is open?",
      provider: "databricks",
      jiraRequest,
    });
    assert.equal(text, "Found it.");
    assert.equal(calls.length, 2);
    assert.ok(calls[0].tools?.length);
    assert.equal(calls[1].messages.at(-1).role, "tool");
  });
});

describe("extractAssistantText", () => {
  it("keeps only text blocks from list-style content", () => {
    const data = {
      choices: [
        {
          message: {
            content: [
              { type: "reasoning", summary: [{ type: "summary_text", text: "thinking" }] },
              { type: "text", text: " Final answer. " },
            ],
          },
        },
      ],
    };
    assert.equal(extractAssistantText(data), "Final answer.");
  });
});
