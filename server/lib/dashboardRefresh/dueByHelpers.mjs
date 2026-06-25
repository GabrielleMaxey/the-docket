import {
  formatDateOnly,
  getFieldValue,
  getIssueStatusName,
  isIssueOpen,
  parseJiraDate,
  startOfToday,
} from "../../../shared/dashboardMetrics.mjs";

export const resolveCandidateFieldIds = (dueByField, { dueFieldId, mrdFieldId, iddFieldId, pedFieldId }) => {
  if (dueByField === "initial_done_date") {
    return [iddFieldId].filter(Boolean);
  }
  if (dueByField === "most_recent_done_date") {
    return [mrdFieldId].filter(Boolean);
  }
  return [dueFieldId, mrdFieldId, iddFieldId, pedFieldId].filter(Boolean);
};

export const buildEpicLevelDueByIssues = ({
  epicIssue,
  childIssues,
  epicKey,
  dueByDate,
  candidateFieldIds,
  existingDueByKeys,
  pastDueFloor = null,
  includePastDueInList = false,
}) => {
  if (!dueByDate || !epicIssue || !childIssues.length || !candidateFieldIds.length) {
    return [];
  }

  const cutoff = parseJiraDate(dueByDate);
  if (!cutoff) {
    return [];
  }
  cutoff.setHours(23, 59, 59, 999);

  let epicDueDate = null;
  let epicDueValue = null;

  for (const fieldId of candidateFieldIds) {
    const value = getFieldValue(epicIssue, fieldId);
    if (!value) {
      continue;
    }

    const date = parseJiraDate(value);
    if (!date || date > cutoff) {
      continue;
    }

    if (!epicDueDate || date < epicDueDate) {
      epicDueDate = date;
      epicDueValue = value;
    }
  }

  if (!epicDueDate) {
    return [];
  }

  const today = startOfToday();
  const isUpcomingEpic = epicDueDate >= today && epicDueDate <= cutoff;
  let includeEpic = isUpcomingEpic;

  if (!includeEpic && includePastDueInList && pastDueFloor) {
    const floor =
      pastDueFloor instanceof Date ? pastDueFloor : parseJiraDate(pastDueFloor);
    includeEpic = Boolean(floor && epicDueDate < today && epicDueDate >= floor);
  }

  if (!includeEpic) {
    return [];
  }

  const epicIsOverdue = epicDueDate < today;
  const epicDueDateStr = formatDateOnly(epicDueValue);

  return childIssues
    .filter(
      (issue) =>
        isIssueOpen(issue) && !existingDueByKeys.has(String(issue.key || ""))
    )
    .map((issue) => ({
      key: String(issue.key || ""),
      summary: String(issue.fields?.summary || ""),
      status: getIssueStatusName(issue),
      assignee: String(issue.fields?.assignee?.displayName || "Unassigned"),
      dueDate: epicDueDateStr,
      issueType: String(issue.fields?.issuetype?.name || ""),
      epicKey: String(epicKey || ""),
      self: String(issue.self || ""),
      isOverdue: epicIsOverdue,
    }));
};
