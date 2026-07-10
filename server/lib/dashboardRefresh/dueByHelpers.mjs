import {
  formatDateOnly,
  getFieldValue,
  getIssueStatusName,
  isIssueOpen,
  parseJiraDate,
  startOfToday,
} from "../../../shared/dashboardMetrics.mjs";
import { getEpicIssueFieldIds, loadIssuesIntoCache } from "../jiraSearchHelpers.mjs";

const resolveGrandparentEpicKey = (grandparentKey, parentIssue, issueCache) => {
  const grandparentTypeFromParent = String(
    parentIssue.fields?.parent?.fields?.issuetype?.name || ""
  ).toLowerCase();
  if (grandparentTypeFromParent === "epic") {
    return grandparentKey;
  }

  const grandparentIssue = issueCache.get(grandparentKey);
  if (String(grandparentIssue?.fields?.issuetype?.name || "").toLowerCase() === "epic") {
    return grandparentKey;
  }

  return "";
};

const resolveEpicKeyFromCache = (issue, issueCache) => {
  const issueKey = String(issue.key || "").trim();
  const issueType = String(issue.fields?.issuetype?.name || "").toLowerCase();
  if (issueType === "epic") {
    return issueKey;
  }

  const parentKey = String(issue.fields?.parent?.key || "").trim();
  if (!parentKey) {
    return "";
  }

  const parentTypeFromSearch = String(
    issue.fields?.parent?.fields?.issuetype?.name || ""
  ).toLowerCase();
  if (parentTypeFromSearch === "epic") {
    return parentKey;
  }

  const parentIssue = issueCache.get(parentKey);
  if (!parentIssue) {
    return "";
  }

  const parentType = String(parentIssue.fields?.issuetype?.name || "").toLowerCase();
  if (parentType === "epic") {
    return parentKey;
  }

  const grandparentKey = String(parentIssue.fields?.parent?.key || "").trim();
  if (grandparentKey) {
    return resolveGrandparentEpicKey(grandparentKey, parentIssue, issueCache);
  }

  return "";
};

const collectParentKeysNeedingFetch = (issues, issueCache) => {
  const keys = new Set();

  for (const issue of issues) {
    const issueType = String(issue.fields?.issuetype?.name || "").toLowerCase();
    if (issueType === "epic") {
      continue;
    }

    const parentKey = String(issue.fields?.parent?.key || "").trim();
    if (!parentKey) {
      continue;
    }

    const parentTypeFromSearch = String(
      issue.fields?.parent?.fields?.issuetype?.name || ""
    ).toLowerCase();
    if (parentTypeFromSearch === "epic") {
      continue;
    }

    if (!issueCache.has(parentKey)) {
      keys.add(parentKey);
    }
  }

  return keys;
};

const collectGrandparentKeysNeedingFetch = (parentKeys, issueCache) => {
  const keys = new Set();

  for (const parentKey of parentKeys) {
    const parentIssue = issueCache.get(parentKey);
    if (!parentIssue) {
      continue;
    }

    if (String(parentIssue.fields?.issuetype?.name || "").toLowerCase() === "epic") {
      continue;
    }

    const grandparentKey = String(parentIssue.fields?.parent?.key || "").trim();
    if (grandparentKey && !issueCache.has(grandparentKey)) {
      keys.add(grandparentKey);
    }
  }

  return keys;
};

export const buildJqlEpicContext = async ({ issues, mappingsByRole, jiraRequest }) => {
  const issueCache = new Map();
  const epicFields = getEpicIssueFieldIds(mappingsByRole);
  const parentFields = ["summary", "issuetype", "parent"];

  for (const issue of issues) {
    const issueKey = String(issue.key || "").trim();
    if (issueKey) {
      issueCache.set(issueKey, issue);
    }
  }

  const parentKeys = collectParentKeysNeedingFetch(issues, issueCache);
  await loadIssuesIntoCache({
    keys: [...parentKeys],
    issueCache,
    jiraRequest,
    fields: parentFields,
  });

  const grandparentKeys = collectGrandparentKeysNeedingFetch(parentKeys, issueCache);
  await loadIssuesIntoCache({
    keys: [...grandparentKeys],
    issueCache,
    jiraRequest,
    fields: parentFields,
  });

  const epicKeyToIssues = new Map();
  for (const issue of issues) {
    const epicKey = resolveEpicKeyFromCache(issue, issueCache);
    if (!epicKey) {
      continue;
    }

    if (!epicKeyToIssues.has(epicKey)) {
      epicKeyToIssues.set(epicKey, []);
    }
    epicKeyToIssues.get(epicKey).push(issue);
  }

  await loadIssuesIntoCache({
    keys: [...epicKeyToIssues.keys()],
    issueCache,
    jiraRequest,
    fields: epicFields,
  });

  return { epicKeyToIssues, issueCache };
};

export const filterEpicGroupsToOpenIssues = (epicKeyToIssues) => {
  const filtered = new Map();
  for (const [epicKey, groupIssues] of epicKeyToIssues.entries()) {
    const openIssues = groupIssues.filter((issue) => isIssueOpen(issue));
    if (openIssues.length > 0) {
      filtered.set(epicKey, openIssues);
    }
  }
  return filtered;
};

export const buildIssueEpicContext = async ({ issues, mappingsByRole, jiraRequest }) => {
  const openIssues = (issues || []).filter((issue) => isIssueOpen(issue));
  const { epicKeyToIssues, issueCache } = await buildJqlEpicContext({
    issues: openIssues,
    mappingsByRole,
    jiraRequest,
  });

  const issueToEpicKey = new Map();
  const epicByKey = new Map();

  for (const [epicKey, groupIssues] of epicKeyToIssues.entries()) {
    const epicIssue = issueCache.get(epicKey);
    if (epicIssue) {
      epicByKey.set(epicKey, epicIssue);
    }

    for (const issue of groupIssues) {
      issueToEpicKey.set(String(issue.key || ""), epicKey);
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
