// Server side of the Flow report: builds the JQL, pages Jira search results with
// changelogs, and normalizes issues for shared/flowMetrics.mjs.
import { searchAllIssues } from "./jiraSearchHelpers.mjs";
import { buildDashboardMetricsJql, buildUnionScopeFromJqls, resolvePresetJql, splitTrailingOrderBy } from "./epicFilterJql.mjs";
import { addDays, dayStr } from "../../shared/flowMetrics.mjs";

const JIRA_SEARCH_JQL_PATH = "/rest/api/3/search/jql";
const SEARCH_PAGE_SIZE = 50; // changelog expansion makes pages heavy
const MAX_ISSUES = 2000;
const MAX_CHANGELOG_BACKFILLS = 100;

export const FLOW_FIELDS = ["summary", "issuetype", "status", "priority", "parent", "created", "updated", "resolutiondate", "duedate", "assignee"];

/** Same calendar day N months back (clamped to the end of shorter months). */
export const windowStartForMonths = (endDay, months) => {
  const [y, m, d] = endDay.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
};

export const buildFlowJql = ({ windowStart, scopeJql = "", allAssignees = false, includeHandedOn = false }) => {
  const start = dayStr(windowStart);
  if (!start) throw new Error("A valid windowStart (YYYY-MM-DD) is required");
  // scopeJql must already be an ORDER BY-free union scope (see buildUnionScopeFromJqls).
  const scope = splitTrailingOrderBy(scopeJql).scope;
  if (allAssignees) {
    // Without an assignee filter the query must be bounded by a project scope.
    if (!scope) throw new Error("An all-assignees flow report requires a project scope");
    return `(created >= "${start}" OR resolved >= "${start}") AND (${scope}) ORDER BY created DESC`;
  }
  const scopeClause = scope ? ` AND (${scope})` : "";
  const assigneeClause = includeHandedOn ? "(assignee = currentUser() OR assignee WAS currentUser())" : "assignee = currentUser()";
  return `${assigneeClause} AND (created >= "${start}" OR resolved >= "${start}")${scopeClause} ORDER BY created DESC`;
};

const MAX_PRESETS = 50;

/**
 * Turn the Metrics page's selected project presets into one JQL scope.
 * Open-only status filters are stripped (the same way the dashboard metrics do),
 * because a flow report needs resolved issues too.
 */
export const resolveFlowScope = async ({ presetIds, loadPreset, jiraRequest }) => {
  const ids = [...new Set((Array.isArray(presetIds) ? presetIds : []).map((id) => Number.parseInt(id, 10)).filter((id) => id > 0))].slice(0, MAX_PRESETS);
  if (ids.length === 0) return { requested: 0, scopeJql: "", names: [], scopeLabel: "" };

  const scopes = [];
  const names = [];
  for (const id of ids) {
    const preset = loadPreset(id);
    if (!preset) continue;
    const jql = await resolvePresetJql({ preset, jiraRequest });
    const metricsJql = buildDashboardMetricsJql(jql);
    const scope = splitTrailingOrderBy(metricsJql).scope;
    if (!scope) continue;
    scopes.push(scope);
    names.push(String(preset.epicName || preset.label || preset.epicKey || `Preset ${id}`));
  }

  const shown = names.slice(0, 3).join(", ");
  const scopeLabel = names.length > 3 ? `${shown} +${names.length - 3} more` : shown;
  return { requested: ids.length, scopeJql: buildUnionScopeFromJqls(scopes), names, scopeLabel };
};

const statusTransitionsFrom = (histories) => {
  const out = [];
  for (const history of Array.isArray(histories) ? histories : []) {
    for (const item of Array.isArray(history?.items) ? history.items : []) {
      if (item?.field === "status") {
        out.push({ at: String(history.created || ""), from: String(item.fromString || ""), to: String(item.toString || "") });
      }
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
};

export const normalizeJiraIssue = (raw) => {
  const f = raw?.fields || {};
  const changelog = raw?.changelog;
  const histories = Array.isArray(changelog?.histories) ? changelog.histories : null;
  const total = Number.isFinite(changelog?.total) ? changelog.total : null;
  const complete = histories !== null && (total === null || histories.length >= total);
  return {
    key: String(raw?.key || ""),
    summary: String(f.summary || ""),
    status: String(f.status?.name || ""),
    statusCategory: String(f.status?.statusCategory?.key || ""),
    type: String(f.issuetype?.name || ""),
    priority: String(f.priority?.name || ""),
    assignee: String(f.assignee?.displayName || ""),
    parent: String(f.parent?.key || ""),
    parentSummary: String(f.parent?.fields?.summary || ""),
    created: f.created || null,
    updated: f.updated || null,
    resolved: f.resolutiondate || null,
    dueDate: f.duedate || null,
    transitions: complete ? statusTransitionsFrom(histories) : null,
    needsChangelog: !complete,
  };
};

const fetchFullChangelog = async ({ jiraRequest, key }) => {
  const values = [];
  let startAt = 0;
  for (let page = 0; page < 20; page += 1) {
    const result = await jiraRequest({
      pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(key)}/changelog?startAt=${startAt}&maxResults=100`,
    });
    if (!result?.ok) return null;
    const batch = Array.isArray(result.data?.values) ? result.data.values : [];
    values.push(...batch);
    if (result.data?.isLast !== false || batch.length === 0) return statusTransitionsFrom(values);
    startAt += batch.length;
  }
  return null;
};

export const fetchFlowIssues = async ({ jql, jiraRequest, signal }) => {
  const runSearch = (query, options = {}) =>
    jiraRequest({
      method: "POST",
      pathWithQuery: JIRA_SEARCH_JQL_PATH,
      body: { jql: query, fields: FLOW_FIELDS, expand: "changelog", ...options },
    });

  const page = await searchAllIssues({ jql, runJiraSearchRequest: runSearch, batchSize: SEARCH_PAGE_SIZE, maxTotal: MAX_ISSUES, signal });
  const issues = page.issues.map(normalizeJiraIssue);

  // The search response truncates long changelogs; backfill those issues one by one (capped).
  let backfills = 0;
  for (const issue of issues) {
    if (!issue.needsChangelog) continue;
    if (backfills >= MAX_CHANGELOG_BACKFILLS) break;
    backfills += 1;
    issue.transitions = await fetchFullChangelog({ jiraRequest, key: issue.key });
  }
  for (const issue of issues) delete issue.needsChangelog;

  return { issues, total: page.total, loaded: page.loaded, isComplete: page.isComplete, completeness: page.completeness };
};

export const resolveFlowWindow = ({ now = new Date(), windowMonths = 12 } = {}) => {
  const windowEnd = dayStr(now);
  const months = Math.min(36, Math.max(1, Number.parseInt(windowMonths, 10) || 12));
  return { windowEnd, windowStart: windowStartForMonths(windowEnd, months), months, windowLabel: `Past ${months} ${months === 1 ? "month" : "months"}` };
};

export { addDays };

export const FLOW_NARRATIVE_SYSTEM_PROMPT = [
  "You write a short narrative summary of a Jira flow report for an engineering lead.",
  "Use only the numbers, issue keys and facts given in the report data. Do not invent causes, people, dates or trends that the data does not show; if something cannot be known from the data, leave it out.",
  "Write 2 to 4 short paragraphs of plain prose (no markdown, bullets, headings or tables), under 180 words in total.",
  "Cover: how much work is moving (throughput and the created-versus-resolved balance), how healthy the open work is (age, idle time, stalled items), and what to look at first, naming at most three issue keys from the list.",
  "State caveats from the note when they affect how much to trust the numbers (for example an incomplete fetch or idle time based on last update).",
].join("\n");
