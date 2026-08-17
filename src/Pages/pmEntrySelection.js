export const isReporterWatchJql = (jql) => /(^|[\s(])reporter\s*=/.test(String(jql || ""));

export const watchTypeLabel = (watchType, jql) => {
  if (watchType !== "jql") return "Person";
  return isReporterWatchJql(jql) ? "Reporter" : "Custom query";
};

export const sameIdList = (left, right) =>
  Array.isArray(left) &&
  Array.isArray(right) &&
  left.length === right.length &&
  left.every((id, index) => id === right[index]);

// knownIds === null is first run: empty selection stays empty; otherwise treat selected ids as known so new Settings entries get selected.
export const reconcileSelectedEntryIds = ({ currentIds, selectedIds, knownIds }) => {
  const current = Array.isArray(currentIds) ? currentIds : [];
  if (selectedIds === null) {
    return { selectedIds: current, knownIds: current };
  }

  const selected = Array.isArray(selectedIds) ? selectedIds : [];
  const currentSet = new Set(current);
  const known = Array.isArray(knownIds) ? knownIds : selected.length === 0 ? current : selected;
  const knownSet = new Set(known);
  const added = current.filter((id) => !knownSet.has(id));
  return {
    selectedIds: [...selected.filter((id) => currentSet.has(id)), ...added],
    knownIds: current,
  };
};
