import { mapWatchedAssigneeRow } from "../db/schema.mjs";
import { createLogger } from "../lib/logger.mjs";
const log = createLogger("dashboard");

import { loadLatestDashboardSnapshot } from "../lib/dashboardRefresh/loadSnapshot.mjs";
import { runDashboardRefresh } from "../lib/dashboardRefresh/runDashboardRefresh.mjs";

const createSnapshotStmts = (db) => ({
  getLatestSnapshotStmt: db.prepare(
    "SELECT * FROM dashboard_snapshots ORDER BY refreshed_at DESC, id DESC LIMIT 1"
  ),
  listEpicMetricsForSnapshotStmt: db.prepare(
    "SELECT * FROM dashboard_epic_metrics WHERE snapshot_id = ? ORDER BY id ASC"
  ),
  listAssigneeMetricsForSnapshotStmt: db.prepare(
    "SELECT * FROM dashboard_assignee_metrics WHERE snapshot_id = ? ORDER BY id ASC"
  ),
});

const createPersistStmts = (db) => ({
  deleteAllAssigneeMetricsStmt: db.prepare("DELETE FROM dashboard_assignee_metrics"),
  deleteAllEpicMetricsStmt: db.prepare("DELETE FROM dashboard_epic_metrics"),
  deleteAllSnapshotsStmt: db.prepare("DELETE FROM dashboard_snapshots"),
  insertSnapshotStmt: db.prepare(`
    INSERT INTO dashboard_snapshots (
      refreshed_at,
      epic_preset_ids_json,
      include_past_due,
      extended_past_due_history,
      past_due_lookback_years,
      due_by_date,
      due_by_field,
      due_by_issues_json,
      assignee_names_json,
      watched_assignee_ids_json,
      overall_issue_percent,
      overall_epic_percent,
      overall_overdue_percent,
      status_counts_json
    ) VALUES (
      @refreshedAt,
      @epicPresetIdsJson,
      @includePastDue,
      @extendedPastDueHistory,
      @pastDueLookbackYears,
      @dueByDate,
      @dueByField,
      @dueByIssuesJson,
      @assigneeNamesJson,
      @watchedAssigneeIdsJson,
      @overallIssuePercent,
      @overallEpicPercent,
      @overallOverduePercent,
      @statusCountsJson
    )
  `),
  insertEpicMetricStmt: db.prepare(`
    INSERT INTO dashboard_epic_metrics (
      snapshot_id,
      epic_preset_id,
      epic_key,
      epic_name,
      issue_percent,
      epic_percent,
      overdue_percent,
      total_issues,
      closed_issues,
      open_issues,
      overdue_open_issues,
      due_by_open_issues,
      initial_done_date,
      most_recent_done_date,
      project_end_date,
      is_past_due,
      past_due_reason,
      status_counts_json,
      open_status_counts_json,
      contributor_metrics_json,
      epic_breakdown_json
    ) VALUES (
      @snapshotId,
      @epicPresetId,
      @epicKey,
      @epicName,
      @issuePercent,
      @epicPercent,
      @overduePercent,
      @totalIssues,
      @closedIssues,
      @openIssues,
      @overdueOpenIssues,
      @dueByOpenIssues,
      @initialDoneDate,
      @mostRecentDoneDate,
      @projectEndDate,
      @isPastDue,
      @pastDueReason,
      @statusCountsJson,
      @openStatusCountsJson,
      @contributorMetricsJson,
      @epicBreakdownJson
    )
  `),
  insertAssigneeMetricStmt: db.prepare(`
    INSERT INTO dashboard_assignee_metrics (
      snapshot_id,
      query_name,
      resolved_display_name,
      resolved_account_id,
      overdue_percent,
      overdue_open_count,
      total_open_count,
      overdue_issue_keys_json,
      overdue_issues_json,
      upcoming_due_issues_json,
      contributor_metrics_json,
      epic_breakdown_json,
      query_type,
      jql,
      workload_counts_json,
      error_message
    ) VALUES (
      @snapshotId,
      @queryName,
      @resolvedDisplayName,
      @resolvedAccountId,
      @overduePercent,
      @overdueOpenCount,
      @totalOpenCount,
      @overdueIssueKeysJson,
      @overdueIssuesJson,
      @upcomingDueIssuesJson,
      @contributorMetricsJson,
      @epicBreakdownJson,
      @queryType,
      @jql,
      @workloadCountsJson,
      @errorMessage
    )
  `),
});

const readSettings = (db) => {
  const rows = db.prepare("SELECT key, value FROM app_settings").all();
  return rows.reduce((acc, row) => {
    acc[row.key] = String(row.value ?? "");
    return acc;
  }, {});
};

export const registerDashboardRoutes = (
  app,
  { getDb, jiraRequest, ensureEnvOrRespond, runJiraSearchRequest }
) => {
  app.get("/api/dashboard/metrics", (_req, res) => {
    const db = getDb();
    const snapshot = loadLatestDashboardSnapshot(db, createSnapshotStmts(db));
    return res.json({ snapshot });
  });

  app.post("/api/dashboard/refresh", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      const db = getDb();
      const snapshotStmts = createSnapshotStmts(db);
      const result = await runDashboardRefresh({
        body: req.body,
        readSettings: () => readSettings(db),
        listFieldMappings: () =>
          db.prepare("SELECT role, field_id, field_name FROM jira_field_mappings ORDER BY role ASC").all(),
        getEpicPreset: (id) => db.prepare("SELECT * FROM epic_presets WHERE id = ?").get(id),
        getWatchedAssignee: (id) => db.prepare("SELECT * FROM watched_assignees WHERE id = ?").get(id),
        mapWatchedAssigneeRow,
        db,
        persistStmts: createPersistStmts(db),
        snapshotStmts,
        jiraRequest,
        runJiraSearchRequest,
      });

      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }

      const snapshot = loadLatestDashboardSnapshot(db, snapshotStmts);
      return res.json({ snapshot });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      log.error("dashboard refresh failed", detail);
      return res.status(500).json({
        error: detail || "Failed to refresh dashboard metrics",
        message: detail,
      });
    }
  });
};
