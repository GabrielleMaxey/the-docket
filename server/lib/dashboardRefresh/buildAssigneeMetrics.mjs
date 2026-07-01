import {
  computeAssigneeMetrics,
  computeJqlWatchMetricsByAssignee,
} from "../../../shared/dashboardMetrics.mjs";
import { buildDashboardMetricsJql } from "../epicFilterJql.mjs";
import { resolveJiraUser, searchAllIssues } from "../jiraSearchHelpers.mjs";

const emptyWorkloadCounts = () => ({
  totalIssues: 0,
  totalAssigned: 0,
  totalResolved: 0,
  pastDue: 0,
  inProgress: 0,
  backlog: 0,
  readyForVerification: 0,
  other: 0,
});

const emptyJqlWatchMetric = (watched, error) => ({
  queryType: "jql",
  jql: watched.jql,
  queryName: watched.displayName,
  resolvedDisplayName: watched.displayName,
  resolvedAccountId: "",
  overduePercent: null,
  overdueOpenCount: 0,
  totalOpenCount: 0,
  overdueIssueKeys: [],
  workloadCounts: emptyWorkloadCounts(),
  ...(error ? { error } : {}),
});

const emptyPersonWatchMetric = (queryName, error) => ({
  queryType: "person",
  jql: "",
  queryName,
  resolvedDisplayName: queryName,
  resolvedAccountId: "",
  overduePercent: null,
  overdueOpenCount: 0,
  totalOpenCount: 0,
  overdueIssueKeys: [],
  workloadCounts: emptyWorkloadCounts(),
  ...(error ? { error } : {}),
});

export const buildAssigneeMetricsForRefresh = async ({
  assigneeNames,
  watchedAssigneeIds,
  scopedChildIssues,
  dueFieldId,
  getWatchedAssignee,
  mapWatchedAssigneeRow,
  jiraRequest,
  runJiraSearchRequest,
}) => {
  const assigneeMetrics = [];

  for (const queryName of assigneeNames) {
    try {
      const resolvedUser = await resolveJiraUser({ query: queryName, jiraRequest });
      const metrics = computeAssigneeMetrics(
        scopedChildIssues,
        queryName,
        resolvedUser?.displayName,
        dueFieldId,
        resolvedUser?.accountId
      );

      assigneeMetrics.push({
        queryType: "person",
        jql: "",
        queryName,
        resolvedDisplayName: resolvedUser?.displayName || queryName,
        resolvedAccountId: resolvedUser?.accountId || "",
        ...metrics,
      });
    } catch (error) {
      assigneeMetrics.push(
        emptyPersonWatchMetric(
          queryName,
          error instanceof Error ? error.message : "Failed to resolve assignee"
        )
      );
    }
  }

  for (const watchedId of watchedAssigneeIds) {
    const watchedRow = getWatchedAssignee(watchedId);
    if (!watchedRow) {
      continue;
    }

    const watched = mapWatchedAssigneeRow(watchedRow);
    if (watched.watchType === "jql") {
      try {
        const metricsJql = buildDashboardMetricsJql(watched.jql) || watched.jql;
        const { issues } = await searchAllIssues({
          jql: metricsJql,
          runJiraSearchRequest,
        });
        const byAssignee = computeJqlWatchMetricsByAssignee(
          issues,
          scopedChildIssues,
          dueFieldId
        );

        if (byAssignee.length === 0) {
          assigneeMetrics.push(emptyJqlWatchMetric(watched));
          continue;
        }

        for (const row of byAssignee) {
          assigneeMetrics.push({
            queryType: "jql",
            jql: watched.jql,
            queryName: row.queryName,
            resolvedDisplayName: row.resolvedDisplayName,
            resolvedAccountId: row.resolvedAccountId,
            overduePercent: row.overduePercent,
            overdueOpenCount: row.overdueOpenCount,
            totalOpenCount: row.totalOpenCount,
            overdueIssueKeys: row.overdueIssueKeys,
            workloadCounts: row.workloadCounts,
          });
        }
      } catch (error) {
        assigneeMetrics.push(
          emptyJqlWatchMetric(
            watched,
            error instanceof Error ? error.message : "JQL watch failed"
          )
        );
      }
      continue;
    }

    try {
      const resolvedUser = await resolveJiraUser({ query: watched.displayName, jiraRequest });
      const metrics = computeAssigneeMetrics(
        scopedChildIssues,
        watched.displayName,
        resolvedUser?.displayName,
        dueFieldId,
        resolvedUser?.accountId || watched.resolvedAccountId
      );

      assigneeMetrics.push({
        queryType: "person",
        jql: "",
        queryName: watched.displayName,
        resolvedDisplayName: resolvedUser?.displayName || watched.displayName,
        resolvedAccountId: resolvedUser?.accountId || watched.resolvedAccountId || "",
        ...metrics,
      });
    } catch (error) {
      assigneeMetrics.push(
        emptyPersonWatchMetric(
          watched.displayName,
          error instanceof Error ? error.message : "Failed to resolve watched assignee"
        )
      );
    }
  }

  return assigneeMetrics;
};
