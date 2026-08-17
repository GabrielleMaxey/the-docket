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

// Computed entirely from fields the default search field set
// (getJiraSearchFields) already returns - status, duedate, updated - so
// this adds zero extra Jira calls beyond the one search per entry that
// already existed. All input issues are open by construction (the JQL
// itself filters statusCategory != Done), so every issue here counts
// toward exactly one status bucket, never a "closed" bucket.
const computeIssueBreakdown = (issues) => {
  const statusCounts = {};
  let overdueCount = 0;
  let blockedCount = 0;
  let staleCount = 0;
  const now = Date.now();
  const staleThresholdMs = STALE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;

  for (const issue of issues) {
    const statusName = getIssueStatusName(issue) || "Unknown";
    statusCounts[statusName] = (statusCounts[statusName] || 0) + 1;

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

  return { statusCounts, overdueCount, blockedCount, staleCount };
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
    const base = {
      id: watched.id,
      displayName: watched.displayName,
      watchType: watched.watchType,
      capacity: hasCapacity ? Number(watched.capacity) : null,
    };
    try {
      const jql = buildOpenCountJql(watched);
      if (!jql) {
        results.push({
          ...base,
          openCount: 0,
          statusCounts: {},
          overdueCount: 0,
          blockedCount: 0,
          staleCount: 0,
          error: "No query available for this entry",
        });
        continue;
      }
      const { issues } = await searchAllIssues({ jql, runJiraSearchRequest, maxTotal: 500 });
      const breakdown = computeIssueBreakdown(issues || []);
      results.push({ ...base, openCount: (issues || []).length, ...breakdown, error: null });
    } catch (error) {
      results.push({
        ...base,
        openCount: 0,
        statusCounts: {},
        overdueCount: 0,
        blockedCount: 0,
        staleCount: 0,
        error: error instanceof Error ? error.message : "Failed to fetch workload",
      });
    }
  }

  return results;
};
