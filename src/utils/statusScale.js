// ── Status colour scale ──────────────────────────────────────────────────────
// This module is a DATA ENCODING, not UI chrome.
//
// Do not fold these values into the general neutral/brand palette, and do not
// include them in any find-and-replace pass that retints chrome colours.
// Sharing tokens between a data scale and UI chrome lets a chrome retint
// silently corrupt the encoding without breaking anything visibly.
//
// Structure: four families. Hue carries the family; lightness separates within
// it. Fills are saturated so a status is legible at a glance in a pie wedge,
// bar, or dot without consulting a legend.
//
//   Terminal   Brand blue → teal    work that has landed or is landing
//   In flight  Brand warm ramp      work actively moving
//   Inert      true neutral         work not moving, deliberately drained
//   Alarm      Brand coral          reserved; the only colour that means "act"
//
// Priority (src/Pages/priorityScale.css) is a separate encoding on its own
// ramp. The two share hues but sit in different registers: priority renders as
// pale row washes (92–96% L), status as saturated marks (55–75% L).
//
// Previously duplicated across StatusPieChart.jsx and MetricBar.jsx; both now
// import from here so the two can no longer drift.

export const STATUS_TERMINAL = "#0c93d9";
export const STATUS_VERIFYING = "#2AEDE5";
export const STATUS_IN_PROGRESS = "#FB9429";
export const STATUS_ANALYZING = "#fdb95e";
export const STATUS_READY = "#FDD219";
export const STATUS_BACKLOG = "#b0b0b0";
export const STATUS_OTHER = "#d0d0d0";
export const STATUS_ALARM = "#F95E4A";

// Fallback rotation for status labels not in the map below. Brand-derived and
// chosen to stay distinguishable from the mapped values above.
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
