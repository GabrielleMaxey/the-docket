import { mapWatchedAssigneeRow } from "../db/schema.mjs";
import { createLogger } from "../lib/logger.mjs";
const log = createLogger("dashboard");

import { loadLatestDashboardSnapshot } from "../lib/dashboardRefresh/loadSnapshot.mjs";
import { runDashboardRefresh } from "../lib/dashboardRefresh/runDashboardRefresh.mjs";

export const registerDashboardRoutes = (
  app,
  { db, jiraRequest, ensureEnvOrRespond, runJiraSearchRequest }
) => {
  const listFieldMappingsStmt = db.prepare(
    "SELECT role, field_id, field_name FROM jira_field_mappings ORDER BY role ASC"
  );
  const listSettingsStmt = db.prepare("SELECT key, value FROM app_settings");
  const getEpicPresetStmt = db.prepare("SELECT * FROM epic_presets WHERE id = ?");
  const getWatchedAssigneeStmt = db.prepare("SELECT * FROM watched_assignees WHERE id = ?");

  const getLatestSnapshotStmt = db.prepare(
    "SELECT * FROM dashboard_snapshots ORDER BY refreshed_at DESC, id DESC LIMIT 1"
  );
  const listEpicMetricsForSnapshotStmt = db.prepare(
    "SELECT * FROM dashboard_epic_metrics WHERE snapshot_id = ? ORDER BY id ASC"
  );
  const listAssigneeMetricsForSnapshotStmt = db.prepare(
    "SELECT * FROM dashboard_assignee_metrics WHERE snapshot_id = ? ORDER BY id ASC"
  );

  const deleteAllAssigneeMetricsStmt = db.prepare("DELETE FROM dashboard_assignee_metrics");
  const deleteAllEpicMetricsStmt = db.prepare("DELETE FROM dashboard_epic_metrics");
  const deleteAllSnapshotsStmt = db.prepare("DELETE FROM dashboard_snapshots");

  const insertSnapshotStmt = db.prepare(`
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
  `);

  const insertEpicMetricStmt = db.prepare(`
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
      contributor_metrics_json
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
      @contributorMetricsJson
    )
  `);

  const insertAssigneeMetricStmt = db.prepare(`
    INSERT INTO dashboard_assignee_metrics (
      snapshot_id,
      query_name,
      resolved_display_name,
      resolved_account_id,
      overdue_percent,
      overdue_open_count,
      total_open_count,
      overdue_issue_keys_json,
      query_type,
      jql,
      workload_counts_json
    ) VALUES (
      @snapshotId,
      @queryName,
      @resolvedDisplayName,
      @resolvedAccountId,
      @overduePercent,
      @overdueOpenCount,
      @totalOpenCount,
      @overdueIssueKeysJson,
      @queryType,
      @jql,
      @workloadCountsJson
    )
  `);

  const snapshotStmts = {
    getLatestSnapshotStmt,
    listEpicMetricsForSnapshotStmt,
    listAssigneeMetricsForSnapshotStmt,
  };

  const persistStmts = {
    deleteAllAssigneeMetricsStmt,
    deleteAllEpicMetricsStmt,
    deleteAllSnapshotsStmt,
    insertSnapshotStmt,
    insertEpicMetricStmt,
    insertAssigneeMetricStmt,
  };

  const readSettings = () => {
    const rows = listSettingsStmt.all();
    return rows.reduce((acc, row) => {
      acc[row.key] = String(row.value ?? "");
      return acc;
    }, {});
  };

  app.get("/api/dashboard/metrics", (_req, res) => {
    const snapshot = loadLatestDashboardSnapshot(db, snapshotStmts);
    return res.json({ snapshot });
  });

  app.post("/api/dashboard/refresh", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      const result = await runDashboardRefresh({
        body: req.body,
        readSettings,
        listFieldMappings: () => listFieldMappingsStmt.all(),
        getEpicPreset: (id) => getEpicPresetStmt.get(id),
        getWatchedAssignee: (id) => getWatchedAssigneeStmt.get(id),
        mapWatchedAssigneeRow,
        db,
        persistStmts,
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
