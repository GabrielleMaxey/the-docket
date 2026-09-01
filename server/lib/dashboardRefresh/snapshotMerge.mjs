const VALID_REFRESH_SCOPES = new Set(["all", "projects", "contributors"]);

export const normalizeRefreshScope = (value) => {
  const scope = String(value || "all").trim();
  return VALID_REFRESH_SCOPES.has(scope) ? scope : "all";
};

export const hasProjectRefreshScope = (input) =>
  input.epicPresetIds.length > 0;

export const hasContributorRefreshScope = (input) =>
  input.assigneeNames.length > 0 || input.watchedAssigneeIds.length > 0;

export const resolveRefreshTargets = (input) => {
  const scope = normalizeRefreshScope(input.refreshScope);
  const hasProjects = hasProjectRefreshScope(input);
  const hasContributors = hasContributorRefreshScope(input);

  if (scope === "projects") {
    return { scope, refreshProjects: true, refreshContributors: false };
  }
  if (scope === "contributors") {
    return { scope, refreshProjects: false, refreshContributors: true };
  }

  return {
    scope,
    refreshProjects: hasProjects,
    refreshContributors: hasContributors,
  };
};

export const emptyRollup = () => ({
  overallIssuePercent: 0,
  overallEpicPercent: 0,
  overallOverduePercent: 0,
  statusCounts: {},
});

export const snapshotEpicToPersist = (epic) => ({
  epicPresetId: epic.epicPresetId ?? null,
  epicKey: epic.epicKey,
  epicName: epic.epicName,
  issuePercent: epic.issuePercent,
  epicPercent: epic.epicPercent,
  overduePercent: epic.overduePercent,
  totalIssues: epic.totalIssues,
  completedIssues: epic.completedIssues,
  openIssues: epic.openIssues,
  overdueOpenIssues: epic.overdueOpenIssues,
  dueByOpenIssues: epic.dueByOpenIssues ?? 0,
  initialDoneDate: epic.initialDoneDate,
  mostRecentDoneDate: epic.mostRecentDoneDate,
  projectEndDate: epic.projectEndDate,
  isPastDue: epic.isPastDue,
  pastDueReason: epic.pastDueReason,
  statusCounts: epic.statusCounts || {},
  openStatusCounts: epic.openStatusCounts || {},
  contributorMetrics: epic.contributorMetrics || [],
  epicBreakdown: epic.epicBreakdown || [],
});

export const snapshotAssigneeToPersist = (assignee) => ({
  queryType: assignee.queryType || "person",
  jql: assignee.jql || "",
  queryName: assignee.queryName,
  resolvedDisplayName: assignee.resolvedDisplayName,
  resolvedAccountId: assignee.resolvedAccountId || "",
  overduePercent: assignee.overduePercent,
  overdueOpenCount: assignee.overdueOpenCount,
  totalOpenCount: assignee.totalOpenCount,
  overdueIssueKeys: assignee.overdueIssueKeys || [],
  overdueIssues: assignee.overdueIssues || [],
  upcomingDueIssues: assignee.upcomingDueIssues || [],
  contributorMetrics: assignee.contributorMetrics || [],
  epicBreakdown: assignee.epicBreakdown || [],
  workloadCounts: assignee.workloadCounts || {},
  error: assignee.error || null,
});

export const rollupFromSnapshot = (snapshot) => ({
  overallIssuePercent: Number(snapshot.overallIssuePercent || 0),
  overallEpicPercent: Number(snapshot.overallEpicPercent || 0),
  overallOverduePercent: Number(snapshot.overallOverduePercent || 0),
  statusCounts: snapshot.statusCounts || {},
});
