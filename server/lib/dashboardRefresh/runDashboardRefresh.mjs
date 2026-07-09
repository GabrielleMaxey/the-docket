import { mapEpicPresetRow } from "../../db/schema.mjs";
import { buildAssigneeMetricsForRefresh } from "./buildAssigneeMetrics.mjs";
import {
  buildEpicMetricsForRefresh,
  computeOverallRollup,
} from "./buildEpicMetrics.mjs";
import { buildDashboardRefreshContext } from "./buildRefreshContext.mjs";
import { collectDueByIssues } from "./collectDueByIssues.mjs";
import { loadLatestDashboardSnapshot } from "./loadSnapshot.mjs";
import { persistDashboardSnapshot } from "./persistSnapshot.mjs";
import {
  parseDashboardRefreshInput,
  validateDashboardRefreshInput,
} from "./parseRefreshInput.mjs";
import {
  emptyRollup,
  resolveRefreshTargets,
  rollupFromSnapshot,
  snapshotAssigneeToPersist,
  snapshotEpicToPersist,
} from "./snapshotMerge.mjs";
import { createLogger } from "../../lib/logger.mjs";

const log = createLogger("dashboard");

export const runDashboardRefresh = async ({
  body,
  readSettings,
  listFieldMappings,
  getEpicPreset,
  getWatchedAssignee,
  mapWatchedAssigneeRow,
  db,
  persistStmts,
  snapshotStmts,
  jiraRequest,
  runJiraSearchRequest,
}) => {
  const input = parseDashboardRefreshInput(body);
  const validationError = validateDashboardRefreshInput(input);
  if (validationError) {
    return { ok: false, status: 400, error: validationError };
  }

  const { refreshProjects, refreshContributors } = resolveRefreshTargets(input);
  const previousSnapshot = loadLatestDashboardSnapshot(db, snapshotStmts);

  const settings = readSettings();
  const ctx = buildDashboardRefreshContext({
    settings,
    fieldMappingRows: listFieldMappings(),
    input,
  });

  const selectedPresets = input.epicPresetIds
    .map((id) => getEpicPreset(id))
    .filter(Boolean)
    .map(mapEpicPresetRow);

  let epicMetrics = [];
  let rollup = emptyRollup();
  let allDueByIssues = [];

  if (refreshProjects) {
    const presetQueryTypes = selectedPresets.map((preset) => preset.presetType || "epic");
    const queryTypes = Array.from(
      new Set([
        ...presetQueryTypes,
        ...(ctx.includePastDue ? ["past_due"] : []),
      ])
    );
    log.info(`dashboard query types: ${queryTypes.length > 0 ? queryTypes.join(", ") : "none"}`);

    const { epicMetrics: refreshedEpics } = await buildEpicMetricsForRefresh({
      ctx,
      selectedPresets,
      jiraRequest,
      runJiraSearchRequest,
    });
    epicMetrics = refreshedEpics;
    rollup = computeOverallRollup(epicMetrics);
    allDueByIssues = collectDueByIssues(epicMetrics, ctx.dueByDate);
  } else if (previousSnapshot) {
    epicMetrics = (previousSnapshot.epics || []).map(snapshotEpicToPersist);
    rollup = rollupFromSnapshot(previousSnapshot);
    allDueByIssues = previousSnapshot.dueByIssues || [];
  }

  let assigneeMetrics = [];

  if (refreshContributors) {
    const watchedQueryTypes = input.watchedAssigneeIds
      .map((id) => getWatchedAssignee(id))
      .filter(Boolean)
      .map(mapWatchedAssigneeRow)
      .map((watched) => (watched.watchType === "jql" ? "jql" : "person"));
    const contributorQueryTypes = [
      ...(input.assigneeNames.length > 0 ? ["person"] : []),
      ...watchedQueryTypes,
    ];
    log.info(
      `dashboard contributor query types: ${
        contributorQueryTypes.length > 0 ? contributorQueryTypes.join(", ") : "none"
      }`
    );

    assigneeMetrics = await buildAssigneeMetricsForRefresh({
      assigneeNames: input.assigneeNames,
      watchedAssigneeIds: input.watchedAssigneeIds,
      dueFieldId: ctx.dueFieldId,
      overdueFieldIds: ctx.overdueFieldIds,
      dueByDate: ctx.dueByDate,
      dueByOptions: ctx.dueByOptions,
      mappingsByRole: ctx.mappingsByRole,
      getWatchedAssignee,
      mapWatchedAssigneeRow,
      jiraRequest,
      runJiraSearchRequest,
    });
  } else if (previousSnapshot) {
    assigneeMetrics = (previousSnapshot.assignees || []).map(snapshotAssigneeToPersist);
  }

  const refreshedAt = new Date().toISOString();

  persistDashboardSnapshot({
    db,
    stmts: persistStmts,
    refreshedAt,
    input,
    rollup,
    allDueByIssues,
    epicMetrics,
    assigneeMetrics,
  });

  return { ok: true };
};
