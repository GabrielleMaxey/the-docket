// Live open-issue-count + risk-signal fetch for every watched_assignees
// entry, for the Project Managers tab's capacity planning view.
// Deliberately lighter than buildAssigneeMetricsForRefresh
// (server/lib/dashboardRefresh/buildAssigneeMetrics.mjs) - capacity
// planning needs a status breakdown and a few risk signals per entry, not
// the full due-date-window/epic-breakdown machinery the Dashboard refresh
// computes.

import { searchAllIssues } from "./jiraSearchHelpers.mjs";
import { splitTrailingOrderBy } from "./epicFilterJql.mjs";
import { getIssueStatusName } from "../../shared/dashboardMetrics.mjs";

const escapeJqlString = (value) =>
  String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// A raw issue count is a weak proxy for real workload - issues vary
// wildly in size, and this org's story-point/estimate fields are checked
// live against real ODI issues and found essentially unpopulated, so
// weighting by estimate isn't viable with this org's actual data. Status
// breakdown and risk signals (overdue/blocked/stale) are reliably
// populated instead, and were chosen for that reason.
const STALE_DAYS_THRESHOLD = 14;
const BLOCKED_STATUS_PATTERN = /blocked|on\s*hold/i;

// Builds the bare assignee/reporter/query scope for one watched entry
// (person or jql type - direct_reports entries are filtered out by the
// caller before this is ever called, since that type expands into
// multiple people elsewhere and doesn't map 1:1 to a single row/card the
// way these two do), WITHOUT any status filter - callers append their own
// (open-only, a specific status, overdue, etc.) so the same scope can
// back the open-count query, the status-breakdown drill-down links, and
// the risk-flag drill-down links, without three different places
// independently reconstructing what "this entry's issues" means.
//
// Any trailing ORDER BY must be stripped before wrapping the scope in
// parens and appending more conditions - ORDER BY can only appear once,
// at the very end of the whole query, never nested inside a parenthesized
// scope followed by more AND clauses. A real live query against
// "reporter = X ORDER BY updated DESC" confirmed this fails with a JQL
// syntax error otherwise ("Expecting ')' but got 'ORDER'") - caught by
// actually testing this against Jira, not just by reading the code.
const buildScopeJql = (watched) => {
  if (watched.watchType === "jql") {
    const raw = String(watched.jql || "").trim();
    if (!raw) return "";
    const { scope } = splitTrailingOrderBy(raw);
    return scope;
  }
  const name = String(watched.displayName || "").trim();
  return name ? `assignee = "${escapeJqlString(name)}"` : "";
};

const buildOpenCountJql = (scopeJql) => (scopeJql ? `(${scopeJql}) AND statusCategory != Done` : "");

// A PM deciding whether someone can take on new work needs THREE numbers:
// their share of THIS project/query (computeIssueBreakdown, below), their
// load within the same Jira PROJECT more broadly (this query might be a
// narrow slice of a project - e.g. only summary-matching issues - while
// the project as a whole has more of their work), and their total open
// workload everywhere else too. This fetches the second and third numbers
// for the top contributors in ONE batched query (assignee in (...) AND
// statusCategory != Done, no scope restriction - deliberately
// cross-project), splitting the same fetched issues into "matches
// dominantProjectKey" vs. everything, rather than a second batched call -
// one extra Jira round-trip total, not two, and not one per person, which
// would multiply calls by contributor count on entries with many people
// (one real entry here has 20+).
const CONTRIBUTOR_TOTAL_LIMIT = 6;

// Every issue key is "PROJECTKEY-NUMBER" - the project a query is "about"
// is derived from whichever project key appears most often in that
// query's own results, not parsed out of the JQL text itself (which can
// be arbitrarily complex - summary matches, parent lookups, OR chains -
// and doesn't reliably name a single project in a simple, parseable way).
const dominantProjectKeyFor = (issues) => {
  const counts = {};
  for (const issue of issues || []) {
    const key = String(issue?.key || "");
    const projectKey = key.includes("-") ? key.split("-")[0] : "";
    if (!projectKey) continue;
    counts[projectKey] = (counts[projectKey] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? entries[0][0] : "";
};

const fetchContributorTotalWorkloads = async ({ contributorCounts, dominantProjectKey, runJiraSearchRequest }) => {
  const names = Object.keys(contributorCounts || {})
    .filter((name) => name !== "Unassigned")
    .sort((a, b) => contributorCounts[b] - contributorCounts[a])
    .slice(0, CONTRIBUTOR_TOTAL_LIMIT);
  if (names.length === 0) {
    return { totals: {}, projectTotals: {} };
  }

  const nameList = names.map((name) => `"${escapeJqlString(name)}"`).join(", ");
  const jql = `assignee in (${nameList}) AND statusCategory != Done`;

  try {
    const { issues } = await searchAllIssues({ jql, runJiraSearchRequest, maxTotal: 500 });
    const totals = {};
    const projectTotals = {};
    for (const issue of issues || []) {
      const assigneeName = String(issue?.fields?.assignee?.displayName || "").trim();
      if (!assigneeName) continue;
      totals[assigneeName] = (totals[assigneeName] || 0) + 1;
      if (dominantProjectKey && String(issue?.key || "").startsWith(`${dominantProjectKey}-`)) {
        projectTotals[assigneeName] = (projectTotals[assigneeName] || 0) + 1;
      }
    }
    return { totals, projectTotals };
  } catch {
    // Non-fatal - the card still shows in-scope numbers fine without
    // totals; a failed total-workload lookup shouldn't break the entry.
    return { totals: {}, projectTotals: {} };
  }
};

// Computed entirely from fields the default search field set
// (getJiraSearchFields) already returns - status, duedate, updated,
// assignee - so this adds zero extra Jira calls beyond the one search per
// entry that already existed. All input issues are open by construction
// (the JQL itself filters statusCategory != Done), so every issue here
// counts toward exactly one status bucket, never a "closed" bucket.
//
// contributorCounts groups the SAME open issues by assignee - this is
// each person's share of THIS entry's query specifically, not their
// total workload across every project. A jql-type entry scoped to one
// initiative (e.g. a specific project or label) will only ever see the
// slice of a person's work that falls inside that scope; the same person
// could have a much larger total workload sitting entirely outside it.
// The client is responsible for labeling this accordingly rather than
// presenting it as anyone's whole plate.
const computeIssueBreakdown = (issues) => {
  const statusCounts = {};
  const contributorCounts = {};
  let overdueCount = 0;
  let blockedCount = 0;
  let staleCount = 0;
  const now = Date.now();
  const staleThresholdMs = STALE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;

  for (const issue of issues) {
    const statusName = getIssueStatusName(issue) || "Unknown";
    statusCounts[statusName] = (statusCounts[statusName] || 0) + 1;

    const assigneeName = String(issue?.fields?.assignee?.displayName || "Unassigned").trim() || "Unassigned";
    contributorCounts[assigneeName] = (contributorCounts[assigneeName] || 0) + 1;

    if (BLOCKED_STATUS_PATTERN.test(statusName)) {
      blockedCount += 1;
    }

    const dueDate = issue?.fields?.duedate;
    if (dueDate) {
      const due = new Date(dueDate);
      if (!Number.isNaN(due.getTime()) && due.getTime() < now) {
        overdueCount += 1;
      }
    }

    const updated = issue?.fields?.updated;
    if (updated) {
      const updatedAt = new Date(updated);
      if (!Number.isNaN(updatedAt.getTime()) && now - updatedAt.getTime() > staleThresholdMs) {
        staleCount += 1;
      }
    }
  }

  return { statusCounts, contributorCounts, overdueCount, blockedCount, staleCount };
};

// Returns [{ id, displayName, watchType, capacity, openCount, statusCounts,
// overdueCount, blockedCount, staleCount, error }] for EVERY
// watched_assignees row (direct_reports excluded - that type expands into
// multiple people server-side elsewhere and doesn't map 1:1 to a single
// row/card the way person/jql entries do). capacity is null for entries
// with no target configured - the caller decides how to render that (e.g.
// a plain workload count instead of a capacity comparison bar), rather
// than this function silently hiding entries with nothing to compare
// against.
export const fetchCapacityWorkloads = async ({ watchedRows, jiraRequest, runJiraSearchRequest }) => {
  const rows = (watchedRows || []).filter((row) => row.watchType !== "direct_reports");
  if (rows.length === 0) {
    return [];
  }

  const results = [];
  for (const watched of rows) {
    const hasCapacity = watched.capacity !== null && watched.capacity !== undefined;
    const scopeJql = buildScopeJql(watched);
    const base = {
      id: watched.id,
      displayName: watched.displayName,
      watchType: watched.watchType,
      capacity: hasCapacity ? Number(watched.capacity) : null,
      // The bare scope (no status filter) - the client builds its own
      // drill-down JQL from this for each status/risk-flag link, so a
      // click always reflects exactly the same "who/what" this card
      // itself is scoped to.
      scopeJql,
    };
    try {
      const jql = buildOpenCountJql(scopeJql);
      if (!jql) {
        results.push({
          ...base,
          openCount: 0,
          statusCounts: {},
          contributorCounts: {},
          contributorTotalCounts: {},
          contributorProjectCounts: {},
          dominantProjectKey: "",
          overdueCount: 0,
          blockedCount: 0,
          staleCount: 0,
          error: "No query available for this entry",
        });
        continue;
      }
      const { issues } = await searchAllIssues({ jql, runJiraSearchRequest, maxTotal: 500 });
      const breakdown = computeIssueBreakdown(issues || []);
      const dominantProjectKey = dominantProjectKeyFor(issues);
      const { totals: contributorTotalCounts, projectTotals: contributorProjectCounts } =
        await fetchContributorTotalWorkloads({
          contributorCounts: breakdown.contributorCounts,
          dominantProjectKey,
          runJiraSearchRequest,
        });
      results.push({
        ...base,
        openCount: (issues || []).length,
        ...breakdown,
        contributorTotalCounts,
        contributorProjectCounts,
        dominantProjectKey,
        error: null,
      });
    } catch (error) {
      results.push({
        ...base,
        openCount: 0,
        statusCounts: {},
        contributorCounts: {},
        contributorTotalCounts: {},
        contributorProjectCounts: {},
        dominantProjectKey: "",
        overdueCount: 0,
        blockedCount: 0,
        staleCount: 0,
        error: error instanceof Error ? error.message : "Failed to fetch workload",
      });
    }
  }

  return results;
};
