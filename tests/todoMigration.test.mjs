import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { initDatabase } from "../server/db/schema.mjs";
import { initInstancesSchema, createInstance, deleteInstance, seedInstanceAppDbFromLegacyIfNeeded } from "../server/lib/jiraInstances.mjs";

const migration = await import("../server/db/todoDatabase.mjs").catch((error) => {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
  return {};
});

const fixture = (t) => {
  assert.equal(typeof migration.openTodoDatabase, "function", "personal database opener must exist");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "personal-todos-"));
  const db = migration.openTodoDatabase(dir);
  const meta = new Database(":memory:");
  initInstancesSchema(meta);
  t.after(() => { db.close(); meta.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, db, meta };
};

const source = (dir, name, rows, { reminders = [], hasTodos = true } = {}) => {
  const dbPath = path.join(dir, name);
  const db = new Database(dbPath);
  if (hasTodos) initDatabase(db);
  else db.exec("CREATE TABLE reminders (slot_index INTEGER PRIMARY KEY, text TEXT, done INTEGER, updated_at TEXT)");
  for (const row of rows) db.prepare("INSERT INTO todos (id, text, priority, due_date, done, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, row.text, row.priority ?? 3, row.dueDate ?? "", row.done ?? 0, row.createdAt ?? "2024-01-02 03:04:05", row.completedAt ?? "");
  for (const row of reminders) db.prepare("INSERT INTO reminders VALUES (?, ?, ?, ?)").run(row.id, row.text, row.done ?? 0, "2023-05-06 07:08:09");
  db.close();
  return { sourceId: name, dbPath };
};
const countTodos = (db) => db.prepare("SELECT COUNT(*) AS n FROM todos").get().n;

// Loss of source identity or text-based merging would drop one of these records.
test("imports 20 distinct records from two sites once despite duplicate text and numeric IDs", (t) => {
  const { dir, db } = fixture(t);
  const a = source(dir, "workweek-a.sqlite", Array.from({ length: 10 }, (_, i) => ({ id: i + 1, text: "same text" })));
  const b = source(dir, "workweek-b.sqlite", Array.from({ length: 10 }, (_, i) => ({ id: i + 1, text: "same text", done: i === 9 ? 1 : 0 })));
  assert.equal(migration.migratePersonalTodos(db, [a, b, a]).copied, 20);
  const secondRun = migration.migratePersonalTodos(db, [a, b]);
  assert.equal(countTodos(db), 20);
  assert.equal(secondRun.copied, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM todos WHERE done = 1 AND completed_at = ''").get().n, 1);
  assert.equal(new Set(db.prepare("SELECT id FROM todos").all().map((row) => row.id)).size, 20);
  const original = new Database(b.dbPath, { readonly: true });
  assert.equal(countTodos(original), 10);
  original.close();
});

test("retries a failed transaction without partial records or ledger entries", (t) => {
  const { dir, db } = fixture(t);
  const input = source(dir, "source.sqlite", [{ id: 1, text: "first" }, { id: 2, text: "second" }]);
  db.exec("CREATE TRIGGER fail_second BEFORE INSERT ON todos WHEN NEW.text = 'second' BEGIN SELECT RAISE(ABORT, 'synthetic interruption'); END");
  assert.throws(() => migration.migratePersonalTodos(db, [input]), /synthetic interruption/);
  assert.equal(countTodos(db), 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM todo_migration_ledger").get().n, 0);
  db.exec("DROP TRIGGER fail_second");
  assert.equal(migration.migratePersonalTodos(db, [input]).copied, 2);
});

test("retains migration ledger after deletion and restart", (t) => {
  const { dir, db } = fixture(t);
  const input = source(dir, "source.sqlite", [{ id: 1, text: "removed" }]);
  migration.migratePersonalTodos(db, [input]);
  db.exec("DELETE FROM todos");
  const reopened = migration.openTodoDatabase(dir);
  assert.equal(migration.migratePersonalTodos(reopened, [input]).copied, 0);
  assert.equal(countTodos(reopened), 0);
  reopened.close();
});

test("keeps all 20 active items rather than applying the creation limit during migration", (t) => {
  const { dir, db } = fixture(t);
  const input = source(dir, "source.sqlite", Array.from({ length: 20 }, (_, i) => ({ id: i + 1, text: `item ${i}` })));
  assert.equal(migration.migratePersonalTodos(db, [input]).copied, 20);
  assert.equal(countTodos(db), 20);
});

test("imports known pre-todos reminders without guessing completion dates", (t) => {
  const { dir, db } = fixture(t);
  const input = source(dir, "old.sqlite", [], { hasTodos: false, reminders: [{ id: 0, text: "complete", done: 1 }] });
  assert.equal(migration.migratePersonalTodos(db, [input]).copied, 1);
  assert.deepEqual(db.prepare("SELECT done, created_at, completed_at FROM todos").get(), { done: 1, created_at: "", completed_at: "" });
  db.exec("DELETE FROM todos");
  const upgraded = new Database(input.dbPath);
  initDatabase(upgraded);
  upgraded.close();
  const restarted = migration.migratePersonalTodos(db, [input]);
  assert.equal(restarted.copied, 0);
  assert.deepEqual(restarted.unresolved, []);
});

for (const rows of [[], [{ id: 1, text: "converted" }]]) {
  test(`retains uncertain reminder correspondence when todos has ${rows.length} records`, (t) => {
    const { dir, db } = fixture(t);
    const input = source(dir, "old.sqlite", rows, { reminders: [{ id: 0, text: "old reminder" }] });
    const result = migration.migratePersonalTodos(db, [input]);
    assert.equal(result.copied, rows.length);
    assert.equal(result.unresolved[0].sourceTable, "reminders");
    assert.equal(result.unresolved[0].count, 1);
  });
}

test("discovers site stores after registry removal and migrates newly registered sources", (t) => {
  const { dir, db, meta } = fixture(t);
  const row = createInstance(meta, { displayName: "Synthetic", baseUrl: "https://lumen.atlassian.net", email: "test@example.test" });
  source(dir, `workweek-${row.id}.sqlite`, [{ id: 1, text: "retained" }]);
  deleteInstance(meta, row.id);
  const inputs = migration.listTodoSources(meta, dir);
  assert.ok(inputs.some((input) => input.sourceId === `site:${row.id}`));
  assert.equal(migration.migratePersonalTodos(db, inputs).copied, 1);
  const next = createInstance(meta, { displayName: "Second", baseUrl: "https://lumen-nm.atlassian.net", email: "test@example.test" });
  source(dir, `workweek-${next.id}.sqlite`, [{ id: 1, text: "new source" }]);
  assert.equal(migration.migratePersonalTodos(db, migration.listTodoSources(meta, dir)).copied, 1);
});

for (const reason of ["no-legacy", "legacy-empty", "dest-has-data", "copied-legacy"]) {
  test(`old seed flag cannot prove lineage (${reason})`, (t) => {
    const { dir, db, meta } = fixture(t);
    const legacyPath = path.join(dir, "workweek.sqlite");
    const sitePath = path.join(dir, "workweek-old-site.sqlite");
    if (reason !== "no-legacy") source(dir, "workweek.sqlite", [{ id: 1, text: "canonical" }]);
    if (["dest-has-data", "copied-legacy"].includes(reason)) {
      const original = new Database(legacyPath);
      original.exec("INSERT INTO epic_presets (epic_key, epic_name) VALUES ('SYN-1', 'Synthetic')");
      original.close();
    }
    if (reason === "dest-has-data") {
      source(dir, "workweek-old-site.sqlite", [{ id: 1, text: "independent recovery" }]);
      const existing = new Database(sitePath);
      existing.exec("INSERT INTO issue_metadata (issue_key, note) VALUES ('SYN-1', 'Synthetic')");
      existing.close();
    }
    assert.equal(seedInstanceAppDbFromLegacyIfNeeded(meta, dir, "old-site").reason, reason);
    // Emulate the historical producer, which recorded only this flag on all four paths.
    meta.prepare("DELETE FROM jira_instance_meta WHERE key = ?").run("legacy_db_copy_records:old-site");
    if (!fs.existsSync(legacyPath)) source(dir, "workweek.sqlite", [{ id: 1, text: "canonical" }]);
    if (!fs.existsSync(sitePath)) source(dir, "workweek-old-site.sqlite", [{ id: 1, text: "site recovery" }]);
    const result = migration.migratePersonalTodos(db, migration.listTodoSources(meta, dir));
    assert.equal(result.copied, 1);
    assert.equal(result.unresolved.find((item) => item.sourceId === "site:old-site").count, 1);
    assert.equal(migration.migratePersonalTodos(db, migration.listTodoSources(meta, dir)).copied, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM todo_migration_ledger WHERE source_id = 'site:old-site'").get().n, 0);
  });
}

test("new successful copy has explicit lineage and does not import its entire copy twice", (t) => {
  const { dir, db, meta } = fixture(t);
  const input = source(dir, "workweek.sqlite", [{ id: 1, text: "canonical" }]);
  const legacy = new Database(input.dbPath);
  legacy.prepare("INSERT INTO epic_presets (epic_key, epic_name) VALUES ('SYN-1', 'Synthetic')").run();
  legacy.close();
  const row = createInstance(meta, { displayName: "Copy", baseUrl: "https://lumen.atlassian.net", email: "test@example.test" });
  assert.equal(seedInstanceAppDbFromLegacyIfNeeded(meta, dir, row.id).seeded, true);
  const result = migration.migratePersonalTodos(db, migration.listTodoSources(meta, dir));
  assert.equal(result.copied, 1);
  assert.deepEqual(result.unresolved, []);
  const copied = new Database(path.join(dir, `workweek-${row.id}.sqlite`));
  copied.exec("INSERT INTO todos (text) VALUES ('independent new record')");
  copied.close();
  assert.equal(migration.migratePersonalTodos(db, migration.listTodoSources(meta, dir)).copied, 1);
  assert.equal(countTodos(db), 2);
  db.exec("DELETE FROM todos");
  assert.equal(migration.migratePersonalTodos(db, migration.listTodoSources(meta, dir)).copied, 0);
});
