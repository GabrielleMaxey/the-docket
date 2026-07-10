export const persistDashboardSnapshot = ({
  db,
  stmts,
  refreshedAt,
  input,
  rollup,
  allDueByIssues,
  epicMetrics,
  assigneeMetrics,
}) => {
  const persist = db.transaction(() => {
    stmts.deleteAllAssigneeMetricsStmt.run();
    stmts.deleteAllEpicMetricsStmt.run();
    stmts.deleteAllSnapshotsStmt.run();

    const snapshotResult = stmts.insertSnapshotStmt.run({
      refreshedAt,
      epicPresetIdsJson: JSON.stringify(input.epicPresetIds),
      includePastDue: input.includePastDue ? 1 : 0,
      extendedPastDueHistory: input.pastDueLookbackYears === 3 ? 1 : 0,
      pastDueLookbackYears: input.pastDueLookbackYears,
      dueByDate: input.dueByDate || null,
      dueByField: input.dueByField,
      dueByIssuesJson: JSON.stringify(allDueByIssues),
      assigneeNamesJson: JSON.stringify(input.assigneeNames),
      watchedAssigneeIdsJson: JSON.stringify(input.watchedAssigneeIds),
      overallIssuePercent: rollup.overallIssuePercent,
      overallEpicPercent: rollup.overallEpicPercent,
      overallOverduePercent: rollup.overallOverduePercent,
      statusCountsJson: JSON.stringify(rollup.statusCounts),
    });

    const snapshotId = snapshotResult.lastInsertRowid;

    for (const epic of epicMetrics) {
      stmts.insertEpicMetricStmt.run({
        snapshotId,
        epicPresetId: epic.epicPresetId,
        epicKey: epic.epicKey,
        epicName: epic.epicName,
        issuePercent: epic.issuePercent,
        epicPercent: epic.epicPercent,
        overduePercent: epic.overduePercent,
        totalIssues: epic.totalIssues,
        closedIssues: epic.completedIssues,
        openIssues: epic.openIssues,
        overdueOpenIssues: epic.overdueOpenIssues,
        dueByOpenIssues: epic.dueByOpenIssues ?? 0,
        initialDoneDate: epic.initialDoneDate,
        mostRecentDoneDate: epic.mostRecentDoneDate,
        projectEndDate: epic.projectEndDate,
        isPastDue: epic.isPastDue ? 1 : 0,
        pastDueReason: epic.pastDueReason,
        statusCountsJson: JSON.stringify(epic.statusCounts || {}),
        openStatusCountsJson: JSON.stringify(epic.openStatusCounts || {}),
        contributorMetricsJson: JSON.stringify(epic.contributorMetrics || []),
        epicBreakdownJson: JSON.stringify(epic.epicBreakdown || []),
      });
    }

    for (const assignee of assigneeMetrics) {
      stmts.insertAssigneeMetricStmt.run({
        snapshotId,
        queryName: assignee.queryName,
        resolvedDisplayName: assignee.resolvedDisplayName,
        resolvedAccountId: assignee.resolvedAccountId,
        overduePercent: assignee.overduePercent ?? 0,
        overdueOpenCount: assignee.overdueOpenCount,
        totalOpenCount: assignee.totalOpenCount,
        overdueIssueKeysJson: JSON.stringify(assignee.overdueIssueKeys || []),
        overdueIssuesJson: JSON.stringify(assignee.overdueIssues || []),
        upcomingDueIssuesJson: JSON.stringify(assignee.upcomingDueIssues || []),
        contributorMetricsJson: JSON.stringify(assignee.contributorMetrics || []),
        epicBreakdownJson: JSON.stringify(assignee.epicBreakdown || []),
        queryType: assignee.queryType || "person",
        jql: assignee.jql || "",
        workloadCountsJson: JSON.stringify(assignee.workloadCounts || {}),
        errorMessage: assignee.error || null,
      });
    }

    return snapshotId;
  });

  persist();
};
