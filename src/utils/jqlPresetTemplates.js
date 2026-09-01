export const JQL_PRESET_TEMPLATES = [
  {
    key: "my-open-work",
    label: "My Open Work",
    description: "Current user, unresolved, highest priority first.",
    jql: "assignee = currentUser() AND resolution = Unresolved ORDER BY priority DESC, updated DESC",
  },
  {
    key: "my-overdue-work",
    label: "My Overdue Work",
    description: "Current user and due date already passed.",
    jql: "assignee = currentUser() AND resolution = Unresolved AND due <= endOfDay() ORDER BY due ASC, priority DESC",
  },
  {
    key: "unassigned-high-priority",
    label: "Unassigned High Priority",
    description: "Unassigned issues with high or highest priority.",
    jql: "assignee is EMPTY AND resolution = Unresolved AND priority in (Highest, High) ORDER BY priority DESC, created DESC",
  },
  {
    key: "recently-updated",
    label: "Recently Updated (7 days)",
    description: "Everything updated in the last week.",
    jql: "updated >= -7d ORDER BY updated DESC",
  },
  {
    key: "blocked-or-on-hold",
    label: "Blocked or On Hold",
    description: "Potentially blocked work across the board.",
    jql: "statusCategory != Done AND status in (Blocked, \"On Hold\") ORDER BY updated DESC",
  },
];

export const getJqlPresetTemplateByKey = (key) =>
  JQL_PRESET_TEMPLATES.find((template) => template.key === String(key || "").trim()) || null;
