import { createLogger } from "../lib/logger.mjs";

const log = createLogger("todos");
const MAX_TODOS = 15;
const TEXT_MAX = 500;

const mapRow = (row) => ({
  id: row.id,
  text: String(row.text || ""),
  priority: Number(row.priority ?? 3),
  dueDate: String(row.due_date || ""),
  done: Boolean(row.done),
  createdAt: String(row.created_at || ""),
  completedAt: String(row.completed_at || ""),
});

const isValidDate = (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(String(v));

// Migration: pull legacy reminders into todos on first GET if todos table is empty
const migrateReminders = (db) => {
  const run = db.transaction(() => {
    if (db.prepare(`SELECT COUNT(*) as n FROM todos`).get().n > 0) return;
    const legacy = db.prepare(
      `SELECT text, done FROM reminders WHERE trim(text) != '' ORDER BY slot_index ASC`
    ).all();
    const now = new Date().toISOString().slice(0, 10);
    for (const row of legacy) {
      db.prepare(
        `INSERT INTO todos (text, priority, due_date, done, created_at, completed_at)
         VALUES (?, 3, '', ?, CURRENT_TIMESTAMP, ?)`
      ).run(row.text, row.done ? 1 : 0, row.done ? now : "");
    }
  });
  run();
};

export const registerTodoRoutes = (app, { getDb }) => {
  app.get("/api/todos", (_req, res) => {
    try {
      const db = getDb();
      migrateReminders(db);
      const items = db
        .prepare(
          `SELECT * FROM todos ORDER BY done ASC, priority ASC,
           CASE WHEN due_date = '' THEN 1 ELSE 0 END ASC, due_date ASC, created_at ASC`
        )
        .all()
        .map(mapRow);
      return res.json({ items });
    } catch (err) {
      log.error("GET /api/todos failed", err.message);
      return res.status(500).json({ error: "Failed to load to dos" });
    }
  });

  app.get("/api/todos/completed", (req, res) => {
    try {
      const db = getDb();
      const days = Math.max(0, Math.min(3650, Math.floor(Number(req.query?.days) || 90)));
      const sql =
        days > 0
          ? `SELECT * FROM todos WHERE done = 1 AND completed_at >= date('now', '-${days} days') ORDER BY completed_at DESC`
          : `SELECT * FROM todos WHERE done = 1 ORDER BY completed_at DESC`;
      return res.json({ items: db.prepare(sql).all().map(mapRow), days });
    } catch (err) {
      log.error("GET /api/todos/completed failed", err.message);
      return res.status(500).json({ error: "Failed to load completed to dos" });
    }
  });

  app.delete("/api/todos/completed", (_req, res) => {
    try {
      const db = getDb();
      const info = db.prepare(`DELETE FROM todos WHERE done = 1`).run();
      return res.json({ ok: true, deleted: info.changes });
    } catch (err) {
      log.error("DELETE /api/todos/completed failed", err.message);
      return res.status(500).json({ error: "Failed to clear completed to dos" });
    }
  });

  app.post("/api/todos", (req, res) => {
    try {
      const db = getDb();
      if (db.prepare(`SELECT COUNT(*) as n FROM todos WHERE done = 0`).get().n >= MAX_TODOS) {
        return res.status(400).json({ error: `Maximum of ${MAX_TODOS} active to dos reached.` });
      }
      const text = String(req.body?.text || "").slice(0, TEXT_MAX);
      const priority = Math.min(5, Math.max(1, Number(req.body?.priority ?? 3)));
      const dueDate = String(req.body?.dueDate || "");
      if (!isValidDate(dueDate)) {
        return res.status(400).json({ error: "dueDate must be YYYY-MM-DD" });
      }
      const result = db
        .prepare(
          `INSERT INTO todos (text, priority, due_date, done, created_at, completed_at)
           VALUES (@text, @priority, @dueDate, 0, CURRENT_TIMESTAMP, '')`
        )
        .run({ text, priority, dueDate });
      const row = db.prepare(`SELECT * FROM todos WHERE id = ?`).get(result.lastInsertRowid);
      return res.status(201).json(mapRow(row));
    } catch (err) {
      log.error("POST /api/todos failed", err.message);
      return res.status(500).json({ error: "Failed to create to do" });
    }
  });

  app.put("/api/todos/:id", (req, res) => {
    try {
      const db = getDb();
      const id = Number(req.params.id);
      const existing = db.prepare(`SELECT * FROM todos WHERE id = ?`).get(id);
      if (!existing) return res.status(404).json({ error: "To do not found" });

      const text = String(req.body?.text ?? existing.text).slice(0, TEXT_MAX);
      const priority = Math.min(5, Math.max(1, Number(req.body?.priority ?? existing.priority)));
      const dueDate = String(req.body?.dueDate ?? existing.due_date);
      if (!isValidDate(dueDate)) {
        return res.status(400).json({ error: "dueDate must be YYYY-MM-DD" });
      }
      const done = req.body?.done !== undefined ? (req.body.done ? 1 : 0) : existing.done;
      const completedAt = done
        ? (existing.completed_at || new Date().toISOString().slice(0, 10))
        : "";

      db.prepare(
        `UPDATE todos SET text = @text, priority = @priority, due_date = @dueDate,
         done = @done, completed_at = @completedAt WHERE id = @id`
      ).run({ id, text, priority, dueDate, done, completedAt });
      return res.json(mapRow(db.prepare(`SELECT * FROM todos WHERE id = ?`).get(id)));
    } catch (err) {
      log.error("PUT /api/todos/:id failed", err.message);
      return res.status(500).json({ error: "Failed to update to do" });
    }
  });

  app.delete("/api/todos/:id", (req, res) => {
    try {
      const db = getDb();
      const id = Number(req.params.id);
      if (!db.prepare(`SELECT * FROM todos WHERE id = ?`).get(id)) {
        return res.status(404).json({ error: "To do not found" });
      }
      db.prepare(`DELETE FROM todos WHERE id = ?`).run(id);
      return res.json({ ok: true });
    } catch (err) {
      log.error("DELETE /api/todos/:id failed", err.message);
      return res.status(500).json({ error: "Failed to delete to do" });
    }
  });
};
