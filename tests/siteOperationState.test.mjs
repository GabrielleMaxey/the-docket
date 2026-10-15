import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import * as operations from "../server/lib/siteOperationState.mjs";

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const snapshot = (id) => ({ credentials: { instanceId: id, baseUrl: `https://${id}.atlassian.net`, apiToken: "synthetic" }, db: { closeCalls: 0 } });
const setup = () => {
  const old = snapshot("a");
  const state = operations.createSiteOperationState({ snapshot: old, activate: (id) => { old.db.closeCalls += 1; return snapshot(id); } });
  return { state, old };
};
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } });
const request = (context) => ({ headers: { "x-docket-site": context.instanceId || "legacy", "x-docket-generation": context.generation } });

test("switch waits for both requests and rejects stale windows before closing old DB", async () => {
  const { state, old } = setup();
  const context = state.getSiteContext();
  const first = state.beginSiteOperation(context);
  const second = state.beginSiteOperation(context);
  const switching = state.switchSite("b", context.generation);
  assert.throws(() => state.beginSiteOperation(context), { status: 409, code: "SITE_CONTEXT_CHANGED" });
  assert.equal(old.db.closeCalls, 0);
  assert.equal(state.getSnapshot().credentials.instanceId, "a");
  first.release();
  await Promise.resolve();
  assert.equal(old.db.closeCalls, 0);
  second.release();
  const next = await switching;
  assert.equal(next.instanceId, "b");
  assert.equal(old.db.closeCalls, 1);
  const staleResponse = response();
  await state.withSiteOperation(() => assert.fail("stale request admitted"))(request(context), staleResponse);
  assert.equal(staleResponse.statusCode, 409);
  assert.equal(staleResponse.data.code, "SITE_CONTEXT_CHANGED");
});

test("browser disconnect does not release server work", async () => {
  const { state, old } = setup();
  const context = state.getSiteContext();
  const work = deferred();
  const res = new EventEmitter();
  const running = state.withSiteOperation(async () => { await work.promise; assert.equal(state.getSnapshot().credentials.instanceId, "a"); })(request(context), res);
  res.emit("close");
  const switching = state.switchSite("b", context.generation);
  assert.equal(old.db.closeCalls, 0);
  work.resolve();
  await running;
  await switching;
  assert.equal(old.db.closeCalls, 1);
});

test("concurrent activation, removal and host edits share one drain gate", async () => {
  const { state } = setup();
  const context = state.getSiteContext();
  const lease = state.beginSiteOperation(context);
  let mutations = 0;
  const edit = state.changeSite(context.generation, () => { mutations += 1; return "b"; });
  await assert.rejects(state.switchSite("c", context.generation), { status: 409 });
  await assert.rejects(state.changeSite(context.generation, () => { mutations += 1; return null; }), { status: 409 });
  assert.equal(mutations, 0);
  lease.release();
  await edit;
  assert.equal(mutations, 1);
});

test("handler failure releases its lease and missing headers fail closed", async () => {
  const { state } = setup();
  const context = state.getSiteContext();
  await assert.rejects(state.withSiteOperation(async () => { throw new Error("work failed"); })(request(context), response()), /work failed/);
  const res = response();
  await state.withSiteOperation(() => assert.fail())({ headers: {} }, res);
  assert.equal(res.statusCode, 409);
  await state.switchSite("b", context.generation);
});

test("every registered business endpoint rejects missing site context before doing work", async () => {
  const { state } = setup();
  const names = ["jiraCore", "jiraIssue", "issueMetadata", "epicWorkload", "capacityPlanning", "teamPriority", "pmAsks", "attachment", "appConfig", "dashboard", "report", "chat", "todo"];
  for (const name of names) {
    const routes = [];
    const app = Object.fromEntries(["get", "post", "put", "patch", "delete"].map((method) => [method, (path, ...handlers) => routes.push({ path, handler: handlers.at(-1) })]));
    const module = await import(`../server/routes/${name}Routes.mjs`);
    const register = Object.values(module).find((value) => typeof value === "function");
    const forbidden = () => assert.fail("Unscoped business work ran");
    register(app, { withSiteOperation: state.withSiteOperation, getDb: forbidden, jiraRequest: forbidden, ensureEnvOrRespond: forbidden, getNoteImagesDir: () => "/tmp/synthetic-note-images" });
    for (const route of routes) {
      const res = response();
      await route.handler({ headers: {}, query: {}, params: {}, body: {} }, res);
      assert.equal(res.statusCode, 409, route.path);
    }
  }
});

test("OAuth navigation uses one-time captured context and rejects switch/replay", async (t) => {
  const { registerChatRoutes } = await import("../server/routes/chatRoutes.mjs");
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(":memory:");
  db.exec("CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, provider TEXT, oauth_tokens TEXT, updated_at TEXT)");
  t.after(() => db.close());
  const oldClient = process.env.ATLASSIAN_OAUTH_CLIENT_ID;
  const oldSecret = process.env.ATLASSIAN_OAUTH_CLIENT_SECRET;
  process.env.ATLASSIAN_OAUTH_CLIENT_ID = "synthetic-client";
  process.env.ATLASSIAN_OAUTH_CLIENT_SECRET = "synthetic-secret";
  const nativeFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = nativeFetch;
    for (const [key, value] of [["ATLASSIAN_OAUTH_CLIENT_ID", oldClient], ["ATLASSIAN_OAUTH_CLIENT_SECRET", oldSecret]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  let exchanges = 0;
  globalThis.fetch = async () => { exchanges += 1; return new Response(JSON.stringify({ access_token: "synthetic" })); };
  const { state } = setup();
  const routes = new Map();
  const app = { get: (path, ...handlers) => routes.set(path, handlers), post() {} };
  registerChatRoutes(app, { ...state, getDb: () => db });
  const call = async (path, req) => {
    const res = { ...response(), send(data) { this.data = data; return this; } };
    const handlers = routes.get(path);
    let index = 0;
    const next = () => handlers[index++]?.(req, res, next);
    await next();
    return res;
  };
  const start = () => call("/api/chat/auth/start", { ...request(state.getSiteContext()), query: { format: "json" } });
  const first = await start();
  const callback = (token) => call("/api/chat/auth/callback", { headers: {}, query: { state: token, code: "synthetic-code" } });
  assert.equal((await callback(first.data.state)).statusCode, 200);
  assert.equal(exchanges, 1);
  assert.equal((await callback(first.data.state)).statusCode, 409);
  const second = await start();
  await state.switchSite("b", state.getSiteContext().generation);
  assert.equal((await callback(second.data.state)).statusCode, 409);
  assert.equal(exchanges, 1);
});

test("active Jira body timeout finishes before a site switch can close its database", async (t) => {
  const { requestJira } = await import("../server/lib/jiraTransport.mjs");
  const nativeFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = nativeFetch; });
  globalThis.fetch = async (_url, { signal }) => ({ ok: true, status: 200, text: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) });
  const { state, old } = setup();
  const context = state.getSiteContext();
  const res = response();
  const running = state.withSiteOperation(async (_req, response) => {
    const result = await requestJira({ credentials: { baseUrl: "https://lumen.atlassian.net", email: "fixture@example.test", apiToken: "synthetic" }, pathWithQuery: "/rest/api/3/myself", timeoutMs: 20 });
    response.status(result.status).json(result.data);
  })(request(context), res);
  const switching = state.switchSite("b", context.generation);
  assert.equal(old.db.closeCalls, 0);
  await running;
  await switching;
  assert.equal(res.statusCode, 504);
  assert.equal(res.data.code, "JIRA_TIMEOUT");
  assert.equal(old.db.closeCalls, 1);
  const back = await state.switchSite("a", state.getSiteContext().generation);
  assert.notEqual(back.generation, context.generation);
  const removed = await state.changeSite(back.generation, () => null);
  assert.equal(removed.instanceId, null);
});
