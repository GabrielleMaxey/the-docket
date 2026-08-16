// Live open-issue-count fetch for every watched_assignees entry that has a
// capacity target configured, for the Project Managers tab's capacity
// planning view. Deliberately lighter than buildAssigneeMetricsForRefresh
// (server/lib/dashboardRefresh/buildAssigneeMetrics.mjs) - capacity
// planning only needs a current open-issue count per entry, not the full
// due-date-window/epic-breakdown machinery the Dashboard refresh computes.

import { searchAllIssues, fetchJiraMyself } from "./jiraSearchHelpers.mjs";
import { buildDirectReportsJql } from "../../shared/directReportsJql.mjs";

const escapeJqlString = (value) =>
  String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// Builds an "open issues" JQL for one watched entry. For jql/direct_reports
// watches, the entry's own JQL is reused as the assignee scope, with an
// open-status filter appended (rather than trusting the saved JQL to
// already be open-only, since some saved queries intentionally aren't).
const buildOpenCountJql = (watched, myself) => {
  if (watched.watchType === "direct_reports") {
    const rawJql = buildDirectReportsJql(watched.memberNames, myself);
    return rawJql ? `(${rawJql}) AND statusCategory != Done` : "";
  }
  if (watched.watchType === "jql") {
    const jql = String(watched.jql || "").trim();
    return jql ? `(${jql}) AND statusCategory != Done` : "";
  }
  const name = String(watched.displayName || "").trim();
  return name ? `assignee = "${escapeJqlString(name)}" AND statusCategory != Done` : "";
};

// Returns [{ id, displayName, watchType, capacity, openCount, error }] for
// every watched_assignees row with capacity IS NOT NULL. Entries with no
// capacity configured are skipped entirely - nothing to compare them against.
export const fetchCapacityWorkloads = async ({ watchedRows, jiraRequest, runJiraSearchRequest }) => {
  const capacityRows = (watchedRows || []).filter(
    (row) => row.capacity !== null && row.capacity !== undefined
  );
  if (capacityRows.length === 0) {
    return [];
  }

  let myself = null;
  if (capacityRows.some((row) => row.watchType === "direct_reports")) {
    try {
      myself = await fetchJiraMyself({ jiraRequest });
    } catch {
      myself = null;
    }
  }

  const results = [];
  for (const watched of capacityRows) {
    const base = {
      id: watched.id,
      displayName: watched.displayName,
      watchType: watched.watchType,
      capacity: Number(watched.capacity),
    };
    try {
      const jql = buildOpenCountJql(watched, myself);
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
