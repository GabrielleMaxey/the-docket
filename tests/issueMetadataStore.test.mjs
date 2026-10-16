import { enableTeamDatabase } from "./teamSettingsFixture.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { initDatabase } from "../server/db/schema.mjs";
import { getLocalMetadata, writeLocalMetadata } from "../server/lib/issueMetadataStore.mjs";

const fixture = (t) => {
  const db = new Database(":memory:");
  initDatabase(db);
  t.after(() => db.close());
  return db;
};

test("local targeted patches preserve omitted metadata and explicit selection clears", (t) => {
  const db = fixture(t);
  writeLocalMetadata(db, [{ issueKey: "ABC-1", patch: { note: "saved", followUp: "now", plannedStart: "2026-10-01", plannedFinish: "2026-10-05", hasOpenDecision: true, pinnedGantt: true } }]);
  db.prepare("UPDATE issue_metadata SET keep_note_images = 1 WHERE issue_key = ?").run("ABC-1");
  writeLocalMetadata(db, [{ issueKey: "ABC-1", patch: { priority: 4 } }]);
  const before = getLocalMetadata(db, ["ABC-1"])["ABC-1"];
  assert.equal(before.note, "saved");
  assert.equal(before.plannedStart, "2026-10-01");
  assert.equal(before.hasOpenDecision, true);
  assert.equal(before.keepNoteImages, true);
  writeLocalMetadata(db, [{ issueKey: "ABC-1", patch: { followUp: null } }]);
  assert.equal(getLocalMetadata(db, ["ABC-1"])["ABC-1"].followUp, null);
});

test("local patches compare changed fields and roll back an entire late-conflicting batch", (t) => {
  const db = fixture(t);
  writeLocalMetadata(db, [{ issueKey: "ABC-1", patch: { note: "first", priority: 1 } }, { issueKey: "ABC-2", patch: { note: "second" } }]);
  assert.throws(() => writeLocalMetadata(db, [
    { issueKey: "ABC-1", patch: { note: "must roll back" }, expected: { note: "first" } },
    { issueKey: "ABC-2", patch: { note: "late" }, expected: { note: "stale" } },
  ]), (error) => error.status === 409);
  assert.equal(getLocalMetadata(db, ["ABC-1"])["ABC-1"].note, "first");
  writeLocalMetadata(db, [{ issueKey: "ABC-1", patch: { priority: 2 }, expected: { priority: 1 } }]);
  assert.equal(getLocalMetadata(db, ["ABC-1"])["ABC-1"].priority, 2);
  assert.throws(() => writeLocalMetadata(db, [{ issueKey: "ABC-1", patch: { priority: 3 }, expected: null }]), (error) => error.status === 409);
  writeLocalMetadata(db, [{ issueKey: "ABC-3", patch: { note: "new" }, expected: null }]);
});

test("local writes validate combined dates, invalid fields and batch bound before commit", (t) => {
  const db = fixture(t);
  writeLocalMetadata(db, [{ issueKey: "ABC-1", patch: { plannedStart: "2026-10-01", plannedFinish: "2026-10-05" } }]);
  assert.throws(() => writeLocalMetadata(db, [{ issueKey: "ABC-1", patch: { plannedStart: "2026-10-06" } }]), /planned/i);
  assert.throws(() => writeLocalMetadata(db, [{ issueKey: "ABC-1", patch: { plannedFinish: "2026-02-30" } }]), /date|YYYY/i);
  assert.throws(() => writeLocalMetadata(db, [{ issueKey: "ABC-1", patch: { keepNoteImages: false } }]), /field/i);
  assert.throws(() => writeLocalMetadata(db, Array.from({ length: 5001 }, () => ({ issueKey: "ABC-2", patch: { note: "x" } }))), /5,?000/);
});


test("real PostgreSQL validates partial dates, atomic stale batches, absent rows and serializable races", { skip: !process.env.DOCKET_TEST_DATABASE_URL }, async (t) => {
  const url = new URL(process.env.DOCKET_TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /^\/docket_test_[a-z0-9_]+$/);
  assert.ok(url.port);
  const store = await import("../server/lib/teamPriorityPostgres.mjs");
  enableTeamDatabase(t);
  const previous = process.env.TEAM_PRIORITY_DATABASE_URL;
  process.env.TEAM_PRIORITY_DATABASE_URL = url.href;
  const siteHost = "d2-store.example.test";
  t.after(async () => {
    await store.getTeamPool().query("DELETE FROM team_issue_metadata WHERE site_host = $1", [siteHost]);
    await store.closeTeamPool();
    if (previous === undefined) delete process.env.TEAM_PRIORITY_DATABASE_URL; else process.env.TEAM_PRIORITY_DATABASE_URL = previous;
  });
  const { migrateTeamDatabase } = await import("../scripts/migrate-team-db.mjs");
  await migrateTeamDatabase(store.getTeamPool());
  const entries = [{ issueKey: "ABC-1", patch: { note: "first", plannedStart: "2026-10-01", plannedFinish: "2026-10-05", followUp: "now" } }, { issueKey: "ABC-2", patch: { note: "second" } }];
  await store.writeTeamMetadata({ siteHost, entries });
  await assert.rejects(store.writeTeamMetadata({ siteHost, entries: [{ issueKey: "ABC-1", patch: { plannedStart: "2026-10-06" } }] }), /planned/i);
  await assert.rejects(store.writeTeamMetadata({ siteHost, entries: [
    { issueKey: "ABC-1", patch: { note: "roll back" }, expected: { note: "first" } },
    { issueKey: "ABC-2", patch: { note: "late" }, expected: { note: "stale" } },
  ] }), (error) => error.status === 409);
  const after = await store.getTeamMetadata({ siteHost, issueKeys: ["ABC-1", "ABC-2"] });
  assert.equal(after["ABC-1"].note, "first");
  assert.equal(after["ABC-2"].note, "second");
  await assert.rejects(store.writeTeamMetadata({ siteHost, entries: [{ issueKey: "ABC-1", patch: { note: "appeared" }, expected: null }] }), (error) => error.status === 409);
  const attempts = await Promise.allSettled(["winner a", "winner b"].map((note) => store.writeTeamMetadata({ siteHost, entries: [{ issueKey: "ABC-3", patch: { note }, expected: null }] })));
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.find((result) => result.status === "rejected").reason.status, 409);
  await store.putTeamDate({ siteHost, issueKey: "ABC-4", followUp: "next" });
  assert.equal((await store.getTeamMetadata({ siteHost, issueKeys: ["ABC-4"] }))["ABC-4"].followUp, "next");
  assert.deepEqual(await store.bulkGetTeamDates(["ABC-4"], siteHost), {});
  await store.putTeamDate({ siteHost, issueKey: "ABC-4", followUp: null });
  assert.equal((await store.getTeamMetadata({ siteHost, issueKeys: ["ABC-4"] }))["ABC-4"].followUp, null);
  assert.deepEqual(await store.bulkGetTeamDates(["ABC-4"], siteHost), {});

  const client = await store.getTeamPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query("SELECT issue_key FROM team_issue_metadata WHERE site_host = $1 AND issue_key = 'ABC-5'", [siteHost]);
    await store.writeTeamMetadata({ siteHost, entries: [{ issueKey: "ABC-5", patch: { note: "concurrently inserted" } }] });
    await assert.rejects(store.writeTeamMetadataEntries(client, { siteHost, entries: [{ issueKey: "ABC-5", patch: { note: "stale absent snapshot" }, expected: null }] }), (error) => error.code === "40001" && store.teamDatabaseError(error).status === 409);
  } finally { await client.query("ROLLBACK"); client.release(); }
  assert.equal((await store.getTeamMetadata({ siteHost, issueKeys: ["ABC-5"] }))["ABC-5"].note, "concurrently inserted");
});
