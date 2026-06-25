import { normalizePastDueLookbackYears } from "../../../shared/dashboardMetrics.mjs";
import { VALID_DUE_BY_FIELDS } from "./constants.mjs";

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
  };
};

export const validateDashboardRefreshInput = (input) => {
  if (input.epicPresetIds.length === 0 && !input.includePastDue) {
    return "Select at least one epic preset or Past Due Projects";
  }
  return null;
};
