import { getRequestOperationContext } from "../lib/jiraRouteContext.mjs";
import {
  getTeamMetadata,
  initializeTeamPrioritySettings, getTeamPrioritySettings, saveTeamPrioritySettings, assertTeamPriorityEnabled,
  teamDatabaseError,
  bulkGetTeamDates,
  bulkGetTeamPriorities,
  bulkPutTeamPriorities,
  deleteTeamDate,
  isTeamPriorityConfigured,
  listAllTeamPriorities,
  listSharedPrograms,
  getTeamStatus,
  putTeamDate,
  putTeamPriority,
  seedSharedPrograms,
} from "../lib/teamPriorityPostgres.mjs";
import { createLogger } from "../lib/logger.mjs";

const log = createLogger("team-priority");

const notConfigured = (res) =>
  res.status(503).json({ error: "Team data not configured — set TEAM_PRIORITY_DATABASE_URL" });

const resolveUpdatedBy = async (resolveCurrentJiraUser) => {
  if (typeof resolveCurrentJiraUser !== "function") {
    return "";
  }
  try {
    const me = await resolveCurrentJiraUser();
    return String(me?.displayName || me?.accountId || "").trim();
  } catch {
    return "";
  }
};

const withTeamDatabase = (label, handler) => async (req, res) => {
  try {
    assertTeamPriorityEnabled();
    if (!isTeamPriorityConfigured()) return notConfigured(res);
    return await handler(req, res);
  } catch (error) {
    const safe = teamDatabaseError(error);
    log.error(`${label} failed`, safe.message);
    return res.status(safe.status || 503).json({ error: safe.message, code: safe.code });
  }
};

export const registerTeamPriorityRoutes = (app, context) => {
  if (context.metaDb) initializeTeamPrioritySettings(context.metaDb);
  const { withSiteOperation = (handler) => handler, getDb, getSiteContext } = context;
  app.get("/api/team-priority/settings", withSiteOperation((_req, res) => res.json(getTeamPrioritySettings())));
  app.put("/api/team-priority/settings", withSiteOperation((req, res) => {
    if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "enabled must be a boolean" });
    return res.json(saveTeamPrioritySettings(req.body));
  }));
  app.get("/api/team-priority/health", withSiteOperation(async (_req, res) => {
    const status = await getTeamStatus();
    return res.json({
      ok: status.connected === true,
      enabled: status.enabled === true,
      configured: status.configured === true,
      connected: status.connected === true,
      ...(status.error ? { error: status.error } : {}),
    });
  }));

  app.post(
    "/api/team-priority/seed",
    withSiteOperation(withTeamDatabase("seed shared programs", async (_req, res) => {
      const programs = await seedSharedPrograms(getSiteContext().siteHost);
      return res.json({ ok: true, programs });
    }))
  );

  app.post("/api/team-priority/import-csv", withSiteOperation((_req, res) => res.status(409).json({
    error: "Review and approve this CSV in Settings → Import metadata before saving to team.", code: "IMPORT_PREVIEW_REQUIRED",
  })));

  app.post(
    "/api/team-priority/sync-local",
    withSiteOperation(withTeamDatabase("sync local priorities to team", async (_req, res) => {
      const db = getDb();
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
      const result = await bulkPutTeamPriorities(entries, "local-sqlite-sync", getSiteContext().siteHost);
      return res.json({
        ok: true,
        updatedPriorities: result.updated,
        scanned: rows.length,
      });
    }))
  );

  app.post(
    "/api/team-priority/pull-to-local",
    withSiteOperation(withTeamDatabase("pull team priorities to local", async (_req, res) => {
      const db = getDb();
      if (!db) {
        return res.status(500).json({ error: "Local database unavailable" });
      }

      const entries = await listAllTeamPriorities(getSiteContext().siteHost);
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
    }))
  );

  app.get("/api/shared-programs", withSiteOperation(withTeamDatabase("list shared programs", async (_req, res) => {
    const { getSiteContext } = getRequestOperationContext(_req, context);
    const items = await listSharedPrograms(getSiteContext().siteHost);
    return res.json({ items });
  })));

  app.post("/api/team-priority/metadata/bulk", withSiteOperation(withTeamDatabase("fetch team metadata", async (req, res) => {
    const { getSiteContext } = getRequestOperationContext(req, context);
    const items = await getTeamMetadata({ siteHost: getSiteContext().siteHost, issueKeys: req.body?.issueKeys });
    return res.json({ items });
  })));

  app.post(
    "/api/team-priority/bulk",
    withSiteOperation(withTeamDatabase("fetch team priorities", async (req, res) => {
      const { getSiteContext } = getRequestOperationContext(req, context);
      const issueKeys = Array.isArray(req.body?.issueKeys) ? req.body.issueKeys : [];
      const items = await bulkGetTeamPriorities(issueKeys, getSiteContext().siteHost);
      return res.json({ items });
    }))
  );

  app.put(
    "/api/team-priority/:issueKey",
    withSiteOperation(withTeamDatabase("update team priority", async (req, res) => {
      const { resolveCurrentJiraUser, getSiteContext } = getRequestOperationContext(req, context);
      const updatedBy = await resolveUpdatedBy(resolveCurrentJiraUser);

      const result = await putTeamPriority({
        siteHost: getSiteContext().siteHost,
        issueKey: req.params.issueKey,
        priority: req.body?.priority,
        updatedBy,
      });
      return res.json(result);
    }))
  );

  app.post(
    "/api/team-priority/dates/bulk",
    withSiteOperation(withTeamDatabase("fetch team dates", async (req, res) => {
      const { getSiteContext } = getRequestOperationContext(req, context);
      const issueKeys = Array.isArray(req.body?.issueKeys) ? req.body.issueKeys : [];
      const items = await bulkGetTeamDates(issueKeys, getSiteContext().siteHost);
      return res.json({ items });
    }))
  );

  app.put(
    "/api/team-priority/dates/:issueKey",
    withSiteOperation(withTeamDatabase("update team date tracking", async (req, res) => {
      const { resolveCurrentJiraUser, getSiteContext } = getRequestOperationContext(req, context);
      const fields = ["followUp", "startDate", "completeDate", "hasOpenDecision", "plannedStart", "plannedFinish", "pmOverride", "requestor", "openDecisionNote"];
      const hasAny = fields.some((f) => req.body?.[f] !== undefined);
      if (!hasAny) {
        return res.status(400).json({ error: "Provide startDate, completeDate, or a planning field" });
      }

      const updatedBy = await resolveUpdatedBy(resolveCurrentJiraUser);

      const patch = {};
      for (const f of fields) {
        if (req.body?.[f] !== undefined) patch[f] = req.body[f];
      }
      const result = await putTeamDate({ siteHost: getSiteContext().siteHost, issueKey: req.params.issueKey, ...patch, updatedBy });
      return res.json(result);
    }))
  );

  // Explicit, deliberate clear — never triggered just by blanking a date field.
  app.delete(
    "/api/team-priority/dates/:issueKey",
    withSiteOperation(withTeamDatabase("clear team date tracking", async (req, res) => {
      const { getSiteContext } = getRequestOperationContext(req, context);
      const result = await deleteTeamDate({ siteHost: getSiteContext().siteHost, issueKey: req.params.issueKey });
      return res.json(result);
    }))
  );
};
