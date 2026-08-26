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

export const registerTodoRoutes = (app, { db }) => {
  const listAll = db.prepare(
    `SELECT * FROM todos ORDER BY done ASC, priority ASC, due_date ASC, created_at ASC`
  );
  const listCompleted = db.prepare(
    `SELECT * FROM todos WHERE done = 1 ORDER BY completed_at DESC`
  );
  const getOne = db.prepare(`SELECT * FROM todos WHERE id = ?`);
  const countActive = db.prepare(`SELECT COUNT(*) as n FROM todos WHERE done = 0`);
  const countTotal = db.prepare(`SELECT COUNT(*) as n FROM todos`);
  const insert = db.prepare(
    `INSERT INTO todos (text, priority, due_date, done, created_at, completed_at)
     VALUES (@text, @priority, @dueDate, 0, CURRENT_TIMESTAMP, '')`
  );
  const updateStmt = db.prepare(
    `UPDATE todos SET text = @text, priority = @priority, due_date = @dueDate,
     done = @done, completed_at = @completedAt WHERE id = @id`
  );
  const deleteStmt = db.prepare(`DELETE FROM todos WHERE id = ?`);

  // Migration: pull legacy reminders into todos on first GET if todos table is empty
  const migrateReminders = db.transaction(() => {
    if (countTotal.get().n > 0) return;
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

  app.get("/api/todos", (_req, res) => {
    try {
      migrateReminders();
      return res.json({ items: listAll.all().map(mapRow) });
    } catch (err) {
      log.error("GET /api/todos failed", err.message);
      return res.status(500).json({ error: "Failed to load to dos" });
    }
  });

  app.get("/api/todos/completed", (_req, res) => {
    try {
      return res.json({ items: listCompleted.all().map(mapRow) });
    } catch (err) {
      log.error("GET /api/todos/completed failed", err.message);
      return res.status(500).json({ error: "Failed to load completed to dos" });
    }
  });

  app.post("/api/todos", (req, res) => {
    try {
      if (countTotal.get().n >= MAX_TODOS) {
        return res.status(400).json({ error: `Maximum of ${MAX_TODOS} to dos reached.` });
      }
      const text = String(req.body?.text || "").slice(0, TEXT_MAX);
      const priority = Math.min(5, Math.max(1, Number(req.body?.priority ?? 3)));
      const dueDate = String(req.body?.dueDate || "");
      if (!isValidDate(dueDate)) {
        return res.status(400).json({ error: "dueDate must be YYYY-MM-DD" });
      }
      const result = insert.run({ text, priority, dueDate });
      return res.status(201).json(mapRow(getOne.get(result.lastInsertRowid)));
    } catch (err) {
      log.error("POST /api/todos failed", err.message);
      return res.status(500).json({ error: "Failed to create to do" });
    }
  });

  app.put("/api/todos/:id", (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = getOne.get(id);
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

      updateStmt.run({ id, text, priority, dueDate, done, completedAt });
      return res.json(mapRow(getOne.get(id)));
    } catch (err) {
      log.error("PUT /api/todos/:id failed", err.message);
      return res.status(500).json({ error: "Failed to update to do" });
    }
  });

  app.delete("/api/todos/:id", (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!getOne.get(id)) return res.status(404).json({ error: "To do not found" });
      deleteStmt.run(id);
      return res.status(204).end();
    } catch (err) {
      log.error("DELETE /api/todos/:id failed", err.message);
      return res.status(500).json({ error: "Failed to delete to do" });
    }
  });
};
