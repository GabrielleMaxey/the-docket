// Epic workload/timeline evaluation - fetches an Epic's full descendant
// tree (Epic -> Story -> Task/Sub-task, matching ODI's three-level Jira
// hierarchy) and flags cross-team blocker candidates, for Chat's persistent
// "Evaluate an Epic" panel.

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

// "ODI-1234" -> "ODI". Used to compare an issue's own project against a
// linked issue's project, as the cross-team-blocker signal.
export const getProjectKeyFromIssueKey = (issueKey) => {
  const match = String(issueKey || "").trim().match(/^([A-Z][A-Z0-9_]*)-\d+$/);
  return match ? match[1] : "";
};

// Cross-team blocker candidates: issue links pointing to a DIFFERENT Jira
// project than the epic's own. This is a reasonable proxy for "involves
// another team" - in this org, different Jira project keys generally line
// up with different teams - but it is a proxy, not certain knowledge: a
// same-project link can still involve another team, and mentions of another
// team in free-text comments/descriptions are not checked at all.
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

// Fetches every descendant of an Epic (Story -> Task/Sub-task), enriched
// with the fields needed for workload/timeline/blocker evaluation. Two-step
// parent walk, matching the app's established three-level hierarchy
// (Epic -> Story -> Task): direct children first (Epic Link or parent =
// epic), then grandchildren (parent in <direct Story children>).
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

// Validates epicKey resolves to a real Epic and returns it with the fields
// evaluation needs (summary, status, IDD/MRD/PED). Returns null if the key
// doesn't exist or isn't an Epic - caller decides how to surface that.
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
