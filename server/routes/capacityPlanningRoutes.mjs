import { createLogger } from "../lib/logger.mjs";
import { fetchCapacityWorkloads } from "../lib/capacityPlanning.mjs";
import { mapWatchedAssigneeRow } from "../db/schema.mjs";

const log = createLogger("capacity-planning");

export const registerCapacityPlanningRoutes = (app, { db, jiraRequest, runJiraSearchRequest, ensureEnvOrRespond }) => {
  app.get("/api/project-managers/capacity", async (_req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      const watchedRows = db
        .prepare("SELECT * FROM watched_assignees ORDER BY sort_order ASC, id ASC")
        .all()
        .map(mapWatchedAssigneeRow);

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
