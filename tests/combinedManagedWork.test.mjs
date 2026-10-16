import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

let bundleId = 0;
const bundle = async (contents, plugins = []) => {
  const result = await build({ stdin: { contents, resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "esm", loader: { ".css": "empty" }, define: { "import.meta.env.VITE_API_BASE": "undefined" }, plugins });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${bundleId++}`);
};
const source = (instanceId, siteHost = `${instanceId}.atlassian.net`) => ({ kind: "saved-site", instanceId, siteHost, baseUrl: `https://${siteHost}`, displayName: instanceId, revision: `revision-${instanceId}` });
const installBrowser = t => {
  const before = { fetch: globalThis.fetch, window: globalThis.window, localStorage: globalThis.localStorage, XMLHttpRequest: globalThis.XMLHttpRequest };
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.window = { localStorage, sessionStorage: localStorage, setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout, dispatchEvent() {} };
  t.after(() => Object.assign(globalThis, before));
  return values;
};

test("all managed edit/read families carry captured saved headers, real keys and source-qualified jobs", async t => {
  installBrowser(t);
  const client = await bundle('export * from "./src/services/jiraClient.js"; export * from "./src/utils/siteContextStore.js"; export * from "./src/utils/backgroundJobStore.js";');
  client.setSiteContext({ instanceId: "active", generation: 7 });
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ items: {}, mappings: [], attachments: [] })); };
  const file = new File(["image"], "test.png", { type: "image/png" });
  const operations = [
    (c, o) => c.updateJiraIssueStatus({ issueKey: "ABC-1", targetStatus: "Closed" }, o),
    (c, o) => c.updateJiraIssueAssignee({ issueKey: "ABC-1", assignee: "person" }, o),
    (c, o) => c.updateJiraIssueDateField({ issueKey: "ABC-1", role: "due_date", value: "2026-11-01" }, o),
    (c, o) => c.saveIssueMetadata({ issueKey: "ABC-1", note: "draft", priority: 2, followUp: "now" }, o),
    (c, o) => c.saveTeamPriority({ issueKey: "ABC-1", priority: 3 }, o),
    (c, o) => c.saveTeamDate({ issueKey: "ABC-1", plannedStart: "2026-11-01" }, o),
    (c, o) => c.deleteTeamDate("ABC-1", o),
    (c, o) => c.updatePinnedGantt("ABC-1", true, o),
    (c, o) => c.pushJiraIssueNote({ issueKey: "ABC-1", note: "draft" }, o),
    (c, o) => c.pushJiraIssueNote({ issueKey: "ABC-1", note: "draft", images: [{ file, filename: file.name }] }, o),
    (c, o) => c.saveKeptNoteImages({ issueKey: "ABC-1", images: [{ file, filename: file.name }] }, o),
    (c, o) => c.deleteKeptNoteImages("ABC-1", o),
    (c, o) => c.fetchKeptNoteImageBlob("ABC-1", 1, o),
    (c, o) => c.searchJiraUsers("person", o),
    (c, o) => c.resolveJiraUsersByAccountIds(["person"], o),
    (c, o) => c.fetchAttachmentLimits(o),
    (c, o) => c.fetchIssueAttachments("ABC-1", o),
    (c, o) => c.fetchFieldMappings(o),
    (c, o) => c.fetchIssueMetadataBulk(["ABC-1"], o),
    (c, o) => c.fetchTeamMetadataBulk(["ABC-1"], o),
    (c, o) => c.fetchTeamPriorityBulk(["ABC-1"], o),
    (c, o) => c.fetchTeamDatesBulk(["ABC-1"], o),
  ];
  for (const id of ["a", "b"]) {
    for (const operation of operations) {
      await operation(client, { siteContext: source(id) });
      const { url, options } = calls.at(-1);
      assert.equal(options.headers["X-Docket-Saved-Site"], id, url);
      assert.equal(options.headers["X-Docket-Saved-Revision"], `revision-${id}`, url);
      assert.equal(options.headers["X-Docket-Site"], undefined, url);
      assert.equal(options.headers["X-Docket-Generation"], undefined, url);
      assert.ok(!url.includes("%5B"), "real key remains in URL");
    }
  }
  assert.deepEqual(new Set(client.getActiveBackgroundJobs().map(job => job.instanceId)), new Set(["a", "b"]));
  assert.ok(!calls.some(call => /health|activate/.test(call.url)));
});

test("multipart attachment upload and stale errors retain the captured saved source", async t => {
  installBrowser(t);
  const client = await bundle('export * from "./src/services/jiraClient.js"; export * from "./src/utils/siteContextStore.js";');
  client.setSiteContext({ instanceId: "active", generation: 7 });
  const uploads = [];
  globalThis.XMLHttpRequest = function () { this.upload = {}; this.headers = {}; this.open = (method, url) => { this.url = url; }; this.setRequestHeader = (key, value) => { this.headers[key] = value; }; this.send = body => { uploads.push(this); this.status = 200; this.responseText = '{"uploaded":[]}'; this.onload(); }; };
  await client.uploadIssueAttachments("ABC-1", [new File(["file"], "test.txt")], { siteContext: source("b") });
  assert.equal(uploads[0].headers["X-Docket-Saved-Site"], "b");
  assert.equal(uploads[0].headers["X-Docket-Site"], undefined);
  globalThis.fetch = async () => new Response('{"error":"Saved entry changed. Keep your edits.","code":"SAVED_SITE_CONTEXT_CHANGED"}', { status: 409 });
  await assert.rejects(client.updateJiraIssueStatus({ issueKey: "ABC-1", targetStatus: "Closed" }, { siteContext: source("b") }), error => error.status === 409 && error.code === "SAVED_SITE_CONTEXT_CHANGED");
});

const hooksPlugin = { name: "managed-hooks", setup(build) {
  build.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "hooks" }));
  build.onLoad({ filter: /.*/, namespace: "hooks" }, () => ({ contents: `
    let slots = new Map(), current, cursor = 0, effects = [];
    export const useState = initial => { const store = current; const i = cursor++; if (!(i in store)) store[i] = typeof initial === 'function' ? initial() : initial; return [store[i], next => { store[i] = typeof next === 'function' ? next(store[i]) : next; }]; };
    export const useRef = initial => useState(() => ({current: initial}))[0];
    export const useMemo = (factory, deps) => { const i = cursor++; if (!current[i] || deps.some((v, n) => v !== current[i].deps[n])) current[i] = {deps, value: factory()}; return current[i].value; };
    export const useCallback = (fn, deps) => useMemo(() => fn, deps);
    export const useEffect = (effect, deps) => { const store = current; const i = cursor++; if (!store[i] || !deps || deps.some((v,n) => v !== store[i].deps?.[n])) { const old = store[i]; store[i] = {deps}; effects.push(() => { old?.cleanup?.(); store[i].cleanup = effect(); }); } };
    export const render = (id, component) => { if (!slots.has(id)) slots.set(id, []); current = slots.get(id); cursor = 0; const result = component(); effects.splice(0).forEach(effect => effect()); return result; };
    export const unmount = () => { for (const store of slots.values()) for (const entry of store) entry?.cleanup?.(); };
    export const createElement = (type, props, ...children) => ({type, props: props || {}, children});
    export const createContext = value => ({Provider: 'provider', value});
    export default {useState,useRef,useMemo,useCallback,useEffect,createElement,createContext};
  ` }));
  build.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: "router", namespace: "router" }));
  build.onLoad({ filter: /.*/, namespace: "router" }, () => ({ contents: 'export const Link="a";' }));
  build.onResolve({ filter: /^semantic-ui-react$/ }, () => ({ path: "ui", namespace: "ui" }));
  build.onLoad({ filter: /.*/, namespace: "ui" }, () => ({ contents: 'export const Button="button", Modal="modal", Icon="i", Input="input", Dropdown="select", Message="message", Checkbox="input", Form="form";' }));
} };
const issue = (fields = {}) => ({ id: "same-id", key: "ABC-1", fields: { summary: "Work", status: { name: "Custom Open", statusCategory: { key: "new" } }, assignee: { accountId: "me", displayName: "Me" }, ...fields } });
const turn = () => new Promise(resolve => setImmediate(resolve));

test("saved editor hydrates independent same-key local state and keeps drafts after stale saves without touching ordinary caches", async t => {
  const storage = installBrowser(t);
  storage.set("docket:site:active:sentinel", "ordinary");
  const app = await bundle('export * from "./src/Pages/hooks/useTaskManagerJira.js"; export * from "react"; export * from "./src/utils/siteContextStore.js";', [hooksPlugin]);
  t.after(app.unmount);
  app.setSiteContext({ instanceId: "active", generation: 10 });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/issue-metadata/bulk")) return new Response(JSON.stringify({ items: { "ABC-1": { note: `note-${options.headers["X-Docket-Saved-Site"]}`, priority: 2, followUp: "now", pinnedGantt: true } } }));
    if (options.method === "POST" && url.endsWith("/status")) return new Response('{"error":"Saved entry changed","code":"SAVED_SITE_CONTEXT_CHANGED"}', { status: 409 });
    return new Response('{"items":{}}');
  };
  const runs = ["a", "b"].map(id => ({ instanceId: id, sourceContext: source(id), issues: [issue()], fieldMappings: [], status: "complete" }));
  const render = id => app.render(id, () => app.useTaskManagerJira({ siteContext: runs[id === "a" ? 0 : 1].sourceContext, combinedRun: runs[id === "a" ? 0 : 1] }));
  render("a"); render("b"); await turn(); await turn();
  assert.equal(render("a").jiraNotes["ABC-1"], "note-a");
  assert.equal(render("b").jiraNotes["ABC-1"], "note-b");
  assert.equal(render("a").jqlRuns[0].index, undefined, "combined run is not a fake ordinary JQL slot");
  render("b").handleStatusDraftChange("ABC-1", "Closed");
  await render("b").handleStatusUpdate("ABC-1", "Custom Open");
  assert.equal(render("b").statusDrafts["ABC-1"], "Closed");
  assert.match(render("b").rowUpdateState["ABC-1"].error, /Saved entry changed/);
  assert.equal(render("a").statusDrafts["ABC-1"], undefined);
  assert.deepEqual([...storage], [["docket:site:active:sentinel", "ordinary"]]);
  assert.ok(calls.every(call => ["a", "b"].includes(call.options.headers["X-Docket-Saved-Site"])));
});

test("combined metrics separate entry identity from distinct tasks and use source dates and status categories", async () => {
  const model = await bundle('export * from "./src/Pages/combinedWorkModel.js";');
  assert.notEqual(model.combinedRowKey("a", "ABC-1"), model.combinedRowKey("b", "ABC-1"));
  const sites = [
    { instanceId: "a", sourceContext: source("a", "same.atlassian.net"), status: "complete", issues: [issue({ status: { name: "Closed by name only", statusCategory: { key: "indeterminate" } }, custom_due: "2000-01-01" })], dueFieldId: "custom_due" },
    { instanceId: "duplicate", sourceContext: source("duplicate", "same.atlassian.net"), status: "complete", issues: [issue({ custom_due: "2000-01-01" })], dueFieldId: "custom_due" },
    { instanceId: "b", sourceContext: source("b"), status: "complete", issues: [issue({ status: { name: "Shipped", statusCategory: { key: "done" } } })] },
    { instanceId: "failed", status: "failed", issues: [] },
  ];
  const metrics = model.buildCombinedMetrics(sites);
  assert.equal(metrics.entryCount, 3);
  assert.equal(metrics.issues.length, 2);
  assert.equal(metrics.open, 1);
  assert.equal(metrics.closed, 1);
  assert.equal(metrics.overdue, 1);
  assert.equal(metrics.inProgress, 1);
  assert.equal(metrics.incomplete, true);
});

const find = (node, predicate) => !node || typeof node !== "object" ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
const text = node => typeof node === "string" || typeof node === "number" ? String(node) : (node?.children || []).flat(Infinity).map(text).join(" ");

test("one mixed table uses composite UI identity while retaining real issue labels and nested saved contexts", async t => {
  installBrowser(t);
  const app = await bundle('export { default as Table } from "./src/Pages/components/JiraResultsTable.jsx"; export * from "react";', [hooksPlugin]);
  t.after(app.unmount);
  const issues = ["a", "b"].map(id => ({ ...issue(), sourceContext: source(id), sourceRun: { dueFieldId: `due_${id}` }, self: `https://${id}.atlassian.net/rest/api/3/issue/1` }));
  const key = issue => JSON.stringify([issue.sourceContext.instanceId, issue.key]);
  const edits = [];
  const props = { jqlRuns: [], combinedRun: { issues, label: "Combined", loadComplete: true }, getIssueStateKey: key,
    isClosedLikeStatus: () => false, clampPriority: Number, getPriorityClass: () => "", getPriorityRowClass: () => "", formatDate: String,
    statusOptions: [], collapsedRowKeys: new Set(), expandedPlanningKeys: new Set(), jiraRowPriorities: {}, selectedForPush: {}, pushState: {}, saveState: {}, rowUpdateState: {}, statusDrafts: {}, iddDrafts: {}, dueDateDrafts: {}, mrdDrafts: {}, startDateByKey: {}, completeDateByKey: {}, planningMetaByKey: {}, assigneeDrafts: {}, noteImagesByKey: {}, noteImageErrorsByKey: {}, keepNoteImagesByKey: {}, noteImageKeepPendingByKey: {}, lastPushedJiraNoteByKey: {},
    jiraNotes: { [key(issues[0])]: "note-a", [key(issues[1])]: "note-b" }, handleNoteChange: (...args) => edits.push(args), handleSavePlanningAll: async () => {},
  };
  const render = () => app.render("table", () => app.Table(props));
  const tree = render();
  assert.equal(find(tree, node => node.type?.name === "CombinedOpenWork").length, 0, "no recursive combined page");
  assert.equal(find(tree, node => node.type === "table" && node.props.className === "ww-results-table").length, 1);
  assert.match(text(tree), /Jira site/);
  const notes = find(tree, node => node.props.className === "ww-note-textarea");
  assert.deepEqual(notes.map(node => node.props.value), ["note-a", "note-b"]);
  notes[1].props.onChange("new-b");
  assert.deepEqual(edits, [[key(issues[1]), "new-b"]]);
  const assignees = find(tree, node => node.type?.name === "AssigneeCell");
  assert.deepEqual(assignees.map(node => node.props.siteContext.instanceId), ["a", "b"]);
  assert.deepEqual(assignees.map(node => node.props.issueKey), issues.map(key), "nested assignee callback identity remains source-qualified");
  assert.deepEqual(find(tree, node => node.type?.name === "PriorityCell").map(node => node.props.issueKey), issues.map(key), "nested priority callback identity remains source-qualified");
  assert.equal(find(tree, node => node.type === "a" && text(node) === "ABC-1").length, 2);
  const attachmentButton = find(tree, node => node.type === "button" && /Attach files/.test(text(node)))[1];
  attachmentButton.props.onClick();
  const modal = find(render(), node => node.type?.name === "AttachFilesModal")[0];
  assert.equal(modal.props.issueKey, "ABC-1");
  assert.equal(modal.props.siteContext.instanceId, "b");
});

test("combined page defaults to managed with mounted source models and preserves loaded scope across presentation changes", async t => {
  installBrowser(t);
  const app = await bundle('export { default as Page } from "./src/Pages/CombinedOpenWork.jsx"; export * from "react";', [hooksPlugin]);
  t.after(app.unmount);
  const sites = ["a", "b"].map(id => ({ id, instanceId: id, enabled: true, displayName: id, baseUrl: source(id).baseUrl, sourceContext: source(id), issues: [issue()], fieldMappings: [], status: "complete", loaded: 1, rows: [{ issueKey: "ABC-1", summary: id, url: `${source(id).baseUrl}/browse/ABC-1` }] }));
  globalThis.fetch = async url => new Response(JSON.stringify(url.endsWith("health") ? { siteContext: { instanceId: "active", generation: 1 } } : url.endsWith("instances") ? { instances: sites } : { fetchedAt: new Date().toISOString(), sites }));
  const render = () => app.render("page", () => app.Page());
  render(); await turn();
  await find(render(), node => node.type === "button" && text(node) === "Load open work")[0].props.onClick();
  let tree = render();
  assert.equal(find(tree, node => node.type?.name === "CombinedSiteEditor").length, 2);
  assert.equal(find(tree, node => node.type?.name === "MyMetricsSection").length, 1);
  const managed = find(tree, node => node.type === "button" && text(node) === "Managed tasks")[0];
  assert.equal(managed.props["aria-pressed"], true);
  find(tree, node => node.type === "button" && text(node) === "List")[0].props.onClick();
  tree = render();
  assert.equal(find(tree, node => node.type?.name === "CombinedSiteEditor").length, 2);
  assert.equal(find(tree, node => node.type?.name === "MyMetricsSection").length, 1);
  assert.equal(find(tree, node => node.type === "a" && text(node) === "ABC-1").length, 2);
});

test("combined metrics render with their own preferences and never mount active-scoped report generation", async t => {
  const storage = installBrowser(t);
  const app = await bundle('export { default as Metrics } from "./src/Pages/components/MyMetricsSection.jsx"; export { default as Numbers } from "./src/Pages/components/JqlRunMetrics.jsx"; export * from "react";', [hooksPlugin]);
  t.after(app.unmount);
  const metrics = { issues: [issue()], total: 1, open: 1, closed: 0, overdue: 0, inProgress: 1, entryCount: 2, incomplete: true };
  const tree = app.render("metrics", () => app.Metrics({ run: { issues: [issue()] }, scope: "combined-work", combinedMetrics: metrics }));
  assert.equal(find(tree, node => node.type?.name === "ProjectReportPanel").length, 0);
  assert.equal(tree.props.storageKey, "docket:combined-work:my-metrics-open");
  const numbers = app.render("numbers", () => app.Numbers({ run: metrics, scope: "combined-work", combinedMetrics: metrics }));
  assert.match(text(numbers), /2\s+saved-entry rows/);
  const capacity = find(numbers, node => node.type?.name === "CapacityRow")[0];
  capacity.props.onLimitChange({ target: { value: "25" } });
  assert.equal(storage.get("docket:combined-work:ic-max-capacity"), "25");
  assert.ok(![...storage.keys()].some(key => key.startsWith("docket:site:")));
});

test("real mixed editor actions route every family to its source, preserve local/Team planning and reconcile only Jira fields", async t => {
  const storage = installBrowser(t);
  const app = await bundle('export * from "./src/Pages/hooks/useTaskManagerJira.js"; export * from "./src/Pages/combinedWorkModel.js"; export * from "./src/utils/backgroundJobStore.js"; export * from "react";', [hooksPlugin]);
  t.after(app.unmount);
  const calls = [];
  let rejectB = false;
  const updatedIssue = issue({ status: { name: "Shipped", statusCategory: { key: "done" } }, assignee: { accountId: "other" } });
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const id = options.headers["X-Docket-Saved-Site"];
    if (url.endsWith("/issue-metadata/bulk")) return new Response(JSON.stringify({ items: { "ABC-1": { note: `local-${id}`, plannedStart: "2026-10-01", followUp: "now" } } }));
    if (url.endsWith("/dates/bulk")) return new Response(JSON.stringify({ items: { "ABC-1": { plannedStart: "2026-12-01", startDate: "2026-12-02" } } }));
    if (url.endsWith("/metadata/bulk")) return new Response(JSON.stringify({ items: { "ABC-1": { followUp: "next" } } }));
    if (url.endsWith("/health")) return new Response('{"configured":true,"ok":true}');
    if (url.endsWith("/search")) return new Response(JSON.stringify({ issues: [updatedIssue] }));
    if (rejectB && id === "b" && url.endsWith("/comment")) return new Response('{"error":"Stale B","code":"SAVED_SITE_CONTEXT_CHANGED"}', { status: 409 });
    return new Response('{"items":{},"ok":true,"accountId":"other","resolvedAssignee":"Other"}');
  };
  const sites = ["a", "b", "duplicate"].map(id => ({ instanceId: id, sourceContext: source(id, id === "duplicate" ? "a.atlassian.net" : `${id}.atlassian.net`), issues: [issue()], fieldMappings: [], status: "complete" }));
  let models = {};
  const onConfirmedIssue = (context, confirmed) => {
    for (const site of sites.filter(site => site.sourceContext.siteHost === context.siteHost)) models[site.instanceId].reconcileIssue(confirmed);
  };
  const render = () => {
    for (const site of sites) models[site.instanceId] = app.render(site.instanceId, () => app.useTaskManagerJira({ siteContext: site.sourceContext, combinedRun: site, onConfirmedIssue }));
    return app.buildCombinedTableModel(sites, models);
  };
  render(); await turn(); await turn();
  let table = render();
  const a = app.combinedRowKey("a", "ABC-1"), b = app.combinedRowKey("b", "ABC-1");
  assert.equal(table.planningMetaByKey[b].plannedStart, "2026-10-01");
  assert.equal(table.teamPlanningMetaByKey[b].plannedStart, "2026-12-01");
  table.handlePlanningFieldChange(b, "followUp", "now", { forceTeam: true });
  table = render();
  assert.equal(table.planningMetaByKey[b].followUp, "now");
  assert.equal(table.teamPlanningMetaByKey[b].teamFollowUp, "now");
  table.handleStartDateChange(b, "2026-12-03", { forceTeam: true });
  table.handleCompleteDateChange(b, "2026-12-04", { forceTeam: true });
  table = render();
  await table.handleSavePlanningAll(b, { forceTeam: true });
  table.handlePlanningFieldChange(b, "requestor", "Local person");
  table = render();
  await table.handleSavePlanningAll(b);
  table.handleRowPriorityChange(b, 3);
  table.handlePinnedGanttChange(b, true);
  table.handleIddDraftChange(b, "2026-11-01"); table = render(); await table.handleIddUpdate(b, "", "custom_idd");
  table.handleDueDateDraftChange(b, "2026-11-02"); table = render(); await table.handleDueDateUpdate(b, "");
  table.handleMrdDraftChange(b, "2026-11-03"); table = render(); await table.handleMrdUpdate(b, "", "custom_mrd");
  table.handleAssigneeDraftChange(b, "Other", "other"); table = render(); await table.handleAssigneeUpdate(b);
  table.handleStatusDraftChange(a, "Shipped"); table = render(); await table.handleStatusUpdate(a, "Custom Open");
  table = render();
  assert.equal(models.a.jqlRuns[0].issues[0].fields.status.statusCategory.key, "done");
  assert.equal(models.duplicate.jqlRuns[0].issues[0].fields.status.statusCategory.key, "done");
  assert.equal(models.duplicate.jiraNotes["ABC-1"], "local-duplicate");
  assert.equal(models.a.jiraNotes["ABC-1"], "local-a");
  assert.equal(models.duplicate.jqlRuns[0].issues[0].combinedEligible, false);
  assert.equal(app.buildCombinedMetrics(sites.map(site => ({ ...site, ...models[site.instanceId].jqlRuns[0] }))).open, 0);
  const writes = calls.filter(call => ["PUT", "PATCH", "DELETE"].includes(call.options.method) || /\/(status|assignee|date-field)$/.test(call.url));
  assert.ok(writes.every(call => call.options.headers["X-Docket-Saved-Site"] === (call.url.endsWith("/status") ? "a" : "b")));
  assert.ok(writes.some(call => call.url.includes("team-priority") && JSON.parse(call.options.body).plannedStart === "2026-12-01"));
  assert.ok(writes.some(call => call.url.includes("issue-metadata") && JSON.parse(call.options.body).plannedStart === "2026-10-01"));
  assert.deepEqual([...storage], []);
  assert.ok(calls.every(call => call.options.headers["X-Docket-Site"] === undefined));

  // Bulk failures remain separate, including unsent images; direct push also works for retained rows.
  const file = new File(["draft"], "draft.png", { type: "image/png" });
  table.handleNoteImagesAdd(b, [file]); table = render();
  rejectB = true;
  models.a.reconcileIssue(issue());
  models.b.reconcileIssue(issue());
  table = render();
  table.handleSelectAll(table.combinedRun.issues, true);
  table = render();
  await table.handlePushSelected(table.combinedRun.issues);
  table = render();
  assert.equal(table.noteImagesByKey[b].length, 1);
  assert.equal(table.jiraNotes[b], "local-b");
  assert.match(table.pushState[b].error, /Stale B/);
  assert.match(table.pushState[a].success, /Pushed/);
});

test("active-site changes ask before discarding mounted combined drafts and cancellation sends no activation", async t => {
  installBrowser(t);
  const events = new EventTarget();
  window.addEventListener = events.addEventListener.bind(events);
  window.removeEventListener = events.removeEventListener.bind(events);
  window.dispatchEvent = events.dispatchEvent.bind(events);
  const prompts = [];
  window.confirm = message => { prompts.push(message); return false; };
  const app = await bundle('export { default as Page } from "./src/Pages/CombinedOpenWork.jsx"; export * from "./src/services/jiraClient.js"; export * from "react";', [hooksPlugin]);
  t.after(app.unmount);
  const calls = [];
  const site = { id: "a", instanceId: "a", enabled: true, displayName: "A", baseUrl: source("a").baseUrl, sourceContext: source("a"), issues: [issue()], fieldMappings: [], status: "complete", loaded: 1, rows: [] };
  globalThis.fetch = async url => { calls.push(url); return new Response(JSON.stringify(url.endsWith("health") ? { siteContext: { instanceId: "active", generation: 1 } } : url.endsWith("instances") ? { instances: [site] } : url.endsWith("activate") ? { siteContext: { instanceId: "other", generation: 2 } } : { sites: [site], fetchedAt: "now" })); };
  const render = () => app.render("page", () => app.Page());
  render(); await turn();
  await find(render(), node => node.type === "button" && text(node) === "Load open work")[0].props.onClick();
  const editor = find(render(), node => node.type?.name === "CombinedSiteEditor")[0];
  const model = { jqlRuns: [{ issues: [] }], collapsedRowKeys: new Set(), jiraNotes: { "ABC-1": "Unpushed" }, statusDrafts: {}, iddDrafts: {}, dueDateDrafts: {}, mrdDrafts: {}, assigneeDrafts: {}, noteImagesByKey: {}, planningMetaByKey: {}, teamPlanningMetaByKey: {}, jiraRowPriorities: {}, saveState: {}, rowUpdateState: {} };
  editor.props.onModel("a", model);
  assert.equal(find(render(), node => node.type?.name === "MyMetricsSection")[0].props.combinedSites[0].jiraNotes["ABC-1"], "Unpushed");
  await assert.rejects(app.activateJiraInstance("other"), /cancelled/i);
  assert.equal(prompts.length, 1);
  assert.ok(!calls.some(url => url.endsWith("activate")));
  window.confirm = () => true;
  await app.activateJiraInstance("other");
  assert.equal(calls.filter(url => url.endsWith("activate")).length, 1);
});

test("nested assignee search, attachment loading and parent date enrichment use their own saved context", async t => {
  installBrowser(t);
  const app = await bundle('export { default as Assignee } from "./src/Pages/components/cells/AssigneeCell.jsx"; export { default as Attach } from "./src/Pages/components/AttachFilesModal.jsx"; export * from "./src/utils/jiraIssueDoneDates.js"; export * from "react";', [hooksPlugin]);
  t.after(app.unmount);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const id = options.headers["X-Docket-Saved-Site"];
    return new Response(JSON.stringify(url.endsWith("search") ? { issues: [{ key: "PARENT-1", fields: { [`mrd_${id}`]: id === "a" ? "2026-10-01" : "2026-11-01" } }] } : { items: [], attachments: [], maxMb: 25, maxCount: 10 }));
  };
  const contexts = [source("a"), source("b")];
  for (const context of contexts) {
    const props = { issueKey: JSON.stringify([context.instanceId, "ABC-1"]), displayIssueKey: "ABC-1", siteContext: context, assignee: "Me", draftValue: "Person", knownAssignees: [], onDraftChange() {}, onUpdate() {} };
    const render = () => app.render(context.instanceId, () => app.Assignee(props));
    find(render(), node => node.type === "input")[0].props.onFocus(); render();
    app.render(`attach-${context.instanceId}`, () => app.Attach({ issueKey: "ABC-1", siteContext: context, open: true }));
    const enriched = await app.enrichRunWithParentDoneDates({ issues: [issue({ parent: { key: "PARENT-1" } })] }, [{ role: "most_recent_done_date", fieldId: `mrd_${context.instanceId}` }], { siteContext: context });
    assert.equal(enriched.parentMostRecentDoneDateByKey["PARENT-1"], context.instanceId === "a" ? "2026-10-01" : "2026-11-01");
  }
  await new Promise(resolve => setTimeout(resolve, 320));
  for (const id of ["a", "b"]) {
    assert.ok(calls.some(call => call.url.includes("users/search") && call.options.headers["X-Docket-Saved-Site"] === id));
    assert.ok(calls.some(call => call.url.endsWith("ABC-1/attachments") && call.options.headers["X-Docket-Saved-Site"] === id));
  }
  assert.ok(calls.every(call => call.options.headers["X-Docket-Site"] === undefined));
});

for (const delayedPath of ["/issue-metadata/bulk", "/team-priority/bulk", "/dates/bulk", "/metadata/bulk", "/search"]) {
  test(`combined source waits for ${delayedPath} before edits without blocking a ready source`, async t => {
    installBrowser(t);
    const app = await bundle('export * from "./src/Pages/hooks/useTaskManagerJira.js"; export * from "./src/Pages/combinedWorkModel.js"; export { default as Table } from "./src/Pages/components/JiraResultsTable.jsx"; export * from "react";', [hooksPlugin]);
    t.after(app.unmount);
    const writes = [];
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    globalThis.fetch = async (url, options) => {
      const id = options.headers["X-Docket-Saved-Site"];
      if (["PUT", "PATCH", "DELETE"].includes(options.method)) writes.push({ url, options });
      if (id === "a" && url.endsWith(delayedPath)) await pending;
      const data = url.endsWith("/health") ? { configured: true, ok: true }
        : url.endsWith("/search") ? { issues: [{ key: "PARENT-1", fields: { custom_mrd: "2026-11-01" } }] }
        : { items: { "ABC-1": url.endsWith("/team-priority/bulk") ? { priority: 3 } : { priority: 1, plannedStart: "2026-11-02", note: "Stored" } } };
      return new Response(JSON.stringify(data));
    };
    const sites = ["a", "b"].map(id => ({ instanceId: id, sourceContext: source(id), status: "complete", issues: [issue({ parent: { key: "PARENT-1" } })], fieldMappings: [{ role: "most_recent_done_date", fieldId: "custom_mrd" }] }));
    let models;
    const render = () => {
      models = Object.fromEntries(sites.map(site => [site.instanceId, app.render(site.instanceId, () => app.useTaskManagerJira({ siteContext: site.sourceContext, combinedRun: site }))]));
      return app.buildCombinedTableModel(sites, models);
    };
    render(); await turn(); await turn();
    let table = render();
    const a = app.combinedRowKey("a", "ABC-1"), b = app.combinedRowKey("b", "ABC-1");
    models.a.handleRowPriorityChange("ABC-1", 2);
    await models.a.handleSavePlanningAll("ABC-1", { forceTeam: true });
    table.handleNoteChange(a, "too early");
    await table.handleSavePlanningAll(a);
    assert.equal(writes.length, 0, "pending reads cannot cause wrong-destination or blank writes");
    assert.equal(models.a.hydrationReady, false);
    assert.equal(models.b.hydrationReady, true);
    const pendingMetrics = app.buildCombinedMetrics(sites.map(site => ({ ...site, hydrationReady: models[site.instanceId].hydrationReady })));
    assert.equal(pendingMetrics.total, 2, "metadata readiness does not remove known Jira issues");
    assert.equal(pendingMetrics.incomplete, true);
    const tree = app.render("table", () => app.Table({ ...table, statusOptions: [], expandedPlanningKeys: new Set([a, b]) }));
    assert.deepEqual(Object.fromEntries(find(tree, node => node.type?.name === "PriorityCell").map(node => [node.props.issueKey, node.props.isClosedOrResolved])), { [a]: true, [b]: false });
    assert.deepEqual(find(tree, node => node.props.className === "ww-planning-save-btn").map(node => node.props.disabled).sort(), [false, true]);
    assert.match(text(tree), /Pin to Gantt \(local\)/);
    table.handleRowPriorityChange(b, 2);
    await turn();
    assert.equal(writes.length, 1);
    assert.match(writes[0].url, /team-priority\/ABC-1$/);
    release(); await turn(); await turn();
    table = render();
    assert.equal(models.a.hydrationReady, true);
    assert.equal(table.jiraRowPriorities[a], 3);
    assert.equal(table.jiraNotes[a], "Stored");
    table.handleStatusDraftChange(a, "Draft status after loading");
    table.handleRowPriorityChange(a, 2);
    await render().handleSavePlanningAll(a, { forceTeam: true });
    await turn(); table = render();
    assert.equal(table.statusDrafts[a], "Draft status after loading");
    assert.equal(table.jiraRowPriorities[a], 2);
    assert.equal(JSON.parse(writes.at(-1).options.body).plannedStart, "2026-11-02");
  });
}

for (const failedPath of ["/issue-metadata/bulk", "/team-priority/bulk", "/dates/bulk", "/metadata/bulk", "/search", "/health"]) {
  test(`combined source exposes failed ${failedPath} and cannot clear unknown metadata`, async t => {
    installBrowser(t);
    const app = await bundle('export * from "./src/Pages/hooks/useTaskManagerJira.js"; export * from "./src/Pages/combinedWorkModel.js"; export { default as Page } from "./src/Pages/CombinedOpenWork.jsx"; export * from "react";', [hooksPlugin]);
    t.after(app.unmount);
    const writes = [];
    const site = { id: "a", instanceId: "a", enabled: true, displayName: "A", baseUrl: source("a").baseUrl, sourceContext: source("a"), status: "complete", loaded: 1, rows: [], issues: [issue({ parent: { key: "PARENT-1" } })], fieldMappings: [{ role: "most_recent_done_date", fieldId: "custom_mrd" }, { role: "due_date", fieldId: "custom_due" }] };
    globalThis.fetch = async (url, options = {}) => {
      if (["PUT", "PATCH", "DELETE"].includes(options.method)) writes.push(url);
      if (url === "/api/health") return new Response(JSON.stringify({ siteContext: { instanceId: "active", generation: 1 } }));
      if (url.endsWith(failedPath)) return new Response(JSON.stringify({ error: `Unavailable ${failedPath}` }), { status: 503 });
      return new Response(JSON.stringify(url.endsWith("instances") ? { instances: [site] }
        : url.endsWith("combined-open-work") ? { sites: [site], fetchedAt: "now" }
        : url.endsWith("/health") ? { configured: true, ok: true }
        : url.endsWith("/search") ? { issues: [] } : { items: {} }));
    };
    const render = () => app.render("model", () => app.useTaskManagerJira({ siteContext: site.sourceContext, combinedRun: site }));
    render(); await turn(); await turn();
    const model = render();
    model.handleRowPriorityChange("ABC-1", 2);
    await model.handleSavePlanningAll("ABC-1", { forceTeam: true });
    assert.equal(writes.length, 0);
    assert.equal(model.hydrationReady, false);
    assert.equal(model.teamAvailable, false);
    assert.match(model.jqlError, /Unavailable/);
    const metrics = app.buildCombinedMetrics([{ ...site, hydrationError: model.jqlError }]);
    assert.equal(metrics.incomplete, true);
    assert.equal(metrics.total, 1);
    assert.equal(metrics.open, 1);
    if (failedPath !== "/search") assert.equal(model.jqlRuns[0].dueFieldId, "custom_due", "mapping enrichment is independent of metadata/health failures");
    const renderPage = () => app.render("page", () => app.Page());
    renderPage(); await turn();
    await find(renderPage(), node => node.type === "button" && text(node) === "Load open work")[0].props.onClick();
    const editor = find(renderPage(), node => node.type?.name === "CombinedSiteEditor")[0];
    editor.props.onModel("a", model);
    assert.ok(find(renderPage(), node => node.props.role === "alert").some(node => /Unavailable/.test(text(node))), "failure is visible at source level");
  });
}


test("ordinary parent-date reads retain their existing fallback while combined reads reject", async t => {
  installBrowser(t);
  const app = await bundle('export * from "./src/utils/jiraIssueDoneDates.js";');
  globalThis.fetch = async () => new Response('{"error":"Parent dates unavailable"}', { status: 503 });
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  const run = { issues: [issue({ parent: { key: "PARENT-1" } })] };
  const mappings = [{ role: "most_recent_done_date", fieldId: "custom_mrd" }];
  const ordinary = await app.enrichRunWithParentDoneDates(run, mappings, { siteContext: { instanceId: "active", generation: 1 } });
  assert.deepEqual(ordinary.parentMostRecentDoneDateByKey, {});
  assert.equal(ordinary.mrdFieldId, "custom_mrd");
  assert.equal(warnings.length, 2);
  await assert.rejects(app.enrichRunWithParentDoneDates(run, mappings, { siteContext: source("a"), propagateErrors: true }), /Parent dates unavailable/);
  assert.equal(warnings.length, 2, "combined failure propagates without duplicate logging");
});
