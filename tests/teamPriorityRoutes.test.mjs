import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { registerTeamPriorityRoutes } from "../server/routes/teamPriorityRoutes.mjs";
import { registerIssueMetadataRoutes } from "../server/routes/issueMetadataRoutes.mjs";
import { createSiteOperationState } from "../server/lib/siteOperationState.mjs";

const withServer = async (run) => {
  const state = createSiteOperationState({ snapshot: { credentials: { instanceId: "a", baseUrl: "https://d1-route-a.example.test" } }, activate: async (id) => ({ credentials: { instanceId: id, baseUrl: `https://d1-route-${id}.example.test` } }) });
  const app = express();
  app.use(express.json());
  registerTeamPriorityRoutes(app, { ...state, getDb: () => null, resolveCurrentJiraUser: async () => ({ displayName: "Synthetic user" }) });
  registerIssueMetadataRoutes(app, { ...state, getDb: () => null });
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const request = (url, method = "GET", body = {}, context = state.getSiteContext()) => fetch(`http://127.0.0.1:${server.address().port}${url}`, { method, headers: { "Content-Type": "application/json", "X-Docket-Site": context.instanceId, "X-Docket-Generation": context.generation }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
  try { await run({ state, request }); } finally { await new Promise((resolve) => server.close(resolve)); }
};

test("unconfigured team endpoints return 503 with setup guidance and health keeps its public shape", async () => {
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  delete process.env.TEAM_PRIORITY_DATABASE_URL;
  try {
    await withServer(async ({ request }) => {
      assert.deepEqual(await request("/api/team-priority/health").then((res) => res.json()), { ok: false, configured: false, connected: false });
      for (const [url, method] of [["/api/team-priority/metadata/bulk", "POST"], ["/api/team-priority/bulk", "POST"], ["/api/shared-programs", "GET"]]) {
        const response = await request(url, method, { issueKeys: ["ABC-1"] });
        assert.equal(response.status, 503);
        assert.match((await response.json()).error, /TEAM_PRIORITY_DATABASE_URL/);
      }
    });
  } finally { if (previous !== undefined) process.env.TEAM_PRIORITY_DATABASE_URL = previous; }
});

test("accepted site context is required even when team data is unavailable", async () => {
  await withServer(async ({ request }) => {
    const response = await request("/api/team-priority/metadata/bulk", "POST", { issueKeys: ["ABC-1"], siteHost: "browser-supplied.invalid" }, { instanceId: "a", generation: "stale" });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "SITE_CONTEXT_CHANGED");
  });
});

test("real PostgreSQL routes scope reads/writes to server site and preserve compatibility", { skip: !process.env.DOCKET_TEST_DATABASE_URL }, async (t) => {
  const url = new URL(process.env.DOCKET_TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /^\/docket_test_[a-z0-9_]+$/);
  assert.ok(url.port);
  const errors = [];
  t.mock.method(console, "error", (...parts) => { errors.push(parts.join(" ")); });
  const store = await import("../server/lib/teamPriorityPostgres.mjs");
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  process.env.TEAM_PRIORITY_DATABASE_URL = url.href;
  t.after(async () => { await store.closeTeamPool(); if (previous === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL; else process.env.TEAM_PRIORITY_DATABASE_URL = previous; });
  const { migrateTeamDatabase } = await import("../scripts/migrate-team-db.mjs");
  await migrateTeamDatabase(store.getTeamPool());
  await withServer(async ({ state, request }) => {
    const priority = await request("/api/team-priority/ABC-1", "PUT", { priority: 7, siteHost: "browser-supplied.invalid" });
    assert.equal(priority.status, 200);
    assert.equal((await priority.json()).priority, 7);
    const dates = await request("/api/team-priority/dates/ABC-1", "PUT", { startDate: "2026-10-02", hasOpenDecision: true });
    assert.equal(dates.status, 200);
    const dateResult = await dates.json();
    assert.equal(dateResult.updatedBy, "Synthetic user");
    assert.ok(dateResult.updatedAt);
    assert.equal((await request("/api/team-priority/dates/ABC-1", "PUT", { plannedStart: "bad" })).status, 400);
    const first = await request("/api/team-priority/metadata/bulk", "POST", { issueKeys: ["ABC-1"] }).then((r) => r.json());
    assert.equal(first.items["ABC-1"].priority, 7);
    assert.equal(first.items["ABC-1"].startDate, "2026-10-02");
    await state.switchSite("b", state.getSiteContext().generation);
    assert.deepEqual((await request("/api/team-priority/metadata/bulk", "POST", { issueKeys: ["ABC-1"] }).then((r) => r.json())).items, {});
    assert.equal((await request("/api/team-priority/metadata/import", "POST", { entries: [] })).status, 404);
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /update team date tracking failed plannedStart must be YYYY-MM-DD/);
  await store.getTeamPool().query("DELETE FROM team_issue_metadata WHERE site_host IN ('d1-route-a.example.test', 'd1-route-b.example.test')");
});


test("configured but disconnected routes return safe 503 responses", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (...parts) => { errors.push(parts.join(" ")); });
  const store = await import("../server/lib/teamPriorityPostgres.mjs");
  const { Pool } = await import("pg");
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  const original = Pool.prototype.query;
  process.env.TEAM_PRIORITY_DATABASE_URL = "postgresql://synthetic:SECRET@127.0.0.1:1/docket_test_unit";
  Pool.prototype.query = async () => { throw new Error("SECRET at internal-db"); };
  try {
    await withServer(async ({ request }) => {
      const response = await request("/api/team-priority/metadata/bulk", "POST", { issueKeys: ["ABC-1"] });
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.match(body.error, /unavailable/i);
      assert.doesNotMatch(JSON.stringify(body), /SECRET|internal-db/);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /fetch team metadata failed Team database unavailable/);
      assert.doesNotMatch(errors[0], /SECRET|internal-db/);
    });
  } finally {
    Pool.prototype.query = original;
    await store.closeTeamPool();
    if (previous === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL; else process.env.TEAM_PRIORITY_DATABASE_URL = previous;
  }
});

test("browser full metadata reads retain the captured server site context", async (t) => {
  const { build } = await import("esbuild");
  const bundled = await build({ stdin: { contents: 'export * from "./src/services/jiraClient.js"; export * from "./src/utils/siteContextStore.js";', resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env.VITE_API_BASE": "undefined" } });
  const client = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const context = { instanceId: "synthetic-a", generation: "accepted-a" };
  client.setSiteContext(context);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/team-priority/metadata/bulk");
    assert.equal(options.headers["X-Docket-Site"], "synthetic-a");
    assert.equal(options.headers["X-Docket-Generation"], "accepted-a");
    assert.deepEqual(JSON.parse(options.body), { issueKeys: ["ABC-1"] });
    return new Response(JSON.stringify({ items: { "ABC-1": { note: "from team" } } }));
  };
  assert.equal((await client.fetchTeamMetadataBulk(["ABC-1"], { siteContext: context }))["ABC-1"].note, "from team");
});


test("real team CSV import preserves priority on optional edits and followUp-only rows keep no tracking provenance", { skip: !process.env.DOCKET_TEST_DATABASE_URL }, async (t) => {
  const url = new URL(process.env.DOCKET_TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /^\/docket_test_[a-z0-9_]+$/);
  assert.ok(url.port);
  const store = await import("../server/lib/teamPriorityPostgres.mjs");
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  process.env.TEAM_PRIORITY_DATABASE_URL = url.href;
  t.after(async () => {
    await store.getTeamPool().query("DELETE FROM team_issue_metadata WHERE site_host = 'd1-route-a.example.test'");
    await store.closeTeamPool();
    if (previous === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL; else process.env.TEAM_PRIORITY_DATABASE_URL = previous;
  });
  const { migrateTeamDatabase } = await import("../scripts/migrate-team-db.mjs");
  await migrateTeamDatabase(store.getTeamPool());
  await store.writeTeamMetadata({ siteHost: "d1-route-a.example.test", entries: [{ issueKey: "ABC-10", patch: { priority: 8, note: "saved", plannedStart: "2026-10-01", plannedFinish: "2026-10-05", hasOpenDecision: true } }] });
  await withServer(async ({ request }) => {
    const preview = await request("/api/jira/issue-metadata/import/preview", "POST", { destination: "team", csvText: "Key,Notes,Requestor,Follow up\nABC-10,protected,Team,now" });
    assert.equal(preview.status, 200);
    const imported = await request("/api/jira/issue-metadata/import/commit", "POST", { previewId: (await preview.json()).previewId });
    assert.equal(imported.status, 200);
    assert.equal((await imported.json()).updated, 1);
    const result = await request("/api/team-priority/metadata/bulk", "POST", { issueKeys: ["ABC-10"] }).then((response) => response.json());
    assert.equal(result.items["ABC-10"].priority, 8);
    assert.equal(result.items["ABC-10"].note, "saved");
    assert.equal(result.items["ABC-10"].requestor, "Team");
    assert.equal(result.items["ABC-10"].plannedStart, "2026-10-01");
    assert.equal(result.items["ABC-10"].hasOpenDecision, true);
    for (const followUp of ["next", null]) {
      assert.equal((await request("/api/team-priority/dates/ABC-11", "PUT", { followUp })).status, 200);
      const full = await request("/api/team-priority/metadata/bulk", "POST", { issueKeys: ["ABC-11"] }).then((response) => response.json());
      assert.equal(full.items["ABC-11"].followUp, followUp);
      const tracking = await request("/api/team-priority/dates/bulk", "POST", { issueKeys: ["ABC-11"] }).then((response) => response.json());
      assert.deepEqual(tracking.items, {});
    }
  });
});
