import { buildFieldMappingsMap } from "../epicFilterJql.mjs";
import { resolveMappedFieldId } from "../../../shared/odiFieldIds.mjs";
import {
  computePastDueFloorDate,
  normalizePastDueLookbackYears,
} from "../../../shared/dashboardMetrics.mjs";
import { EPIC_PAST_DUE_MODES } from "./constants.mjs";
import { resolveCandidateFieldIds } from "./dueByHelpers.mjs";

const resolveDueByCompareFieldId = (dueByField, iddFieldId, mrdFieldId, dueFieldId) => {
  if (dueByField === "initial_done_date") {
    return iddFieldId;
  }
  if (dueByField === "most_recent_done_date") {
    return mrdFieldId;
  }
  if (dueByField === "due_date") {
    return dueFieldId;
  }
  return dueFieldId;
};

export const buildDashboardRefreshContext = ({
  settings,
  fieldMappingRows,
  input,
}) => {
  const epicPastDueMode = EPIC_PAST_DUE_MODES.has(settings.epic_past_due_mode)
    ? settings.epic_past_due_mode
    : "either";
  const mappingsByRole = buildFieldMappingsMap(fieldMappingRows);
  const dueFieldId = mappingsByRole.get("due_date")?.fieldId || "duedate";
  const iddFieldId = resolveMappedFieldId(mappingsByRole, "initial_done_date");
  const mrdFieldId = resolveMappedFieldId(mappingsByRole, "most_recent_done_date");
  const pedFieldId = mappingsByRole.get("project_end_date")?.fieldId;
  const candidateFieldIds = resolveCandidateFieldIds(input.dueByField, {
    dueFieldId,
    mrdFieldId,
    iddFieldId,
    pedFieldId,
  });
  const dueByCompareFieldId = resolveDueByCompareFieldId(
    input.dueByField,
    iddFieldId,
    mrdFieldId,
    dueFieldId
  );
  const pastDueLookbackYears = normalizePastDueLookbackYears(input.pastDueLookbackYears);
  const pastDueFloor = input.includePastDue
    ? computePastDueFloorDate(pastDueLookbackYears)
    : null;

  return {
    epicPastDueMode,
    mappingsByRole,
    dueFieldId,
    iddFieldId,
    mrdFieldId,
    pedFieldId,
    overdueFieldIds: [mrdFieldId, iddFieldId].filter(Boolean),
    candidateFieldIds,
    dueByDate: input.dueByDate,
    dueByField: input.dueByField,
    includePastDue: input.includePastDue,
    pastDueLookbackYears,
    pastDueFloor,
    dueByCompareFieldId,
    dueByOptions: input.dueByDate
      ? {
          dueByCompareFieldId,
          // When comparing by MRD or IDD, the fallback is the same field —
          // standard task duedate should NOT override the user's chosen compare
          // field (a task's old duedate would incorrectly resolve as past-due
          // even when the epic's MRD/IDD is in the future).
          dueByFallbackFieldId: input.dueByField === "due_date" ? dueFieldId : dueByCompareFieldId,
          preferEpicCompareForChildren:
            input.dueByField === "most_recent_done_date" ||
            input.dueByField === "initial_done_date",
          includePastDueInList: input.includePastDue,
          pastDueFloor,
        }
      : null,
  };
};
