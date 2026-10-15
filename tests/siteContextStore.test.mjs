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
