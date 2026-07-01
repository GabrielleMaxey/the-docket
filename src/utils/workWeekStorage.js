export const WORK_WEEK_STORAGE_KEYS = {
  chatSessionArtifacts: "taskManagerChatSessionArtifacts",
  jiraPreferences: "workWeekTasksJiraPreferences",
  jiraNotes: "workWeekTasksJiraNotes",
  jiraRowPriorities: "workWeekTasksJiraRowPriorities",
  jqlRuns: "workWeekTasksJiraLastJqlRuns",
  drillDownRuns: "workWeekTasksJiraDrillDownRuns",
  reminders: "workWeekTasksReminders",
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
