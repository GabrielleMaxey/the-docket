import { createLogger } from "../lib/logger.mjs";
import { fetchCapacityWorkloads } from "../lib/capacityPlanning.mjs";
import { mapWatchedAssigneeRow } from "../db/schema.mjs";
import { buildFieldMappingsMap } from "../lib/epicFilterJql.mjs";

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
};
