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

  const presetQueryTypes = selectedPresets.map((preset) => preset.presetType || "epic");
  const watchedQueryTypes = input.watchedAssigneeIds
    .map((id) => getWatchedAssignee(id))
    .filter(Boolean)
    .map(mapWatchedAssigneeRow)
    .map((watched) => (watched.watchType === "jql" ? "jql" : "person"));
  const contributorQueryTypes = [
    ...(input.assigneeNames.length > 0 ? ["person"] : []),
    ...watchedQueryTypes,
  ];
  const queryTypes = Array.from(new Set([
    ...presetQueryTypes,
    ...(ctx.includePastDue ? ["past_due"] : []),
    ...contributorQueryTypes,
  ]));
  log.info(`dashboard query types: ${queryTypes.length > 0 ? queryTypes.join(", ") : "none"}`);

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
