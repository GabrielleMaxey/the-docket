import { test } from "node:test";
import assert from "node:assert/strict";

const loadStore = () => import("../server/lib/teamPriorityPostgres.mjs");
const databaseUrl = process.env.DOCKET_TEST_DATABASE_URL;

const assertTestDatabase = (url) => {
  const parsed = new URL(url);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname));
  assert.match(parsed.pathname, /^\/docket_test_[a-z0-9_]+$/);
  assert.ok(parsed.port, "test database needs an explicit port");
};

test("unconfigured startup remains local and team status is unavailable", async () => {
  const store = await loadStore();
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  delete process.env.TEAM_PRIORITY_DATABASE_URL;
  try {
    assert.deepEqual(await store.getTeamStatus(), { configured: false, connected: false });
    await assert.rejects(store.getTeamMetadata({ siteHost: "a.example.test", issueKeys: ["ABC-1"] }), /not configured/i);
  } finally {
    if (previous === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL;
    else process.env.TEAM_PRIORITY_DATABASE_URL = previous;
    await store.closeTeamPool();
  }
});

test("connection failures never expose database credentials or internal server errors", async () => {
  const store = await loadStore();
  const { Pool } = await import("pg");
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  const original = Pool.prototype.query;
  process.env.TEAM_PRIORITY_DATABASE_URL = "postgresql://synthetic:SECRET@127.0.0.1:1/docket_test_unit";
  Pool.prototype.query = async () => { throw new Error("password SECRET host internal-company-db"); };
  try {
    const status = await store.getTeamStatus();
    assert.equal(status.configured, true);
    assert.equal(status.connected, false);
    assert.doesNotMatch(status.error, /SECRET|internal-company-db/);
    assert.match(status.error, /unavailable/i);
  } finally {
    Pool.prototype.query = original;
    await store.closeTeamPool();
    if (previous === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL;
    else process.env.TEAM_PRIORITY_DATABASE_URL = previous;
  }
});

test("remote databases require verified TLS and CA settings cannot be replaced by URL SSL options", async () => {
  const { teamPoolOptions } = await loadStore();
  const remote = teamPoolOptions({ TEAM_PRIORITY_DATABASE_URL: "postgresql://user:synthetic@database.example.test/team" });
  assert.equal(remote.ssl.rejectUnauthorized, true);
  assert.equal(remote.max, 5);
  assert.equal(remote.connectionTimeoutMillis, 5000);
  assert.equal(remote.statement_timeout, 30000);
  for (const query of ["sslmode=disable", "sslmode=no-verify", "host=127.0.0.1", "ssl=true"]) {
    assert.throws(() => teamPoolOptions({ TEAM_PRIORITY_DATABASE_URL: `postgresql://user:synthetic@database.example.test/team?${query}` }), /URL|TLS|SSL/);
  }
  assert.throws(() => teamPoolOptions({ TEAM_PRIORITY_DATABASE_URL: "postgresql://user:synthetic@127.0.0.1:1234/team?sslmode=require", TEAM_PRIORITY_DATABASE_CA_FILE: "/does/not/exist" }), /SSL/);
  assert.equal(teamPoolOptions({ TEAM_PRIORITY_DATABASE_URL: "postgresql://user:synthetic@127.0.0.1:1234/team" }).ssl, false);
  assert.throws(() => teamPoolOptions({ TEAM_PRIORITY_DATABASE_URL: "postgresql:///team" }), /host|URL/);
  assert.equal(teamPoolOptions({ TEAM_PRIORITY_DATABASE_URL: "postgresql://user:synthetic@127.0.0.1:1234/team", NODE_ENV: "production" }).ssl.rejectUnauthorized, true);
});

test("real PostgreSQL preserves site identity, full fields, partial clears and transactional rollback", { skip: !databaseUrl }, async (t) => {
  assertTestDatabase(databaseUrl);
  const store = await loadStore();
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  process.env.TEAM_PRIORITY_DATABASE_URL = databaseUrl;
  t.after(async () => { await pool.query("DELETE FROM team_issue_metadata WHERE site_host = ANY($1)", [["d1-a.example.test", "d1-b.example.test"]]); await store.closeTeamPool(); await pool.end(); if (previous === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL; else process.env.TEAM_PRIORITY_DATABASE_URL = previous; });
  const { migrateTeamDatabase } = await import("../scripts/migrate-team-db.mjs");
  await migrateTeamDatabase(pool);
  await migrateTeamDatabase(pool);
  const siteAHost = "d1-a.example.test";
  const siteBHost = "d1-b.example.test";
  const patch = { priority: 4, followUp: "now", note: "A", requestor: "Synthetic requestor", openDecisionNote: "Decision", pmOverride: "hold", hasOpenDecision: true, pinnedGantt: true, startDate: "2026-10-01", completeDate: "2026-10-03", plannedStart: "2026-10-04", plannedFinish: "2026-10-05" };
  await store.writeTeamMetadata({ siteHost: siteAHost, entries: [{ issueKey: "ABC-1", patch }, { issueKey: "ABC-2", patch: { note: "original second" } }], updatedBy: "synthetic tester" });
  await store.writeTeamMetadata({ siteHost: siteBHost, entries: [{ issueKey: "ABC-1", patch: { note: "B" } }] });
  const siteA = await store.getTeamMetadata({ siteHost: siteAHost, issueKeys: ["ABC-1"] });
  const siteB = await store.getTeamMetadata({ siteHost: siteBHost, issueKeys: ["ABC-1"] });
  assert.equal(siteA['ABC-1'].note, 'A');
  assert.equal(siteB['ABC-1'].note, 'B');
  for (const [key, value] of Object.entries(patch)) assert.equal(siteA["ABC-1"][key], value);
  assert.equal(siteA["ABC-1"].updatedBy, "synthetic tester");
  await store.putTeamPriority({ siteHost: siteAHost, issueKey: "ABC-1", priority: 0 });
  const afterClear = (await store.getTeamMetadata({ siteHost: siteAHost, issueKeys: ["ABC-1"] }))["ABC-1"];
  assert.equal(afterClear.followUp, 'now');
  assert.equal(afterClear.note, "A");
  assert.equal(afterClear.priority, 0);
  await store.deleteTeamDate({ siteHost: siteAHost, issueKey: "ABC-1" });
  const afterDates = (await store.getTeamMetadata({ siteHost: siteAHost, issueKeys: ["ABC-1"] }))["ABC-1"];
  assert.equal(afterDates.startDate, null);
  assert.equal(afterDates.plannedStart, null);
  assert.equal(afterDates.note, "A");
  assert.equal(afterDates.followUp, "now");
  assert.equal(afterDates.requestor, patch.requestor);
  assert.equal(afterDates.openDecisionNote, patch.openDecisionNote);
  const before = await store.getTeamMetadata({ siteHost: siteAHost, issueKeys: ["ABC-1", "ABC-2"] });
  await assert.rejects(store.writeTeamMetadata({ siteHost: siteAHost, entries: [{ issueKey: "ABC-1", patch: { note: "must roll back" } }, { issueKey: "ABC-2", patch: { priority: 21 } }] }));
  assert.deepEqual(await store.getTeamMetadata({ siteHost: siteAHost, issueKeys: ["ABC-1", "ABC-2"] }), before);
  await assert.rejects(store.writeTeamMetadata({ siteHost: siteAHost, entries: [{ issueKey: "ABC-1", patch: { note: "stale write" }, expected: { note: "stale" } }] }), (error) => error.status === 409);
  await assert.rejects(store.writeTeamMetadata({ siteHost: siteAHost, entries: [{ issueKey: "ABC-1", patch: { keepNoteImages: true } }] }), /field/i);
});


test("missing schema is visibly unavailable with migration guidance", async () => {
  const store = await loadStore();
  const { Pool } = await import("pg");
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  const original = Pool.prototype.query;
  process.env.TEAM_PRIORITY_DATABASE_URL = "postgresql://synthetic@127.0.0.1:1/docket_test_unit";
  Pool.prototype.query = async () => { throw Object.assign(new Error("relation absent"), { code: "42P01" }); };
  try {
    const status = await store.getTeamStatus();
    assert.equal(status.connected, false);
    assert.match(status.error, /team-db:migrate/);
  } finally {
    Pool.prototype.query = original;
    await store.closeTeamPool();
    if (previous === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL; else process.env.TEAM_PRIORITY_DATABASE_URL = previous;
  }
});

test("demo exports require explicit source mappings including every program epic", async () => {
  const { planTeamDemoImport } = await import("../scripts/import-team-demo.mjs");
  const mapping = { old: "d1-demo.example.test" };
  const data = { team_issue_priorities: [{ _id: "ABC-1", source: "old", priority: 2 }], team_issue_dates: [], shared_programs: [{ slug: "synthetic", displayName: "Synthetic", enabled: true, epicRoots: [{ source: "unknown", issueKey: "ABC-1" }] }] };
  assert.throws(() => planTeamDemoImport(data, mapping), /source|mapping/i);
  assert.throws(() => planTeamDemoImport({ team_issue_priorities: [{ _id: "ABC-1", priority: 2 }] }, mapping), /source|mapping/i);
  data.shared_programs[0].epicRoots[0].source = "old";
  const plan = planTeamDemoImport(data, mapping);
  assert.equal(plan.entries[0].siteHost, "d1-demo.example.test");
  assert.equal(plan.programs[0].epicRoots[0].siteHost, "d1-demo.example.test");
});

test("real demo migration rejects unknown sites before connecting and rolls back every collection on bad metadata", { skip: !databaseUrl }, async (t) => {
  assertTestDatabase(databaseUrl);
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  t.after(async () => { await pool.query("DELETE FROM shared_programs WHERE slug = 'd1-synthetic'"); await pool.query("DELETE FROM team_issue_metadata WHERE site_host = 'd1-demo.example.test'"); await pool.end(); });
  const { migrateTeamDatabase } = await import("../scripts/migrate-team-db.mjs");
  const { importTeamDemo } = await import("../scripts/import-team-demo.mjs");
  await migrateTeamDatabase(pool);
  const mapping = { old: "d1-demo.example.test" };
  const data = { team_issue_priorities: [{ _id: "ABC-1", source: "old", priority: 2 }], shared_programs: [{ slug: "d1-synthetic", displayName: "Synthetic", enabled: true, epicRoots: [{ source: "old", issueKey: "ABC-1" }] }] };
  await importTeamDemo(data, mapping, pool);
  const program = await pool.query("SELECT issue_key FROM shared_program_epics WHERE program_slug = 'd1-synthetic' AND site_host = 'd1-demo.example.test'");
  assert.deepEqual(program.rows, [{ issue_key: "ABC-1" }]);
  const before = await pool.query("SELECT priority FROM team_issue_metadata WHERE site_host = 'd1-demo.example.test' AND issue_key = 'ABC-1'");
  data.team_issue_priorities[0].priority = 8;
  data.team_issue_dates = [{ _id: "ABC-2", source: "old", startDate: "2026-02-30" }];
  data.shared_programs[0].displayName = "must roll back";
  await assert.rejects(importTeamDemo(data, mapping, pool));
  assert.deepEqual((await pool.query("SELECT priority FROM team_issue_metadata WHERE site_host = 'd1-demo.example.test' AND issue_key = 'ABC-1'")).rows, before.rows);
  assert.equal((await pool.query("SELECT display_name FROM shared_programs WHERE slug = 'd1-synthetic'")).rows[0].display_name, "Synthetic");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM team_issue_metadata WHERE site_host = 'd1-demo.example.test' AND issue_key = 'ABC-2'")).rows[0].n, 0);
  data.shared_programs[0].epicRoots[0].source = "unknown";
  await assert.rejects(importTeamDemo(data, mapping, { connect: () => assert.fail("unknown mapping must fail before a transaction") }), /mapping|source/i);
});
