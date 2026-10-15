import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter, once } from "node:events";
import express from "express";
import { registerAttachmentRoutes } from "../server/routes/attachmentRoutes.mjs";
import { registerTeamPriorityRoutes } from "../server/routes/teamPriorityRoutes.mjs";
import { getTeamPool, closeTeamPool } from "../server/lib/teamPriorityPostgres.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import * as instances from "../server/lib/jiraInstances.mjs";
import { initDatabase } from "../server/db/schema.mjs";
import { createSiteOperationState } from "../server/lib/siteOperationState.mjs";
import { registerIssueMetadataRoutes } from "../server/routes/issueMetadataRoutes.mjs";
import { registerJiraCoreRoutes } from "../server/routes/jiraCoreRoutes.mjs";
import { registerAppConfigRoutes } from "../server/routes/appConfigRoutes.mjs";
const operations = await import("../server/lib/savedSiteOperations.mjs").catch(error => { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; return {}; });
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } });
const request = (context, extra = {}) => ({ method: "PUT", path: "/api/jira/issue-metadata/ABC-1", params: { issueKey: "ABC-1" }, body: {}, headers: { "x-docket-saved-site": context.instanceId, "x-docket-saved-revision": context.revision }, ...extra });
const setup = (t, transport) => {
  assert.equal(typeof operations.createSavedSiteOperations, "function", "saved operations must be available");
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "saved-operation-"));
  const metaDb = new Database(":memory:");
  instances.initInstancesSchema(metaDb);
  const sites = ["a", "b"].map(name => instances.createInstance(metaDb, { displayName: name, baseUrl: `https://${name}.test`, email: `${name}@example.test` }, ["a.test", "b.test"]));
  instances.setActiveInstanceId(metaDb, sites[0].id);
  const activeDb = new Database(":memory:"); initDatabase(activeDb);
  const active = createSiteOperationState({ snapshot: { credentials: { instanceId: sites[0].id, baseUrl: sites[0].baseUrl }, db: activeDb }, activate: () => assert.fail("must not activate") });
  const calls = [];
  const service = operations.createSavedSiteOperations({ metaDb, dataDir, env: { JIRA_ALLOWED_HOSTS: "a.test,b.test", JIRA_API_TOKEN: "synthetic" }, withSiteOperation: active.withSiteOperation, requestJira: async options => { calls.push(options); if (transport) return transport(options); return { ok: true, status: 200, data: { issues: [], isLast: true } }; } });
  const contexts = sites.map(site => service.getSavedSiteContext(site.id));
  t.after(() => { metaDb.close(); activeDb.close(); rmSync(dataDir, { recursive: true, force: true }); });
  return { dataDir, metaDb, sites, active, activeDb, calls, service, contexts };
};
const routes = (register, f) => {
  const registered = new Map();
  const app = Object.fromEntries(["get", "post", "put", "patch", "delete"].map(method => [method, (url, ...handlers) => registered.set(`${method.toUpperCase()} ${url}`, handlers.at(-1))]));
  register(app, { withSiteOperation: f.service.withSavedSiteOperation, getDb: () => f.activeDb, getSiteContext: f.active.getSiteContext });
  return registered;
};

test("same issue keys write independent saved DBs and date mappings use captured credentials", async t => {
  const f = setup(t);
  const handlers = routes(registerIssueMetadataRoutes, f);
  for (const [index, context] of f.contexts.entries()) {
    const res = response();
    await handlers.get("PUT /api/jira/issue-metadata/:issueKey")(request(context, { body: { note: `note-${index}` } }), res);
    assert.equal(res.statusCode, 200);
    const db = new Database(instances.appDbPathForInstance(f.dataDir, context.instanceId));
    assert.equal(db.prepare("SELECT note FROM issue_metadata WHERE issue_key = 'ABC-1'").get().note, `note-${index}`);
    db.prepare("UPDATE jira_field_mappings SET field_id = ? WHERE role = 'due_date'").run(`customfield_${index + 11}`); db.close();
    await handlers.get("POST /api/jira/issues/:issueKey/date-field")(request(context, { method: "POST", path: "/api/jira/issues/ABC-1/date-field", body: { role: "due_date", value: "2026-10-15" } }), response());
  }
  assert.deepEqual(f.calls.map(c => [c.credentials.email, c.body.fields]), [["a@example.test", { customfield_11: "2026-10-15" }], ["b@example.test", { customfield_12: "2026-10-15" }]]);
  assert.equal(f.activeDb.prepare("SELECT COUNT(*) n FROM issue_metadata").get().n, 0);
  assert.equal(instances.getActiveInstanceId(f.metaDb), f.sites[0].id);
  assert.doesNotMatch(JSON.stringify(f.contexts), /synthetic|example.test|generation/);
});

test("stale, disabled, removed, malformed and unsupported saved contexts never fall back active", async t => {
  const f = setup(t);
  const c = f.contexts[0];
  instances.updateInstance(f.metaDb, c.instanceId, { email: "changed@example.test" }, ["a.test"]);
  const bad = [request(c), request({ ...c, instanceId: "unknown" }), request(c, { headers: { "x-docket-saved-site": c.instanceId } }), request(c, { headers: { "x-docket-saved-revision": c.revision } }), request(c, { headers: { "x-docket-saved-site": [c.instanceId], "x-docket-saved-revision": c.revision } })];
  const fresh = f.service.getSavedSiteContext(c.instanceId);
  for (const [method, url] of [["PUT", "/api/settings"], ["POST", "/api/jira/issues"], ["POST", "/api/jira/issue-metadata/import/commit"], ["DELETE", "/api/jira/instances/x"], ["GET", "/api/jira/issues/ABC-1/status"]]) bad.push(request(fresh, { method, path: url }));
  for (const req of bad) { const res = response(); await f.service.withSavedSiteOperation(() => assert.fail("invalid context admitted"))(req, res); assert.equal(res.statusCode, 409); assert.equal(res.data.code, "SAVED_SITE_CONTEXT_CHANGED"); }
  instances.updateInstance(f.metaDb, c.instanceId, { enabled: false }, ["a.test"]);
  const disabled = response(); await f.service.withSavedSiteOperation(() => assert.fail("disabled"))(request(fresh), disabled); assert.equal(disabled.statusCode, 409);
  instances.deleteInstance(f.metaDb, f.contexts[1].instanceId);
  const removed = response(); await f.service.withSavedSiteOperation(() => assert.fail("removed"))(request(f.contexts[1]), removed); assert.equal(removed.statusCode, 409);
});

test("ordinary requests still require the original active generation", async t => {
  const f = setup(t);
  const res = response(); await f.service.withSavedSiteOperation(() => assert.fail("unguarded active"))({ headers: {} }, res); assert.equal(res.data.code, "SITE_CONTEXT_CHANGED");
  const active = f.active.getSiteContext(); let called = false;
  await f.service.withSavedSiteOperation(req => { called = true; assert.equal(req.docketOperation, undefined); })({ headers: { "x-docket-site": active.instanceId, "x-docket-generation": active.generation } }, response()); assert.equal(called, true);
});

test("registry lease and owned DB survive response close until handler settlement", async t => {
  const f = setup(t); const c = f.contexts[1]; let finish; let db;
  const pending = new Promise(resolve => { finish = resolve; });
  const res = Object.assign(new EventEmitter(), response());
  const running = f.service.withSavedSiteOperation(async req => { db = req.docketOperation.getDb(); await pending; assert.equal(db.open, true); })(request(c), res);
  res.emit("close");
  assert.ok(db.open);
  assert.throws(() => instances.updateInstance(f.metaDb, c.instanceId, { enabled: false }, ["b.test"]), { code: "INSTANCE_IN_USE" });
  finish(); await running;
  assert.equal(db.open, false); assert.equal(f.activeDb.open, true);
  instances.updateInstance(f.metaDb, c.instanceId, { enabled: false }, ["b.test"]);
});

test("search and field-mapping reads hydrate from the saved entry", async t => {
  const f = setup(t); const c = f.contexts[1];
  await f.service.withSavedSiteOperation(req => req.docketOperation.getDb().prepare("UPDATE jira_field_mappings SET field_id = 'customfield_777' WHERE role = 'due_date'").run())(request(c), response());
  const core = routes(registerJiraCoreRoutes, f); const config = routes(registerAppConfigRoutes, f);
  const search = response(); await core.get("POST /api/jira/search/all")(request(c, { method: "POST", path: "/api/jira/search/all", body: { jql: "assignee = currentUser()" } }), search);
  assert.equal(search.statusCode, 200); assert.equal(f.calls[0].credentials.email, "b@example.test"); assert.ok(f.calls[0].body.fields.includes("customfield_777"));
  const mappings = response(); await config.get("GET /api/jira/field-mappings")(request(c, { method: "GET", path: "/api/jira/field-mappings" }), mappings);
  assert.equal(mappings.data.items.find(m => m.role === "due_date").fieldId, "customfield_777");
});


test("GET search validates the selected site's environment rather than active dependencies", async t => {
  const f = setup(t); const handlers = routes(registerJiraCoreRoutes, f); const res = response();
  await handlers.get("GET /api/jira/search")(request(f.contexts[1], { method: "GET", path: "/api/jira/search", query: { jql: "key = ABC-1" } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(f.calls[0].credentials.email, "b@example.test");
});

test("saved-only boundary rejects unsupported routes before an ordinary unguarded handler", t => {
  const f = setup(t); const res = response();
  f.service.rejectUnsupportedSavedSiteOperation(request(f.contexts[1], { method: "POST", path: "/api/combined-open-work" }), res, () => assert.fail("unsupported explicit request reached route"));
  assert.equal(res.statusCode, 409);
});

test("saved handlers preserve Workfront suppression and sanitized validation errors", async t => {
  const f = setup(t, async () => ({ ok: false, status: 400, data: { errorMessages: ["Workfront sync failed"], errors: { workfront: "Workfront detail" } } }));
  const handlers = routes(registerIssueMetadataRoutes, f); const res = response();
  await handlers.get("POST /api/jira/issues/:issueKey/assignee")(request(f.contexts[1], { method: "POST", path: "/api/jira/issues/ABC-1/assignee", body: { assignee: "unassigned" } }), res);
  assert.equal(res.statusCode, 200); assert.equal(res.data.accountId, null);
  f.metaDb.prepare("UPDATE jira_instances SET base_url = ? WHERE id = ?").run("https://private:synthetic@blocked.test", f.contexts[1].instanceId);
  const invalid = response(); await f.service.withSavedSiteOperation(() => assert.fail("invalid host"))(request(f.contexts[1]), invalid);
  assert.equal(invalid.statusCode, 409); assert.doesNotMatch(JSON.stringify(invalid.data), /private|synthetic|blocked/);
});

test("real multipart, retained images and nested comment media requests keep the saved source", async t => {
  const mediaId = "12345678-1234-1234-1234-123456789abc";
  const f = setup(t, async options => {
    if (options.responseMode === "redirect") return { ok: false, status: 303, location: `https://media.example.test/file/${mediaId}` };
    if (options.formData) return { ok: true, status: 200, data: [{ id: "123", filename: "image.png", size: 3 }] };
    return { ok: true, status: 200, data: { id: "comment", fields: { attachment: [] } } };
  });
  const app = express(); app.use(express.json()); app.use(f.service.rejectUnsupportedSavedSiteOperation);
  const context = { withSiteOperation: f.service.withSavedSiteOperation, getDb: () => f.activeDb, getSiteContext: f.active.getSiteContext };
  registerIssueMetadataRoutes(app, context); registerAttachmentRoutes(app, context);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (url, method, body, c = f.contexts[1]) => fetch(base + url, { method, body, headers: { "X-Docket-Saved-Site": c.instanceId, "X-Docket-Saved-Revision": c.revision } });
  const form = field => { const value = new FormData(); value.append(field, new Blob(["png"], { type: "image/png" }), "image.png"); return value; };
  const kept = await send("/api/jira/issue-metadata/ABC-1/images", "POST", form("images"));
  assert.equal(kept.status, 200); const keptData = await kept.json(); const imageId = keptData.images[0].id;
  const same = await send(`/api/jira/issue-metadata/ABC-1/images/${imageId}`, "GET"); assert.equal(same.status, 200); assert.equal(await same.text(), "png");
  const other = await send(`/api/jira/issue-metadata/ABC-1/images/${imageId}`, "GET", undefined, f.contexts[0]); assert.equal(other.status, 404);
  const comment = await send("/api/jira/issues/ABC-1/comment", "POST", form("images")); assert.equal(comment.status, 200);
  assert.deepEqual(f.calls.map(c => c.credentials.email), ["b@example.test", "b@example.test", "b@example.test"]);
  assert.equal(f.calls[0].formData.get("file").name, "image.png");
  assert.equal(f.calls[1].pathWithQuery, "/rest/api/3/attachment/content/123");
  assert.equal(f.calls[2].body.body.content[0].content[0].attrs.id, mediaId);
  const gone = await send(`/api/jira/issue-metadata/ABC-1/images/${imageId}`, "GET"); assert.equal(gone.status, 404);
  assert.equal((await send("/api/jira/issues/ABC-1/attachments", "POST", form("files"))).status, 200);
  assert.equal((await send("/api/jira/issues/ABC-1/attachments", "GET")).status, 200);
  assert.ok(f.calls.every(c => c.credentials.email === "b@example.test"));
});

test("Team metadata reads and writes retain hostname and actor through the SQL boundary", async t => {
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  process.env.TEAM_PRIORITY_DATABASE_URL = "postgres://test@127.0.0.1:59999/docket_test_saved";
  t.after(async () => { await closeTeamPool(); if (previous === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL; else process.env.TEAM_PRIORITY_DATABASE_URL = previous; });
  const sql = [];
  const query = async (statement, params) => { sql.push({ statement, params }); return { rows: statement.startsWith("SELECT") && params?.[1] ? [{ issue_key: "ABC-1", priority: 3, updatedAt: "2026-10-15", updatedBy: "b actor" }] : [] }; };
  const pool = getTeamPool(); t.mock.method(pool, "query", query); t.mock.method(pool, "connect", async () => ({ query, release() {} }));
  const f = setup(t, async () => ({ ok: true, status: 200, data: { accountId: "b-user", displayName: "b actor" } }));
  const handlers = routes(registerTeamPriorityRoutes, f);
  for (const [method, template, url, body] of [
    ["POST", "/api/team-priority/metadata/bulk", "/api/team-priority/metadata/bulk", { issueKeys: ["ABC-1"] }],
    ["POST", "/api/team-priority/bulk", "/api/team-priority/bulk", { issueKeys: ["ABC-1"] }],
    ["POST", "/api/team-priority/dates/bulk", "/api/team-priority/dates/bulk", { issueKeys: ["ABC-1"] }],
    ["PUT", "/api/team-priority/:issueKey", "/api/team-priority/ABC-1", { priority: 3 }],
    ["PUT", "/api/team-priority/dates/:issueKey", "/api/team-priority/dates/ABC-1", { startDate: "2026-10-15" }],
    ["DELETE", "/api/team-priority/dates/:issueKey", "/api/team-priority/dates/ABC-1", {}],
  ]) {
    const res = response(); await handlers.get(`${method} ${template}`)(request(f.contexts[1], { method, path: url, body }), res); assert.equal(res.statusCode, 200, JSON.stringify(res.data));
  }
  assert.ok(sql.filter(c => c.params).every(c => c.params[0] === "b.test"));
  assert.ok(sql.some(c => c.statement.startsWith("UPDATE") && c.params.at(-1) === "b actor"));
  assert.ok(f.calls.every(c => c.credentials.email === "b@example.test"));
});
