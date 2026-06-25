import { mapEpicPresetRow } from "../../db/schema.mjs";
import { buildAssigneeMetricsForRefresh } from "./buildAssigneeMetrics.mjs";
import {
  buildEpicMetricsForRefresh,
  computeOverallRollup,
} from "./buildEpicMetrics.mjs";
import { buildDashboardRefreshContext } from "./buildRefreshContext.mjs";
import { collectDueByIssues } from "./collectDueByIssues.mjs";
import { persistDashboardSnapshot } from "./persistSnapshot.mjs";
import {
  parseDashboardRefreshInput,
  validateDashboardRefreshInput,
} from "./parseRefreshInput.mjs";

export const runDashboardRefresh = async ({
  body,
  readSettings,
  listFieldMappings,
  getEpicPreset,
  getWatchedAssignee,
  mapWatchedAssigneeRow,
  db,
  persistStmts,
  jiraRequest,
  runJiraSearchRequest,
}) => {
  const input = parseDashboardRefreshInput(body);
  const validationError = validateDashboardRefreshInput(input);
  if (validationError) {
    return { ok: false, status: 400, error: validationError };
  }

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

  const { epicMetrics, scopedChildIssues } = await buildEpicMetricsForRefresh({
    ctx,
    selectedPresets,
    jiraRequest,
    runJiraSearchRequest,
  });

  const rollup = computeOverallRollup(epicMetrics);
  const refreshedAt = new Date().toISOString();
  const allDueByIssues = collectDueByIssues(epicMetrics, ctx.dueByDate);

  const assigneeMetrics = await buildAssigneeMetricsForRefresh({
    assigneeNames: input.assigneeNames,
    watchedAssigneeIds: input.watchedAssigneeIds,
    scopedChildIssues,
    dueFieldId: ctx.dueFieldId,
    getWatchedAssignee,
    mapWatchedAssigneeRow,
    jiraRequest,
    runJiraSearchRequest,
  });

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
