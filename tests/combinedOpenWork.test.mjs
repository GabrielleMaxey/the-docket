import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter, once } from "node:events";
import Database from "better-sqlite3";
import express from "express";
import * as instances from "../server/lib/jiraInstances.mjs";
import { collectCombinedOpenWork } from "../server/lib/combinedOpenWork.mjs";
import { registerCombinedOpenWorkRoutes } from "../server/routes/combinedOpenWorkRoutes.mjs";

const issue = (key = "ABC-1") => ({ key, self: "https://unsafe.test", fields: { summary: "Task", status: { name: "Open" }, priority: { name: "High" }, duedate: "2026-10-31", assignee: { emailAddress: "private" } } });
const page = (issues = [issue()], extra = { isLast: true }) => ({ ok: true, data: { issues, ...extra } });
const fixture = t => {
  const metaDb = new Database(":memory:");
  instances.initInstancesSchema(metaDb);
  const saved = ["A", "B", "Unselected"].map(displayName => instances.createInstance(metaDb, { displayName, baseUrl: "https://lumen.atlassian.net", email: `${displayName}@example.test` }));
  instances.setActiveInstanceId(metaDb, saved[2].id);
  t.after(() => metaDb.close());
  const context = { metaDb, env: { JIRA_API_TOKEN: "synthetic" }, requestJira: async () => page() };
  const collect = (extra = {}) => collectCombinedOpenWork({ ...context, instanceIds: saved.slice(0, 2).map(s => s.id), ...extra });
  return { metaDb, saved, context, collect };
};

test("same host and issue key stay separate per saved identity, with selected credentials and fixed minimal search", async t => {
  const f = fixture(t);
  const calls = [];
  const result = await f.collect({ requestJira: async options => { calls.push(options); return page([issue(), issue()]); } });
  assert.deepEqual(result.sites.map(s => [s.instanceId, s.displayName, s.loaded, s.status]), f.saved.slice(0, 2).map(s => [s.id, s.displayName, 1, "complete"]));
  assert.deepEqual(calls.map(c => c.credentials.email).sort(), ["A@example.test", "B@example.test"]);
  for (const c of calls) {
    assert.equal(c.credentials.apiToken, "synthetic");
    assert.equal(c.pathWithQuery, "/rest/api/3/search/jql");
    assert.equal(c.method, "POST");
    assert.equal(c.body.jql, "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC, key ASC");
    assert.deepEqual(c.body.fields, ["summary", "status", "priority", "duedate"]);
    assert.ok(c.signal instanceof AbortSignal);
  }
  assert.deepEqual(result.sites[0].rows[0], { issueKey: "ABC-1", summary: "Task", status: "Open", jiraPriority: "High", dueDate: "2026-10-31", url: "https://lumen.atlassian.net/browse/ABC-1" });
  assert.equal(instances.getActiveInstanceId(f.metaDb), f.saved[2].id);
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
  assert.doesNotMatch(JSON.stringify(result), /private|synthetic|example.test|unsafe/);
});

test("validation rejects unknown, disabled, duplicate, empty, non-array and excessive ids before requests", async t => {
  const f = fixture(t);
  instances.updateInstance(f.metaDb, f.saved[1].id, { enabled: false });
  for (const instanceIds of [undefined, null, "id", [], [""], ["missing"], [f.saved[1].id], [f.saved[0].id, f.saved[0].id], [1], ["a", "b", "c", "d", "e", "f"]]) {
    await assert.rejects(f.collect({ instanceIds, requestJira: () => assert.fail("outbound validation") }), { status: 400 });
  }
});

test("independent auth/rate/network/blocked-host/missing-token errors remain safe and never erase successful peers", async t => {
  const f = fixture(t);
  for (const status of [401, 403, 429, 500]) {
    const r = await f.collect({ requestJira: async o => o.credentials.email.startsWith("A") ? { ok: false, status, data: { message: "private synthetic" } } : page() });
    assert.deepEqual(r.sites.map(s => s.status), ["failed", "complete"]);
    assert.deepEqual(r.sites[0].rows, []);
    assert.doesNotMatch(r.sites[0].message, /private|synthetic/);
  }
  const network = await f.collect({ requestJira: async () => { throw new TypeError("secret network"); } });
  assert.ok(network.sites.every(s => s.status === "failed" && !s.message.includes("secret")));
  f.metaDb.prepare("UPDATE jira_instances SET base_url = ? WHERE id = ?").run("https://blocked.test", f.saved[0].id);
  const blocked = await f.collect();
  assert.deepEqual(blocked.sites.map(s => s.status), ["failed", "complete"]);
  const missing = await f.collect({ env: {}, requestJira: () => assert.fail("missing token request") });
  assert.ok(missing.sites.every(s => s.status === "failed"));
});

test("empty complete differs from failed; optional fields remain plain empty text", async t => {
  const f = fixture(t);
  const r = await f.collect({ requestJira: async o => page(o.credentials.email.startsWith("A") ? [] : [{ key: "ABC-2", fields: { summary: {}, status: null, priority: {} } }]) });
  assert.equal(r.sites[0].status, "complete");
  assert.equal(r.sites[0].loaded, 0);
  assert.deepEqual(r.sites[1].rows[0], { issueKey: "ABC-2", summary: "", status: "", jiraPriority: "", dueDate: null, url: "https://lumen.atlassian.net/browse/ABC-2" });
});

test("opaque pagination, row bound without totals, malformed pages and unsafe keys", async t => {
  const f = fixture(t);
  let calls = 0;
  const paged = await f.collect({ instanceIds: [f.saved[0].id], requestJira: async o => {
    calls++;
    if (!o.body.nextPageToken) return page([issue()], { nextPageToken: "opaque+/=" });
    assert.equal(o.body.nextPageToken, "opaque+/=");
    return page([issue("ABC-2")]);
  } });
  assert.equal(calls, 2);
  assert.equal(paged.sites[0].loaded, 2);
  for (const value of ["1", "2"]) {
    const r = await f.collect({ env: { JIRA_API_TOKEN: "synthetic", DOCKET_OPEN_WORK_MAX_ROWS_PER_SITE: value }, requestJira: async o => {
      assert.equal(o.body.maxResults, Number(value));
      return page(Array.from({ length: Number(value) }, (_, i) => issue(`ABC-${i + 1}`)), { nextPageToken: "more" });
    } });
    assert.ok(r.sites.every(s => s.status === "partial" && /incomplete|limit/i.test(s.message)));
  }
  for (const response of [{ ok: true, data: {} }, page([{ key: "../unsafe" }]), page([{ key: null }])]) {
    const r = await f.collect({ requestJira: async () => response });
    assert.ok(r.sites.every(s => s.status === "failed" && s.rows.length === 0));
  }
});

test("invalid settings default and oversized row setting caps at 5000", async t => {
  const f = fixture(t);
  for (const setting of ["0", "-1", "bad", "1.2", "999999"]) {
    const r = await f.collect({ env: { JIRA_API_TOKEN: "synthetic", DOCKET_OPEN_WORK_MAX_ROWS_PER_SITE: setting, DOCKET_OPEN_WORK_TIMEOUT_MS: "bad" }, requestJira: async o => {
      assert.equal(o.body.maxResults, 100);
      return page(Array.from({ length: 5001 }, (_, i) => issue(`ABC-${i + 1}`)), { nextPageToken: "more" });
    } });
    assert.ok(r.sites.every(s => s.status === "partial" && s.loaded === 5000));
  }
});

test("deadline retains earlier pages as partial and aborts real injected transport/body work", async t => {
  const f = fixture(t);
  const r = await f.collect({ env: { JIRA_API_TOKEN: "synthetic", DOCKET_OPEN_WORK_TIMEOUT_MS: "20" }, requestJira: async o => {
    if (!o.body.nextPageToken) return page([issue()], { nextPageToken: "next" });
    await new Promise(resolve => o.signal.addEventListener("abort", resolve, { once: true }));
    o.signal.throwIfAborted();
  } });
  assert.ok(r.sites.every(s => s.status === "partial" && s.loaded === 1 && /deadline|time/i.test(s.message)));
});

test("caller cancellation waits for all siblings before releasing selected leases", async t => {
  const f = fixture(t);
  const controller = new AbortController();
  let release;
  let started = 0;
  const pending = f.collect({ signal: controller.signal, requestJira: async o => {
    started++;
    await new Promise(resolve => o.signal.addEventListener("abort", resolve, { once: true }));
    if (o.credentials.email.startsWith("B")) await new Promise(resolve => { release = resolve; });
    o.signal.throwIfAborted();
  } });
  assert.equal(started, 2);
  controller.abort();
  await new Promise(resolve => setImmediate(resolve));
  for (const s of f.saved.slice(0, 2)) assert.throws(() => instances.deleteInstance(f.metaDb, s.id), { status: 409 });
  instances.updateInstance(f.metaDb, f.saved[2].id, { displayName: "Editable" });
  instances.setActiveInstanceId(f.metaDb, f.saved[2].id);
  release();
  await assert.rejects(pending, { name: "AbortError" });
  for (const s of f.saved.slice(0, 2)) instances.deleteInstance(f.metaDb, s.id);
});

test("HTTP route accepts only instanceIds and returns no-store safe response without active headers", async t => {
  const f = fixture(t);
  const app = express();
  app.use(express.json({ strict: false }));
  let calls = 0;
  registerCombinedOpenWorkRoutes(app, { ...f.context, requestJira: async () => { calls++; return page(); } });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const send = body => fetch(`http://127.0.0.1:${server.address().port}/api/combined-open-work`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  for (const body of [{ instanceIds: [f.saved[0].id], jql: "anything" }, {}, [], null]) assert.equal((await send(body)).status, 400);
  assert.equal(calls, 0);
  const response = await send({ instanceIds: [f.saved[0].id] });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).sites[0].status, "complete");
});


test("HTTP disconnect aborts upstream and sends no late response while leases await settlement", async t => {
  const f = fixture(t);
  let handler;
  let finish;
  let signal;
  registerCombinedOpenWorkRoutes({ post: (_path, callback) => { handler = callback; } }, { ...f.context, requestJira: async options => {
    signal = options.signal;
    await new Promise(resolve => { finish = resolve; });
    return page();
  } });
  const req = Object.assign(new EventEmitter(), { body: { instanceIds: [f.saved[0].id] } });
  const res = Object.assign(new EventEmitter(), { setHeader: () => {}, json: () => assert.fail("stale disconnected response"), status: () => assert.fail("disconnected error response") });
  const pending = handler(req, res);
  assert.equal(signal.aborted, false);
  res.emit("close");
  assert.equal(signal.aborted, true);
  assert.throws(() => instances.deleteInstance(f.metaDb, f.saved[0].id), { status: 409 });
  finish();
  await pending;
  instances.deleteInstance(f.metaDb, f.saved[0].id);
  assert.equal(req.listenerCount("aborted"), 0);
  assert.equal(res.listenerCount("close"), 0);
});
