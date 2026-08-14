import {
  bulkGetTeamPriorities,
  bulkPutTeamPriorities,
  isTeamPriorityMongoConfigured,
  listAllTeamPriorities,
  listSharedPrograms,
  pingTeamPriorityMongo,
  putTeamPriority,
  seedSharedPrograms,
} from "../lib/teamPriorityMongo.mjs";
import {
  parseIssueMetadataCsv,
  planIssueMetadataImport,
} from "../lib/issueMetadataImport.mjs";
import { createLogger } from "../lib/logger.mjs";

const log = createLogger("team-priority");

const notConfigured = (res) =>
  res.status(503).json({ error: "Team priority demo not configured" });

const errorMessage = (error) =>
  error instanceof Error ? error.message : "Unknown error";

const withTeamMongo = (label, handler) => async (req, res) => {
  if (!isTeamPriorityMongoConfigured()) {
    return notConfigured(res);
  }
  try {
    return await handler(req, res);
  } catch (error) {
    log.error(`${label} failed`, errorMessage(error));
    return res.status(500).json({
      error: `Failed to ${label}`,
      message: errorMessage(error),
    });
  }
};

export const registerTeamPriorityRoutes = (app, { db, resolveJiraUser }) => {
  app.get("/api/team-priority/health", async (_req, res) => {
    const status = await pingTeamPriorityMongo();
    return res.json({
      ok: status.connected === true,
      configured: status.configured === true,
      connected: status.connected === true,
      ...(status.error ? { error: status.error } : {}),
    });
  });

  app.post(
    "/api/team-priority/seed",
    withTeamMongo("seed shared programs", async (_req, res) => {
      const programs = await seedSharedPrograms();
      return res.json({ ok: true, programs });
    })
  );

  app.post(
    "/api/team-priority/import-csv",
    withTeamMongo("import team priorities to Atlas", async (req, res) => {
      const csvText = String(req.body?.csvText || "");
      if (!csvText.trim()) {
        return res.status(400).json({ error: "Missing csvText" });
      }

      const parsed = parseIssueMetadataCsv(csvText);
      if (!parsed.ok) {
        return res.status(400).json({ error: parsed.error || "Invalid CSV" });
      }

      const plan = planIssueMetadataImport(parsed.rows, {});
      const result = await bulkPutTeamPriorities(
        plan.upserts.map((item) => ({
          issueKey: item.issueKey,
          priority: item.priority,
        })),
        "nora-csv-import"
      );
      return res.json({
        ok: true,
        updatedPriorities: result.updated,
        skipped: plan.skipped,
        errors: plan.errors,
      });
    })
  );

  app.post(
    "/api/team-priority/sync-local",
    withTeamMongo("sync local priorities to Atlas", async (_req, res) => {
      if (!db) {
        return res.status(500).json({ error: "Local database unavailable" });
      }

      const rows = db
        .prepare(
          `SELECT issue_key, priority FROM issue_metadata
           WHERE priority IS NOT NULL AND priority >= 1 AND priority <= 20`
        )
        .all();
      const entries = rows.map((row) => ({
        issueKey: String(row.issue_key || "").trim().toUpperCase(),
        priority: row.priority,
      }));
      const result = await bulkPutTeamPriorities(entries, "local-sqlite-sync");
      return res.json({
        ok: true,
        updatedPriorities: result.updated,
        scanned: rows.length,
      });
    })
  );

  app.post(
    "/api/team-priority/pull-to-local",
    withTeamMongo("pull Atlas priorities to local", async (_req, res) => {
      if (!db) {
        return res.status(500).json({ error: "Local database unavailable" });
      }

      const entries = await listAllTeamPriorities();
      const upsert = db.prepare(`
        INSERT INTO issue_metadata (issue_key, note, priority, updated_at)
        VALUES (@issueKey, '', @priority, CURRENT_TIMESTAMP)
        ON CONFLICT(issue_key) DO UPDATE SET
          priority = excluded.priority,
          updated_at = CURRENT_TIMESTAMP
      `);
      const apply = db.transaction((rows) => {
        for (const row of rows) {
          upsert.run({ issueKey: row.issueKey, priority: row.priority });
        }
      });
      apply(entries);

      return res.json({
        ok: true,
        updatedPriorities: entries.length,
      });
    })
  );

  app.get("/api/shared-programs", async (_req, res) => {
    if (!isTeamPriorityMongoConfigured()) {
      return res.json({ items: [] });
    }
    try {
      const items = await listSharedPrograms();
      return res.json({ items });
    } catch (error) {
      log.error("list programs failed", errorMessage(error));
      return res.status(500).json({
        error: "Failed to list shared programs",
        message: errorMessage(error),
      });
    }
  });

  app.post(
    "/api/team-priority/bulk",
    withTeamMongo("fetch team priorities", async (req, res) => {
      const issueKeys = Array.isArray(req.body?.issueKeys) ? req.body.issueKeys : [];
      const items = await bulkGetTeamPriorities(issueKeys);
      return res.json({ items });
    })
  );

  app.put(
    "/api/team-priority/:issueKey",
    withTeamMongo("update team priority", async (req, res) => {
      let updatedBy = "demo";
      if (typeof resolveJiraUser === "function") {
        try {
          const me = await resolveJiraUser();
          updatedBy = String(me?.displayName || me?.accountId || "").trim() || "demo";
        } catch {
          updatedBy = "demo";
        }
      }

      const result = await putTeamPriority({
        issueKey: req.params.issueKey,
        priority: req.body?.priority,
        updatedBy,
      });
      return res.json(result);
    })
  );
};
