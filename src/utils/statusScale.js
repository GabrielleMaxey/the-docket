// Status colors are a data encoding, not UI chrome — do not fold into a palette retint.

export const STATUS_TERMINAL = "#0c93d9";
export const STATUS_VERIFYING = "#2AEDE5";
export const STATUS_IN_PROGRESS = "#FB9429";
export const STATUS_ANALYZING = "#fdb95e";
export const STATUS_READY = "#FDD219";
export const STATUS_BACKLOG = "#b0b0b0";
export const STATUS_OTHER = "#d0d0d0";
export const STATUS_ALARM = "#F95E4A";

export const STATUS_FALLBACK_COLORS = [
  "#076ea4",
  "#0a8f92",
  "#c98a0c",
  "#cf6420",
  "#8a8a8a",
  "#1f7fc4",
  "#b8940a",
  "#545454",
];

// Every label variant seen across the pie, bar and metric-bar call sites.
// Keys are lowercased and trimmed before lookup.
export const STATUS_COLOR_MAP = {
  "resolved/closed/done": STATUS_TERMINAL,
  "resolved / closed / done": STATUS_TERMINAL,
  done: STATUS_TERMINAL,
  closed: STATUS_TERMINAL,
  resolved: STATUS_TERMINAL,
  "ready for verification": STATUS_VERIFYING,
  "in progress": STATUS_IN_PROGRESS,
  analyzing: STATUS_ANALYZING,
  "ready for work": STATUS_READY,
  backlog: STATUS_BACKLOG,
  other: STATUS_OTHER,
  "past due": STATUS_ALARM,
  "past due (of open)": STATUS_ALARM,
  "open tasks overdue": STATUS_ALARM,
};

const normalize = (label) => String(label || "").toLowerCase().trim();

// Charts: always return a colour, falling back to the rotation for unknowns.
export const getStatusColor = (label, fallbackIndex = 0) =>
  STATUS_COLOR_MAP[normalize(label)] ??
  STATUS_FALLBACK_COLORS[fallbackIndex % STATUS_FALLBACK_COLORS.length];

// Metric bars: return null for unknowns so the caller can skip tinting.
export const getMappedStatusColor = (label) =>
  STATUS_COLOR_MAP[normalize(label)] || null;
