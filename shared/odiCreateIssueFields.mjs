export const ODI_COMPONENT_OPTIONS = [];

export const ODI_VERTICAL_COMPONENT_OPTIONS = [];

// Offline fallback only. In ODI these are Components; live options come from Jira.
export const ODI_BUG_TRACKING_OPTIONS = [
  "BUG Tracking-Ansible",
  "BUG Tracking-Itential Platform",
  "BUG Tracking-Non Itential",
  "BUG Tracking-System & Application",
  "BUG Tracking-Workflow",
];

export const toCreateIssueDropdownOptions = (items) =>
  items.map((item) => ({
    key: item,
    text: item,
    value: item,
  }));
