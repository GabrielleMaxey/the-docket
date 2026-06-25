import {
  getIssueStatusName,
  getIssueTypeName,
  isIssueClosed,
  isTaskDueInFuture,
  isTaskOverdue,
  formatDateOnly,
  getFieldValue,
} from "../../shared/dashboardMetrics.mjs";

export const CHAT_SESSION_ARTIFACTS_KEY = "taskManagerChatSessionArtifacts";
export const JQL_RUNS_STORAGE_KEY = "workWeekTasksJiraLastJqlRuns";

const MAX_STORED_ARTIFACTS = 8;
const MAX_ARTIFACT_CHARS = 6000;
const MAX_TOP_ISSUES_PER_QUERY = 12;

const truncateText = (value, max = MAX_ARTIFACT_CHARS) => {
  const text = String(value || "").trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}\n…[truncated]`;
};

const readJsonArray = (key) => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const loadChatSessionArtifacts = () =>
  readJsonArray(CHAT_SESSION_ARTIFACTS_KEY).filter(
    (item) => item && typeof item === "object" && String(item.content || "").trim()
  );

export const saveChatSessionArtifact = ({ type, label, content, meta = {} }) => {
  if (typeof window === "undefined") {
    return;
  }

  const trimmed = truncateText(content);
  if (!trimmed) {
    return;
  }

  const artifact = {
    type: String(type || "report").trim(),
    label: String(label || "Report").trim(),
    content: trimmed,
    generatedAt: new Date().toISOString(),
    meta: meta && typeof meta === "object" ? meta : {},
  };

  const previous = loadChatSessionArtifacts();
  const next = [artifact, ...previous].slice(0, MAX_STORED_ARTIFACTS);

  try {
    window.localStorage.setItem(CHAT_SESSION_ARTIFACTS_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Could not persist chat session artifact.", error);
  }
};

const summarizeJqlIssue = (issue) => {
  const isPastDue = isTaskOverdue(issue, "duedate");
  const dueDate = formatDateOnly(getFieldValue(issue, "duedate"));

  return {
    key: String(issue?.key || "").trim(),
    summary: String(issue?.fields?.summary || "").trim(),
    status: getIssueStatusName(issue),
    issueType: getIssueTypeName(issue),
    assignee: String(issue?.fields?.assignee?.displayName || "Unassigned").trim(),
    dueDate: dueDate || null,
    isPastDue,
    isUpcomingDue: isTaskDueInFuture(issue, "duedate"),
  };
};

export const summarizeJqlRunsFromStorage = () => {
  const runs = readJsonArray(JQL_RUNS_STORAGE_KEY).filter(
    (run) => run && typeof run === "object" && Array.isArray(run.issues)
  );

  return runs.map((run) => {
    const issues = run.issues || [];
    const openIssues = issues.filter((issue) => !isIssueClosed(issue));
    const pastDue = openIssues.filter((issue) => isTaskOverdue(issue, "duedate"));
    const upcomingDue = openIssues.filter((issue) => isTaskDueInFuture(issue, "duedate"));

    return {
      label: String(run.label || `Run ${Number(run.index || 0) + 1}`).trim(),
      jql: String(run.jql || "").trim(),
      total: issues.length,
      open: openIssues.length,
      closed: issues.length - openIssues.length,
      pastDue: pastDue.length,
      upcomingDue: upcomingDue.length,
      error: run.error ? String(run.error) : null,
      topIssues: openIssues.slice(0, MAX_TOP_ISSUES_PER_QUERY).map(summarizeJqlIssue),
    };
  });
};

export const summarizeDashboardSnapshot = (snapshot) => {
  if (!snapshot) {
    return null;
  }

  const dueByIssues = Array.isArray(snapshot.dueByIssues) ? snapshot.dueByIssues : [];
  const dueByPastDueCount = dueByIssues.filter((issue) => issue.isOverdue).length;
  const dueByUpcomingCount = dueByIssues.length - dueByPastDueCount;

  return {
    refreshedAt: snapshot.refreshedAt || null,
    includePastDue: Boolean(snapshot.includePastDue),
    dueByDate: snapshot.dueByDate || null,
    overallIssuePercent: Number(snapshot.overallIssuePercent || 0),
    overallEpicPercent: Number(snapshot.overallEpicPercent || 0),
    overallOverduePercent: Number(snapshot.overallOverduePercent || 0),
    dueByPastDueCount,
    dueByUpcomingCount,
    epics: (snapshot.epics || []).map((epic) => ({
      label: epic.label || epic.epicName || epic.epicKey,
      epicKey: epic.epicKey,
      issuePercent: Number(epic.issuePercent || 0),
      epicPercent: Number(epic.epicPercent || 0),
      overduePercent: Number(epic.overduePercent || 0),
      openIssues: Number(epic.openIssues || 0),
      isPastDueEpic: Boolean(epic.isPastDue),
      upcomingDueByCount: Number(epic.dueByOpenIssues || 0),
    })),
    assigneeCount: (snapshot.assignees || []).length,
  };
};

export const buildChatSessionContext = ({ dashboardSnapshot = null } = {}) => ({
  jqlQueries: summarizeJqlRunsFromStorage(),
  artifacts: loadChatSessionArtifacts(),
  dashboardSnapshot: summarizeDashboardSnapshot(dashboardSnapshot),
});
