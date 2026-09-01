import { normalizePastDueLookbackYears } from "../../../shared/dashboardMetrics.mjs";
import { VALID_DUE_BY_FIELDS } from "./constants.mjs";
import {
  hasContributorRefreshScope,
  hasProjectRefreshScope,
  normalizeRefreshScope,
} from "./snapshotMerge.mjs";

export const parseDashboardRefreshInput = (body) => {
  const epicPresetIds = Array.isArray(body?.epicPresetIds)
    ? body.epicPresetIds.map((value) => Number(value)).filter((value) => value > 0)
    : [];
  const includePastDue = Boolean(body?.includePastDue);
  const pastDueLookbackYears = normalizePastDueLookbackYears(body?.pastDueLookbackYears);
  const dueByDate = (() => {
    const raw = String(body?.dueByDate || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  })();
  const dueByField = VALID_DUE_BY_FIELDS.has(body?.dueByField)
    ? body.dueByField
    : "most_recent_done_date";
  const assigneeNames = Array.isArray(body?.assigneeNames)
    ? body.assigneeNames.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const watchedAssigneeIds = Array.isArray(body?.watchedAssigneeIds)
    ? body.watchedAssigneeIds.map((value) => Number(value)).filter((value) => value > 0)
    : [];

  return {
    epicPresetIds,
    includePastDue,
    pastDueLookbackYears,
    dueByDate,
    dueByField,
    assigneeNames,
    watchedAssigneeIds,
    refreshScope: normalizeRefreshScope(body?.refreshScope),
  };
};

export const validateDashboardRefreshInput = (input) => {
  const hasProjects = hasProjectRefreshScope(input);
  const hasContributors = hasContributorRefreshScope(input);
  const scope = normalizeRefreshScope(input.refreshScope);

  if (scope === "projects") {
    if (!hasProjects) {
      return "Select at least one saved project preset";
    }
    return null;
  }

  if (scope === "contributors") {
    if (!hasContributors) {
      return "Select at least one person or custom query to refresh contributor metrics";
    }
    return null;
  }

  if (!hasProjects && !hasContributors) {
    return "Select at least one saved project preset or contributor to track";
  }

  return null;
};
