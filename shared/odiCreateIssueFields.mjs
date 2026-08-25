export const ODI_COMPONENT_OPTIONS = [];

export const ODI_VERTICAL_COMPONENT_OPTIONS = [];

export const ODI_BUG_TRACKING_OPTIONS = [
  "BUG Tracking-Itential Platform",
  "BUG Tracking-Non Itential",
  "BUG Tracking-System & Application",
];

export const toCreateIssueDropdownOptions = (items) =>
  items.map((item) => ({
    key: item,
    text: item,
    value: item,
  }));
