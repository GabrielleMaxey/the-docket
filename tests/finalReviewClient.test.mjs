import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { build } from "esbuild";

const bundle = async (contents) => {
  const built = await build({ stdin: { contents, resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env.VITE_API_BASE": "undefined" } });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
};
const clientSource = 'export * from "./src/services/jiraClient.js"; export * from "./src/utils/siteContextStore.js"; export * from "./src/utils/backgroundJobStore.js";';
const turn = () => new Promise((resolve) => setImmediate(resolve));
const windowFixture = (t) => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  globalThis.window = { dispatchEvent: () => true, setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms === 350 ? 0 : ms); if (ms !== 350) timer.unref(); return timer; }, clearTimeout, localStorage: { getItem: () => null } };
  t.after(() => { globalThis.window = previousWindow; globalThis.fetch = previousFetch; });
};

test("invalid import preview does not block activation or become export failed-save consent", async (t) => {
  windowFixture(t);
  const client = await bundle(clientSource);
  client.setSiteContext({ instanceId: "preview-a", generation: "1" });
  globalThis.fetch = async (url) => url.endsWith("/preview") ? new Response('{"error":"Invalid CSV"}', { status: 400 }) : new Response('{"siteContext":{"instanceId":"preview-b","generation":"2"}}');
  await assert.rejects(client.previewIssueMetadataImport({ csv: "invalid" }), /Invalid CSV/);
  assert.equal(client.getActiveBackgroundJobs().filter((job) => job.instanceId === "preview-a" && job.siteSave).length, 0);
  await client.activateJiraInstance("preview-b");
  assert.equal(client.getSiteContext().instanceId, "preview-b");
});

test("failed import commit still blocks activation until its successful retry", async (t) => {
  windowFixture(t);
  const client = await bundle(clientSource);
  client.setSiteContext({ instanceId: "commit-a", generation: "1" });
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('{"error":"Save conflict"}', { status: 409 }); };
  await assert.rejects(client.commitIssueMetadataImport("preview"), /Save conflict/);
  await assert.rejects(client.activateJiraInstance("commit-b"), /Save conflict/);
  assert.equal(calls, 1);
  globalThis.fetch = async () => new Response('{"siteContext":{"instanceId":"commit-b","generation":"2"}}');
  await client.commitIssueMetadataImport("preview-retried");
  await client.activateJiraInstance("commit-b");
  assert.equal(client.getSiteContext().instanceId, "commit-b");
});

test("binary errors retain status with empty, plain-text, HTML and JSON bodies", async (t) => {
  windowFixture(t);
  const client = await bundle(clientSource);
  for (const [body, status] of [["", 503], ["upstream failed", 502], ["<html>secret diagnostic</html>", 409], ['{"error":"Preview expired"}', 409]]) {
    globalThis.fetch = async () => new Response(body, { status });
    await assert.rejects(client.downloadTaskExport({ previewId: "synthetic" }), (error) => {
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /JSON|Unexpected|secret diagnostic|<html>/);
      assert.match(error.message, body.startsWith('{') ? /Preview expired/ : new RegExp(String(status)));
      return true;
    });
  }
});

test("non-JSON 409 invalidates the actual export modal preview", async (t) => {
  windowFixture(t);
  const source = await fs.readFile(new URL("../src/Pages/components/TaskExportModal.jsx", import.meta.url), "utf8");
  // Use the production handler up to the component's return; no DOM path runs on error.
  const downloadBody = source.slice(source.indexOf("  const download = async"), source.indexOf("  const close =", source.indexOf("  const download = async")));
  const modal = await bundle(clientSource + `
    import { downloadTaskExport } from "./src/services/jiraClient.js";
    import { runBackgroundJob, BACKGROUND_JOB_IDS } from "./src/utils/backgroundJobStore.js";
    export const runDownload = async () => {
      let preview = { previewId: "synthetic" }, invalidated = false, error;
      const busy = "", pendingSaves = [], failedSaves = [], savedConsent = false, partial = false, allowPartial = false, excludedRows = [];
      const requestVersion = { current: 0 };
      const setBusy = () => {}, setNotice = () => {}, setError = (value) => { error = value; };
      const invalidatePreview = () => { preview = null; invalidated = true; };
      ${downloadBody}
      await download();
      return { invalidated, error };
    }
  `);
  globalThis.fetch = async () => new Response("<html>proxy error</html>", { status: 409 });
  const result = await modal.runDownload();
  assert.equal(result.invalidated, true);
  assert.match(result.error, /409/);
});

test("rapid note edits coalesce, retain captured site, survive navigation and retry failures", async (t) => {
  windowFixture(t);
  const source = await fs.readFile(new URL("../src/Pages/hooks/useTaskManagerJira.js", import.meta.url), "utf8");
  const refs = source.slice(source.indexOf("  const latestNoteDraftsRef"), source.indexOf("  React.useEffect", source.indexOf("  const latestNoteDraftsRef")));
  const handlers = source.slice(source.indexOf("  const scheduleNoteAutosave"), source.indexOf("  const handleNoteImagesAdd"));
  const actual = await bundle(clientSource + `
    import { saveIssueMetadata } from "./src/services/jiraClient.js";
    import { runBackgroundJob } from "./src/utils/backgroundJobStore.js";
${source.slice(source.indexOf("const patchIssueKeyed"), source.indexOf("const removeIssueKeyed"))}
    export const mount = (siteContext) => {
      const React = { useRef: (value) => ({ current: value }), useCallback: (callback) => callback };
      const instanceId = siteContext.instanceId, storedNotes = {}, NOTE_AUTOSAVE_DELAY_MS = 350;
      const setSaveState = () => {}, setJiraNotes = () => {}, errorMessage = (error) => error.message;
      ${refs}
      ${handlers}
      return handleNoteChange;
    }
  `);
  const context = { instanceId: "notes-a", generation: "1" };
  actual.setSiteContext(context);
  const writes = [];
  let release;
  let started;
  const pending = new Promise((resolve) => { started = resolve; });
  globalThis.fetch = async (_url, options) => {
    writes.push({ ...JSON.parse(options.body), site: options.headers["X-Docket-Site"] });
    if (writes.length === 1) { started(); await new Promise((resolve) => { release = resolve; }); }
    return new Response("{}");
  };
  const change = actual.mount(context);
  for (let i = 1; i <= 100; i++) change("SAME-1", `edit ${i}`);
  await pending;
  change("SAME-1", "final before navigation");
  const remountedChange = actual.mount(context);
  remountedChange("SAME-1", "new page final");
  actual.setSiteContext({ instanceId: "notes-b", generation: "2" });
  release();
  await actual.waitForSiteSaves("notes-a");
  assert.deepEqual(writes, [
    { note: "edit 100", site: "notes-a" },
    { note: "final before navigation", site: "notes-a" },
    { note: "new page final", site: "notes-a" },
  ]);
  globalThis.fetch = async () => new Response('{"error":"Retry required"}', { status: 500 });
  remountedChange("SAME-1", "retry value");
  await assert.rejects(actual.waitForSiteSaves("notes-a"), /Retry required/);
  await turn();
  globalThis.fetch = async (_url, options) => { writes.push(JSON.parse(options.body)); return new Response("{}"); };
  remountedChange("SAME-1", "retry value");
  await actual.getBackgroundJob("docket:site:notes-a:note-autosave:SAME-1").promise;
  await actual.waitForSiteSaves("notes-a");
  assert.deepEqual(writes.at(-1), { note: "retry value" });
});
