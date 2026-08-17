// Live open-issue-count fetch for every watched_assignees entry that has a
// capacity target configured, for the Project Managers tab's capacity
// planning view. Deliberately lighter than buildAssigneeMetricsForRefresh
// (server/lib/dashboardRefresh/buildAssigneeMetrics.mjs) - capacity
// planning only needs a current open-issue count per entry, not the full
// due-date-window/epic-breakdown machinery the Dashboard refresh computes.

import { searchAllIssues } from "./jiraSearchHelpers.mjs";
import { splitTrailingOrderBy } from "./epicFilterJql.mjs";

const escapeJqlString = (value) =>
  String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// Builds an "open issues" JQL for one watched entry (person or jql type -
// direct_reports entries are filtered out by the caller before this is
// ever called, since that type expands into multiple people elsewhere and
// doesn't map 1:1 to a single row/card the way these two do). The entry's
// own JQL is reused as the assignee scope for jql-type watches, with an
// open-status filter appended (rather than trusting the saved JQL to
// already be open-only, since some saved queries intentionally aren't).
//
// Any trailing ORDER BY must be stripped before wrapping the scope in
// parens and appending more conditions - ORDER BY can only appear once,
// at the very end of the whole query, never nested inside a parenthesized
// scope followed by more AND clauses. A real live query against
// "reporter = X ORDER BY updated DESC" confirmed this fails with a JQL
// syntax error otherwise ("Expecting ')' but got 'ORDER'") - caught by
// actually testing this against Jira, not just by reading the code.
const buildOpenCountJql = (watched) => {
  if (watched.watchType === "jql") {
    const raw = String(watched.jql || "").trim();
    if (!raw) return "";
    const { scope } = splitTrailingOrderBy(raw);
    return `(${scope}) AND statusCategory != Done`;
  }
  const name = String(watched.displayName || "").trim();
  return name ? `assignee = "${escapeJqlString(name)}" AND statusCategory != Done` : "";
};

// Returns [{ id, displayName, watchType, capacity, openCount, error }] for
// EVERY watched_assignees row (direct_reports excluded - that type expands
// into multiple people server-side elsewhere and doesn't map 1:1 to a
// single row/card the way person/jql entries do). capacity is null for
// entries with no target configured - the caller decides how to render
// that (e.g. a plain workload count instead of a capacity comparison bar),
// rather than this function silently hiding entries with nothing to
// compare against. Previously filtered to capacity-only rows, which meant
// a newly-added Contributor Metrics entry appeared to do nothing on the
// Project Managers page until a capacity was also set - not a bug, but
// confusing enough in practice to change: every entry should be visible
// here, with or without a capacity target.
export const fetchCapacityWorkloads = async ({ watchedRows, jiraRequest, runJiraSearchRequest }) => {
  const rows = (watchedRows || []).filter((row) => row.watchType !== "direct_reports");
  if (rows.length === 0) {
    return [];
  }

  const results = [];
  for (const watched of rows) {
    const hasCapacity = watched.capacity !== null && watched.capacity !== undefined;
    const base = {
      id: watched.id,
      displayName: watched.displayName,
      watchType: watched.watchType,
      capacity: hasCapacity ? Number(watched.capacity) : null,
    };
    try {
      const jql = buildOpenCountJql(watched);
      if (!jql) {
        results.push({ ...base, openCount: 0, error: "No query available for this entry" });
        continue;
      }
      const { issues } = await searchAllIssues({ jql, runJiraSearchRequest, maxTotal: 500 });
      results.push({ ...base, openCount: (issues || []).length, error: null });
    } catch (error) {
      results.push({
        ...base,
        openCount: 0,
        error: error instanceof Error ? error.message : "Failed to fetch workload",
      });
    }
  }

  return results;
};
