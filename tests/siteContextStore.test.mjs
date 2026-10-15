import assert from "node:assert/strict";
import { test } from "node:test";
import * as store from "../src/utils/siteContextStore.js";
import * as jobs from "../src/utils/backgroundJobStore.js";

globalThis.window = { setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout };

test("identical keys in two sites remain isolated and captured identity stays stable", () => {
  store.setSiteContext({ instanceId: "a", generation: "1" });
  const captured = store.siteStorageKey("notes");
  store.setSiteContext({ instanceId: "b", generation: "2" });
  assert.equal(captured, "docket:site:a:notes");
  assert.equal(store.siteStorageKey("notes"), "docket:site:b:notes");
  assert.equal(store.siteStorageKey("notes", null), "docket:site:legacy:notes");
});

test("pending saves survive route unmount and failed saves prevent switching until retried", async () => {
  let finish;
  const pending = jobs.runBackgroundJob("test-save", { instanceId: "a", siteSave: true, run: () => new Promise((resolve) => { finish = resolve; }) });
  let drained = false;
  const waiting = jobs.waitForSiteSaves("a").then(() => { drained = true; });
  await Promise.resolve();
  assert.equal(drained, false);
  finish();
  await pending;
  await waiting;
  await assert.rejects(jobs.runBackgroundJob("test-failed-save", { instanceId: "a", siteSave: true, run: async () => { throw new Error("save failed"); } }), /save failed/);
  await assert.rejects(jobs.waitForSiteSaves("a"), /save failed/);
  await jobs.runBackgroundJob("test-failed-save", { instanceId: "a", siteSave: true, run: async () => "saved" });
  await jobs.waitForSiteSaves("a");
});

test("saved reports and handoffs cannot leak between sites with identical keys", async () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  window.localStorage = storage;
  window.sessionStorage = storage;
  const reports = await import("../src/utils/pageReportPersistence.js");
  const handoff = await import("../src/utils/pmAskCreateIssueHandoff.js");
  store.setSiteContext({ instanceId: "a", generation: "1" });
  reports.saveWorkWeekProjectReport("same", { report: "site A" });
  handoff.writePmAskCreateIssueHandoff({ askId: 1, title: "site A", note: "draft" });
  store.setSiteContext({ instanceId: "b", generation: "2" });
  assert.equal(reports.loadWorkWeekProjectReport("same"), null);
  assert.equal(handoff.consumePmAskCreateIssueHandoff(), null);
  store.setSiteContext({ instanceId: "a", generation: "3" });
  assert.equal(reports.loadWorkWeekProjectReport("same").report, "site A");
  assert.equal(handoff.consumePmAskCreateIssueHandoff().title, "site A");
});

test("browser requests bootstrap health, retain both headers, and refuse activation after failed saves", async (t) => {
  const { build } = await import("esbuild");
  const bundled = await build({
    stdin: { contents: 'export * from "./src/services/jiraClient.js"; export * from "./src/utils/siteContextStore.js"; export * from "./src/utils/backgroundJobStore.js";', resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env.VITE_API_BASE": "undefined" },
  });
  const client = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const nativeFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = nativeFetch; });
  const calls = [];
  let failSave = false;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/health") return new Response(JSON.stringify({ siteContext: { instanceId: "client-a", generation: "client-1" } }));
    if (url.includes("/images/")) return new Response("image");
    if (failSave) return new Response(JSON.stringify({ error: "Synthetic save failed" }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }));
  };
  await client.saveIssueMetadata({ issueKey: "SAME-1", note: "retained draft" });
  assert.equal(calls[0].url, "/api/health");
  assert.equal(calls[1].options.headers["X-Docket-Site"], "client-a");
  assert.equal(calls[1].options.headers["X-Docket-Generation"], "client-1");
  assert.equal(calls[1].options.headers["Content-Type"], "application/json");
  await client.fetchKeptNoteImageBlob("SAME-1", 1);
  assert.equal(calls.at(-1).options.headers["X-Docket-Generation"], "client-1");
  failSave = true;
  await assert.rejects(client.saveIssueMetadata({ issueKey: "SAME-1", note: "unsaved draft" }), /Synthetic save failed/);
  const before = calls.length;
  await assert.rejects(client.activateJiraInstance("client-b"), /Synthetic save failed/);
  assert.equal(calls.length, before);
  assert.equal(client.getSiteContext().instanceId, "client-a");
  failSave = false;
  await client.saveIssueMetadata({ issueKey: "SAME-1", note: "unsaved draft" });
  await client.waitForSiteSaves("client-a");
  let finishSwitch;
  globalThis.fetch = () => new Promise((resolve) => { finishSwitch = resolve; });
  const switching = client.activateJiraInstance("client-b");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.isSiteSwitching(), true);
  finishSwitch(new Response(JSON.stringify({ siteContext: { instanceId: "client-b", generation: "client-2" } })));
  await switching;
  assert.equal(client.isSiteSwitching(), false);
  assert.equal(client.getSiteContext().instanceId, "client-b");
});

test("queued saves from a remounted page run after its older pending save", async () => {
  const saved = [];
  let finishFirst;
  const first = jobs.runBackgroundJob("remounted-note", { instanceId: "queue-site", siteSave: true, queue: true, run: async () => { await new Promise((resolve) => { finishFirst = resolve; }); saved.push("old draft"); } });
  const second = jobs.runBackgroundJob("remounted-note", { instanceId: "queue-site", siteSave: true, queue: true, run: async () => { saved.push("new draft"); } });
  await Promise.resolve();
  assert.deepEqual(saved, []);
  finishFirst();
  await Promise.all([first, second, jobs.waitForSiteSaves("queue-site")]);
  assert.deepEqual(saved, ["old draft", "new draft"]);
});

test("drill-downs invalidate a deferred old-site response before subsequent requests or persistence", async (t) => {
  const { build } = await import("esbuild");
  const bundle = await build({ stdin: { contents: 'export * from "./src/Pages/hooks/jiraJqlRunWorkflow.js"; export * from "./src/utils/siteContextStore.js";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env.VITE_API_BASE": "undefined" } });
  const workflow = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const nativeFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = nativeFetch; });
  for (const [name, inputs] of [
    ["loadDrillDownIssuesByAssignee", { assigneeName: "Synthetic", epicPresetId: "7" }],
    ["loadDrillDownIssueByKey", { issueKey: "SAME-1" }],
    ["loadDrillDownByJql", { jql: "key = SAME-1", label: "Synthetic" }],
  ]) {
    const values = new Map();
    window.localStorage = window.sessionStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
    const calls = [];
    let release;
    let signalStarted;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    globalThis.fetch = async (url, options) => {
      calls.push({ url, headers: options.headers });
      if (calls.length === 1) { signalStarted(); await new Promise((resolve) => { release = resolve; }); }
      const body = url.includes("scope-jql") ? { scopeJql: "project = ORIGINAL" } : url.includes("/search/") ? { issues: [{ key: "SAME-1", fields: {} }], total: 1, isComplete: true } : { items: {} };
      return new Response(JSON.stringify(body));
    };
    workflow.setSiteContext({ instanceId: "original", generation: "generation-a" });
    let runs = [{ index: 0, label: "Private original run", jql: "project = ORIGINAL", issues: [] }];
    const noop = () => {};
    const running = workflow[name]({ ...inputs, clampPriority: Number, setJqlRuns: (update) => { runs = update(runs); }, setJqlLoading: noop, setJiraRowPriorities: noop, setJiraNotes: noop, setJqlError: noop, fieldMappingRows: [] });
    await started;
    assert.equal(calls[0].url.includes("scope-jql"), name === "loadDrillDownIssuesByAssignee");
    workflow.setSiteContext({ instanceId: "new", generation: "generation-b" });
    release();
    const completed = await running;
    assert.equal(calls.some((call) => call.headers["X-Docket-Site"] === "new"), false, name);
    assert.equal(completed, false, name);
    assert.equal(values.has("docket:site:new:workWeekTasksJiraLastJqlRuns"), false, name);
  }
});

test("parent enrichment retains captured headers across a switch and invalidates the drill-down", async (t) => {
  const { build } = await import("esbuild");
  const bundle = await build({ stdin: { contents: 'export * from "./src/Pages/hooks/jiraJqlRunWorkflow.js"; export * from "./src/utils/siteContextStore.js";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env.VITE_API_BASE": "undefined" } });
  const workflow = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const nativeFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = nativeFetch; });
  workflow.setSiteContext({ instanceId: "original", generation: "generation-a" });
  const calls = [];
  let release;
  let signalStarted;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  const parentWait = new Promise((resolve) => { release = resolve; });
  globalThis.fetch = async (url, options) => {
    const { jql } = JSON.parse(options.body);
    calls.push({ url, jql, headers: options.headers });
    let issues;
    if (jql.includes("PARENT-1")) {
      signalStarted();
      await parentWait;
      issues = [{ key: "PARENT-1", fields: { parent: { key: "ROOT-1" } } }];
    } else if (jql.includes("ROOT-1")) {
      issues = [{ key: "ROOT-1", fields: { customfield_10009: "2026-10-14", customfield_10008: "2026-10-14" } }];
    } else {
      issues = [{ key: "SAME-1", fields: { parent: { key: "PARENT-1" } } }];
    }
    return new Response(JSON.stringify({ issues, total: issues.length, isComplete: true }));
  };
  const noop = () => {};
  const running = workflow.loadDrillDownIssueByKey({ issueKey: "SAME-1", clampPriority: Number, setJqlRuns: () => assert.fail("Stale drill-down updated runs"), setJqlLoading: noop, setJiraRowPriorities: noop, setJiraNotes: noop, setJqlError: noop, fieldMappingRows: [] });
  await started;
  workflow.setSiteContext({ instanceId: "new", generation: "generation-b" });
  release();
  assert.equal(await running, false);
  assert.ok(calls.some((call) => call.jql.includes("ROOT-1")), "Exercise a request after the switch");
  assert.ok(calls.every((call) => call.headers["X-Docket-Site"] === "original" && call.headers["X-Docket-Generation"] === "generation-a"));
  assert.equal(calls.some((call) => call.url.includes("metadata")), false);
});

test("deferred drill-down state updaters persist only to their captured site", async (t) => {
  const { build } = await import("esbuild");
  const bundle = await build({ stdin: { contents: 'export * from "./src/Pages/hooks/jiraJqlRunWorkflow.js"; export * from "./src/utils/siteContextStore.js";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env.VITE_API_BASE": "undefined" } });
  const workflow = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const nativeFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = nativeFetch; });
  for (const [name, inputs] of [
    ["loadDrillDownIssuesByAssignee", { assigneeName: "Synthetic", epicPresetId: "7" }],
    ["loadDrillDownIssueByKey", { issueKey: "SAME-1" }],
    ["loadDrillDownByJql", { jql: "key = SAME-1", label: "Synthetic" }],
  ]) {
    const values = new Map();
    window.localStorage = window.sessionStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
    workflow.setSiteContext({ instanceId: "original", generation: "generation-a" });
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      const body = url.includes("scope-jql") ? { scopeJql: "project = ORIGINAL" } : url.includes("/search/") ? { issues: [{ key: "SAME-1", fields: {} }], total: 1, isComplete: true } : { items: {} };
      return new Response(JSON.stringify(body));
    };
    let updateRuns;
    const noop = () => {};
    assert.equal(await workflow[name]({ ...inputs, clampPriority: Number, setJqlRuns: (update) => { updateRuns = update; }, setJqlLoading: noop, setJiraRowPriorities: noop, setJiraNotes: noop, setJqlError: noop, fieldMappingRows: [] }), true, name);
    assert.ok(calls.some((call) => call.url.includes("metadata")), name);
    if (inputs.epicPresetId) assert.match(calls[1].options.body, /project = ORIGINAL/);
    workflow.setSiteContext({ instanceId: "new", generation: "generation-b" });
    updateRuns([{ index: 0, label: "Private original run", jql: "project = ORIGINAL", issues: [] }]);
    assert.match(values.get("docket:site:original:workWeekTasksJiraLastJqlRuns"), /Private original run/, name);
    assert.equal(values.has("docket:site:new:workWeekTasksJiraLastJqlRuns"), false, name);
  }
});
