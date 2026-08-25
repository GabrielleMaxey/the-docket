import { createLogger } from "../lib/logger.mjs";
import { fetchCapacityWorkloads } from "../lib/capacityPlanning.mjs";
import { mapWatchedAssigneeRow } from "../db/schema.mjs";
import { buildFieldMappingsMap } from "../lib/epicFilterJql.mjs";
import { listSharedPrograms, bulkGetTeamDates, isTeamPriorityMongoConfigured } from "../lib/teamPriorityMongo.mjs";
import { searchAllIssues } from "../lib/jiraSearchHelpers.mjs";

const log = createLogger("capacity-planning");

export const registerCapacityPlanningRoutes = (app, { db, jiraRequest, runJiraSearchRequest, ensureEnvOrRespond }) => {
  app.get("/api/project-managers/capacity", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      let watchedRows = db
        .prepare("SELECT * FROM watched_assignees ORDER BY sort_order ASC, id ASC")
        .all()
        .map(mapWatchedAssigneeRow);

      const idsParam = String(req.query?.ids || "").trim();
      if (idsParam) {
        const requestedIds = new Set(
          idsParam
            .split(",")
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isFinite(value))
        );
        watchedRows = watchedRows.filter((row) => requestedIds.has(row.id));
      }

      const mappingsByRole = buildFieldMappingsMap(
        db.prepare("SELECT role, field_id, field_name FROM jira_field_mappings").all()
      );
      const items = await fetchCapacityWorkloads({
        watchedRows,
        jiraRequest,
        runJiraSearchRequest,
        mappingsByRole,
      });

      return res.json({ items });
    } catch (error) {
      log.error("capacity fetch failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to load capacity data",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/project-managers/gantt", async (req, res) => {
    if (!ensureEnvOrRespond(res)) return;

    const slug = String(req.query?.slug || "").trim();
    if (!slug) {
      return res.status(400).json({ error: "slug is required" });
    }

    try {
      const programs = await listSharedPrograms();
      const program = programs.find((p) => p.slug === slug);
      if (!program) {
        return res.status(404).json({ error: "Program not found" });
      }

      const roots = (program.epicRoots || [])
        .map((k) => String(k || "").trim().toUpperCase())
        .filter(Boolean);
      if (roots.length === 0) {
        return res.json({ slug, displayName: program.displayName, issues: [] });
      }

      const rootList = roots.join(", ");
      const jql = `(parent in (${rootList}) OR key in (${rootList})) ORDER BY updated DESC`;

      const { issues: loaded } = await searchAllIssues({ jql, runJiraSearchRequest, maxTotal: 2000 });

      const issueKeys = loaded.map((i) => i.key);
      const datesByKey =
        isTeamPriorityMongoConfigured() && issueKeys.length > 0
          ? await bulkGetTeamDates(issueKeys)
          : {};

      const issues = loaded.map((issue) => {
        const fields = issue.fields || {};
        const dates = datesByKey[issue.key] || {};
        return {
          key: issue.key,
          summary: String(fields.summary || ""),
          status: String(fields.status?.name || ""),
          statusCategory: String(fields.status?.statusCategory?.name || ""),
          assignee: String(fields.assignee?.displayName || "Unassigned"),
          dueDate: String(fields.duedate || ""),
          startDate: String(dates.startDate || ""),
          completeDate: String(dates.completeDate || ""),
          plannedStart: String(dates.plannedStart || ""),
          plannedFinish: String(dates.plannedFinish || ""),
        };
      });

      return res.json({ slug, displayName: program.displayName, issues });
    } catch (error) {
      log.error("gantt fetch failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to load Gantt data",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
