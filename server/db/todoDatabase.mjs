import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { listInstances, legacyAppDbPath, appDbPathForInstance } from "../lib/jiraInstances.mjs";

export function openTodoDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "personal-todos.sqlite"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL DEFAULT '',
      priority INTEGER NOT NULL DEFAULT 3,
      due_date TEXT NOT NULL DEFAULT '',
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT NOT NULL DEFAULT '',
      client_id TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS todo_migration_ledger (
      source_id TEXT NOT NULL,
      source_table TEXT NOT NULL,
      source_record_id INTEGER NOT NULL,
      destination_id INTEGER NOT NULL,
      PRIMARY KEY (source_id, source_table, source_record_id)
    );
  `);
  return db;
}

export function listTodoSources(metaDb, dataDir) {
  const ids = new Set(listInstances(metaDb).map((instance) => instance.id));
  // Site deletion leaves recovery databases behind; their filenames retain source identity.
  for (const name of fs.readdirSync(dataDir)) {
    const match = /^workweek-(.+)\.sqlite$/.exec(name);
    if (match) ids.add(match[1]);
  }
  return [
    { sourceId: "legacy", dbPath: legacyAppDbPath(dataDir) },
    ...Array.from(ids, (id) => {
      const copy = metaDb.prepare("SELECT value FROM jira_instance_meta WHERE key = ?").get(`legacy_db_copy_records:${id}`);
      const seeded = metaDb.prepare("SELECT value FROM jira_instance_meta WHERE key = ?").get(`legacy_db_seeded:${id}`);
      return {
        sourceId: `site:${id}`,
        dbPath: appDbPathForInstance(dataDir, id),
        copiedRecords: copy ? JSON.parse(copy.value) : null,
        // The old flag also means copying was skipped. It cannot establish lineage.
        ambiguousLineage: Boolean(seeded && !copy),
      };
    }),
  ];
}

function copyTodoRecord(todoDb, source, table, row, result) {
  const remember = todoDb.prepare("INSERT INTO todo_migration_ledger VALUES (?, ?, ?, ?)");
  if (source.copiedRecords?.[table]?.includes(row.source_record_id)) {
    const original = todoDb.prepare("SELECT destination_id FROM todo_migration_ledger WHERE source_id = 'legacy' AND source_table = ? AND source_record_id = ?")
      .get(table, row.source_record_id);
    if (!original) {
      result.unresolved.push({ sourceId: source.sourceId, sourceTable: table, count: 1,
        reason: "Copied legacy record has no canonical migration; source retained for recovery." });
      return;
    }
    remember.run(source.sourceId, table, row.source_record_id, original.destination_id);
    result.alreadyMigrated++;
    return;
  }
  const values = table === "todos" ? row : {
    text: row.text, priority: 3, due_date: "", done: row.done,
    // Reminder updated_at is neither a creation date nor a completion date.
    created_at: "", completed_at: "",
  };
  const inserted = todoDb.prepare(`INSERT INTO todos (text, priority, due_date, done, created_at, completed_at)
    VALUES (@text, @priority, @due_date, @done, @created_at, @completed_at)`).run(values);
  remember.run(source.sourceId, table, row.source_record_id, inserted.lastInsertRowid);
  result.copied++;
}

function migrateTodoTable(todoDb, sourceDb, source, table, result) {
  const hasTable = (name) => Boolean(sourceDb.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  if (!hasTable(table)) return;
  const ledger = todoDb.prepare("SELECT destination_id FROM todo_migration_ledger WHERE source_id = ? AND source_table = ? AND source_record_id = ?");
  const sql = table === "todos" ? "SELECT *, id AS source_record_id FROM todos ORDER BY id"
    : "SELECT *, slot_index AS source_record_id FROM reminders WHERE trim(text) != '' ORDER BY slot_index";
  const rows = sourceDb.prepare(sql).all().filter((row) => {
    if (!ledger.get(source.sourceId, table, row.source_record_id)) return true;
    result.alreadyMigrated++;
    return false;
  });
  if (rows.length === 0) return;
  if (source.ambiguousLineage || (table === "reminders" && hasTable("todos"))) {
    // No old conversion ledger exists, even when todos is empty after deletion.
    result.unresolved.push({ sourceId: source.sourceId, sourceTable: table, count: rows.length,
      reason: source.ambiguousLineage ? "Legacy copy lineage is unknown; source records retained for recovery." : "Reminder conversion history is unknown; source records retained for recovery." });
    return;
  }
  for (const row of rows) copyTodoRecord(todoDb, source, table, row, result);
}

export function migratePersonalTodos(todoDb, sources) {
  const result = { copied: 0, alreadyMigrated: 0, unresolved: [] };
  const seen = new Set();
  todoDb.transaction(() => {
    for (const source of sources) {
      if (seen.has(source.sourceId) || !fs.existsSync(source.dbPath)) continue;
      seen.add(source.sourceId);
      const db = new Database(source.dbPath, { readonly: true, fileMustExist: true });
      try {
        for (const table of ["todos", "reminders"]) migrateTodoTable(todoDb, db, source, table, result);
      } finally {
        db.close();
      }
    }
  })();
  return result;
}
