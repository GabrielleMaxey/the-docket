import { createLogger } from "../lib/logger.mjs";
import { fetchCapacityWorkloads } from "../lib/capacityPlanning.mjs";
import { mapWatchedAssigneeRow } from "../db/schema.mjs";

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

      // Same entries back Dashboard and Chat too, so a PM viewing a wide
      // portfolio here shouldn't be forced to fetch (and pay the Jira
      // search cost for) every entry that exists - only the ones actually
      // selected. Omitting ?ids entirely keeps the old "fetch everything"
      // behavior, so this stays backward compatible for any other caller.
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

      const items = await fetchCapacityWorkloads({ watchedRows, jiraRequest, runJiraSearchRequest });

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
