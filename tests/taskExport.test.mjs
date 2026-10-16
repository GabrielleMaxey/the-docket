import assert from "node:assert/strict";
import { enableTeamDatabase } from "./teamSettingsFixture.mjs";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import express from "express";
import { initDatabase } from "../server/db/schema.mjs";
import * as instances from "../server/lib/jiraInstances.mjs";
import { createSiteOperationState } from "../server/lib/siteOperationState.mjs";
import { createTaskExportService } from "../server/lib/taskExport.mjs";
import { searchAllIssues } from "../server/lib/jiraSearchHelpers.mjs";

const issue = (key = "ABC-1") => ({ key, fields: { summary: "Task", status: { name: "Open" }, assignee: { displayName: "Test Person", emailAddress: "never-export@example.test" }, duedate: "2026-11-01" } });
const selected = (instanceId, source = "local", extra = {}) => ({ instanceId, source, scope: { projectKeys: ["ABC"] }, ...extra });
const fixture = (t, overrides = {}) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "task-export-"));
  const metaDb = new Database(":memory:");
  instances.initInstancesSchema(metaDb);
  if (overrides.teamEnabled) metaDb.prepare("INSERT INTO jira_instance_meta (key,value) VALUES ('use_team_db','true')").run();
  const saved = ["A", "B", "Unselected"].map(displayName => instances.createInstance(metaDb, { displayName, baseUrl: "https://lumen.atlassian.net", email: `${displayName}@example.test` }));
  for (const [i, item] of saved.entries()) {
    const db = new Database(instances.appDbPathForInstance(dataDir, item.id));
    initDatabase(db);
    db.prepare("INSERT INTO issue_metadata (issue_key, note, priority, follow_up) VALUES (?, ?, ?, ?)").run("ABC-1", `local ${i}`, i + 1, i === 0 ? "now" : "next");
    db.prepare("INSERT INTO epic_presets (epic_key,epic_name,jql,preset_type) VALUES ('ABC-9','Saved scope','project = ABC ORDER BY key ASC','jql')").run();
    db.close();
  }
  instances.setActiveInstanceId(metaDb, saved[2].id);
  const state = createSiteOperationState({ snapshot: { credentials: { instanceId: saved[2].id, baseUrl: saved[2].baseUrl } }, activate: () => assert.fail("Export changed active site") });
  const before = state.getSiteContext();
  const calls = [];
  const teamCalls = [];
  const request = async options => {
    calls.push(options);
    if (overrides.request) return overrides.request(options);
    if (options.pathWithQuery.startsWith("/rest/api/3/project/search")) return { ok: true, data: { values: [{ key: "ABC", name: "Project" }], isLast: true, total: 1 } };
    if (options.pathWithQuery === "/rest/api/3/search/jql") return { ok: true, data: { issues: [issue()], isLast: true } };
    return { ok: true, data: { startAt: 0, maxResults: 1, total: 0, comments: [] } };
  };
  t.after(() => { metaDb.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { saved, metaDb, dataDir, calls, teamCalls, state, before,
    service: createTaskExportService({ metaDb, dataDir, env: { JIRA_API_TOKEN: "synthetic", ...overrides.env }, requestJira: request,
      getTeamMetadata: async input => { teamCalls.push(input); return overrides.team ? overrides.team(input) : { "ABC-1": { priority: 9, note: "team note", followUp: "next" } }; }, ...overrides.service }),
  };
};

test("two saved entries keep same host and keys separate; active site does not change; unselected site is never read", async t => {
  const f = fixture(t);
  fs.unlinkSync(instances.appDbPathForInstance(f.dataDir, f.saved[2].id));
  const snapshot = await f.service.collectTaskExport({ sites: f.saved.slice(0, 2).map(s => selected(s.id)), timezone: "America/Denver" });
  assert.deepEqual(snapshot.sites.map(s => [s.instanceId, s.displayName, s.siteHost, s.rows[0].note, s.rows[0].localNote]), [
    [f.saved[0].id, "A", "lumen.atlassian.net", "local 0", "local 0"], [f.saved[1].id, "B", "lumen.atlassian.net", "local 1", "local 1"],
  ]);
  assert.ok(snapshot.sites.every(s => s.status === "complete" && s.rows[0].teamNote === ""));
  assert.deepEqual(f.state.getSiteContext(), f.before);
  assert.equal(instances.getActiveInstanceId(f.metaDb), f.saved[2].id);
  assert.ok(f.calls.every(c => c.credentials.email !== "Unselected@example.test"));
  assert.equal(f.teamCalls.length, 0);
  assert.equal(snapshot.commentScope, "Latest Jira comment only");
  assert.equal(snapshot.timezone, "America/Denver");
  assert.ok(!JSON.stringify(snapshot).includes("never-export"));
  assert.ok(!JSON.stringify(snapshot).includes("synthetic"));
});

test("Team metadata controls filters and explicit team/local notes without substitution", async t => {
  const f = fixture(t, { teamEnabled: true });
  const snapshot = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id, "team", { priorities: [9], followUp: "next" })] });
  const row = snapshot.sites[0].rows[0];
  assert.equal(row.priority, 9);
  assert.equal(row.followUp, "next");
  assert.equal(row.note, "team note");
  assert.equal(row.teamNote, "team note");
  assert.equal(row.localNote, "local 0");
  assert.equal(row.localNoteStatus, "available");
  assert.deepEqual(f.teamCalls[0], { siteHost: "lumen.atlassian.net", issueKeys: ["ABC-1"] });
});

test("team failure does not use local fallback", async t => {
  const f = fixture(t, { teamEnabled: true, team: async () => { throw new Error("secret connection detail"); } });
  const { sites: [site] } = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id, "team")] });
  assert.equal(site.status, "failed");
  assert.deepEqual(site.rows, []);
  assert.match(site.message, /[Tt]eam/);
  assert.ok(!site.message.includes("secret"));
  assert.equal(f.calls.filter(c => c.pathWithQuery.includes("/comment")).length, 0);
});

test("Team supplemental local notes unavailable is partial; Local metadata unavailable fails without migration", async t => {
  const f = fixture(t, { teamEnabled: true });
  const dbPath = instances.appDbPathForInstance(f.dataDir, f.saved[0].id);
  fs.unlinkSync(dbPath);
  const team = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id, "team")] });
  assert.equal(team.sites[0].status, "partial");
  assert.equal(team.sites[0].rows[0].localNoteStatus, "unavailable");
  assert.equal(team.sites[0].rows[0].localNote, null);
  assert.equal(team.sites[0].rows[0].teamNote, "team note");
  const local = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id)] });
  assert.equal(local.sites[0].status, "failed");
  assert.deepEqual(local.sites[0].rows, []);
  assert.equal(fs.existsSync(dbPath), false);
});

test("latest comment is bounded descending creation, multiline ADF survives, raw identity stays private", async t => {
  const f = fixture(t, { request: async o => {
    if (!o.pathWithQuery.includes("/comment")) return { ok: true, data: { issues: [issue()], isLast: true } };
    return { ok: true, data: { startAt: 0, maxResults: 1, total: 12, comments: [{ created: "2026-10-14T09:10:00-0600", updated: "2099-01-01", author: { displayName: "Writer", accountId: "private-id", emailAddress: "private-email" }, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }, { type: "hardBreak" }, { type: "text", text: "Second" }] }] } }] } };
  } });
  const { sites: [site] } = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id)] });
  assert.equal(site.status, "complete");
  assert.deepEqual(site.rows[0].latestJiraComment, { text: "First\nSecond", author: "Writer", createdAt: "2026-10-14T09:10:00-0600" });
  assert.equal(site.rows[0].jiraCommentStatus, "available");
  assert.equal(f.calls.at(-1).pathWithQuery, "/rest/api/3/issue/ABC-1/comment?startAt=0&maxResults=1&orderBy=-created");
  assert.ok(!JSON.stringify(site).includes("private-"));
});

test("no comment differs from denied/timed-out comment; unknown author/date remain null", async t => {
  for (const [response, status, partial] of [
    [{ ok: true, data: { startAt: 0, total: 0, comments: [] } }, "none", false],
    [{ ok: false, status: 403 }, "unavailable", true],
    [{ ok: false, status: 504 }, "unavailable", true],
    [{ ok: true, data: { startAt: 0, total: 1, comments: [{ body: "Text" }] } }, "available", false],
    [{ ok: true, data: { startAt: 1, total: 2, comments: [{ body: "Wrong page" }] } }, "unavailable", true],
    [{ ok: true, data: { startAt: 0, total: 1, comments: [] } }, "unavailable", true],
  ]) {
    const f = fixture(t, { request: async o => o.pathWithQuery.includes("/comment") ? response : { ok: true, data: { issues: [issue()], isLast: true } } });
    const { sites: [site] } = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id)] });
    assert.equal(site.rows[0].jiraCommentStatus, status);
    assert.equal(site.status, partial ? "partial" : "complete");
    if (status === "available") assert.deepEqual(site.rows[0].latestJiraComment, { text: "Text", author: null, createdAt: null });
    else assert.equal(site.rows[0].latestJiraComment, null);
  }
});

test("selected metadata filters prevent comment reads for excluded tasks", async t => {
  const f = fixture(t);
  const { sites: [site] } = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id, "local", { priorities: [20] })] });
  assert.deepEqual(site.rows, []);
  assert.equal(f.calls.filter(c => c.pathWithQuery.includes("/comment")).length, 0);
});

test("reached search bound is partial without verified final page", async t => {
  const f = fixture(t, { env: { DOCKET_EXPORT_MAX_ROWS_PER_SITE: "1" }, request: async o => o.pathWithQuery.includes("/comment") ? { ok: true, data: { startAt: 0, total: 0, comments: [] } } : { ok: true, data: { issues: [issue()] } } });
  const { sites: [site] } = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id)] });
  assert.equal(site.status, "partial");
  assert.match(site.message, /limit|bound/i);
  assert.equal(site.searchLimit, 1);
});

test("search completeness at cap requires evidence and opaque pagination remains row-bounded", async () => {
  const result = await searchAllIssues({ jql: "x", maxTotal: 1, runJiraSearchRequest: async () => ({ ok: true, data: { issues: [issue()] } }) });
  assert.equal(result.isComplete, false);
  assert.equal(result.completeness, "limit");
  let calls = 0;
  const repeated = await searchAllIssues({ jql: "x", maxTotal: 20, runJiraSearchRequest: async () => { calls += 1; return { ok: true, data: { issues: [issue()], nextPageToken: "same" } }; } });
  assert.equal(repeated.isComplete, false);
  assert.equal(calls, 20);
});

test("leases block selected identity/deletion only and release idempotently", t => {
  const f = fixture(t);
  const lease = instances.beginInstanceOperations(f.metaDb, [f.saved[0].id]);
  assert.throws(() => instances.deleteInstance(f.metaDb, f.saved[0].id), { status: 409, code: "INSTANCE_IN_USE" });
  assert.throws(() => instances.updateInstance(f.metaDb, f.saved[0].id, { email: "changed@example.test" }), { status: 409 });
  instances.updateInstance(f.metaDb, f.saved[1].id, { displayName: "Still editable" });
  instances.setActiveInstanceId(f.metaDb, f.saved[1].id);
  lease.release(); lease.release();
  instances.deleteInstance(f.metaDb, f.saved[0].id);
});

test("abort discards collection, releases every selected lease and closes read handles", async t => {
  const controller = new AbortController();
  let f;
  f = fixture(t, { request: async () => {
    assert.throws(() => instances.deleteInstance(f.metaDb, f.saved[1].id), { code: "INSTANCE_IN_USE" });
    controller.abort();
    throw controller.signal.reason;
  } });
  await assert.rejects(f.service.collectTaskExport({ sites: f.saved.slice(0, 2).map(s => selected(s.id)), signal: controller.signal }), { name: "AbortError" });
  instances.deleteInstance(f.metaDb, f.saved[0].id);
  instances.deleteInstance(f.metaDb, f.saved[1].id);
});

test("collection deadline preserves tasks, marks missing comments and unfinished sites explicitly, releases leases", async t => {
  let requests = 0;
  const f = fixture(t, { env: { DOCKET_EXPORT_TIMEOUT_MS: "25" }, request: async o => {
    requests += 1;
    if (!o.pathWithQuery.includes("/comment")) return { ok: true, data: { issues: [issue(), issue("ABC-2")], isLast: true } };
    await new Promise((resolve, reject) => { o.signal.addEventListener("abort", () => reject(o.signal.reason), { once: true }); });
  } });
  const { sites } = await f.service.collectTaskExport({ sites: f.saved.slice(0, 2).map(s => selected(s.id)) });
  assert.equal(requests, 2);
  assert.equal(sites[0].status, "partial");
  assert.equal(sites[0].rows.length, 2);
  assert.ok(sites[0].rows.every(r => r.jiraCommentStatus === "unavailable"));
  assert.equal(sites[1].status, "failed");
  assert.match(sites[0].message, /deadline/i);
  instances.deleteInstance(f.metaDb, f.saved[0].id);
});

test("strict scope/source/timezone/filter validation rejects arbitrary input before Jira", async t => {
  const f = fixture(t);
  const s = selected(f.saved[0].id);
  for (const options of [
    { sites: [] }, { sites: [s,s] }, { sites: [{ ...s, source: "other" }] },
    { sites: [{ ...s, scope: {} }] }, { sites: [{ ...s, scope: { projectKeys: ["ABC"], presetIds: [1] } }] },
    { sites: [{ ...s, scope: { projectKeys: ["ABC) OR key = PRIVATE-1"] } }] },
    { sites: [{ ...s, scope: { jql: "project = private" } }] }, { sites: [{ ...s, priorities: [-1] }] },
    { sites: [{ ...s, followUp: "later" }] }, { sites: [s], timezone: "not/a-timezone" },
    { sites: [{ ...s, instanceId: "missing" }] }, { sites: [{ ...s, rows: [issue()] }] },
  ]) await assert.rejects(f.service.collectTaskExport(options), { status: 400 });
  assert.equal(f.calls.length, 0);
});

test("saved presets are read from selected entry and default open/completed choice is explicit", async t => {
  const f = fixture(t);
  await f.service.collectTaskExport({ sites: [selected(f.saved[0].id, "local", { scope: { presetIds: [1] } })] });
  assert.match(f.calls[0].body.jql, /project = ABC/);
  assert.match(f.calls[0].body.jql, /statusCategory != Done/);
  f.calls.length = 0;
  await f.service.collectTaskExport({ sites: [selected(f.saved[0].id, "local", { includeCompleted: true })] });
  assert.ok(!f.calls[0].body.jql.includes("statusCategory != Done"));
});

test("safe scopes contain projects/preset labels, never saved JQL or credentials", async t => {
  const f = fixture(t);
  const scopes = await f.service.getExportScopes(f.saved[0].id);
  assert.deepEqual(scopes.projects, [{ key: "ABC", name: "Project" }]);
  assert.deepEqual(scopes.presets, [{ id: 1, name: "Saved scope" }]);
  assert.ok(!JSON.stringify(scopes).includes("ORDER BY"));
  assert.ok(!JSON.stringify(scopes).includes("synthetic"));
});

test("previews own immutable data, expire at fifteen minutes, cap at three and enforce total 25 MiB", async t => {
  let now = 0;
  const f = fixture(t, { service: { now: () => now } });
  const input = { sites: [selected(f.saved[0].id)] };
  const first = await f.service.createPreview(input);
  first.snapshot.sites[0].rows[0].note = "forged";
  assert.equal(f.service.getPreview(first.previewId).snapshot.sites[0].rows[0].note, "local 0");
  await f.service.createPreview(input);
  await f.service.createPreview(input);
  await assert.rejects(f.service.createPreview(input), { status: 429 });
  now = 15 * 60 * 1000;
  assert.throws(() => f.service.getPreview(first.previewId), { status: 409 });
  await f.service.createPreview(input);
  const huge = fixture(t, { request: async () => ({ ok: true, data: { issues: [{ ...issue(), fields: { summary: "x".repeat(26 * 1024 * 1024) } }], isLast: true } }) });
  await assert.rejects(huge.service.createPreview({ sites: [selected(huge.saved[0].id)] }), error => error.status === 413 && /narrow/i.test(error.message));
});

test("preview route returns server-collected rows, safe errors and scope endpoint", async t => {
  const { registerTaskExportRoutes } = await import("../server/routes/taskExportRoutes.mjs");
  const f = fixture(t);
  const app = express(); app.use(express.json());
  registerTaskExportRoutes(app, { taskExportService: f.service });
  const server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/api/task-export/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sites: [selected(f.saved[0].id)], timezone: "UTC" }) });
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.ok(preview.previewId); assert.ok(preview.expiresAt); assert.equal(preview.snapshot.sites[0].rows[0].localNote, "local 0");
  const scopeResponse = await fetch(`${origin}/api/task-export/sites/${f.saved[0].id}/scopes`);
  assert.equal(scopeResponse.status, 200);
  assert.deepEqual((await scopeResponse.json()).presets, [{ id: 1, name: "Saved scope" }]);
});

test("contradictory comment ordering is unavailable and oversized text remains excludable in a stored snapshot", async t => {
  const longText = "=literal\n" + "x".repeat(33000);
  const f = fixture(t, { request: async o => o.pathWithQuery.includes("/comment") ? { ok: true, data: { startAt: 0, total: 1, orderBy: "created", comments: [{ body: longText }] } } : { ok: true, data: { issues: [issue()], isLast: true } } });
  const preview = await f.service.createPreview({ sites: [selected(f.saved[0].id)] });
  assert.equal(preview.snapshot.sites[0].rows[0].jiraCommentStatus, "unavailable");
  const good = fixture(t, { request: async o => o.pathWithQuery.includes("/comment") ? { ok: true, data: { startAt: 0, total: 1, comments: [{ body: longText }] } } : { ok: true, data: { issues: [issue()], isLast: true } } });
  const stored = await good.service.createPreview({ sites: [selected(good.saved[0].id)] });
  assert.equal(good.service.getPreview(stored.previewId).snapshot.sites[0].rows[0].latestJiraComment.text, longText);
});

test("missing Team preset store fails explicitly and old Local schema is never modified", async t => {
  const f = fixture(t, { teamEnabled: true });
  const filename = instances.appDbPathForInstance(f.dataDir, f.saved[0].id);
  fs.unlinkSync(filename);
  const oldDb = new Database(filename);
  oldDb.exec("CREATE TABLE issue_metadata (issue_key TEXT PRIMARY KEY, note TEXT)");
  oldDb.close();
  const before = fs.readFileSync(filename);
  const local = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id)] });
  assert.equal(local.sites[0].status, "failed");
  assert.match(local.sites[0].message, /schema|migrate/i);
  const team = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id, "team", { scope: { presetIds: [1] } })] });
  assert.equal(team.sites[0].status, "failed");
  assert.match(team.sites[0].message, /schema|migrate/i);
  assert.equal(f.teamCalls.length, 0);
  assert.deepEqual(fs.readFileSync(filename), before);
});

test("missing selected Team values stay unset and changes after capture cannot mutate stored snapshot", async t => {
  const team = { "ABC-1": { priority: 0, note: "", followUp: null } };
  const f = fixture(t, { teamEnabled: true, team: async () => team });
  const preview = await f.service.createPreview({ sites: [selected(f.saved[0].id, "team")] });
  team["ABC-1"].note = "later changed";
  const row = f.service.getPreview(preview.previewId).snapshot.sites[0].rows[0];
  assert.equal(row.priority, 0); assert.equal(row.followUp, null); assert.equal(row.teamNote, "");
  assert.equal(row.note, ""); assert.equal(row.localNote, "local 0");
});

test("deadline during Team read retains selected Team rows but does no later local/comment requests", async t => {
  const f = fixture(t, { teamEnabled: true, env: { DOCKET_EXPORT_TIMEOUT_MS: "10" }, team: async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
    return { "ABC-1": { priority: 7, note: "captured team" } };
  } });
  const { sites: [site] } = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id, "team")] });
  assert.equal(site.status, "partial");
  assert.equal(site.rows[0].teamNote, "captured team");
  assert.equal(site.rows[0].localNoteStatus, "unavailable");
  assert.equal(site.rows[0].jiraCommentStatus, "unavailable");
  assert.equal(f.calls.length, 1);
});

test("total preview memory cap applies across previews and capacity includes in-progress work", async t => {
  const f = fixture(t, { request: async o => o.pathWithQuery.includes("/comment") ? { ok: true, data: { startAt: 0, total: 0, comments: [] } } : { ok: true, data: { issues: [{ ...issue(), fields: { summary: "x".repeat(9 * 1024 * 1024) } }], isLast: true } } });
  const options = { sites: [selected(f.saved[0].id)] };
  await f.service.createPreview(options); await f.service.createPreview(options);
  await assert.rejects(f.service.createPreview(options), { status: 413 });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const slow = fixture(t, { request: async o => { await gate; return o.pathWithQuery.includes("/comment") ? { ok: true, data: { startAt: 0, total: 0, comments: [] } } : { ok: true, data: { issues: [issue()], isLast: true } }; } });
  const pending = Array.from({ length: 3 }, () => slow.service.createPreview({ sites: [selected(slow.saved[0].id)] }));
  await assert.rejects(slow.service.createPreview({ sites: [selected(slow.saved[0].id)] }), { status: 429 });
  release(); await Promise.all(pending);
});

test("preview collection uses explicit captured transport credentials and permits independent active-site changes", async t => {
  let f;
  f = fixture(t, { request: async o => {
    instances.updateInstance(f.metaDb, f.saved[2].id, { displayName: "Other entry changed" });
    assert.throws(() => instances.updateInstance(f.metaDb, f.saved[0].id, { email: "changed@example.test" }), { code: "INSTANCE_IN_USE" });
    assert.equal(o.credentials.email, "A@example.test");
    return o.pathWithQuery.includes("/comment") ? { ok: true, data: { startAt: 0, total: 0, comments: [] } } : { ok: true, data: { issues: [issue()], isLast: true } };
  } });
  const state = createSiteOperationState({ snapshot: { credentials: { instanceId: f.saved[2].id, baseUrl: f.saved[2].baseUrl } }, activate: id => ({ credentials: { instanceId: id, baseUrl: f.saved[1].baseUrl } }) });
  const snapshot = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id)] });
  await state.switchSite(f.saved[1].id, state.getSiteContext().generation);
  assert.equal(snapshot.sites[0].instanceId, f.saved[0].id);
  assert.equal(snapshot.sites[0].rows[0].localNote, "local 0");
});

test("client preview cancellation retains AbortError and avoids active-site health/save traffic", async t => {
  const { build } = await import("esbuild");
  const result = await build({ entryPoints: ["src/services/jiraClient.js"], bundle: true, write: false, platform: "browser", format: "esm", define: { "import.meta.env": "{}" } });
  const client = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  const nativeFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = nativeFetch; });
  const controller = new AbortController();
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push(String(url)); controller.abort(); throw controller.signal.reason; };
  await assert.rejects(client.previewTaskExport({ sites: [] }, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith("/api/task-export/preview"));
});

test("real PostgreSQL Team export retains full selected fields, separate local note, immutable snapshot", { skip: !process.env.DOCKET_TEST_DATABASE_URL }, async t => {
  const databaseUrl = new URL(process.env.DOCKET_TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(databaseUrl.hostname));
  assert.ok(databaseUrl.port); assert.match(databaseUrl.pathname, /^\/docket_test_[a-z0-9_]+$/);
  const { Pool } = await import("pg");
  const store = await import("../server/lib/teamPriorityPostgres.mjs");
  const pool = new Pool({ connectionString: databaseUrl.href, max: 1 });
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  process.env.TEAM_PRIORITY_DATABASE_URL = databaseUrl.href;
  t.after(async () => {
    await pool.query("DELETE FROM team_issue_metadata WHERE site_host = $1 AND issue_key = $2", ["lumen.atlassian.net", "E1EXPORT-1"]);
    await store.closeTeamPool(); await pool.end();
    if (previous === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL; else process.env.TEAM_PRIORITY_DATABASE_URL = previous;
  });
  const { migrateTeamDatabase } = await import("../scripts/migrate-team-db.mjs");
  await migrateTeamDatabase(pool);
  store.initializeTeamPrioritySettings(enableTeamDatabase(t));
  await store.writeTeamMetadata({ siteHost: "lumen.atlassian.net", entries: [{ issueKey: "E1EXPORT-1", patch: { priority: 6, followUp: "next", note: "real Team note", requestor: "Requester", plannedStart: "2026-10-15", plannedFinish: "2026-10-16", openDecisionNote: "Decision" } }] });
  const f = fixture(t, { teamEnabled: true, service: { getTeamMetadata: store.getTeamMetadata }, request: async o => o.pathWithQuery.includes("/comment") ? { ok: true, data: { startAt: 0, total: 0, comments: [] } } : { ok: true, data: { issues: [issue("E1EXPORT-1")], isLast: true } } });
  const preview = await f.service.createPreview({ sites: [selected(f.saved[0].id, "team")] });
  await store.writeTeamMetadata({ siteHost: "lumen.atlassian.net", entries: [{ issueKey: "E1EXPORT-1", patch: { note: "after preview" } }] });
  const row = f.service.getPreview(preview.previewId).snapshot.sites[0].rows[0];
  assert.equal(row.teamNote, "real Team note"); assert.equal(row.localNote, "");
  assert.equal(row.priority, 6); assert.equal(row.followUp, "next");
  assert.equal(row.plannedStart, "2026-10-15"); assert.equal(row.plannedFinish, "2026-10-16");
  assert.equal(row.requestor, "Requester"); assert.equal(row.openDecisionNote, "Decision");
});

test("deadline during search fails provisional site before selected metadata without dropping earlier approved rows", async t => {
  let searches = 0;
  const f = fixture(t, { teamEnabled: true, env: { DOCKET_EXPORT_TIMEOUT_MS: "30" }, request: async o => {
    if (o.pathWithQuery.includes("/comment")) return { ok: true, data: { startAt: 0, total: 0, comments: [] } };
    searches += 1;
    if (searches === 1) return { ok: true, data: { issues: [issue()], isLast: true } };
    if (searches === 2) return { ok: true, data: { issues: [issue()], nextPageToken: "second-page" } };
    await new Promise((_resolve, reject) => o.signal.addEventListener("abort", () => reject(o.signal.reason), { once: true }));
  } });
  const { sites } = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id), selected(f.saved[1].id, "team")] });
  assert.equal(sites[0].status, "complete"); assert.equal(sites[0].rows[0].localNote, "local 0");
  assert.equal(sites[1].status, "failed"); assert.deepEqual(sites[1].rows, []);
  assert.equal(sites[1].searchedCount, 1); assert.equal(f.teamCalls.length, 0);
  assert.match(sites[1].message, /before.*metadata/i);
});

test("selected-entry delete route responds 409 while collection is leased and recovers after release", async t => {
  const { registerJiraInstanceRoutes } = await import("../server/routes/jiraInstanceRoutes.mjs");
  const f = fixture(t);
  const state = createSiteOperationState({ snapshot: { credentials: { instanceId: f.saved[2].id, baseUrl: f.saved[2].baseUrl } }, activate: id => ({ credentials: { instanceId: id, baseUrl: f.saved[2].baseUrl } }) });
  const routes = new Map();
  registerJiraInstanceRoutes({ get() {}, post() {}, patch() {}, delete: (url, handler) => routes.set(url, handler) }, { ...state, metaDb: f.metaDb, getCredentials: () => state.getSnapshot().credentials });
  const lease = instances.beginInstanceOperations(f.metaDb, [f.saved[0].id]);
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.data = value; return this; } });
  const req = () => ({ params: { id: f.saved[0].id }, headers: { "x-docket-generation": state.getSiteContext().generation } });
  const blocked = response(); await routes.get("/api/jira/instances/:id")(req(), blocked);
  assert.equal(blocked.statusCode, 409); assert.equal(blocked.data.code, "INSTANCE_IN_USE");
  lease.release();
  const removed = response(); await routes.get("/api/jira/instances/:id")(req(), removed);
  assert.equal(removed.statusCode, 200); assert.equal(removed.data.ok, true);
});

test("elapsed collection deadline stops subsequent requests even when resolved promises defer timer delivery", async t => {
  let comments = 0;
  const f = fixture(t, { env: { DOCKET_EXPORT_TIMEOUT_MS: "15" }, request: async o => {
    if (!o.pathWithQuery.includes("/comment")) return { ok: true, data: { issues: [issue(), issue("ABC-2")], isLast: true } };
    comments += 1;
    const until = performance.now() + 25;
    while (performance.now() < until) { /* Synthetic synchronous boundary delays the timer callback. */ }
    return { ok: true, data: { startAt: 0, total: 0, comments: [] } };
  } });
  const { sites: [site] } = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id)] });
  assert.equal(comments, 1);
  assert.equal(site.status, "partial");
  assert.match(site.message, /deadline/i);
});

test("valid scopes above one hundred projects keep the existing request and search bounds", async t => {
  const f = fixture(t);
  const projects = Array.from({ length: 101 }, (_, index) => `PROJ${index}`);
  const { sites: [site] } = await f.service.collectTaskExport({ sites: [selected(f.saved[0].id, "local", { scope: { projectKeys: projects } })] });
  assert.equal(site.status, "complete");
  assert.equal(site.scope.projectKeys.length, 101);
  assert.ok(f.calls[0].body.jql.includes("PROJ100"));
});

test("real S2 transport sends each saved entry's captured credentials without active wrappers", async t => {
  const { requestJira } = await import("../server/lib/jiraTransport.mjs");
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, authorization: options.headers.Authorization });
    const data = String(url).includes("/comment") ? { startAt: 0, total: 0, comments: [] } : { issues: [issue()], isLast: true };
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const f = fixture(t, { service: { requestJira } });
  const before = f.state.getSiteContext();
  const snapshot = await f.service.collectTaskExport({ sites: f.saved.slice(0, 2).map(s => selected(s.id)) });
  assert.ok(snapshot.sites.every(s => s.status === "complete"));
  assert.equal(requests.length, 4);
  assert.deepEqual(requests.map(r => Buffer.from(r.authorization.slice(6), "base64").toString()), ["A@example.test:synthetic", "A@example.test:synthetic", "B@example.test:synthetic", "B@example.test:synthetic"]);
  assert.ok(requests.every(r => new URL(r.url).origin === "https://lumen.atlassian.net"));
  assert.deepEqual(f.state.getSiteContext(), before);
});

test("null Jira total does not prove completion at the row bound", async () => {
  const result = await searchAllIssues({ jql: "project = ABC", maxTotal: 1,
    runJiraSearchRequest: async () => ({ ok: true, data: { issues: [issue()], total: null } }),
  });
  assert.equal(result.isComplete, false);
  assert.equal(result.completeness, "limit");
});

test("project scope discovery follows a second page when the first total is null", async t => {
  const f = fixture(t, { request: async options => {
    const startAt = new URL(options.pathWithQuery, "https://lumen.atlassian.net").searchParams.get("startAt");
    return startAt === "0"
      ? { ok: true, data: { values: [{ key: "FIRST", name: "First project" }], total: null, isLast: false } }
      : { ok: true, data: { values: [{ key: "SECOND", name: "Second project" }], total: 2, isLast: true } };
  } });
  const scopes = await f.service.getExportScopes(f.saved[0].id);
  assert.deepEqual(scopes.projects.map(project => project.key), ["FIRST", "SECOND"]);
  assert.equal(scopes.projectsComplete, true);
  assert.equal(f.calls.length, 2);
});

test("explicit nonfinal project pages override conflicting totals and invalid totals are not completion evidence", async t => {
  for (const total of [1, "1", -1, 0.5]) {
    let requests = 0;
    const f = fixture(t, { request: async () => {
      requests += 1;
      return requests === 1
        ? { ok: true, data: { values: [{ key: "FIRST" }], total, ...(total === 1 ? { isLast: false } : {}) } }
        : { ok: true, data: { values: [{ key: "SECOND" }], total: 2, isLast: true } };
    } });
    const scopes = await f.service.getExportScopes(f.saved[0].id);
    assert.deepEqual(scopes.projects.map(project => project.key), ["FIRST", "SECOND"]);
    assert.equal(scopes.projectsComplete, true);
    assert.equal(requests, 2);
  }
});

test("inconsistent empty project pages are incomplete while verified empty scopes are complete", async t => {
  for (const [page, complete] of [
    [{ total: null, isLast: false }, false],
    [{ total: 3, isLast: false }, false],
    [{ total: 3, isLast: true }, false],
    [{ total: null }, false],
    [{ total: 0, isLast: true }, true],
  ]) {
    const f = fixture(t, { request: async () => ({ ok: true, data: { values: [], ...page } }) });
    const scopes = await f.service.getExportScopes(f.saved[0].id);
    assert.deepEqual(scopes.projects, []);
    assert.equal(scopes.projectsComplete, complete);
    assert.equal(f.calls.length, 1);
  }
});


test("client workbook download returns binary bytes, keeps snapshot identity and surfaces retry guidance", async t => {
  const { build } = await import("esbuild");
  const result = await build({ entryPoints: ["src/services/jiraClient.js"], bundle: true, write: false, platform: "browser", format: "esm", define: { "import.meta.env": "{}" } });
  const client = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  const nativeFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = nativeFetch; });
  const options = { previewId: "reviewed", excludedRows: [{ instanceId: "saved-a", siteHost: "lumen.atlassian.net", issueKey: "ABC-1" }], allowPartial: true };
  let requests = 0;
  globalThis.fetch = async (url, request) => {
    requests++;
    assert.ok(String(url).endsWith("/api/task-export/download"));
    assert.deepEqual(JSON.parse(request.body), options);
    assert.equal(request.headers["X-Docket-Site"], undefined);
    return new Response(new Uint8Array([80, 75, 3, 4]), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
  };
  const blob = await client.downloadTaskExport(options);
  assert.ok(blob instanceof Blob);
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [80, 75, 3, 4]);
  assert.equal(requests, 1);
  for (const status of [400, 409, 413, 500]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "Preview again or narrow filters." }), { status, headers: { "Content-Type": "application/json" } });
    await assert.rejects(client.downloadTaskExport(options), error => error.status === status && /Preview again/.test(error.message));
  }
  globalThis.fetch = async () => new Response("<html>Wrong API</html>", { headers: { "Content-Type": "text/html" } });
  await assert.rejects(client.downloadTaskExport(options), /workbook|XLSX/i);
  const controller = new AbortController();
  globalThis.fetch = async () => { controller.abort(); throw controller.signal.reason; };
  await assert.rejects(client.downloadTaskExport(options, { signal: controller.signal }), { name: "AbortError" });
});

test("real export routes require a fresh preview for source changes, enforce consent and reject forged exclusions and expired IDs", async t => {
  const { registerTaskExportRoutes } = await import("../server/routes/taskExportRoutes.mjs");
  let now = Date.now();
  const f = fixture(t, { teamEnabled: true, service: { now: () => now }, request: async o => o.pathWithQuery.includes("/comment") ? { ok: false, status: 403 } : { ok: true, data: { issues: [issue()], isLast: true } } });
  const app = express(); app.use(express.json());
  registerTaskExportRoutes(app, { taskExportService: f.service });
  const server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = (route, body) => fetch(`http://127.0.0.1:${server.address().port}/api/task-export/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const preview = await (await post("preview", { sites: [selected(f.saved[0].id)] })).json();
  assert.equal((await post("download", { previewId: preview.previewId })).status, 400);
  assert.equal((await post("download", { previewId: preview.previewId, allowPartial: true, source: "team" })).status, 400);
  assert.equal((await post("download", { previewId: preview.previewId, allowPartial: true, excludedRows: [{ instanceId: f.saved[1].id, siteHost: "lumen.atlassian.net", issueKey: "ABC-1" }] })).status, 400);
  const team = await (await post("preview", { sites: [selected(f.saved[0].id, "team")] })).json();
  assert.notEqual(team.previewId, preview.previewId);
  assert.equal(team.snapshot.sites[0].rows[0].priority, 9);
  assert.equal(f.service.getPreview(preview.previewId).snapshot.sites[0].rows[0].priority, 1);
  assert.equal((await post("download", { previewId: preview.previewId, allowPartial: true })).status, 200);
  now += 15 * 60 * 1000 + 1;
  assert.equal((await post("download", { previewId: preview.previewId, allowPartial: true })).status, 409);
});


test("disabled Team rejects an explicit export and a retained Team preview while Local export stays usable", async t => {
  const f = fixture(t);
  await assert.rejects(f.service.createPreview({ sites: [selected(f.saved[0].id, "team")] }), error => error.code === "TEAM_DATABASE_DISABLED");
  assert.equal(f.teamCalls.length, 0);
  f.metaDb.prepare("INSERT INTO jira_instance_meta (key,value) VALUES ('use_team_db','true')").run();
  const team = await f.service.createPreview({ sites: [selected(f.saved[0].id, "team")] });
  f.metaDb.prepare("UPDATE jira_instance_meta SET value = 'false' WHERE key = 'use_team_db'").run();
  assert.throws(() => f.service.getPreview(team.previewId), error => error.code === "TEAM_DATABASE_DISABLED");
  const local = await f.service.createPreview({ sites: [selected(f.saved[0].id)] });
  assert.equal(f.service.getPreview(local.previewId).snapshot.sites[0].rows[0].priority, 1);
});
