// Shared Jira metrics helpers — importable from server and browser (no Node/DOM APIs).

import { resolveMappedFieldId } from "./odiFieldIds.mjs";
import { extractAccountIdFromInput, looksLikeAccountId } from "./directReportsJql.mjs";

export const getIssueStatusName = (issue) => {
  const status = issue?.fields?.status;
  if (typeof status === "string") {
    return String(status).trim();
  }

  return String(status?.name || "").trim();
};

export const getIssueTypeName = (issue) => {
  const fromFields = issue?.fields?.issuetype;
  if (typeof fromFields === "string") {
    return String(fromFields).trim();
  }

  return String(fromFields?.name || issue?.issueType || "").trim();
};

export const matchesIssueTypeFamily = (issueTypeName, family) => {
  const normalized = String(issueTypeName || "").trim().toLowerCase();
  const base = String(family || "").trim().toLowerCase();
  if (!normalized || !base) {
    return false;
  }
  return (
    normalized === base ||
    normalized.startsWith(`${base} `) ||
    normalized.startsWith(`${base}(`)
  );
};

export const isEpicIssueType = (issueOrTypeName) => {
  if (typeof issueOrTypeName === "string") {
    return matchesIssueTypeFamily(issueOrTypeName, "epic");
  }

  return matchesIssueTypeFamily(getIssueTypeName(issueOrTypeName), "epic");
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

export const PAST_DUE_LOOKBACK_YEAR_OPTIONS = [0.5, 1, 2, 3];

export const normalizePastDueLookbackYears = (value) => {
  const years = Number(value);
  if (years === 0.5 || years === 2 || years === 3) {
    return years;
  }
  return 1;
};

export const formatPastDueLookbackLabel = (lookbackYears) => {
  const years = normalizePastDueLookbackYears(lookbackYears);
  if (years === 0.5) {
    return "Last 6 months";
  }
  return `Last ${years} year${years !== 1 ? "s" : ""}`;
};

export const formatPastDueLookbackPhrase = (lookbackYears) => {
  const years = normalizePastDueLookbackYears(lookbackYears);
  if (years === 0.5) {
    return "6 months";
  }
  return `${years} year${years !== 1 ? "s" : ""}`;
};

export const formatOverdueWindowPhrase = (lookbackYears, includePastDue) => {
  if (!includePastDue) {
    return "all open work past due (no lookback floor)";
  }
  return `within the past ${formatPastDueLookbackPhrase(lookbackYears)}`;
};

export const formatUpcomingWindowPhrase = (dueByDate) => {
  const date = String(dueByDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return "";
  }
  return `from today through ${date}`;
};

export const computePastDueFloorDate = (lookbackYears = 1) => {
  const years = normalizePastDueLookbackYears(lookbackYears);
  const floor = startOfToday();
  floor.setMonth(floor.getMonth() - years * 12);
  return floor;
};

export const isDueDateInDueByWindow = (dueDate, targetDate, pastDueFloor) => {
  if (!dueDate || !targetDate) {
    return false;
  }

  const cutoff = parseJiraDate(targetDate);
  if (!cutoff) {
    return false;
  }

  cutoff.setHours(23, 59, 59, 999);
  if (dueDate > cutoff) {
    return false;
  }

  const today = startOfToday();
  if (dueDate >= today) {
    return true;
  }

  if (!pastDueFloor) {
    return true;
  }

  const floor =
    pastDueFloor instanceof Date ? pastDueFloor : parseJiraDate(pastDueFloor);
  if (!floor) {
    return true;
  }

  return dueDate >= floor;
};

export const getIssueDueByDate = (
  issue,
  compareFieldId,
  fallbackFieldId,
  epicIssue = null,
  preferEpicCompareForChildren = false
) => {
  const fallbackId = String(fallbackFieldId || "duedate").trim();
  const compareId = String(compareFieldId || fallbackId).trim();

  const epicKey = String(epicIssue?.key || "").trim();
  const issueKey = String(issue?.key || "").trim();
  if (preferEpicCompareForChildren && epicIssue && epicKey && epicKey !== issueKey) {
    const epicValue = getFieldValue(epicIssue, compareId);
    const epicDate = parseJiraDate(epicValue);
    if (epicDate) {
      return { dueDate: epicDate, dueValue: epicValue };
    }
  }

  const fallbackValue = getFieldValue(issue, fallbackId);
  const fallbackDate = parseJiraDate(fallbackValue);
  if (fallbackDate) {
    return { dueDate: fallbackDate, dueValue: fallbackValue };
  }

  if (epicIssue && epicKey && epicKey !== issueKey) {
    const epicValue = getFieldValue(epicIssue, compareId);
    const epicDate = parseJiraDate(epicValue);
    if (epicDate) {
      return { dueDate: epicDate, dueValue: epicValue };
    }
  } else if (compareId !== fallbackId) {
    const compareValue = getFieldValue(issue, compareId);
    const compareDate = parseJiraDate(compareValue);
    if (compareDate) {
      return { dueDate: compareDate, dueValue: compareValue };
    }
  }

  return { dueDate: null, dueValue: null };
};

export const isIssueInDueByWindow = (
  issue,
  compareFieldId,
  fallbackFieldId,
  targetDate,
  pastDueFloor,
  epicIssue = null,
  preferEpicCompareForChildren = false
) => {
  if (!isIssueOpen(issue)) {
    return false;
  }

  const { dueDate } = getIssueDueByDate(
    issue,
    compareFieldId,
    fallbackFieldId,
    epicIssue,
    preferEpicCompareForChildren
  );
  if (!dueDate) {
    return false;
  }

  return isDueDateInDueByWindow(dueDate, targetDate, pastDueFloor);
};

export const isIssueUpcomingDueBy = (
  issue,
  compareFieldId,
  fallbackFieldId,
  targetDate,
  epicIssue = null,
  preferEpicCompareForChildren = false
) => {
  if (!isIssueOpen(issue)) {
    return false;
  }

  const { dueDate } = getIssueDueByDate(
    issue,
    compareFieldId,
    fallbackFieldId,
    epicIssue,
    preferEpicCompareForChildren
  );
  if (!dueDate || !targetDate) {
    return false;
  }

  const cutoff = parseJiraDate(targetDate);
  if (!cutoff) {
    return false;
  }

  cutoff.setHours(23, 59, 59, 999);
  const today = startOfToday();
  return dueDate >= today && dueDate <= cutoff;
};

export const isIssuePastDueInLookback = (
  issue,
  compareFieldId,
  fallbackFieldId,
  pastDueFloor,
  epicIssue = null,
  preferEpicCompareForChildren = false
) => {
  if (!isIssueOpen(issue) || !pastDueFloor) {
    return false;
  }

  const { dueDate } = getIssueDueByDate(
    issue,
    compareFieldId,
    fallbackFieldId,
    epicIssue,
    preferEpicCompareForChildren
  );
  if (!dueDate) {
    return false;
  }

  const today = startOfToday();
  if (dueDate >= today) {
    return false;
  }

  const floor =
    pastDueFloor instanceof Date ? pastDueFloor : parseJiraDate(pastDueFloor);
  if (!floor) {
    return false;
  }

  return dueDate >= floor;
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

export const isTaskOverdue = (issue, dueFieldId, extraFieldIds = []) => {
  if (!isIssueOpen(issue)) {
    return false;
  }

  const fieldIds = [dueFieldId || "duedate", ...extraFieldIds].filter(Boolean);
  const today = startOfToday();

  for (const fieldId of fieldIds) {
    const dueDate = parseJiraDate(getFieldValue(issue, fieldId));
    if (dueDate && dueDate < today) {
      return true;
    }
  }

  return false;
};

export const isIssueOverdueForMetrics = (
  issue,
  dueFieldId,
  extraOverdueFieldIds = [],
  dueByOptions = null
) => {
  const preferEpic = Boolean(dueByOptions?.preferEpicCompareForChildren);
  const epicIssue = dueByOptions?.epicIssue ?? null;
  if (preferEpic && epicIssue) {
    const compareFieldId = dueByOptions.dueByCompareFieldId || dueFieldId;
    const fallbackFieldId = dueByOptions.dueByFallbackFieldId || compareFieldId;
    const { dueDate } = getIssueDueByDate(
      issue,
      compareFieldId,
      fallbackFieldId,
      epicIssue,
      true
    );
    return Boolean(dueDate && dueDate < startOfToday());
  }

  return isTaskOverdue(issue, dueFieldId, extraOverdueFieldIds);
};

// Open issue with a due date on or after today (not yet missed).
export const isTaskDueInFuture = (issue, dueFieldId = "duedate", extraOverdueFieldIds = []) => {
  if (!isIssueOpen(issue) || isTaskOverdue(issue, dueFieldId, extraOverdueFieldIds)) {
    return false;
  }

  const fieldIds = [dueFieldId || "duedate", ...extraOverdueFieldIds].filter(Boolean);
  const today = startOfToday();

  for (const fieldId of fieldIds) {
    const dueDate = parseJiraDate(getFieldValue(issue, fieldId));
    if (dueDate && dueDate >= today) {
      return true;
    }
  }

  return false;
};

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

export const computeEpicPastDue = ({
  epicIssue,
  mappingsByRole,
  epicPastDueMode,
  pastDueFloor = null,
  trackPastDue = true,
}) => {
  if (!epicIssue || !isIssueOpen(epicIssue) || !trackPastDue) {
    return { isPastDue: false, pastDueReason: null };
  }

  const iddFieldId = resolveMappedFieldId(mappingsByRole, "initial_done_date");
  const mrdFieldId = resolveMappedFieldId(mappingsByRole, "most_recent_done_date");
  const pedFieldId =
    mappingsByRole.get("project_end_date")?.fieldId ||
    mappingsByRole.get("project_end_date")?.fieldName;

  const iddValue = getFieldValue(epicIssue, iddFieldId);
  const mrdValue = getFieldValue(epicIssue, mrdFieldId);
  const pedValue = getFieldValue(epicIssue, pedFieldId);
  const iddDate = parseJiraDate(iddValue);
  const mrdDate = parseJiraDate(mrdValue);
  const pedDate = parseJiraDate(pedValue);
  const today = startOfToday();
  const floor =
    pastDueFloor instanceof Date ? pastDueFloor : parseJiraDate(pastDueFloor);

  const isDatePastDue = (date) => {
    if (!date || date >= today) {
      return false;
    }
    if (!floor) {
      return false;
    }
    return date >= floor;
  };

  const iddPastDue = isDatePastDue(iddDate);
  const mrdPastDue = isDatePastDue(mrdDate);
  const endPastDue = isDatePastDue(pedDate);

  switch (epicPastDueMode) {
    case "initial_done_date":
      return {
        isPastDue: iddPastDue,
        pastDueReason: iddPastDue ? "idd" : null,
      };
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
      const isPastDue = mrdPastDue || iddPastDue || endPastDue;
      let pastDueReason = null;
      if (isPastDue) {
        pastDueReason = mrdPastDue ? "mrd" : iddPastDue ? "idd" : "project_end";
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

export const computeChildIssueMetrics = (
  issues,
  epicKey,
  dueFieldId,
  dueByDate,
  extraOverdueFieldIds = [],
  dueByOptions = null
) => {
  const compareFieldId = dueByOptions?.dueByCompareFieldId || dueFieldId;
  const fallbackFieldId = dueByOptions?.dueByFallbackFieldId || dueFieldId;
  const pastDueFloor = dueByOptions?.pastDueFloor ?? null;
  const includePastDueInList = Boolean(dueByOptions?.includePastDueInList);
  const epicIssue = dueByOptions?.epicIssue ?? null;
  const preferEpicCompareForChildren = Boolean(dueByOptions?.preferEpicCompareForChildren);
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
      if (isIssueOverdueForMetrics(issue, dueFieldId, extraOverdueFieldIds, dueByOptions)) {
        overdueOpenIssues += 1;
      }
      if (dueByDate) {
        const dueMeta = getIssueDueByDate(
          issue,
          compareFieldId,
          fallbackFieldId,
          epicIssue,
          preferEpicCompareForChildren
        );
        const today = startOfToday();
        const pushDueByIssue = (isOverdue) => {
          if (!dueMeta.dueValue) {
            return;
          }

          dueByIssues.push({
            key: String(issue.key || ""),
            summary: String(issue.fields?.summary || ""),
            status: statusName,
            assignee: String(issue.fields?.assignee?.displayName || "Unassigned"),
            dueDate: formatDateOnly(dueMeta.dueValue),
            issueType: String(issue.fields?.issuetype?.name || ""),
            epicKey: String(epicKey || ""),
            self: String(issue.self || ""),
            isOverdue: isOverdue,
          });
        };

        if (
          isIssueUpcomingDueBy(
            issue,
            compareFieldId,
            fallbackFieldId,
            dueByDate,
            epicIssue,
            preferEpicCompareForChildren
          )
        ) {
          dueByOpenIssues += 1;
          pushDueByIssue(false);
        } else if (
          includePastDueInList &&
          isIssuePastDueInLookback(
            issue,
            compareFieldId,
            fallbackFieldId,
            pastDueFloor,
            epicIssue,
            preferEpicCompareForChildren
          )
        ) {
          pushDueByIssue(Boolean(dueMeta.dueDate && dueMeta.dueDate < today));
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

export const computeContributorMetricsFromIssues = (
  issues,
  dueFieldId,
  extraOverdueFieldIds = [],
  dueContext = null
) => {
  const normalizedDueContext = normalizeAssigneeDueContext(dueContext);
  const byContributor = new Map();
  const preferEpic = Boolean(normalizedDueContext?.dueByOptions?.preferEpicCompareForChildren);
  const epicIssue = normalizedDueContext?.dueByOptions?.epicIssue ?? null;
  const compareFieldId = normalizedDueContext?.dueByOptions?.dueByCompareFieldId || dueFieldId;
  const fallbackFieldId =
    normalizedDueContext?.dueByOptions?.dueByFallbackFieldId || compareFieldId;

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
        upcomingDueIssues: [],
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

    const issueOpts = resolveIssueDueByOptions(issue, normalizedDueContext);
    const row = buildDueIssueRow(issue, dueFieldId, issueOpts);

    if (row.dueDate) {
      if (isIssueOverdueForMetrics(issue, dueFieldId, extraOverdueFieldIds, issueOpts)) {
        bucket.overdueOpenIssues += 1;
        bucket.overdueIssues.push(row);
      } else if (
        normalizedDueContext?.dueByDate &&
        isIssueUpcomingDueBy(
          issue,
          compareFieldId,
          fallbackFieldId,
          normalizedDueContext.dueByDate,
          epicIssue,
          preferEpic
        )
      ) {
        bucket.upcomingDueIssues.push(row);
      } else if (
        normalizedDueContext?.dueByDate &&
        issueOpts?.includePastDueInList &&
        issueOpts?.pastDueFloor &&
        isIssuePastDueInLookback(
          issue,
          compareFieldId,
          fallbackFieldId,
          issueOpts.pastDueFloor,
          epicIssue,
          preferEpic
        )
      ) {
        bucket.overdueOpenIssues += 1;
        bucket.overdueIssues.push(row);
      }
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
      overdueIssues: [...row.overdueIssues].sort(compareDueIssueRows),
      upcomingDueIssues: [...row.upcomingDueIssues].sort(compareDueIssueRows),
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

export const normalizePersonQuery = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const personMatchesIssue = (
  issue,
  queryName,
  resolvedDisplayName,
  resolvedAccountId = ""
) => {
  const query = normalizePersonQuery(queryName);
  if (!query) {
    return false;
  }

  const { displayName, emailAddress, accountId } = normalizeAssigneeName(issue);
  const issueAccountId = String(accountId || "").trim();
  const targetAccountId =
    String(resolvedAccountId || "").trim() || extractAccountIdFromInput(queryName);
  const queryEmail = String(queryName || "").trim().toLowerCase();
  const issueEmail = String(emailAddress || "").trim().toLowerCase();

  if (targetAccountId && issueAccountId && targetAccountId === issueAccountId) {
    return true;
  }

  if (queryEmail.includes("@") && issueEmail && queryEmail === issueEmail) {
    return true;
  }

  if (looksLikeAccountId(queryName) || /\bassignee\b/.test(query)) {
    return false;
  }

  const normalizedDisplay = normalizePersonQuery(displayName);
  const normalizedEmailLocal = normalizePersonQuery(String(emailAddress || "").split("@")[0]);
  const normalizedCanonical = normalizePersonQuery(resolvedDisplayName || displayName);

  if (
    normalizedDisplay === query ||
    normalizedEmailLocal === query ||
    normalizedCanonical === query
  ) {
    return true;
  }

  if (
    normalizedCanonical &&
    (normalizedCanonical.includes(query) || query.includes(normalizedCanonical))
  ) {
    return true;
  }

  if (normalizedDisplay.includes(query) || query.includes(normalizedDisplay)) {
    return true;
  }

  return false;
};

export const computeAssigneeWorkloadCounts = (
  allIssues,
  dueFieldId,
  extraOverdueFieldIds = [],
  dueContext = null
) => {
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
    if (
      isIssueOverdueForMetrics(
        issue,
        dueFieldId,
        extraOverdueFieldIds,
        resolveIssueDueByOptions(issue, dueContext)
      )
    ) {
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

export const normalizeAssigneeDueContext = (value, dueByDate = null) => {
  if (!value && !dueByDate) {
    return null;
  }

  if (value?.dueByOptions || value?.epicByKey || value?.issueToEpicKey) {
    return {
      dueByDate: value.dueByDate || dueByDate || null,
      dueByOptions: value.dueByOptions || null,
      epicByKey: value.epicByKey || null,
      issueToEpicKey: value.issueToEpicKey || null,
    };
  }

  return {
    dueByDate: value?.dueByDate || dueByDate || null,
    dueByOptions: value || null,
    epicByKey: null,
    issueToEpicKey: null,
  };
};

export const resolveIssueDueByOptions = (issue, dueContext) => {
  const normalized = normalizeAssigneeDueContext(dueContext);
  if (!normalized?.dueByOptions) {
    return null;
  }

  const issueKey = String(issue?.key || "").trim();
  const epicKey = normalized.issueToEpicKey?.get(issueKey);
  const epicIssue =
    epicKey && normalized.epicByKey?.has(epicKey)
      ? normalized.epicByKey.get(epicKey)
      : normalized.dueByOptions.epicIssue ?? null;

  return epicIssue ? { ...normalized.dueByOptions, epicIssue } : normalized.dueByOptions;
};

export const buildDueIssueRow = (issue, dueFieldId, issueDueByOptions = null) => {
  const compareFieldId = issueDueByOptions?.dueByCompareFieldId || dueFieldId;
  const fallbackFieldId = issueDueByOptions?.dueByFallbackFieldId || compareFieldId;
  const epicIssue = issueDueByOptions?.epicIssue ?? null;
  const preferEpic = Boolean(issueDueByOptions?.preferEpicCompareForChildren);
  const { dueValue } = getIssueDueByDate(
    issue,
    compareFieldId,
    fallbackFieldId,
    epicIssue,
    preferEpic
  );

  return {
    key: String(issue?.key || "").trim(),
    summary: String(issue?.fields?.summary || "").trim(),
    dueDate: formatDateOnly(dueValue),
    issueType: getIssueTypeName(issue),
  };
};

const compareDueIssueRows = (left, right) => {
  const leftDate = left.dueDate || "9999-12-31";
  const rightDate = right.dueDate || "9999-12-31";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  return left.key.localeCompare(right.key);
};

export const buildAssigneeDueIssueLists = (
  issues,
  dueFieldId,
  extraOverdueFieldIds = [],
  dueContext = null
) => {
  const normalized = normalizeAssigneeDueContext(dueContext);
  if (!normalized) {
    const openIssues = (issues || []).filter((issue) => isIssueOpen(issue));
    return {
      overdueIssues: buildOverdueIssueRows(openIssues, dueFieldId, extraOverdueFieldIds),
      upcomingDueIssues: [],
    };
  }

  const { dueByDate } = normalized;
  const overdueIssues = [];
  const upcomingDueIssues = [];

  for (const issue of issues || []) {
    if (!isIssueOpen(issue)) {
      continue;
    }

    const issueOpts = resolveIssueDueByOptions(issue, normalized);
    const compareFieldId = issueOpts?.dueByCompareFieldId || dueFieldId;
    const fallbackFieldId = issueOpts?.dueByFallbackFieldId || compareFieldId;
    const epicIssue = issueOpts?.epicIssue ?? null;
    const preferEpic = Boolean(issueOpts?.preferEpicCompareForChildren);
    const row = buildDueIssueRow(issue, dueFieldId, issueOpts);

    if (!row.dueDate) {
      continue;
    }

    if (isIssueOverdueForMetrics(issue, dueFieldId, extraOverdueFieldIds, issueOpts)) {
      overdueIssues.push(row);
      continue;
    }

    if (
      dueByDate &&
      isIssueUpcomingDueBy(
        issue,
        compareFieldId,
        fallbackFieldId,
        dueByDate,
        epicIssue,
        preferEpic
      )
    ) {
      upcomingDueIssues.push(row);
      continue;
    }

    if (
      dueByDate &&
      issueOpts?.includePastDueInList &&
      issueOpts?.pastDueFloor &&
      isIssuePastDueInLookback(
        issue,
        compareFieldId,
        fallbackFieldId,
        issueOpts.pastDueFloor,
        epicIssue,
        preferEpic
      )
    ) {
      overdueIssues.push(row);
    }
  }

  overdueIssues.sort(compareDueIssueRows);
  upcomingDueIssues.sort(compareDueIssueRows);

  return { overdueIssues, upcomingDueIssues };
};

export const buildOverdueIssueRows = (
  issues,
  dueFieldId,
  extraOverdueFieldIds = [],
  dueByOptions = null
) =>
  (issues || [])
    .filter((issue) => isIssueOpen(issue))
    .filter((issue) =>
      isIssueOverdueForMetrics(issue, dueFieldId, extraOverdueFieldIds, dueByOptions)
    )
    .map((issue) => buildDueIssueRow(issue, dueFieldId, dueByOptions));

export const computeAssigneeMetricsFromIssueSet = (
  personIssues,
  dueFieldId,
  extraOverdueFieldIds = [],
  dueContext = null
) => {
  const scopedIssues = Array.isArray(personIssues) ? personIssues : [];
  const personOpen = scopedIssues.filter((issue) => isIssueOpen(issue));
  const normalizedDueContext = normalizeAssigneeDueContext(dueContext);
  const { overdueIssues, upcomingDueIssues } = buildAssigneeDueIssueLists(
    personOpen,
    dueFieldId,
    extraOverdueFieldIds,
    normalizedDueContext
  );
  const workloadCounts = computeAssigneeWorkloadCounts(
    scopedIssues,
    dueFieldId,
    extraOverdueFieldIds,
    normalizedDueContext
  );

  if (personOpen.length === 0) {
    return {
      overduePercent: null,
      overdueOpenCount: 0,
      totalOpenCount: 0,
      overdueIssueKeys: [],
      overdueIssues: [],
      upcomingDueIssues: [],
      workloadCounts,
    };
  }

  return {
    overduePercent: (overdueIssues.length / personOpen.length) * 100,
    overdueOpenCount: overdueIssues.length,
    totalOpenCount: personOpen.length,
    overdueIssueKeys: overdueIssues.map((row) => row.key),
    overdueIssues,
    upcomingDueIssues,
    workloadCounts,
  };
};

export const computeAssigneeMetrics = (
  issues,
  queryName,
  resolvedDisplayName,
  dueFieldId,
  resolvedAccountId = "",
  extraOverdueFieldIds = [],
  dueContext = null
) =>
  computeAssigneeMetricsFromIssueSet(
    issues.filter((issue) =>
      personMatchesIssue(issue, queryName, resolvedDisplayName, resolvedAccountId)
    ),
    dueFieldId,
    extraOverdueFieldIds,
    dueContext
  );

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

export const computeJqlWatchMetrics = (
  jqlIssues,
  scopedChildIssues,
  dueFieldId,
  extraOverdueFieldIds = [],
  dueContext = null
) => {
  let issues = jqlIssues;
  if (scopedChildIssues.length > 0) {
    const scopeKeys = new Set(scopedChildIssues.map((issue) => String(issue.key || "")));
    issues = jqlIssues.filter((issue) => scopeKeys.has(String(issue.key || "")));
  }

  const openIssues = issues.filter((issue) => isIssueOpen(issue));
  const normalizedDueContext = normalizeAssigneeDueContext(dueContext);
  const { overdueIssues, upcomingDueIssues } = buildAssigneeDueIssueLists(
    openIssues,
    dueFieldId,
    extraOverdueFieldIds,
    normalizedDueContext
  );
  const workloadCounts = computeAssigneeWorkloadCounts(
    issues,
    dueFieldId,
    extraOverdueFieldIds,
    normalizedDueContext
  );

  if (openIssues.length === 0) {
    return {
      overduePercent: null,
      overdueOpenCount: 0,
      totalOpenCount: 0,
      overdueIssueKeys: [],
      overdueIssues: [],
      upcomingDueIssues: [],
      workloadCounts,
    };
  }

  return {
    overduePercent: (overdueIssues.length / openIssues.length) * 100,
    overdueOpenCount: overdueIssues.length,
    totalOpenCount: openIssues.length,
    overdueIssueKeys: overdueIssues.map((row) => row.key),
    overdueIssues,
    upcomingDueIssues,
    workloadCounts,
  };
};

export const rollupEpicPercentFromBreakdown = (breakdown) => {
  const rows = Array.isArray(breakdown) ? breakdown : [];
  if (rows.length === 0) {
    return 0;
  }

  const complete = rows.filter((row) => Number(row?.epicPercent || 0) >= 100).length;
  return (complete / rows.length) * 100;
};

export const collectEpicCompletionCounts = (epicMetrics) => {
  let epicsComplete = 0;
  let epicCount = 0;

  for (const epic of epicMetrics || []) {
    const breakdown = Array.isArray(epic.epicBreakdown) ? epic.epicBreakdown : null;
    if (breakdown && breakdown.length > 0) {
      for (const row of breakdown) {
        epicCount += 1;
        if (Number(row.epicPercent || 0) >= 100) {
          epicsComplete += 1;
        }
      }
      continue;
    }

    if (String(epic.epicKey || "").trim() === "JQL") {
      continue;
    }

    const epicKey = String(epic.epicKey || "").trim();
    if (!epicKey) {
      continue;
    }

    epicCount += 1;
    if (Number(epic.epicPercent || 0) >= 100) {
      epicsComplete += 1;
    }
  }

  return { epicsComplete, epicCount };
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
  let totalOverdueOpen = 0;
  let totalOpen = 0;
  const statusCounts = {};
  const { epicsComplete, epicCount } = collectEpicCompletionCounts(epicMetrics);

  for (const epic of epicMetrics) {
    totalCompleted += epic.completedIssues ?? 0;
    totalIssues += epic.totalIssues;
    totalOverdueOpen += epic.overdueOpenIssues;
    totalOpen += epic.openIssues;

    const counts = epic.statusCounts || {};
    for (const [status, count] of Object.entries(counts)) {
      statusCounts[status] = (statusCounts[status] || 0) + count;
    }
  }

  return {
    overallIssuePercent: totalIssues > 0 ? (totalCompleted / totalIssues) * 100 : 0,
    overallEpicPercent: epicCount > 0 ? (epicsComplete / epicCount) * 100 : 0,
    overallOverduePercent: totalOpen > 0 ? (totalOverdueOpen / totalOpen) * 100 : 0,
    statusCounts,
  };
};
