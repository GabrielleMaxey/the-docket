import { buildDashboardMetricsJql, resolvePresetJql, splitTrailingOrderBy } from "./epicFilterJql.mjs";

export { GANTT_MAX_JQL, ganttSnapshotKey, parseGanttSlug } from "../../shared/ganttSlug.mjs";

/**
 * JQL + display name for a saved-filter or custom-JQL Gantt source.
 * Open-only status filters are stripped (as on the Metrics page) so finished work still shows on the plan.
 */
export const resolveGanttSourceJql = async ({ source, loadPreset, jiraRequest }) => {
  if (source?.kind === "preset") {
    const preset = loadPreset(source.presetId);
    if (!preset) return { error: "Preset not found" };
    const jql = buildDashboardMetricsJql(await resolvePresetJql({ preset, jiraRequest }));
    if (!splitTrailingOrderBy(jql).scope) return { error: "This preset has no query to run" };
    const displayName = String(preset.epicName || preset.label || preset.epicKey || `Preset ${source.presetId}`);
    return { jql, displayName };
  }
  if (source?.kind === "jql") {
    const { scope, orderBy } = splitTrailingOrderBy(source.jql);
    if (!scope) return { error: "Enter a JQL query" };
    return { jql: `${scope} ${orderBy || "ORDER BY updated DESC"}`, displayName: "Custom JQL" };
  }
  return { error: "Unsupported Gantt source" };
};
