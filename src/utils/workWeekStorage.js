export const WORK_WEEK_STORAGE_KEYS = {
  chatSessionArtifacts: "taskManagerChatSessionArtifacts",
  jiraPreferences: "workWeekTasksJiraPreferences",
  jiraNotes: "workWeekTasksJiraNotes",
  jiraRowPriorities: "workWeekTasksJiraRowPriorities",
  jqlRuns: "workWeekTasksJiraLastJqlRuns",
  drillDownRuns: "workWeekTasksJiraDrillDownRuns",
  dismissedDrillDownIds: "workWeekTasksJiraDismissedDrillDownIds",
  reminders: "workWeekTasksReminders",
  generatedSharedProgramJqlBySlot: "workWeekTasksGeneratedSharedProgramJqlBySlot",
  activeRunIndex: "workWeekTasksActiveRunIndex",
  planningMetaByKey: "workWeekTasksPlanningMetaByKey",
};

export const MAX_JQL_SLOTS = 5;
export const DEFAULT_JQL_COUNT = 1;
export const DEFAULT_JQLS = [
  "assignee = currentUser() ORDER BY updated DESC",
  "",
  "",
  "",
  "",
];
export const DEFAULT_JQL_LABELS = ["My Work", "In Progress", "Blocked", "", ""];
export const DEFAULT_JQL_SHARED_PROGRAM_IDS = ["", "", "", "", ""];

export const normalizeJqlCount = (value) => {
  const count = Number(value);
  return Math.min(
    MAX_JQL_SLOTS,
    Math.max(1, Number.isFinite(count) ? count : DEFAULT_JQL_COUNT)
  );
};

export const normalizeJqlSlotValues = (value, fallback) => {
  const source = Array.isArray(value) ? value : fallback;
  return Array.from({ length: MAX_JQL_SLOTS }, (_, index) => {
    const item = source?.[index];
    return item == null ? String(fallback?.[index] || "") : String(item);
  });
};

export const isConfiguredJqlSlot = (jqlInputs, jqlLabels, index) => {
  const jql = String(jqlInputs?.[index] || "").trim();
  const label = String(jqlLabels?.[index] || "").trim();
  return jql.length > 0 && label.length > 0;
};

export const getConfiguredJqlSlotIndexes = (jqlInputs, jqlLabels) => {
  const indexes = [];
  for (let i = 0; i < MAX_JQL_SLOTS; i++) {
    if (isConfiguredJqlSlot(jqlInputs, jqlLabels, i)) {
      indexes.push(i);
    }
  }
  return indexes;
};

/** Configured slots plus one trailing row for adding the next query. */
export const getJqlSlotEditorIndexes = (jqlInputs, jqlLabels) => {
  const configured = getConfiguredJqlSlotIndexes(jqlInputs, jqlLabels);
  if (configured.length >= MAX_JQL_SLOTS) {
    return configured;
  }

  const trailingEmpty = Array.from({ length: MAX_JQL_SLOTS }, (_, i) => i).find(
    (i) => !isConfiguredJqlSlot(jqlInputs, jqlLabels, i)
  );

  if (trailingEmpty === undefined) {
    return configured.length > 0 ? configured : [0];
  }

  if (configured.includes(trailingEmpty)) {
    return configured;
  }

  return [...configured, trailingEmpty];
};

export const buildSharedProgramJql = (epicRoots) => {
  const keys = [
    ...new Set(
      (Array.isArray(epicRoots) ? epicRoots : [])
        .map((key) => String(key || "").trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
  if (keys.length === 0) {
    return "";
  }
  const list = keys.join(", ");
  return `(parent in (${list}) OR key in (${list})) ORDER BY updated DESC`;
};

// Include direct-child keys because subtasks are not direct Epic children.
export const buildSharedProgramJqlWithDescendants = (epicRoots, directChildKeys = []) => {
  const roots = [
    ...new Set(
      (Array.isArray(epicRoots) ? epicRoots : [])
        .map((key) => String(key || "").trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
  if (roots.length === 0) {
    return "";
  }
  const rootList = roots.join(", ");
  const clauses = [`parent in (${rootList})`, `key in (${rootList})`];

  const childKeys = [
    ...new Set(
      (Array.isArray(directChildKeys) ? directChildKeys : [])
        .map((key) => String(key || "").trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
  if (childKeys.length > 0) {
    clauses.push(`parent in (${childKeys.join(", ")})`);
  }

  return `(${clauses.join(" OR ")}) ORDER BY updated DESC`;
};

export const shouldReplaceSlotQueryForSharedProgram = ({
  jql,
  label,
  index,
  previousGeneratedJql = "",
  previousLabel = "",
}) => {
  const currentJql = String(jql || "").trim();
  const currentLabel = String(label || "").trim();
  const defaultJql = String(DEFAULT_JQLS[index] || "").trim();
  const defaultLabel = String(DEFAULT_JQL_LABELS[index] || "").trim();
  const prevJql = String(previousGeneratedJql || "").trim();
  const prevLabel = String(previousLabel || "").trim();

  const replaceJql = Boolean(
    !currentJql || currentJql === defaultJql || (prevJql && currentJql === prevJql)
  );
  const replaceLabel = Boolean(
    !currentLabel || currentLabel === defaultLabel || (prevLabel && currentLabel === prevLabel)
  );

  return { replaceJql, replaceLabel };
};

export const isConfiguredJqlRun = (run) => {
  if (run?.isDrillDown || run?.isPendingDrillDown) {
    return true;
  }

  const jql = String(run?.jql || "").trim();
  const label = String(run?.label || "").trim();
  return jql.length > 0 && label.length > 0;
};
