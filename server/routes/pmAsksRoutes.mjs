import { createLogger } from "../lib/logger.mjs";

const log = createLogger("pm-asks");

const trimAsk = (row) => ({
  id: row.id,
  title: String(row.title || ""),
  whoAsked: String(row.who_asked || ""),
  note: String(row.note || ""),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

export const registerPmAsksRoutes = (app, { db }) => {
  app.get("/api/project-managers/asks", (req, res) => {
    const rows = db
      .prepare("SELECT id, title, who_asked, note, created_at, updated_at FROM pm_asks ORDER BY id ASC")
      .all();
    return res.json({ items: rows.map(trimAsk) });
  });

  app.post("/api/project-managers/asks", (req, res) => {
    const title = String(req.body?.title || "").trim();
    const whoAsked = String(req.body?.whoAsked || "").trim();
    const note = String(req.body?.note || "").trim();

    const result = db
      .prepare(
        "INSERT INTO pm_asks (title, who_asked, note) VALUES (?, ?, ?) RETURNING id, title, who_asked, note, created_at, updated_at"
      )
      .get(title, whoAsked, note);

    return res.status(201).json(trimAsk(result));
  });

  app.put("/api/project-managers/asks/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid ask id" });
    }

    const current = db.prepare("SELECT id, title, who_asked, note FROM pm_asks WHERE id = ?").get(id);
    if (!current) {
      return res.status(404).json({ error: "Ask not found" });
    }

    const hasTitle = typeof req.body?.title === "string";
    const hasWhoAsked = typeof req.body?.whoAsked === "string";
    const hasNote = typeof req.body?.note === "string";
    if (!hasTitle && !hasWhoAsked && !hasNote) {
      return res.status(400).json({ error: "Provide title, whoAsked, or note" });
    }

    const nextTitle = hasTitle ? String(req.body.title).trim() : String(current.title || "");
    const nextWhoAsked = hasWhoAsked ? String(req.body.whoAsked).trim() : String(current.who_asked || "");
    const nextNote = hasNote ? String(req.body.note).trim() : String(current.note || "");

    const updated = db
      .prepare(
        "UPDATE pm_asks SET title = ?, who_asked = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING id, title, who_asked, note, created_at, updated_at"
      )
      .get(nextTitle, nextWhoAsked, nextNote, id);

    return res.json(trimAsk(updated));
  });

  app.delete("/api/project-managers/asks/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid ask id" });
    }

    const result = db.prepare("DELETE FROM pm_asks WHERE id = ?").run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Ask not found" });
    }
    return res.json({ ok: true, id });
  });
};
