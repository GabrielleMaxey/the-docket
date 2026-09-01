import { searchAllIssues, fetchIssuesByKeys, fetchEpicIssue } from "./jiraSearchHelpers.mjs";
import { isEpicIssueType } from "../../shared/dashboardMetrics.mjs";

const DESCENDANT_FIELDS = ["summary", "status", "issuetype", "assignee", "parent", "duedate", "issuelinks"];

export const buildDescendantFieldIds = (mappingsByRole) =>
  [
    ...DESCENDANT_FIELDS,
    mappingsByRole?.get?.("most_recent_done_date")?.fieldId,
    mappingsByRole?.get?.("initial_done_date")?.fieldId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

export const getProjectKeyFromIssueKey = (issueKey) => {
  const match = String(issueKey || "").trim().match(/^([A-Z][A-Z0-9_]*)-\d+$/);
  return match ? match[1] : "";
};

// Cross-project issue links as a proxy for another team — not comments, and not same-project links.
export const detectCrossTeamLinks = (issue, ownProjectKey) => {
  const links = Array.isArray(issue?.fields?.issuelinks) ? issue.fields.issuelinks : [];
  const found = [];

  for (const link of links) {
    const direction = link?.outwardIssue ? "outward" : link?.inwardIssue ? "inward" : null;
    const linkedIssue = link?.outwardIssue || link?.inwardIssue;
    if (!direction || !linkedIssue) {
      continue;
    }

    const linkedKey = String(linkedIssue.key || "").trim();
    const linkedProject = getProjectKeyFromIssueKey(linkedKey);
    if (!linkedProject || linkedProject === ownProjectKey) {
      continue;
    }

    found.push({
      linkedKey,
      linkedSummary: String(linkedIssue.fields?.summary || "").trim(),
      linkedStatus: String(linkedIssue.fields?.status?.name || "").trim(),
      linkType: direction === "outward" ? String(link?.type?.outward || "").trim() : String(link?.type?.inward || "").trim(),
      linkedProject,
    });
  }

  return found;
};

export const fetchEpicDescendants = async ({
  epicKey,
  mappingsByRole,
  jiraRequest,
  runJiraSearchRequest,
  maxTotal = 300,
}) => {
  const key = String(epicKey || "").trim();
  if (!key) {
    return [];
  }

  const directResult = await searchAllIssues({
    jql: `(parent = ${key} OR "Epic Link" = ${key}) ORDER BY key ASC`,
    runJiraSearchRequest,
    maxTotal,
  });
  const directIssues = directResult.issues || [];
  const directKeys = directIssues.map((issue) => String(issue.key || "").trim()).filter(Boolean);

  const storyKeys = directIssues
    .filter((issue) => String(issue.fields?.issuetype?.name || "").trim().toLowerCase() === "story")
    .map((issue) => String(issue.key || "").trim())
    .filter(Boolean);

  let grandchildKeys = [];
  if (storyKeys.length > 0) {
    const grandchildResult = await searchAllIssues({
      jql: `parent in (${storyKeys.join(",")}) ORDER BY key ASC`,
      runJiraSearchRequest,
      maxTotal,
    });
    grandchildKeys = (grandchildResult.issues || [])
      .map((issue) => String(issue.key || "").trim())
      .filter(Boolean);
  }

  const allKeys = [...new Set([...directKeys, ...grandchildKeys])];
  if (allKeys.length === 0) {
    return [];
  }

  const fields = buildDescendantFieldIds(mappingsByRole);
  return fetchIssuesByKeys({ keys: allKeys, jiraRequest, fields });
};

export const fetchAndValidateEpic = async ({ epicKey, mappingsByRole, jiraRequest }) => {
  const key = String(epicKey || "").trim().toUpperCase();
  if (!key) {
    return { ok: false, error: "Epic key is required" };
  }

  const epic = await fetchEpicIssue({ epicKey: key, mappingsByRole, jiraRequest });
  if (!epic) {
    return { ok: false, error: "Epic not found", status: 404 };
  }
  if (!isEpicIssueType(epic)) {
    return {
      ok: false,
      error: "That issue exists but isn't an Epic",
      status: 400,
      issueType: String(epic.fields?.issuetype?.name || "").trim(),
    };
  }

  return { ok: true, epic };
};
