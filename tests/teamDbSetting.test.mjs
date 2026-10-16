import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { initInstancesSchema } from "../server/lib/jiraInstances.mjs";
import * as store from "../server/lib/teamPriorityPostgres.mjs";
import { registerTeamPriorityRoutes } from "../server/routes/teamPriorityRoutes.mjs";
import { registerIssueMetadataRoutes } from "../server/routes/issueMetadataRoutes.mjs";

// Removing the common access guard would allow these direct callers to reach PostgreSQL.
test("Team defaults off, settings persist in app metadata, and disabled direct callers are rejected", async () => {
  const db = new Database(":memory:");
  initInstancesSchema(db);
  assert.equal(typeof store.initializeTeamPrioritySettings, "function");
  store.initializeTeamPrioritySettings(db);
  try {
    assert.deepEqual(store.getTeamPrioritySettings(), { enabled: false });
    for (const run of [
      () => store.getTeamMetadata({ siteHost: "site.test", issueKeys: ["ABC-1"] }),
      () => store.writeTeamMetadata({ siteHost: "site.test", entries: [{ issueKey: "ABC-1", patch: { priority: 2 } }] }),
      () => store.listSharedPrograms("site.test"),
    ]) await assert.rejects(run(), error => error.code === "TEAM_DATABASE_DISABLED");
    store.saveTeamPrioritySettings({ enabled: true });
    store.initializeTeamPrioritySettings(db);
    assert.deepEqual(store.getTeamPrioritySettings(), { enabled: true });
    store.saveTeamPrioritySettings({ enabled: false });
    assert.equal(db.prepare("SELECT value FROM jira_instance_meta WHERE key = 'use_team_db'").get().value, "false");
  } finally { store.initializeTeamPrioritySettings(null); db.close(); }
});

test("settings validate booleans, disabled health makes no connection, and import obeys the switch", async (t) => {
  const errors = [];
  const originalError = console.error;
  t.mock.method(console, "error", (...parts) => {
    const message = parts.join(" ");
    if (message.includes("[team-priority]")) errors.push(message.replace(/^.*\[team-priority\] /, ""));
    else originalError(...parts);
  });
  const db = new Database(":memory:"); initInstancesSchema(db);
  const app = express(); app.use(express.json());
  registerTeamPriorityRoutes(app, { metaDb: db });
  registerIssueMetadataRoutes(app, { getDb: () => null, getSiteContext: () => ({ instanceId: "a", siteHost: "site.test", generation: 1 }) });
  const server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const request = (url, method = "GET", body) => fetch(`http://127.0.0.1:${server.address().port}${url}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const old = process.env.TEAM_PRIORITY_DATABASE_URL;
  process.env.TEAM_PRIORITY_DATABASE_URL = "postgresql://synthetic:synthetic@127.0.0.1:1/docket_test_unit";
  try {
    assert.equal((await request("/api/team-priority/settings")).status, 200);
    assert.deepEqual(await request("/api/team-priority/health").then(r => r.json()), { ok: false, enabled: false, configured: true, connected: false });
    assert.equal((await request("/api/team-priority/settings", "PUT", { enabled: "true" })).status, 400);
    for (const [url, method, body] of [
      ["/api/team-priority/ABC-1", "PUT", { priority: 3 }],
      ["/api/shared-programs", "GET"],
      ["/api/jira/issue-metadata/import/preview", "POST", { destination: "team", csvText: "Key,Priority\nABC-1,3" }],
    ]) {
      const response = await request(url, method, body);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "TEAM_DATABASE_DISABLED");
    }
    assert.deepEqual(errors, [
      "update team priority failed Team database is disabled. Enable Use team DB in Settings.",
      "list shared programs failed Team database is disabled. Enable Use team DB in Settings.",
    ]);
    delete process.env.TEAM_PRIORITY_DATABASE_URL;
    assert.deepEqual(await request("/api/team-priority/settings", "PUT", { enabled: true }).then(r => r.json()), { enabled: true });
    const health = await request("/api/team-priority/health").then(r => r.json());
    assert.deepEqual(health, { ok: false, enabled: true, configured: false, connected: false });
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (old === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL; else process.env.TEAM_PRIORITY_DATABASE_URL = old;
    store.initializeTeamPrioritySettings?.(null); db.close();
  }
});
