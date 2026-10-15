export const IMPORT_FIELDS = ["priority", "note", "followUp", "requestor", "plannedStart", "plannedFinish", "startDate", "openDecisionNote"];
export const METADATA_COLUMNS = {
  priority: "priority", followUp: "follow_up", note: "note", requestor: "requestor",
  openDecisionNote: "open_decision_note", pmOverride: "pm_override",
  hasOpenDecision: "has_open_decision", pinnedGantt: "pinned_gantt",
  startDate: "start_date", completeDate: "complete_date",
  plannedStart: "planned_start", plannedFinish: "planned_finish",
};
export const METADATA_DATE_FIELDS = ["startDate", "completeDate", "plannedStart", "plannedFinish"];
export const FOLLOW_UP_OPTIONS = [{ value: "now", label: "Now" }, { value: "next", label: "Next" }];

export const validateMetadataPatch = (input, { importOnly = false } = {}) => {
  const patch = {};
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { patch, errors: ["A metadata patch is required"] };
  }
  for (const [field, raw] of Object.entries(input)) {
    let value = raw;
    if (!Object.hasOwn(METADATA_COLUMNS, field) || (importOnly && !IMPORT_FIELDS.includes(field))) {
      errors.push(`Unsupported metadata field: ${field}`);
      continue;
    }
    if (METADATA_DATE_FIELDS.includes(field)) {
      value = raw === "" ? null : raw;
      if (value !== null && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === "0000" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) {
        errors.push(`${field} must be YYYY-MM-DD (valid calendar date)`);
        continue;
      }
    } else if (field === "followUp") {
      value = typeof raw === "string" ? raw.trim().toLowerCase() : raw;
      if (value !== null && !FOLLOW_UP_OPTIONS.some((option) => option.value === value)) {
        errors.push("followUp must be now, next or null");
        continue;
      }
    } else if (["hasOpenDecision", "pinnedGantt"].includes(field)) {
      if (typeof value !== "boolean") { errors.push(`${field} must be a boolean`); continue; }
    } else if (field === "priority") {
      if (!Number.isInteger(value) || value < 0 || value > 20) { errors.push("priority must be an integer from 0 to 20"); continue; }
    } else if (typeof value !== "string") {
      errors.push(`${field} must be text`);
      continue;
    }
    patch[field] = value;
  }
  if (patch.plannedStart && patch.plannedFinish && patch.plannedStart > patch.plannedFinish) errors.push("plannedStart must be on or before plannedFinish");
  return { patch, errors };
};
