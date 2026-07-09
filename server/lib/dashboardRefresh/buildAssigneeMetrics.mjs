import {
  computeAssigneeMetrics,
  computeContributorMetricsFromIssues,
  computeJqlWatchMetrics,
} from "../../../shared/dashboardMetrics.mjs";
import { buildDashboardMetricsJql } from "../epicFilterJql.mjs";
import { resolveJiraUser, searchAllIssues } from "../jiraSearchHelpers.mjs";
import { buildIssueEpicContext } from "./dueByHelpers.mjs";

const escapeJqlString = (value) =>
  String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const buildAssigneeWatchJql = (displayName) =>
  `assignee = "${escapeJqlString(displayName)}" ORDER BY updated DESC`;

const fetchPersonWatchIssues = async ({ displayName, runJiraSearchRequest }) => {
  const rawJql = buildAssigneeWatchJql(displayName);
  const jql = buildDashboardMetricsJql(rawJql) || rawJql;
  const { issues } = await searchAllIssues({ jql, runJiraSearchRequest });
  return issues;
};

const buildAssigneeDueContext = async ({
  issues,
  dueByDate,
  dueByOptions,
  mappingsByRole,
  jiraRequest,
}) => {
  if (!dueByDate || !dueByOptions) {
    return null;
  }

  const { issueToEpicKey, epicByKey } = await buildIssueEpicContext({
    issues,
    mappingsByRole,
    jiraRequest,
  });

  return {
    dueByDate,
    dueByOptions,
    issueToEpicKey,
    epicByKey,
  };
};

const buildPersonWatchMetric = async ({
  queryName,
  resolvedDisplayName,
  resolvedAccountId,
  dueFieldId,
  overdueFieldIds,
  dueByDate,
  dueByOptions,
  mappingsByRole,
  jiraRequest,
  runJiraSearchRequest,
}) => {
  const assigneeLabel = String(resolvedDisplayName || queryName).trim() || queryName;
  const issues = await fetchPersonWatchIssues({
    displayName: assigneeLabel,
    runJiraSearchRequest,
  });
  const dueContext = await buildAssigneeDueContext({
    issues,
    dueByDate,
    dueByOptions,
    mappingsByRole,
    jiraRequest,
  });
  const metrics = computeAssigneeMetrics(
    issues,
    queryName,
    resolvedDisplayName,
    dueFieldId,
    resolvedAccountId,
    overdueFieldIds,
    dueContext
  );

  return {
    queryType: "person",
    jql: "",
    queryName,
    resolvedDisplayName: assigneeLabel,
    resolvedAccountId: resolvedAccountId || "",
    contributorMetrics: [],
    ...metrics,
  };
};

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
  overdueIssues: [],
  upcomingDueIssues: [],
  contributorMetrics: [],
  workloadCounts: emptyWorkloadCounts(),
  ...(error ? { error } : {}),
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
  overdueIssues: [],
  upcomingDueIssues: [],
  contributorMetrics: [],
  workloadCounts: emptyWorkloadCounts(),
  ...(error ? { error } : {}),
});

export const buildAssigneeMetricsForRefresh = async ({
  assigneeNames,
  watchedAssigneeIds,
  dueFieldId,
  overdueFieldIds = [],
  dueByDate,
  dueByOptions,
  mappingsByRole,
  getWatchedAssignee,
  mapWatchedAssigneeRow,
  jiraRequest,
  runJiraSearchRequest,
}) => {
  const assigneeMetrics = [];

  for (const queryName of assigneeNames) {
    try {
      const resolvedUser = await resolveJiraUser({ query: queryName, jiraRequest });
      assigneeMetrics.push(
        await buildPersonWatchMetric({
          queryName,
          resolvedDisplayName: resolvedUser?.displayName,
          resolvedAccountId: resolvedUser?.accountId,
          dueFieldId,
          overdueFieldIds,
          dueByDate,
          dueByOptions,
          mappingsByRole,
          jiraRequest,
          runJiraSearchRequest,
        })
      );
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
        const dueContext = await buildAssigneeDueContext({
          issues,
          dueByDate,
          dueByOptions,
          mappingsByRole,
          jiraRequest,
        });
        const metrics = computeJqlWatchMetrics(issues, [], dueFieldId, overdueFieldIds, dueContext);
        const contributorMetrics = computeContributorMetricsFromIssues(
          issues,
          dueFieldId,
          overdueFieldIds,
          dueContext
        );

        assigneeMetrics.push({
          queryType: "jql",
          jql: watched.jql,
          queryName: watched.displayName,
          resolvedDisplayName: watched.displayName,
          resolvedAccountId: "",
          contributorMetrics,
          ...metrics,
        });
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
      assigneeMetrics.push(
        await buildPersonWatchMetric({
          queryName: watched.displayName,
          resolvedDisplayName: resolvedUser?.displayName || watched.displayName,
          resolvedAccountId: resolvedUser?.accountId || watched.resolvedAccountId,
          dueFieldId,
          overdueFieldIds,
          dueByDate,
          dueByOptions,
          mappingsByRole,
          jiraRequest,
          runJiraSearchRequest,
        })
      );
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
