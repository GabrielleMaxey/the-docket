// Framework-agnostic Jira issue/metrics helpers shared by both the Express
// server (server/routes/dashboardRoutes.mjs) and the React frontend
// (src/Pages/Dashboard.jsx). This file must stay free of Node-only or
// browser-only APIs so it can be imported from either side unmodified.
//
// This used to be duplicated: the server had its own copy in
// server/lib/dashboardMetrics.mjs, and the frontend reimplemented
// isClosedLikeStatus / getTerminalIssueCount locally in Dashboard.jsx with a
// slightly different (out of sync) status regex than the one used by
// src/Pages/hooks/useTaskManagerJira.js. Both now import from here so there
// is exactly one definition of "what counts as a closed/terminal issue".

export const getIssueStatusName = (issue) => {
  const status = issue?.fields?.status;
  if (typeof status === "string") {
    return String(status).trim();
  }

  return String(status?.name || "").trim();
};

export const getIssueStatusCategoryKey = (issue) =>
  String(issue?.fields?.status?.statusCategory?.key || "")
    .trim()
    .toLowerCase();

export const isClosedLikeStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return /^(closed|resolved|done|complete|completed|cancelled|canceled)$/.test(normalized);
};

export const isIssueClosed = (issue) => {
  if (getIssueStatusCategoryKey(issue) === "done") {
    return true;
  }

  return isClosedLikeStatus(getIssueStatusName(issue));
};

export const isIssueOpen = (issue) => !isIssueClosed(issue);

export const parseJiraDate = (value) => {
  if (value == null || value === "") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

export const getFieldValue = (issue, fieldId) => {
  const id = String(fieldId || "").trim();
  if (!id || !issue?.fields) {
    return null;
  }

  return issue.fields[id] ?? null;
};

export const formatDateOnly = (value) => {
  const parsed = parseJiraDate(value);
  if (!parsed) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

export const isTaskOverdue = (issue, dueFieldId) => {
  if (!isIssueOpen(issue)) {
    return false;
  }

  const dueValue = getFieldValue(issue, dueFieldId || "duedate");
  const dueDate = parseJiraDate(dueValue);
  if (!dueDate) {
    return false;
  }

  return dueDate < startOfToday();
};

// Counts open issues due strictly between today and a future cutoff date.
// Past-due issues (dueDate < today) are excluded from this count — they
// already appear in the overdue count. Use isTaskDueOrOverdue (below) to
// include them in a list.
export const isTaskDueBy = (issue, dueFieldId, targetDate) => {
  if (!isIssueOpen(issue)) {
    return false;
  }

  const dueValue = getFieldValue(issue, dueFieldId || "duedate");
  const dueDate = parseJiraDate(dueValue);
  if (!dueDate || !targetDate) {
    return false;
  }

  const cutoff = parseJiraDate(targetDate);
  if (!cutoff) {
    return false;
  }

  // Include the cutoff date itself (end of day).
  cutoff.setHours(23, 59, 59, 999);
  const today = startOfToday();
  // "Between now and date": on or after today, on or before cutoff.
  return dueDate >= today && dueDate <= cutoff;
};

// Open issues due on or before the cutoff (past due + upcoming).
// Used to build the task list, not the count metric.
export const isTaskDueOrOverdue = (issue, dueFieldId, targetDate) => {
  if (!isIssueOpen(issue)) {
    return false;
  }

  const dueValue = getFieldValue(issue, dueFieldId || "duedate");
  const dueDate = parseJiraDate(dueValue);
  if (!dueDate || !targetDate) {
    return false;
  }

  const cutoff = parseJiraDate(targetDate);
  if (!cutoff) {
    return false;
  }

  cutoff.setHours(23, 59, 59, 999);
  return dueDate <= cutoff;
};

export const computeEpicPastDue = ({ epicIssue, mappingsByRole, epicPastDueMode }) => {
  if (!epicIssue || !isIssueOpen(epicIssue)) {
    return { isPastDue: false, pastDueReason: null };
  }

  const mrdFieldId =
    mappingsByRole.get("most_recent_done_date")?.fieldId ||
    mappingsByRole.get("most_recent_done_date")?.fieldName;
  const pedFieldId =
    mappingsByRole.get("project_end_date")?.fieldId ||
    mappingsByRole.get("project_end_date")?.fieldName;

  const mrdValue = getFieldValue(epicIssue, mrdFieldId);
  const pedValue = getFieldValue(epicIssue, pedFieldId);
  const mrdDate = parseJiraDate(mrdValue);
  const pedDate = parseJiraDate(pedValue);
  const today = startOfToday();

  const mrdPastDue = Boolean(mrdDate && mrdDate < today);
  const endPastDue = Boolean(pedDate && pedDate < today);

  switch (epicPastDueMode) {
    case "most_recent_done_date":
      return {
        isPastDue: mrdPastDue,
        pastDueReason: mrdPastDue ? "mrd" : null,
      };
    case "project_end_date":
      return {
        isPastDue: endPastDue,
        pastDueReason: endPastDue ? "project_end" : null,
      };
    case "either":
    default: {
      const isPastDue = mrdPastDue || endPastDue;
      let pastDueReason = null;
      if (isPastDue) {
        pastDueReason = mrdPastDue ? "mrd" : "project_end";
      }
      return { isPastDue, pastDueReason };
    }
  }
};

export const computeEpicPercent = (epicIssue, mappingsByRole) => {
  const mrdFieldId = mappingsByRole.get("most_recent_done_date")?.fieldId;
  const iddFieldId = mappingsByRole.get("initial_done_date")?.fieldId;

  const mrdValue = getFieldValue(epicIssue, mrdFieldId);
  const iddValue = getFieldValue(epicIssue, iddFieldId);

  const epicComplete = Boolean(parseJiraDate(mrdValue) || parseJiraDate(iddValue));
  return epicComplete ? 100 : 0;
};

export const countIssuesWithStatusName = (issues, targetStatus) => {
  const normalized = String(targetStatus || "").trim().toLowerCase();
  return issues.filter(
    (issue) => getIssueStatusName(issue).toLowerCase() === normalized
  ).length;
};

export const getStatusCountFromMap = (statusCounts, targetStatus) => {
  const normalized = String(targetStatus || "").trim().toLowerCase();
  for (const [status, count] of Object.entries(statusCounts || {})) {
    if (String(status).trim().toLowerCase() === normalized) {
      return Number(count) || 0;
    }
  }
  return 0;
};

export const getTerminalIssueCount = ({
  resolvedIssues,
  completedIssues,
  totalIssues,
  openIssues,
  statusCounts,
  openStatusCounts,
}) => {
  const fromResolved = Number(resolvedIssues ?? completedIssues) || 0;
  const fromTotals = Math.max(0, Number(totalIssues) - Number(openIssues));
  let fromStatusDiff = 0;

  for (const [status, count] of Object.entries(statusCounts || {})) {
    const full = Number(count) || 0;
    const open = Number(openStatusCounts?.[status]) || 0;
    fromStatusDiff += Math.max(0, full - open);
  }

  return Math.max(fromResolved, fromTotals, fromStatusDiff);
};

export const computeChildIssueMetrics = (issues, epicKey, dueFieldId, dueByDate) => {
  const childIssues = issues.filter((issue) => String(issue.key || "") !== String(epicKey || ""));

  let completedIssues = 0;
  let resolvedIssues = 0;
  let openIssues = 0;
  let overdueOpenIssues = 0;
  let dueByOpenIssues = 0;
  const dueByIssues = [];
  const statusCounts = {};
  const openStatusCounts = {};

  for (const issue of childIssues) {
    const statusName = getIssueStatusName(issue) || "Unknown";
    statusCounts[statusName] = (statusCounts[statusName] || 0) + 1;

    if (isIssueClosed(issue)) {
      completedIssues += 1;
      resolvedIssues += 1;
    } else {
      openIssues += 1;
      openStatusCounts[statusName] = (openStatusCounts[statusName] || 0) + 1;
      if (isTaskOverdue(issue, dueFieldId)) {
        overdueOpenIssues += 1;
      }
      if (dueByDate) {
        if (isTaskDueBy(issue, dueFieldId, dueByDate)) {
          dueByOpenIssues += 1;
        }
        if (isTaskDueOrOverdue(issue, dueFieldId, dueByDate)) {
          const dueValue = getFieldValue(issue, dueFieldId || "duedate");
          dueByIssues.push({
            key: String(issue.key || ""),
            summary: String(issue.fields?.summary || ""),
            status: statusName,
            assignee: String(issue.fields?.assignee?.displayName || "Unassigned"),
            dueDate: formatDateOnly(dueValue),
            issueType: String(issue.fields?.issuetype?.name || ""),
            epicKey: String(epicKey || ""),
            self: String(issue.self || ""),
            isOverdue: isTaskOverdue(issue, dueFieldId),
          });
        }
      }
    }
  }

  const totalIssues = childIssues.length;
  const issuePercent = totalIssues > 0 ? (completedIssues / totalIssues) * 100 : 0;
  const overduePercent = openIssues > 0 ? (overdueOpenIssues / openIssues) * 100 : 0;
  const dueByPercent =
    dueByDate && openIssues > 0 ? (dueByOpenIssues / openIssues) * 100 : null;

  return {
    totalIssues,
    completedIssues,
    resolvedIssues,
    openIssues,
    overdueOpenIssues,
    dueByOpenIssues,
    dueByIssues,
    dueByPercent,
    issuePercent,
    overduePercent,
    statusCounts,
    openStatusCounts,
    childIssues,
  };
};

export const computeContributorMetricsFromIssues = (issues, dueFieldId) => {
  const byContributor = new Map();

  for (const issue of issues || []) {
    const assignee = String(issue?.fields?.assignee?.displayName || "Unassigned").trim() || "Unassigned";
    if (!byContributor.has(assignee)) {
      byContributor.set(assignee, {
        name: assignee,
        totalIssues: 0,
        resolvedIssues: 0,
        openIssues: 0,
        overdueOpenIssues: 0,
        inProgress: 0,
        readyForVerification: 0,
        readyForWork: 0,
        analyzing: 0,
        openStatusCounts: {},
        overdueIssues: [],
      });
    }

    const bucket = byContributor.get(assignee);
    bucket.totalIssues += 1;

    if (isIssueClosed(issue)) {
      bucket.resolvedIssues += 1;
      continue;
    }

    bucket.openIssues += 1;

    const statusName = getIssueStatusName(issue).trim() || "Unknown";
    bucket.openStatusCounts[statusName] = (bucket.openStatusCounts[statusName] || 0) + 1;

    if (isTaskOverdue(issue, dueFieldId)) {
      bucket.overdueOpenIssues += 1;
      bucket.overdueIssues.push({
        key: String(issue?.key || "").trim(),
        summary: String(issue?.fields?.summary || "").trim(),
        dueDate: formatDateOnly(getFieldValue(issue, dueFieldId || "duedate")),
      });
    }

    const status = statusName.toLowerCase();
    if (status === "in progress") {
      bucket.inProgress += 1;
    } else if (status === "ready for verification") {
      bucket.readyForVerification += 1;
    } else if (status === "ready for work") {
      bucket.readyForWork += 1;
    } else if (status === "analyzing") {
      bucket.analyzing += 1;
    }
  }

  return [...byContributor.values()]
    .map((row) => ({
      ...row,
      overduePercent: row.openIssues > 0 ? (row.overdueOpenIssues / row.openIssues) * 100 : 0,
    }))
    .sort((a, b) => {
      const openDelta = b.openIssues - a.openIssues;
      if (openDelta !== 0) return openDelta;
      const overdueDelta = b.overdueOpenIssues - a.overdueOpenIssues;
      if (overdueDelta !== 0) return overdueDelta;
      return a.name.localeCompare(b.name);
    });
};

export const normalizeAssigneeName = (issue) => {
  const assignee = issue?.fields?.assignee;
  if (!assignee) {
    return { displayName: "", emailAddress: "", accountId: "" };
  }

  return {
    displayName: String(assignee.displayName || "").trim(),
    emailAddress: String(assignee.emailAddress || "").trim(),
    accountId: String(assignee.accountId || "").trim(),
  };
};

export const personMatchesIssue = (issue, queryName, resolvedDisplayName) => {
  const query = String(queryName || "").trim().toLowerCase();
  if (!query) {
    return false;
  }

  const { displayName, emailAddress, accountId } = normalizeAssigneeName(issue);
  const canonical = String(resolvedDisplayName || displayName || "").trim().toLowerCase();

  if (displayName.toLowerCase() === query || emailAddress.toLowerCase() === query) {
    return true;
  }

  if (canonical && (canonical === query || canonical.includes(query) || query.includes(canonical))) {
    return true;
  }

  if (displayName.toLowerCase().includes(query)) {
    return true;
  }

  return false;
};

export const computeAssigneeWorkloadCounts = (allIssues, dueFieldId) => {
  const openIssues = allIssues.filter((issue) => isIssueOpen(issue));
  const counts = {
    totalIssues: allIssues.length,
    totalAssigned: openIssues.length,
    totalResolved: allIssues.filter((issue) => isIssueClosed(issue)).length,
    pastDue: 0,
    inProgress: 0,
    backlog: 0,
    readyForVerification: 0,
    readyForWork: 0,
    analyzing: 0,
    other: 0,
  };

  for (const issue of openIssues) {
    if (isTaskOverdue(issue, dueFieldId)) {
      counts.pastDue += 1;
      continue;
    }

    const status = getIssueStatusName(issue).toLowerCase();

    if (status === "in progress") {
      counts.inProgress += 1;
    } else if (status === "backlog") {
      counts.backlog += 1;
    } else if (status === "ready for verification") {
      counts.readyForVerification += 1;
    } else if (status === "ready for work") {
      counts.readyForWork += 1;
    } else if (status === "analyzing") {
      counts.analyzing += 1;
    } else {
      counts.other += 1;
    }
  }

  return counts;
};

export const computeAssigneeMetrics = (issues, queryName, resolvedDisplayName, dueFieldId) => {
  const personIssues = issues.filter((issue) =>
    personMatchesIssue(issue, queryName, resolvedDisplayName)
  );
  const personOpen = personIssues.filter((issue) => isIssueOpen(issue));
  const personOverdueOpen = personOpen.filter((issue) => isTaskOverdue(issue, dueFieldId));
  const workloadCounts = computeAssigneeWorkloadCounts(personIssues, dueFieldId);

  if (personOpen.length === 0) {
    return {
      overduePercent: null,
      overdueOpenCount: 0,
      totalOpenCount: 0,
      overdueIssueKeys: [],
      workloadCounts,
    };
  }

  return {
    overduePercent: (personOverdueOpen.length / personOpen.length) * 100,
    overdueOpenCount: personOverdueOpen.length,
    totalOpenCount: personOpen.length,
    overdueIssueKeys: personOverdueOpen.map((issue) => issue.key),
    workloadCounts,
  };
};

export const computeJqlWatchMetricsByAssignee = (jqlIssues, scopedChildIssues, dueFieldId) => {
  let issues = jqlIssues;
  if (scopedChildIssues.length > 0) {
    const scopeKeys = new Set(scopedChildIssues.map((issue) => String(issue.key || "")));
    issues = jqlIssues.filter((issue) => scopeKeys.has(String(issue.key || "")));
  }

  const groups = new Map();
  for (const issue of issues) {
    const { displayName } = normalizeAssigneeName(issue);
    const key = displayName || "Unassigned";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(issue);
  }

  const results = [];
  for (const [displayName, personIssues] of groups.entries()) {
    const openIssues = personIssues.filter((issue) => isIssueOpen(issue));
    const overdueOpen = openIssues.filter((issue) => isTaskOverdue(issue, dueFieldId));
    const workloadCounts = computeAssigneeWorkloadCounts(personIssues, dueFieldId);
    const { accountId } = normalizeAssigneeName(personIssues[0]);

    results.push({
      queryName: displayName,
      resolvedDisplayName: displayName,
      resolvedAccountId: accountId,
      overduePercent:
        openIssues.length === 0 ? null : (overdueOpen.length / openIssues.length) * 100,
      overdueOpenCount: overdueOpen.length,
      totalOpenCount: openIssues.length,
      overdueIssueKeys: overdueOpen.map((issue) => issue.key),
      workloadCounts,
    });
  }

  return results.sort((left, right) =>
    left.resolvedDisplayName.localeCompare(right.resolvedDisplayName)
  );
};

export const computeJqlWatchMetrics = (jqlIssues, scopedChildIssues, dueFieldId) => {
  let issues = jqlIssues;
  if (scopedChildIssues.length > 0) {
    const scopeKeys = new Set(scopedChildIssues.map((issue) => String(issue.key || "")));
    issues = jqlIssues.filter((issue) => scopeKeys.has(String(issue.key || "")));
  }

  const openIssues = issues.filter((issue) => isIssueOpen(issue));
  const overdueOpenIssues = openIssues.filter((issue) => isTaskOverdue(issue, dueFieldId));
  const workloadCounts = computeAssigneeWorkloadCounts(issues, dueFieldId);

  if (openIssues.length === 0) {
    return {
      overduePercent: null,
      overdueOpenCount: 0,
      totalOpenCount: 0,
      overdueIssueKeys: [],
      workloadCounts,
    };
  }

  return {
    overduePercent: (overdueOpenIssues.length / openIssues.length) * 100,
    overdueOpenCount: overdueOpenIssues.length,
    totalOpenCount: openIssues.length,
    overdueIssueKeys: overdueOpenIssues.map((issue) => issue.key),
    workloadCounts,
  };
};

export const computeOverallRollup = (epicMetrics) => {
  if (epicMetrics.length === 0) {
    return {
      overallIssuePercent: 0,
      overallEpicPercent: 0,
      overallOverduePercent: 0,
      statusCounts: {},
    };
  }

  let totalCompleted = 0;
  let totalIssues = 0;
  let epicsComplete = 0;
  let totalOverdueOpen = 0;
  let totalOpen = 0;
  const statusCounts = {};

  for (const epic of epicMetrics) {
    totalCompleted += epic.completedIssues ?? 0;
    totalIssues += epic.totalIssues;
    totalOverdueOpen += epic.overdueOpenIssues;
    totalOpen += epic.openIssues;
    if (epic.epicPercent >= 100) {
      epicsComplete += 1;
    }

    const counts = epic.statusCounts || {};
    for (const [status, count] of Object.entries(counts)) {
      statusCounts[status] = (statusCounts[status] || 0) + count;
    }
  }

  return {
    overallIssuePercent: totalIssues > 0 ? (totalCompleted / totalIssues) * 100 : 0,
    overallEpicPercent: (epicsComplete / epicMetrics.length) * 100,
    overallOverduePercent: totalOpen > 0 ? (totalOverdueOpen / totalOpen) * 100 : 0,
    statusCounts,
  };
};
