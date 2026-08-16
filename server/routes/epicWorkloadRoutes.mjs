// Epic workload/timeline evaluation for Chat's persistent "Evaluate an
// Epic" panel: fetches an Epic's full descendant tree and returns
// workload totals, per-contributor breakdown, and cross-team blocker
// candidates in one response.

import { createLogger } from "../lib/logger.mjs";
import { buildFieldMappingsMap } from "../lib/epicFilterJql.mjs";
import {
  fetchAndValidateEpic,
  fetchEpicDescendants,
  detectCrossTeamLinks,
  getProjectKeyFromIssueKey,
} from "../lib/epicWorkloadEvaluation.mjs";
import {
  computeChildIssueMetrics,
  computeContributorMetricsFromIssues,
  getIssueStatusName,
  getIssueTypeName,
  formatDateOnly,
  getFieldValue,
} from "../../shared/dashboardMetrics.mjs";

const log = createLogger("epic-workload");

export const registerEpicWorkloadRoutes = (app, { db, jiraRequest, runJiraSearchRequest, ensureEnvOrRespond }) => {
  const loadMappingsByRole = () => {
    const rows = db
      .prepare("SELECT role, field_id, field_name FROM jira_field_mappings ORDER BY role ASC")
      .all();
    return buildFieldMappingsMap(rows);
  };

  app.get("/api/jira/epics/:epicKey/workload", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const epicKey = String(req.params.epicKey || "").trim().toUpperCase();
    if (!epicKey) {
      return res.status(400).json({ error: "Epic key is required" });
    }

    try {
      const mappingsByRole = loadMappingsByRole();

      const validated = await fetchAndValidateEpic({ epicKey, mappingsByRole, jiraRequest });
      if (!validated.ok) {
        return res.status(validated.status || 400).json({
          error: validated.error,
          ...(validated.issueType ? { issueType: validated.issueType } : {}),
        });
      }
      const epic = validated.epic;
      const ownProjectKey = getProjectKeyFromIssueKey(epicKey);

      const descendants = await fetchEpicDescendants({
        epicKey,
        mappingsByRole,
        jiraRequest,
        runJiraSearchRequest,
      });

      // Overdue here is deliberately based on each task's own raw Jira
      // duedate only (not epic-level MRD/IDD fallback) - MRD/IDD represent
      // when something WAS completed, not when a task is due, so folding
      // them in as an "extra overdue field" for individual tasks would be
      // a category error. In spaces that don't set per-task due dates,
      // this will often read 0 - that's an honest reflection of the data,
      // not a bug; the epic-level timeline read below uses PED/MRD/IDD
      // instead, where those fields are actually meaningful.
      const workload = computeChildIssueMetrics(descendants, epicKey, "duedate", null);
      const contributors = computeContributorMetricsFromIssues(descendants, "duedate");

      const blockers = [];
      const tasks = descendants.map((issue) => {
        const crossTeamLinks = detectCrossTeamLinks(issue, ownProjectKey);
        if (crossTeamLinks.length > 0) {
          blockers.push({
            key: String(issue.key || "").trim(),
            summary: String(issue.fields?.summary || "").trim(),
            status: getIssueStatusName(issue),
            assignee: String(issue.fields?.assignee?.displayName || "Unassigned").trim(),
            crossTeamLinks,
          });
        }
        return {
          key: String(issue.key || "").trim(),
          summary: String(issue.fields?.summary || "").trim(),
          status: getIssueStatusName(issue),
          issueType: getIssueTypeName(issue),
          assignee: String(issue.fields?.assignee?.displayName || "Unassigned").trim(),
          dueDate: formatDateOnly(getFieldValue(issue, "duedate")),
          parentKey: String(issue.fields?.parent?.key || "").trim() || null,
          crossTeamLinkCount: crossTeamLinks.length,
        };
      });

      const iddFieldId = mappingsByRole.get("initial_done_date")?.fieldId;
      const mrdFieldId = mappingsByRole.get("most_recent_done_date")?.fieldId;
      const pedFieldId = mappingsByRole.get("project_end_date")?.fieldId || mappingsByRole.get("project_end_date")?.fieldName;

      return res.json({
        epic: {
          key: epicKey,
          summary: String(epic.fields?.summary || "").trim(),
          status: getIssueStatusName(epic),
          initialDoneDate: formatDateOnly(getFieldValue(epic, iddFieldId)),
          mostRecentDoneDate: formatDateOnly(getFieldValue(epic, mrdFieldId)),
          projectEndDate: formatDateOnly(getFieldValue(epic, pedFieldId)),
        },
        workload: {
          total: workload.totalIssues,
          open: workload.openIssues,
          closed: workload.completedIssues,
          overdue: workload.overdueOpenIssues,
          statusCounts: workload.statusCounts,
        },
        contributors: contributors.map((c) => ({
          name: c.name,
          totalIssues: c.totalIssues,
          openIssues: c.openIssues,
          resolvedIssues: c.resolvedIssues,
          inProgress: c.inProgress,
        })),
        tasks,
        blockers,
      });
    } catch (error) {
      log.error("epic workload fetch failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to load epic workload",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
