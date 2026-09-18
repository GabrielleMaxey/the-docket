import {
  getIssueTypeName,
  matchesIssueTypeFamily,
} from "../../../shared/dashboardMetrics.mjs";

export const getKnownAssignees = (issues) =>
  Array.from(
    new Set(
      issues
        .map((issue) => issue.fields?.assignee?.displayName)
        .filter((name) => typeof name === "string" && name.trim().length > 0)
    )
  ).sort();

export const getKnownStatuses = (issues) =>
  Array.from(
    new Set(
      issues
        .map((issue) => issue.fields?.status?.name)
        .filter((status) => typeof status === "string" && status.trim().length > 0)
    )
  ).sort();

export const filterIssues = (
  issues,
  { keyQuery, keywordQuery, statusFilter, assigneeFilter, subtaskBugOnly, includeStories }
) => {
  let result = issues;
  const keyTerm = String(keyQuery || "").trim().toLowerCase();
  if (keyTerm) {
    const looksLikeFullKey = /^[a-z][a-z0-9]*-\d+$/i.test(keyTerm);
    result = result.filter((issue) => {
      const issueKey = String(issue.key || "").toLowerCase();
      return looksLikeFullKey ? issueKey === keyTerm : issueKey.includes(keyTerm);
    });
  }
  const kw = String(keywordQuery || "").trim().toLowerCase();
  if (kw) {
    result = result.filter((issue) =>
      String(issue.fields?.summary || "").toLowerCase().includes(kw)
    );
  }
  if (statusFilter) {
    result = result.filter((issue) => String(issue.fields?.status?.name || "") === statusFilter);
  }
  if (assigneeFilter) {
    const target = assigneeFilter === "__unassigned__" ? "" : assigneeFilter;
    result = result.filter((issue) => {
      const name = String(issue.fields?.assignee?.displayName || "");
      return target === "" ? !name : name === target;
    });
  }
  if (subtaskBugOnly) {
    result = result.filter((issue) => {
      const typeName = getIssueTypeName(issue);
      return (
        matchesIssueTypeFamily(typeName, "sub-task") ||
        matchesIssueTypeFamily(typeName, "bug") ||
        (includeStories && matchesIssueTypeFamily(typeName, "story"))
      );
    });
  }
  return result;
};

const getPrioritySortRank = (clampPriority, priorityValue) => {
  const priority = clampPriority(priorityValue);
  return priority === 0 ? 21 : priority;
};

const compareIssueKeys = (a, b) =>
  String(a.key || "").localeCompare(String(b.key || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });

const compareTextValues = (left, right) =>
  String(left || "").localeCompare(String(right || ""), undefined, {
    sensitivity: "base",
  });

const getIssueStatus = (issue) => String(issue.fields?.status?.name || "");
const getIssueAssignee = (issue) => String(issue.fields?.assignee?.displayName || "Unassigned");

export const sortIssues = ({
  issues,
  isClosedLikeStatus,
  jiraRowPriorities,
  clampPriority,
  sortField,
  sortDirection,
}) =>
  [...issues].sort((a, b) => {
    const aStatus = getIssueStatus(a);
    const bStatus = getIssueStatus(b);
    const aClosed = isClosedLikeStatus(aStatus);
    const bClosed = isClosedLikeStatus(bStatus);
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    if (sortField === "default") {
      if (aClosed && bClosed) return compareIssueKeys(a, b);
      const aRank = getPrioritySortRank(clampPriority, jiraRowPriorities[String(a.key || "").trim()] ?? 0);
      const bRank = getPrioritySortRank(clampPriority, jiraRowPriorities[String(b.key || "").trim()] ?? 0);
      return aRank !== bRank ? aRank - bRank : compareIssueKeys(a, b);
    }
    let result = 0;
    if (sortField === "key") result = compareIssueKeys(a, b);
    else if (sortField === "status") result = compareTextValues(aStatus, bStatus);
    else if (sortField === "assignee") result = compareTextValues(getIssueAssignee(a), getIssueAssignee(b));
    else if (sortField === "priority") {
      const aRank = getPrioritySortRank(clampPriority, jiraRowPriorities[String(a.key || "").trim()] ?? 0);
      const bRank = getPrioritySortRank(clampPriority, jiraRowPriorities[String(b.key || "").trim()] ?? 0);
      result = aRank - bRank;
    }
    return (result === 0 ? compareIssueKeys(a, b) : result) * (sortDirection === "desc" ? -1 : 1);
  });

export const getIssueBrowseUrl = (issue) => {
  const issueKey = String(issue?.key || "").trim();
  if (!issueKey || typeof issue?.self !== "string" || !issue.self.trim()) return "";
  try {
    const parsed = new URL(issue.self);
    return `${parsed.protocol}//${parsed.host}/browse/${encodeURIComponent(issueKey)}`;
  } catch {
    return "";
  }
};

export const noteMatchesLastJiraPush = (fingerprint, lastPushed) =>
  typeof lastPushed === "string" && lastPushed.length > 0 && fingerprint === lastPushed;
