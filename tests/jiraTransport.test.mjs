import { it } from "node:test";
import assert from "node:assert/strict";

const credentials = { baseUrl: "https://lumen.atlassian.net", email: "fixture@example.test", apiToken: "fixture-token" };
const requestJira = async (options) => {
  const transport = await import("../server/lib/jiraTransport.mjs");
  return transport.requestJira({ credentials, ...options });
};

const pendingUntilAbort = (signal) => new Promise((_resolve, reject) => {
  if (signal.aborted) return reject(signal.reason);
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});

it("timeout includes response body consumption", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    return { ok: true, status: 200, text: () => pendingUntilAbort(options.signal) };
  };
  const result = await requestJira({ pathWithQuery: "/rest/api/3/myself", timeoutMs: 20 });
  assert.equal(result.status, 504);
  assert.equal(result.data.code, "JIRA_TIMEOUT");
  assert.equal(result.data.outcome, "not-written");
  assert.equal(calls.length, 1);
});

it("write timeout is not retried", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = (url, options) => { calls.push(url); return pendingUntilAbort(options.signal); };
  const result = await requestJira({ method: "POST", pathWithQuery: "/rest/api/3/issue", body: { fields: {} }, timeoutMs: 20 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 504);
  assert.equal(result.data.outcome, "unknown");
  assert.equal(calls.length, 1);
});

it("redirect does not send Authorization elsewhere", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  let cancelled = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      status: 303, headers: { Location: "https://api.media.atlassian.com/file/fixture-id" },
    });
  };
  const result = await requestJira({ pathWithQuery: "/rest/api/3/attachment/content/123", responseMode: "redirect" });
  assert.equal(result.location, "https://api.media.atlassian.com/file/fixture-id");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://lumen.atlassian.net/rest/api/3/attachment/content/123");
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(cancelled, true);
});

it("caller abort closes pending work", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const caller = new AbortController();
  let outgoingSignal;
  globalThis.fetch = (_url, options) => { outgoingSignal = options.signal; return pendingUntilAbort(options.signal); };
  const result = requestJira({ pathWithQuery: "/rest/api/3/myself", signal: caller.signal, timeoutMs: 1000 });
  const rejected = assert.rejects(result, { name: "AbortError" });
  await new Promise((resolve) => setImmediate(resolve));
  caller.abort();
  await rejected;
  assert.equal(outgoingSignal.aborted, true);
});

for (const pathWithQuery of ["/rest/api/3/search/jql", "/rest/api/3/search/approximate-count"]) {
  it(`search POST timeout is not reported as a write: ${pathWithQuery}`, async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    globalThis.fetch = (_url, options) => pendingUntilAbort(options.signal);
    const result = await requestJira({ method: "POST", pathWithQuery, body: { jql: "project = FIXTURE" }, timeoutMs: 20 });
    assert.equal(result.status, 504);
    assert.equal(result.data.outcome, "not-written");
  });
}

it("rejects destinations before attaching Jira credentials", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("{}"); };
  for (const pathWithQuery of ["https://evil.example/rest/api/3/myself", "//evil.example/rest/api/3/myself", "/\\evil.example/rest/api/3/myself"]) {
    await assert.rejects(requestJira({ pathWithQuery }), TypeError);
  }
  await assert.rejects(requestJira({ credentials: { ...credentials, baseUrl: "https://evil.example" }, pathWithQuery: "/rest/api/3/myself" }), TypeError);
  assert.equal(calls, 0);
});

it("ordinary redirects are rejected without following Location", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, "error");
    return new Response(null, { status: 302, headers: { Location: "https://evil.example" } });
  };
  await assert.rejects(requestJira({ pathWithQuery: "/rest/api/3/myself" }), TypeError);
  assert.equal(calls.length, 1);
});

it("uses the configured positive integer deadline", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = process.env.JIRA_REQUEST_TIMEOUT_MS;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalTimeout === undefined) delete process.env.JIRA_REQUEST_TIMEOUT_MS;
    else process.env.JIRA_REQUEST_TIMEOUT_MS = originalTimeout;
  });
  process.env.JIRA_REQUEST_TIMEOUT_MS = "20";
  globalThis.fetch = (_url, options) => pendingUntilAbort(options.signal);
  const result = await requestJira({ pathWithQuery: "/rest/api/3/myself" });
  assert.equal(result.status, 504);
});

it("UI write timeout warns to preserve edits and verify Jira without retrying", async (t) => {
  const { build } = await import("esbuild");
  const bundled = await build({ entryPoints: ["src/services/jiraClient.js"], bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env": "{}" } });
  const client = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ code: "JIRA_TIMEOUT", outcome: "unknown", error: "Generic route error" }), { status: 504 });
  };
  await assert.rejects(client.createJiraIssue({ summary: "Fixture draft" }), (error) => {
    assert.match(error.message, /Keep your edits/);
    assert.match(error.message, /may have succeeded/);
    assert.match(error.message, /check Jira before submitting again/);
    return true;
  });
  assert.equal(calls, 1);
});
