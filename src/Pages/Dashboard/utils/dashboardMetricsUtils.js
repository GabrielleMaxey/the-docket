import {
  isClosedLikeStatus as isClosedLikeStatusName,
  getTerminalIssueCount,
} from "../../../../shared/dashboardMetrics.mjs";

export const TERMINAL_STATUS_LABEL = "Resolved/Closed/Done";

export const sameNumberSet = (left, right) => {
  const a = [...left].map(Number).sort((x, y) => x - y);
  const b = [...right].map(Number).sort((x, y) => x - y);
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
};

export const sameStringSet = (left, right) => {
  const a = [...left].map((value) => String(value).trim().toLowerCase()).sort();
  const b = [...right].map((value) => String(value).trim().toLowerCase()).sort();
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
};

export const getDueBrowseUrl = (issue, jiraBaseUrl) => {
  if (issue.self) {
    try {
      const parsed = new URL(issue.self);
      return `${parsed.protocol}//${parsed.host}/browse/${encodeURIComponent(issue.key)}`;
    } catch {
      // fall through
    }
  }
  if (jiraBaseUrl && issue.key) {
    return `${jiraBaseUrl}/browse/${encodeURIComponent(issue.key)}`;
  }
  return null;
};

export const formatIssueTypeLabel = (issueType) => {
  const normalized = String(issueType || "").trim();
  if (!normalized) {
    return "Issue";
  }
  return normalized;
};

export const pastDueBadgeLabel = (reason) => {
  if (reason === "mrd") {
    return "Past due (MRDD)";
  }
  if (reason === "idd") {
    return "Past due (Initial Done Date)";
  }
  if (reason === "project_end") {
    return "Past due (Project End)";
  }
  return "Past due";
};

export const buildEpicPieStatusCounts = (epic) => {
  const pie = {};
  const openCounts =
    epic?.openStatusCounts && Object.keys(epic.openStatusCounts).length > 0
      ? epic.openStatusCounts
      : Object.fromEntries(
          Object.entries(epic?.statusCounts || {}).filter(
            ([status]) => !isClosedLikeStatusName(status)
          )
        );

  for (const [status, count] of Object.entries(openCounts)) {
    const value = Number(count) || 0;
    if (value > 0) {
      pie[status] = value;
    }
  }

  const terminal = getTerminalIssueCount(epic || {});
  if (terminal > 0) {
    pie[TERMINAL_STATUS_LABEL] = terminal;
  }

  return pie;
};

export const collapseTerminalStatusCounts = (statusCounts) => {
  const collapsed = {};
  let terminal = 0;

  for (const [status, count] of Object.entries(statusCounts || {})) {
    const value = Number(count) || 0;
    if (value <= 0) continue;
    if (isClosedLikeStatusName(status)) {
      terminal += value;
    } else {
      collapsed[status] = (collapsed[status] || 0) + value;
    }
  }

  if (terminal > 0) {
    collapsed[TERMINAL_STATUS_LABEL] = terminal;
  }

  return collapsed;
};

export const getOpenStatusCounts = (source) => {
  if (source?.openStatusCounts && Object.keys(source.openStatusCounts).length > 0) {
    return source.openStatusCounts;
  }

  return Object.fromEntries(
    Object.entries(source?.statusCounts || {}).filter(([status]) => !isClosedLikeStatusName(status))
  );
};

export const sumStatusCount = (statusCounts, ...targets) => {
  const normalizedTargets = new Set(targets.map((target) => String(target).trim().toLowerCase()));
  let sum = 0;

  for (const [status, count] of Object.entries(statusCounts || {})) {
    if (normalizedTargets.has(String(status).trim().toLowerCase())) {
      sum += Number(count) || 0;
    }
  }

  return sum;
};

export const getWorkloadStatusCounts = (source) => {
  const openCounts = getOpenStatusCounts(source);

  return {
    inProgress: sumStatusCount(openCounts, "in progress"),
    readyForVerification: sumStatusCount(openCounts, "ready for verification"),
  };
};

export const sumEpicMetrics = (epics) => {
  const statusCounts = {};
  const openStatusCounts = {};
  let totalIssues = 0;
  let resolvedIssues = 0;
  let openIssues = 0;
  let inProgress = 0;
  let readyForVerification = 0;

  for (const epic of epics) {
    totalIssues += Number(epic.totalIssues || 0);
    openIssues += Number(epic.openIssues || 0);
    resolvedIssues += getTerminalIssueCount(epic);

    const workloadStatuses = getWorkloadStatusCounts(epic);
    inProgress += workloadStatuses.inProgress;
    readyForVerification += workloadStatuses.readyForVerification;

    for (const [status, count] of Object.entries(epic.statusCounts || {})) {
      statusCounts[status] = (statusCounts[status] || 0) + Number(count || 0);
    }

    for (const [status, count] of Object.entries(epic.openStatusCounts || {})) {
      openStatusCounts[status] = (openStatusCounts[status] || 0) + Number(count || 0);
    }
  }

  return {
    statusCounts,
    openStatusCounts,
    totalIssues,
    resolvedIssues,
    openIssues,
    inProgress,
    readyForVerification,
  };
};

export const workloadCountsToPieData = (counts) => {
  const data = {
    "Past Due": Number(counts?.pastDue || 0),
    "In Progress": Number(counts?.inProgress || 0),
    Backlog: Number(counts?.backlog || 0),
    "Ready for Verification": Number(counts?.readyForVerification || 0),
    "Ready for Work": Number(counts?.readyForWork || 0),
    Analyzing: Number(counts?.analyzing || 0),
  };

  const resolved =
    Number(counts?.totalResolved) ||
    Math.max(0, Number(counts?.totalIssues) - Number(counts?.totalAssigned));
  if (resolved > 0) {
    data[TERMINAL_STATUS_LABEL] = resolved;
  }

  const other = Number(counts?.other || 0);
  if (other > 0) {
    data.Other = other;
  }

  return data;
};

export const getWeekLabel = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00");
  const daysToMonday = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysToMonday);
  return `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
};

export const getMonthLabel = (dateStr) =>
  new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

export const UPCOMING_DUE_PRESET_OFF = "off";
export const UPCOMING_DUE_PRESET_CUSTOM = "custom";

export const DEFAULT_DASHBOARD_DUE_LOOKAHEAD_DAYS = 180;

export const UPCOMING_DUE_DATE_PRESETS = [
  { id: "7d", days: 7, label: "Next 7 days" },
  { id: "14d", days: 14, label: "Next 2 weeks" },
  { id: "30d", days: 30, label: "Next 30 days" },
  { id: "90d", days: 90, label: "Next 90 days" },
  { id: "6m", days: DEFAULT_DASHBOARD_DUE_LOOKAHEAD_DAYS, label: "Next 6 months" },
  { id: "1y", days: 365, label: "Next year" },
];

export const defaultDashboardDueByDate = () =>
  addDaysFromToday(DEFAULT_DASHBOARD_DUE_LOOKAHEAD_DAYS);

const DASHBOARD_REFRESH_SCOPES = new Set(["all", "projects", "contributors"]);

export const resolveEffectiveRefreshScope = ({
  hasEpicScope,
  hasContributorScope,
  requestedScope = "all",
}) => {
  const scope = DASHBOARD_REFRESH_SCOPES.has(requestedScope) ? requestedScope : "all";

  if (scope === "projects" || scope === "contributors") {
    return scope;
  }

  if (hasEpicScope && hasContributorScope) {
    return "all";
  }
  if (hasEpicScope) {
    return "projects";
  }
  if (hasContributorScope) {
    return "contributors";
  }

  return "all";
};

export const getDashboardRefreshStatusHint = ({ hasEpicScope, hasContributorScope }) => {
  const scope = resolveEffectiveRefreshScope({ hasEpicScope, hasContributorScope });

  if (!hasEpicScope && !hasContributorScope) {
    return "Select at least one project preset, Past Due Projects, or contributor to track.";
  }
  if (scope === "contributors") {
    return "Pulls workload and overdue metrics for selected people and custom queries from Jira.";
  }
  if (scope === "projects") {
    return "Pulls project resolution, workload, and due-date metrics from Jira.";
  }

  return "Pulls current resolution, workload, and overdue metrics from Jira for all selected filters.";
};

const DASHBOARD_REFRESH_TIMEOUT_MINUTES = 3;

export const getDashboardRefreshTimeoutMs = (_scope = "all") =>
  DASHBOARD_REFRESH_TIMEOUT_MINUTES * 60 * 1000;

export const getDashboardRefreshTimeoutLabel = (_scope = "all") =>
  `${DASHBOARD_REFRESH_TIMEOUT_MINUTES} min`;

export const buildDashboardRefreshTimeoutMessage = (scope = "all") =>
  `Refresh timed out after ${getDashboardRefreshTimeoutLabel(scope)}. Narrow your selection, click Cancel, and try again.`;

export const getDashboardRefreshLoadingHint = (scope = "all") =>
  `Still loading from Jira — times out after ${getDashboardRefreshTimeoutLabel(scope)}.`;

export const formatDateInputValue = (date) => {
  const value = date instanceof Date ? date : new Date(date);
  return value.toISOString().slice(0, 10);
};

export const addDaysFromToday = (days) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return formatDateInputValue(date);
};

export const inferUpcomingDuePreset = (dueByDate) => {
  if (!dueByDate) {
    return UPCOMING_DUE_PRESET_OFF;
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const target = new Date(`${dueByDate}T12:00:00`);
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  const match = UPCOMING_DUE_DATE_PRESETS.find((preset) => preset.days === diffDays);
  return match ? match.id : UPCOMING_DUE_PRESET_CUSTOM;
};

export const upcomingDueDateForPreset = (presetId) => {
  const preset = UPCOMING_DUE_DATE_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    return "";
  }

  return addDaysFromToday(preset.days);
};

export const DEFAULT_DASHBOARD_VISIBLE_SECTIONS = {
  overall: true,
  epicMetrics: true,
  dueByUpcoming: true,
  dueByPastDue: true,
  overdue: true,
  report: true,
};

export const normalizeVisibleSections = (parsed, defaultValue = DEFAULT_DASHBOARD_VISIBLE_SECTIONS) => {
  const merged = { ...defaultValue, ...(parsed && typeof parsed === "object" ? parsed : {}) };

  if (
    parsed &&
    typeof parsed === "object" &&
    parsed.dueBy != null &&
    parsed.dueByUpcoming == null &&
    parsed.dueByPastDue == null
  ) {
    merged.dueByUpcoming = Boolean(parsed.dueBy);
    merged.dueByPastDue = Boolean(parsed.dueBy);
  }

  delete merged.dueBy;
  return merged;
};

export const splitDueByIssues = (issues) => {
  const pastDue = [];
  const upcoming = [];

  for (const issue of issues || []) {
    if (issue?.isOverdue) {
      pastDue.push(issue);
    } else {
      upcoming.push(issue);
    }
  }

  return { pastDue, upcoming };
};

export const formatDueByCountsLabel = (issues) => {
  const { pastDue, upcoming } = splitDueByIssues(issues);
  const parts = [];

  if (pastDue.length > 0) {
    parts.push(`${pastDue.length} past due`);
  }
  if (upcoming.length > 0) {
    parts.push(`${upcoming.length} upcoming`);
  }

  return parts.join(" · ");
};

export const buildPeriodSummary = (issues, dueByDate) => {
  if (!dueByDate || !issues.length) {
    return { pastDueCount: 0, upcoming: [] };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(dueByDate + "T23:59:59");
  const diffDays = Math.round((cutoff - today) / (1000 * 60 * 60 * 24));
  const useMonths = diffDays > 31;

  let pastDueCount = 0;
  const upcomingCounts = {};
  const upcomingOrder = [];

  for (const issue of issues) {
    if (issue.isOverdue) {
      pastDueCount += 1;
      continue;
    }

    if (!issue.dueDate) {
      continue;
    }

    const bucket = useMonths ? getMonthLabel(issue.dueDate) : getWeekLabel(issue.dueDate);
    if (!upcomingCounts[bucket]) {
      upcomingCounts[bucket] = 0;
      upcomingOrder.push(bucket);
    }
    upcomingCounts[bucket] += 1;
  }

  return {
    pastDueCount,
    upcoming: upcomingOrder.map((label) => ({
      label,
      count: upcomingCounts[label],
    })),
  };
};

export const groupIssuesByEpicAndAssignee = (issues) => {
  const epics = new Map();

  for (const issue of issues) {
    const epicKey = issue.epicKey || "";
    const assignee = issue.assignee || "Unassigned";

    if (!epics.has(epicKey)) {
      epics.set(epicKey, { epicKey, assignees: new Map(), total: 0 });
    }

    const epicGroup = epics.get(epicKey);
    epicGroup.total += 1;

    if (!epicGroup.assignees.has(assignee)) {
      epicGroup.assignees.set(assignee, []);
    }

    epicGroup.assignees.get(assignee).push(issue);
  }

  return epics;
};
