import { getEffectiveDueDateForIssue } from "../utils/jiraIssueDoneDates.js";
import { formatDateOnly } from "../../shared/dashboardMetrics.mjs";

export const combinedRowKey = (instanceId, issueKey) => JSON.stringify([instanceId, issueKey]);

export const buildCombinedMetrics = (sites) => {
  const distinct = new Map();
  let entryCount = 0;
  for (const site of sites || []) {
    for (const issue of site.issues || []) {
      entryCount++;
      if (issue.combinedEligible === false) continue;
      const key = combinedRowKey(site.sourceContext?.siteHost || site.siteHost, issue.key);
      const dueDate = getEffectiveDueDateForIssue(issue, issue.sourceRun || site);
      const isOpen = issue.fields?.status?.statusCategory?.key !== "done";
      const isOverdue = isOpen && Boolean(dueDate && dueDate < formatDateOnly(new Date().toISOString()));
      const existing = distinct.get(key);
      // Different saved entries may have different date mappings; any overdue source remains visible.
      distinct.set(key, existing ? { ...existing, isOverdue: existing.isOverdue || isOverdue } : { ...issue, isOverdue });
    }
  }
  const issues = [...distinct.values()];
  const openIssues = issues.filter((issue) => issue.fields?.status?.statusCategory?.key !== "done");
  return {
    issues, entryCount, total: issues.length, open: openIssues.length,
    closed: issues.length - openIssues.length,
    overdue: openIssues.filter((issue) => issue.isOverdue).length,
    inProgress: openIssues.filter((issue) => issue.fields?.status?.statusCategory?.key === "indeterminate").length,
    incomplete: (sites || []).some((site) => site.status !== "complete" || !Array.isArray(site.issues) || site.hydrationError),
  };
};

export const COMBINED_STATE_FIELDS = [
  "selectedForPush", "pushState", "saveState", "rowUpdateState", "statusDrafts", "iddDrafts",
  "dueDateDrafts", "mrdDrafts", "startDateByKey", "completeDateByKey", "planningMetaByKey",
  "teamPlanningMetaByKey", "teamStartDateByKey", "teamCompleteDateByKey", "assigneeDrafts",
  "jiraRowPriorities", "jiraNotes", "noteImagesByKey", "noteImageErrorsByKey", "keepNoteImagesByKey",
  "noteImageKeepPendingByKey", "lastPushedJiraNoteByKey", "prioritySourceByKey",
];
const ROW_ACTIONS = [
  "handleSaveMetadata", "handleStatusDraftChange", "handleStatusUpdate", "handleIddDraftChange", "handleIddUpdate",
  "handleDueDateDraftChange", "handleDueDateUpdate", "handleMrdDraftChange", "handleMrdUpdate",
  "handleStartDateChange", "handleCompleteDateChange", "handleClearDateTracking", "handleTogglePlanningRow",
  "handleToggleRowExpand", "handleSavePlanningAll", "handlePlanningFieldChange", "handlePinnedGanttChange",
  "handleAssigneeDraftChange", "handleAssigneeUpdate", "handleRowPriorityChange", "handleNoteChange",
  "handleNoteImagesAdd", "handleNoteImageRemove", "handleKeepNoteImagesToggle", "handleSelectForPush", "handlePushNote",
];

export const buildCombinedTableModel = (sites, models) => {
  const adapter = Object.fromEntries(COMBINED_STATE_FIELDS.map((field) => [field, {}]));
  const rows = new Map();
  const issues = [];
  adapter.collapsedRowKeys = new Set();
  adapter.expandedPlanningKeys = new Set();
  for (const site of sites || []) {
    const model = models[site.instanceId];
    if (!model) continue;
    const sourceRun = model.jqlRuns[0];
    for (const issue of sourceRun?.issues || []) {
      const key = combinedRowKey(site.instanceId, issue.key);
      rows.set(key, { model, issue });
      issues.push({ ...issue, sourceContext: site.sourceContext, sourceRun, teamAvailable: model.teamAvailable });
      for (const field of COMBINED_STATE_FIELDS) adapter[field][key] = model[field]?.[issue.key];
      if (model.collapsedRowKeys.has(issue.key)) adapter.collapsedRowKeys.add(key);
      if (model.expandedPlanningKey === issue.key) adapter.expandedPlanningKeys.add(key);
    }
  }
  for (const action of ROW_ACTIONS) {
    adapter[action] = (key, ...args) => {
      const row = rows.get(key);
      return row?.model[action](row.issue.key, ...args);
    };
  }
  for (const action of ["handleSelectAll", "handlePushSelected"]) {
    adapter[action] = (selectedIssues, ...args) => Promise.all((sites || []).map((site) => {
      const selected = selectedIssues.filter((issue) => issue.sourceContext.instanceId === site.instanceId);
      return selected.length ? models[site.instanceId][action](selected, ...args) : undefined;
    }));
  }
  for (const action of ["handleExpandAllRows", "handleCollapseAllRows"]) {
    adapter[action] = (keys) => {
      for (const site of sites || []) {
        const selected = keys.map((key) => rows.get(key)).filter((row) => row?.model === models[site.instanceId]);
        if (selected.length) models[site.instanceId][action](selected.map((row) => row.issue.key));
      }
    };
  }
  const first = Object.values(models)[0];
  for (const field of ["isClosedLikeStatus", "clampPriority", "getPriorityClass", "getPriorityRowClass", "formatDate"]) adapter[field] = first?.[field];
  adapter.getIssueStateKey = (issue) => combinedRowKey(issue.sourceContext.instanceId, issue.key);
  adapter.combinedRun = { label: "Combined managed tasks", issues, total: issues.length, loaded: issues.length, loadComplete: true };
  return adapter;
};
