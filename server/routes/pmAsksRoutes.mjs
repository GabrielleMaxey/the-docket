import { createLogger } from "../lib/logger.mjs";
import { normalizePmAskStatus } from "../../shared/pmAskStatus.mjs";

const log = createLogger("pm-asks");

const ASK_COLUMNS =
  "id, title, who_asked, note, status, jira_issue_key, created_at, updated_at";

const trimAsk = (row) => ({
  id: row.id,
  title: String(row.title || ""),
  whoAsked: String(row.who_asked || ""),
  note: String(row.note || ""),
  status: normalizePmAskStatus(row.status),
  jiraIssueKey: String(row.jira_issue_key || ""),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

export const registerPmAsksRoutes = (app, { withSiteOperation = (handler) => handler, getDb }) => {
  app.get("/api/project-managers/asks", withSiteOperation((req, res) => {
    const rows = getDb()
      .prepare(`SELECT ${ASK_COLUMNS} FROM pm_asks ORDER BY id ASC`)
      .all();
    return res.json({ items: rows.map(trimAsk) });
  }));

  app.post("/api/project-managers/asks", withSiteOperation((req, res) => {
    const title = String(req.body?.title || "").trim();
    const whoAsked = String(req.body?.whoAsked || "").trim();
    const note = String(req.body?.note || "").trim();

    const result = getDb()
      .prepare(
        `INSERT INTO pm_asks (title, who_asked, note) VALUES (?, ?, ?) RETURNING ${ASK_COLUMNS}`
      )
      .get(title, whoAsked, note);

    return res.status(201).json(trimAsk(result));
  }));

  app.put("/api/project-managers/asks/:id", withSiteOperation((req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid ask id" });
    }

    const db = getDb();
    const current = db
      .prepare(`SELECT ${ASK_COLUMNS} FROM pm_asks WHERE id = ?`)
      .get(id);
    if (!current) {
      return res.status(404).json({ error: "Ask not found" });
    }

    const hasTitle = typeof req.body?.title === "string";
    const hasWhoAsked = typeof req.body?.whoAsked === "string";
    const hasNote = typeof req.body?.note === "string";
    const hasStatus = typeof req.body?.status === "string";
    const hasJiraIssueKey = typeof req.body?.jiraIssueKey === "string";
    if (!hasTitle && !hasWhoAsked && !hasNote && !hasStatus && !hasJiraIssueKey) {
      return res.status(400).json({ error: "Provide title, whoAsked, note, status, or jiraIssueKey" });
    }

    const nextTitle = hasTitle ? String(req.body.title).trim() : String(current.title || "");
    const nextWhoAsked = hasWhoAsked ? String(req.body.whoAsked).trim() : String(current.who_asked || "");
    const nextNote = hasNote ? String(req.body.note).trim() : String(current.note || "");
    const nextStatus = hasStatus
      ? normalizePmAskStatus(req.body.status)
      : normalizePmAskStatus(current.status);
    const nextJiraIssueKey = hasJiraIssueKey
      ? String(req.body.jiraIssueKey).trim()
      : String(current.jira_issue_key || "");

    const updated = db
      .prepare(
        `UPDATE pm_asks SET title = ?, who_asked = ?, note = ?, status = ?, jira_issue_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING ${ASK_COLUMNS}`
      )
      .get(nextTitle, nextWhoAsked, nextNote, nextStatus, nextJiraIssueKey, id);

    return res.json(trimAsk(updated));
  }));

  app.delete("/api/project-managers/asks/:id", withSiteOperation((req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid ask id" });
    }

    const result = getDb().prepare("DELETE FROM pm_asks WHERE id = ?").run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Ask not found" });
    }
    return res.json({ ok: true, id });
  }));
};
