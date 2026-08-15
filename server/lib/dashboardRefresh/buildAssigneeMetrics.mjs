import {
  computeAssigneeMetrics,
  computeAssigneeMetricsFromIssueSet,
  computeContributorMetricsFromIssues,
  computeJqlWatchMetrics,
  normalizeAssigneeName,
} from "../../../shared/dashboardMetrics.mjs";
import { buildDashboardMetricsJql } from "../epicFilterJql.mjs";
import { fetchJiraMyself, fetchJiraUsersByAccountIds, resolveJiraUser, searchAllIssues } from "../jiraSearchHelpers.mjs";
import { buildEpicBreakdownForIssues, buildIssueEpicContext } from "./dueByHelpers.mjs";
import {
  buildDirectReportsJql,
  extractAccountIdFromInput,
  isCurrentUserMember,
  looksLikeAccountId,
  normalizeMemberNames,
} from "../../../shared/directReportsJql.mjs";

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
  iddFieldId,
  mrdFieldId,
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
  const epicBreakdown = await buildEpicBreakdownForIssues({
    issues,
    mappingsByRole,
    jiraRequest,
    dueFieldId,
    overdueFieldIds,
    iddFieldId,
    mrdFieldId,
  });

  return {
    queryType: "person",
    jql: "",
    queryName,
    resolvedDisplayName: assigneeLabel,
    resolvedAccountId: resolvedAccountId || "",
    contributorMetrics: [],
    epicBreakdown,
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
  epicBreakdown: [],
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
  epicBreakdown: [],
  workloadCounts: emptyWorkloadCounts(),
  ...(error ? { error } : {}),
});

const resolveDirectReportLabel = (token, issues) => {
  const accountId = extractAccountIdFromInput(token);
  const email = String(token || "").trim().toLowerCase();
  for (const issue of issues) {
    const assignee = normalizeAssigneeName(issue);
    if (accountId && assignee.accountId === accountId) {
      return { displayName: assignee.displayName || token, accountId: assignee.accountId || accountId };
    }
    if (email.includes("@") && String(assignee.emailAddress || "").trim().toLowerCase() === email) {
      return {
        displayName: assignee.displayName || token,
        accountId: assignee.accountId || "",
      };
    }
  }
  return { displayName: token, accountId: accountId || "" };
};

const pushDirectReportPerson = (roster, seen, person) => {
  const queryName = String(person.queryName || "").trim();
  const displayName = String(person.displayName || queryName).trim();
  const accountId = String(person.accountId || "").trim();
  if (!queryName && !displayName) {
    return;
  }
  const idKey = accountId ? `id:${accountId}` : "";
  const nameKey = `name:${(displayName || queryName).toLowerCase()}`;
  if ((idKey && seen.has(idKey)) || seen.has(nameKey)) {
    return;
  }
  if (idKey) {
    seen.add(idKey);
  }
  seen.add(nameKey);
  roster.push({
    queryName: queryName || displayName,
    displayName,
    accountId,
  });
};

const buildDirectReportRoster = async ({ memberNames, issues, jiraRequest, myself = null }) => {
  const tokens = normalizeMemberNames(memberNames).filter(
    (token) => !isCurrentUserMember(token, myself)
  );
  const accountIds = tokens.map((token) => extractAccountIdFromInput(token)).filter(Boolean);
  const usersById = new Map();

  for (const user of await fetchJiraUsersByAccountIds({ accountIds, jiraRequest })) {
    if (user.accountId) {
      usersById.set(user.accountId, user);
    }
  }

  const roster = [];
  const seen = new Set();
  const myAccountId = String(myself?.accountId || "").trim();
  const myName = String(myself?.displayName || "").trim().toLowerCase();

  for (const issue of issues || []) {
    const assignee = normalizeAssigneeName(issue);
    if (!assignee.displayName && !assignee.accountId) {
      continue;
    }
    if (myAccountId && assignee.accountId === myAccountId) {
      continue;
    }
    if (myName && String(assignee.displayName || "").trim().toLowerCase() === myName) {
      continue;
    }
    const resolved = assignee.accountId ? usersById.get(assignee.accountId) : null;
    pushDirectReportPerson(roster, seen, {
      queryName: resolved?.displayName || assignee.displayName || assignee.accountId,
      displayName: resolved?.displayName || assignee.displayName || assignee.accountId,
      accountId: assignee.accountId || resolved?.accountId || "",
    });
  }

  for (const token of tokens) {
    const accountId = extractAccountIdFromInput(token);
    const user = accountId ? usersById.get(accountId) : null;
    const fromIssues = resolveDirectReportLabel(token, issues);
    const displayName = user?.displayName || fromIssues.displayName;
    const resolvedAccountId = user?.accountId || fromIssues.accountId || accountId || "";
    if (!displayName) {
      continue;
    }
    if (looksLikeAccountId(displayName) && !user) {
      continue;
    }
    if (isCurrentUserMember(displayName, myself) || isCurrentUserMember(resolvedAccountId, myself)) {
      continue;
    }

    pushDirectReportPerson(roster, seen, {
      queryName: displayName,
      displayName,
      accountId: resolvedAccountId,
    });
  }

  return roster;
};

const buildDirectReportPersonMetrics = async ({
  watched,
  issues,
  dueFieldId,
  overdueFieldIds,
  dueContext,
  jiraRequest,
  myself = null,
}) => {
  const jql = buildDirectReportsJql(watched.memberNames, myself) || watched.jql;
  const groups = new Map();

  for (const issue of issues || []) {
    const assignee = normalizeAssigneeName(issue);
    if (!assignee.displayName && !assignee.accountId) {
      continue;
    }
    if (
      isCurrentUserMember(assignee.displayName, myself) ||
      isCurrentUserMember(assignee.accountId, myself)
    ) {
      continue;
    }
    const groupKey = String(assignee.accountId || assignee.displayName).trim().toLowerCase();
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        displayName: assignee.displayName || assignee.accountId,
        accountId: assignee.accountId || "",
        issues: [],
      });
    }
    groups.get(groupKey).issues.push(issue);
  }

  const metrics = [...groups.values()].map((group) => ({
    queryType: "direct_reports",
    jql,
    queryName: group.displayName,
    resolvedDisplayName: group.displayName,
    resolvedAccountId: group.accountId,
    contributorMetrics: [],
    epicBreakdown: [],
    ...computeAssigneeMetricsFromIssueSet(
      group.issues,
      dueFieldId,
      overdueFieldIds,
      dueContext
    ),
  }));

  const roster = await buildDirectReportRoster({
    memberNames: watched.memberNames,
    issues,
    jiraRequest,
    myself,
  });
  const seen = new Set();
  for (const person of metrics) {
    const accountId = String(person.resolvedAccountId || "").trim().toLowerCase();
    const displayName = String(person.resolvedDisplayName || "").trim().toLowerCase();
    if (accountId) {
      seen.add(accountId);
    }
    if (displayName) {
      seen.add(displayName);
    }
  }
  for (const person of roster) {
    const accountId = String(person.accountId || "").trim().toLowerCase();
    const displayName = String(person.displayName || "").trim().toLowerCase();
    if ((accountId && seen.has(accountId)) || (displayName && seen.has(displayName))) {
      continue;
    }
    if (!accountId && !displayName) {
      continue;
    }
    if (accountId) {
      seen.add(accountId);
    }
    if (displayName) {
      seen.add(displayName);
    }
    metrics.push({
      queryType: "direct_reports",
      jql,
      queryName: person.displayName,
      resolvedDisplayName: person.displayName,
      resolvedAccountId: person.accountId,
      contributorMetrics: [],
      epicBreakdown: [],
      ...emptyPersonWatchMetric(person.displayName),
    });
  }

  if (metrics.length === 0) {
    return [
      emptyPersonWatchMetric(
        watched.displayName,
        "Add contributor names in Settings → My Direct Reports"
      ),
    ];
  }

  return metrics;
};

export const buildAssigneeMetricsForRefresh = async ({
  assigneeNames,
  watchedAssigneeIds,
  dueFieldId,
  overdueFieldIds = [],
  iddFieldId,
  mrdFieldId,
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
          iddFieldId,
          mrdFieldId,
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
    if (watched.watchType === "jql" || watched.watchType === "direct_reports") {
      try {
        if (watched.watchType === "direct_reports") {
          const myself = await fetchJiraMyself({ jiraRequest });
          const rawJql = buildDirectReportsJql(watched.memberNames, myself);
          if (!rawJql) {
            assigneeMetrics.push(
              ...(await buildDirectReportPersonMetrics({
                watched,
                issues: [],
                dueFieldId,
                overdueFieldIds,
                dueContext: null,
                jiraRequest,
                myself,
              }))
            );
            continue;
          }
          const metricsJql = buildDashboardMetricsJql(rawJql) || rawJql;
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
          assigneeMetrics.push(
            ...(await buildDirectReportPersonMetrics({
              watched: { ...watched, jql: rawJql },
              issues,
              dueFieldId,
              overdueFieldIds,
              dueContext,
              jiraRequest,
              myself,
            }))
          );
          continue;
        }

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
          epicBreakdown: [],
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
          iddFieldId,
          mrdFieldId,
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
