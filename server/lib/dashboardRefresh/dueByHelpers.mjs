import {
  formatDateOnly,
  getFieldValue,
  getIssueStatusName,
  isIssueOpen,
  parseJiraDate,
  startOfToday,
} from "../../../shared/dashboardMetrics.mjs";
import { fetchEpicIssue } from "../jiraSearchHelpers.mjs";

export const buildIssueEpicContext = async ({ issues, mappingsByRole, jiraRequest }) => {
  const parentKeyToGroup = new Map();

  for (const issue of issues || []) {
    if (!isIssueOpen(issue)) {
      continue;
    }

    const parentKey = String(issue.fields?.parent?.key || "").trim();
    if (!parentKey) {
      continue;
    }

    const parentIssuetype = String(
      issue.fields?.parent?.fields?.issuetype?.name || ""
    ).toLowerCase();

    if (!parentKeyToGroup.has(parentKey)) {
      parentKeyToGroup.set(parentKey, { issues: [], isEpic: parentIssuetype === "epic" });
    }

    parentKeyToGroup.get(parentKey).issues.push(issue);
  }

  const issueToEpicKey = new Map();
  const epicKeys = new Set();

  for (const [parentKey, { issues: groupIssues, isEpic }] of parentKeyToGroup.entries()) {
    let resolvedEpicKey = parentKey;

    if (!isEpic) {
      const parentData = await fetchEpicIssue({ epicKey: parentKey, mappingsByRole, jiraRequest });
      const grandparentKey = String(parentData?.fields?.parent?.key || "").trim();
      if (grandparentKey) {
        resolvedEpicKey = grandparentKey;
      }
    }

    epicKeys.add(resolvedEpicKey);
    for (const issue of groupIssues) {
      issueToEpicKey.set(String(issue.key || ""), resolvedEpicKey);
    }
  }

  const epicByKey = new Map();
  for (const epicKey of epicKeys) {
    const epicIssue = await fetchEpicIssue({ epicKey, mappingsByRole, jiraRequest });
    if (epicIssue) {
      epicByKey.set(epicKey, epicIssue);
    }
  }

  return { issueToEpicKey, epicByKey };
};

export const resolveCandidateFieldIds = (dueByField, { dueFieldId, mrdFieldId, iddFieldId, pedFieldId }) => {
  if (dueByField === "due_date") {
    // For epic-level date inheritance: prefer standard duedate, fall back to
    // MRD / IDD / PED since ODI epics don't use the standard duedate field.
    return [dueFieldId, mrdFieldId, iddFieldId, pedFieldId].filter(Boolean);
  }
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
