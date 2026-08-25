import { buildApiUrl } from "./apiBase.js";
import { getLocalTimestampPayload } from "../utils/localTimestamp.js";
import { filterWorkfrontErrorMessages } from "../../shared/jiraErrorUtils.mjs";
import {
  buildSharedProgramJql,
  buildSharedProgramJqlWithDescendants,
} from "../utils/workWeekStorage.js";

const formatErrorDetail = (value) => {
  if (value == null || value === "") {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const extractJiraErrorMessage = (data, status) => {
  if (Array.isArray(data?.errorMessages) && data.errorMessages.length > 0) {
    const messages = filterWorkfrontErrorMessages(data.errorMessages);
    if (messages.length > 0) {
      return messages.map((item) => formatErrorDetail(item)).filter(Boolean).join(" ");
    }
  }

  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return data.errors.map((item) => formatErrorDetail(item)).filter(Boolean).join(" ");
  }

  const errorDetail = formatErrorDetail(data?.error);
  if (errorDetail) {
    return errorDetail;
  }

  const messageDetail = formatErrorDetail(data?.message);
  if (messageDetail) {
    return messageDetail;
  }

  return `Jira request failed with status ${status}`;
};

const requestJson = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(buildApiUrl(path), {
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Cannot reach the local API. Start it with npm run dev:api or npm run dev:all (proxy on port 8787)."
      );
    }
    throw error;
  }

  const text = await response.text();
  let data = {};
  let parsedJson = false;

  if (text) {
    try {
      data = JSON.parse(text);
      parsedJson = true;
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(extractJiraErrorMessage(data, response.status));
  }

  // SPA/static fallbacks sometimes return index.html with HTTP 200 for unknown API routes.
  if (!parsedJson || (typeof data === "object" && data && typeof data.message === "string" && /^\s*</.test(data.message))) {
    throw new Error(
      `API returned a non-JSON response for ${path}. Restart the local API (npm run dev:api or npm run dev:all) so new routes are loaded.`
    );
  }

  return data;
};

export const fetchJiraMyself = async () => requestJson("/api/jira/myself");

export const fetchJiraHealth = async () => requestJson("/api/health");

export const testJiraConnection = async () => fetchJiraMyself();

// Send JQL as POST JSON body to avoid URL-encoding edge cases.
export const fetchJiraSearch = async ({ jql, maxResults = 5 }) => {
  return requestJson("/api/jira/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jql, maxResults }),
  });
};

export const fetchJiraSearchAll = async ({ jql, maxTotal = 200 }) => {
  return requestJson("/api/jira/search/all", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jql, maxTotal }),
  });
};

// Resolve direct children first so generated JQL also includes their subtasks.
// Fall back to the direct-child query if Jira cannot resolve descendants.
export const resolveSharedProgramJql = async (epicRoots) => {
  const baseJql = buildSharedProgramJql(epicRoots);
  if (!baseJql) {
    return "";
  }

  try {
    const data = await fetchJiraSearchAll({ jql: baseJql, maxTotal: 1000 });
    const childKeys = (data?.issues || [])
      .map((issue) => String(issue.key || "").trim())
      .filter(Boolean);
    return buildSharedProgramJqlWithDescendants(epicRoots, childKeys) || baseJql;
  } catch (error) {
    console.error("Failed to resolve shared program descendants", error);
    return baseJql;
  }
};

export const pushJiraIssueNote = async ({ issueKey, note, images = [] }) => {
  const path = `/api/jira/issues/${encodeURIComponent(issueKey)}/comment`;

  if (images.length === 0) {
    return requestJson(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ note }),
    });
  }

  const formData = new FormData();
  formData.append("note", note || "");
  images.forEach((image) => formData.append("images", image.file, image.filename));

  // Omit Content-Type so the browser sets the multipart boundary itself.
  return requestJson(path, {
    method: "POST",
    body: formData,
  });
};

export const saveKeptNoteImages = async ({ issueKey, images = [] }) => {
  const formData = new FormData();
  images.forEach((image) => formData.append("images", image.file, image.filename));

  return requestJson(`/api/jira/issue-metadata/${encodeURIComponent(issueKey)}/images`, {
    method: "POST",
    body: formData,
  });
};

export const deleteKeptNoteImages = async (issueKey) => {
  return requestJson(`/api/jira/issue-metadata/${encodeURIComponent(issueKey)}/images`, {
    method: "DELETE",
  });
};

export const fetchKeptNoteImageBlob = async (issueKey, imageId) => {
  const response = await fetch(
    buildApiUrl(`/api/jira/issue-metadata/${encodeURIComponent(issueKey)}/images/${encodeURIComponent(imageId)}`)
  );
  if (!response.ok) {
    throw new Error(`Failed to load kept image ${imageId} for ${issueKey}`);
  }
  return response.blob();
};

export const updateJiraIssueStatus = async ({ issueKey, targetStatus }) => {
  return requestJson(`/api/jira/issues/${encodeURIComponent(issueKey)}/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targetStatus }),
  });
};

export const JIRA_UNASSIGNED_ASSIGNEE = "__unassigned__";

export const isJiraUnassignValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "unassigned" || normalized === JIRA_UNASSIGNED_ASSIGNEE;
};

export const updateJiraIssueAssignee = async ({ issueKey, assignee }) => {
  return requestJson(`/api/jira/issues/${encodeURIComponent(issueKey)}/assignee`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assignee }),
  });
};

export const searchJiraUsers = async (query) => {
  const data = await requestJson(
    `/api/jira/users/search?query=${encodeURIComponent(String(query || "").trim())}`
  );
  return data?.items || [];
};

export const resolveJiraUsersByAccountIds = async (accountIds) => {
  const data = await requestJson("/api/jira/users/resolve-bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ accountIds }),
  });
  return data?.items || {};
};

export const fetchIssueMetadataBulk = async (issueKeys) => {
  const data = await requestJson("/api/jira/issue-metadata/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ issueKeys }),
  });

  return data?.items || {};
};

export const fetchRecentlyNotedIssueKeys = async (since) => {
  const data = await requestJson(`/api/jira/issue-metadata/recent-notes?since=${encodeURIComponent(since)}`);
  return Array.isArray(data?.issueKeys) ? data.issueKeys : [];
};

export const fetchLatestJiraCommentsBulk = async (issueKeys) => {
  const data = await requestJson("/api/jira/issues/comments/latest/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ issueKeys }),
  });

  return data?.items || {};
};

const PLANNING_FIELDS = ["hasOpenDecision", "plannedStart", "plannedFinish", "pmOverride", "requestor", "openDecisionNote"];

export const saveIssueMetadata = async ({ issueKey, note, priority, startDate, completeDate, ...planningFields }) => {
  const body = {};
  if (typeof note === "string") body.note = note;
  if (priority !== undefined) body.priority = priority;
  if (typeof startDate === "string") body.startDate = startDate;
  if (typeof completeDate === "string") body.completeDate = completeDate;
  for (const f of PLANNING_FIELDS) {
    if (planningFields[f] !== undefined) body[f] = planningFields[f];
  }

  return requestJson(`/api/jira/issue-metadata/${encodeURIComponent(issueKey)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
};

// role: "due_date" | "most_recent_done_date". value: "YYYY-MM-DD" or "" to clear.
export const updateJiraIssueDateField = async ({ issueKey, role, value }) => {
  return requestJson(`/api/jira/issues/${encodeURIComponent(issueKey)}/date-field`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role, value }),
  });
};

export const importIssueMetadataCsv = async (csvText) => {
  const data = await requestJson("/api/jira/issue-metadata/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ csvText }),
  });
  if (!data || data.ok !== true || typeof data.updatedPriorities !== "number") {
    throw new Error(
      "Priority import API response was incomplete. Restart npm run dev:all and try again."
    );
  }
  return data;
};

export const fetchTeamPriorityHealth = async () => {
  return requestJson("/api/team-priority/health");
};

export const seedTeamPriorityPrograms = async () => {
  return requestJson("/api/team-priority/seed", { method: "POST" });
};

export const importTeamPriorityCsv = async (csvText) => {
  const data = await requestJson("/api/team-priority/import-csv", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ csvText }),
  });
  if (!data || data.ok !== true || typeof data.updatedPriorities !== "number") {
    throw new Error("Team priority CSV import failed or returned an incomplete response.");
  }
  return data;
};

export const syncLocalPrioritiesToTeam = async () => {
  const data = await requestJson("/api/team-priority/sync-local", { method: "POST" });
  if (!data || data.ok !== true || typeof data.updatedPriorities !== "number") {
    throw new Error("Local → Atlas priority sync failed or returned an incomplete response.");
  }
  return data;
};

export const pullTeamPrioritiesToLocal = async () => {
  const data = await requestJson("/api/team-priority/pull-to-local", { method: "POST" });
  if (!data || data.ok !== true || typeof data.updatedPriorities !== "number") {
    throw new Error("Atlas → local priority pull failed or returned an incomplete response.");
  }
  return data;
};

export const fetchSharedPrograms = async () => {
  const data = await requestJson("/api/shared-programs");
  return data?.items || [];
};

export const fetchTeamPriorityBulk = async (issueKeys) => {
  const data = await requestJson("/api/team-priority/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ issueKeys }),
  });
  return data?.items || {};
};

export const saveTeamPriority = async ({ issueKey, priority }) => {
  return requestJson(`/api/team-priority/${encodeURIComponent(issueKey)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ priority }),
  });
};

export const fetchTeamDatesBulk = async (issueKeys) => {
  const data = await requestJson("/api/team-priority/dates/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ issueKeys }),
  });
  return data?.items || {};
};

export const saveTeamDate = async ({ issueKey, startDate, completeDate, ...planningFields }) => {
  const body = {};
  if (typeof startDate === "string") body.startDate = startDate;
  if (typeof completeDate === "string") body.completeDate = completeDate;
  for (const f of PLANNING_FIELDS) {
    if (planningFields[f] !== undefined) body[f] = planningFields[f];
  }

  return requestJson(`/api/team-priority/dates/${encodeURIComponent(issueKey)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
};

// Explicit, deliberate clear of the whole shared date-tracking row for an issue.
export const deleteTeamDate = async (issueKey) => {
  return requestJson(`/api/team-priority/dates/${encodeURIComponent(issueKey)}`, {
    method: "DELETE",
  });
};

export const fetchEpicPresets = async () => {
  const data = await requestJson("/api/epic-presets");
  return data?.items || [];
};

export const fetchEpicPresetScopeJql = async (epicPresetId) => {
  const id = String(epicPresetId || "").trim();
  if (!id) {
    return "";
  }
  const data = await requestJson(`/api/epic-presets/${encodeURIComponent(id)}/scope-jql`);
  return String(data?.scopeJql || "").trim();
};

export const createEpicPreset = async (payload) => {
  return requestJson("/api/epic-presets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
};

export const updateEpicPreset = async (id, payload) => {
  return requestJson(`/api/epic-presets/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
};

export const deleteEpicPreset = async (id) => {
  return requestJson(`/api/epic-presets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

export const exportEpicPresetsPack = async () => requestJson("/api/epic-presets/export");

export const importEpicPresetsPack = async ({ presets, mode = "merge" }) =>
  requestJson("/api/epic-presets/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ presets, mode }),
  });

export const fetchFavouriteJiraFilters = async () => {
  const data = await requestJson("/api/jira/filters/favourite");
  return data?.items || [];
};

export const runEpicFilters = async ({ epicPresetIds, includePastDue, maxResults = 200 }) => {
  const data = await requestJson("/api/epic-filters/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ epicPresetIds, includePastDue, maxResults }),
  });

  return data?.runs || [];
};

export const fetchFieldMappings = async () => {
  const data = await requestJson("/api/jira/field-mappings");
  return data?.items || [];
};

export const saveFieldMappings = async (mappings) => {
  const data = await requestJson("/api/jira/field-mappings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mappings }),
  });

  return data?.items || [];
};

export const syncFieldMappingsFromJira = async () => {
  const data = await requestJson("/api/jira/field-mappings/sync", {
    method: "POST",
  });

  return data?.items || [];
};

export const fetchJiraFields = async () => {
  const data = await requestJson("/api/jira/fields");
  return data?.items || [];
};

export const fetchAppSettings = async () => {
  const data = await requestJson("/api/settings");
  return data?.settings || {};
};

export const saveAppSettings = async (settings) => {
  const data = await requestJson("/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ settings: settings || {} }),
  });

  return data?.settings || {};
};

export const fetchReminders = async () => {
  const data = await requestJson("/api/reminders");
  return data?.items || [];
};

export const saveReminders = async (reminders) => {
  const data = await requestJson("/api/reminders", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reminders: reminders || [] }),
  });

  return data?.items || [];
};

export const fetchWatchedAssignees = async () => {
  const data = await requestJson("/api/watched-assignees");
  return data?.items || [];
};

export const createWatchedAssignee = async (payload) => {
  return requestJson("/api/watched-assignees", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
};

export const updateWatchedAssignee = async (id, payload) => {
  return requestJson(`/api/watched-assignees/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
};

export const deleteWatchedAssignee = async (id) => {
  return requestJson(`/api/watched-assignees/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

export const fetchDashboardMetrics = async () => {
  const data = await requestJson("/api/dashboard/metrics");
  return data?.snapshot || null;
};

export const fetchJiraFilters = async () => {
  const data = await requestJson("/api/jira/filters");
  return Array.isArray(data) ? data : [];
};

export const refreshDashboardMetrics = async (payload, options = {}) => {
  const data = await requestJson("/api/dashboard/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
    signal: options.signal,
  });

  return data?.snapshot || null;
};

export const generateReport = async ({
  audience,
  epicPresetIds,
  additionalContext,
  statusCounts,
  chartVariant,
}) => {
  return requestJson("/api/report/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audience,
      epicPresetIds,
      additionalContext,
      statusCounts,
      chartVariant,
      ...getLocalTimestampPayload(),
    }),
  });
};

export const fetchWeeklyDigest = async () => requestJson("/api/reports/weekly-digest");

export const fetchChatStatus = async () => requestJson("/api/chat/status");

export const startChatOAuth = async () => {
  const data = await requestJson("/api/chat/auth/start?format=json");
  return String(data?.authorizeUrl || "").trim();
};

export const signOutChat = async () => {
  return requestJson("/api/chat/auth/signout", {
    method: "POST",
  });
};

export const sendChatMessage = async ({ message, epicContext }) => {
  return requestJson("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, epicContext }),
  });
};

export const fetchJiraProjects = async () => {
  const data = await requestJson("/api/jira/projects");
  return data?.items || [];
};

export const fetchJiraCreateMeta = async (projectKey) => {
  return requestJson(`/api/jira/projects/${encodeURIComponent(projectKey)}/createmeta`);
};

export const fetchJiraCreateFieldOptions = async (projectKey, issueType = "Story") => {
  const type = encodeURIComponent(String(issueType || "Story").trim() || "Story");
  return requestJson(
    `/api/jira/projects/${encodeURIComponent(projectKey)}/create-field-options?issueType=${type}`
  );
};

export const fetchJiraIssueSummary = async (issueKey) => {
  return requestJson(`/api/jira/issues/${encodeURIComponent(String(issueKey || "").trim())}/summary`);
};

export const fetchEpicParentOptions = async (epicKey) => {
  return requestJson(`/api/jira/epics/${encodeURIComponent(String(epicKey || "").trim())}/parent-options`);
};

export const fetchEpicWorkload = async (epicKey) => {
  return requestJson(`/api/jira/epics/${encodeURIComponent(String(epicKey || "").trim())}/workload`);
};

// omitted/null selectedIds = all entries; [] = none (do not fetch).
export const fetchCapacityPlanning = async (selectedIds) => {
  if (Array.isArray(selectedIds) && selectedIds.length === 0) {
    return [];
  }
  const idList = Array.isArray(selectedIds) ? selectedIds.filter((id) => id !== null && id !== undefined) : null;
  const query = idList && idList.length > 0 ? `?ids=${idList.map((id) => encodeURIComponent(id)).join(",")}` : "";
  const data = await requestJson(`/api/project-managers/capacity${query}`);
  return data?.items || [];
};

export const fetchGanttData = async (slug) => {
  const data = await requestJson(`/api/project-managers/gantt?slug=${encodeURIComponent(slug)}`);
  return data;
};

export const searchEpics = async (query) => {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return [];
  }
  const data = await requestJson(`/api/jira/epics/search?q=${encodeURIComponent(q)}`);
  return data?.items || [];
};

export const fetchJiraParentCandidates = async ({ jql, maxTotal = 100 }) => {
  return requestJson("/api/jira/issues/parent-candidates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jql: String(jql || "").trim(),
      maxTotal,
    }),
  });
};

export const createJiraIssue = async (payload) => {
  return requestJson("/api/jira/issues", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
};

export const generateIssueDescription = async ({
  summary,
  issueType,
  epicKey,
  epicName,
  intake,
}) => {
  return requestJson("/api/jira/issues/generate-description", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary,
      issueType,
      epicKey: epicKey || "",
      epicName: epicName || "",
      intake: intake || null,
    }),
  });
};

export const generateProjectReport = async ({
  label,
  jql,
  summary,
  reportType,
  pwbPeriod,
  userGoals,
  companyGoals,
}) => {
  return requestJson("/api/report/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label,
      jql,
      summary,
      reportType,
      pwbPeriod,
      userGoals,
      companyGoals,
      ...getLocalTimestampPayload(),
    }),
  });
};

export const generateWeekPlan = async ({ projects, focusStyle, capacityHours, additionalContext }) => {
  return requestJson("/api/plan/week", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projects,
      focusStyle,
      capacityHours,
      additionalContext,
      ...getLocalTimestampPayload(),
    }),
  });
};

export const fetchArchivedReports = async ({ source, limit } = {}) => {
  const params = new URLSearchParams();
  if (source) {
    params.set("source", source);
  }
  if (limit) {
    params.set("limit", String(limit));
  }
  const query = params.toString();
  const path = query ? `/api/reports/archive?${query}` : "/api/reports/archive";
  const data = await requestJson(path);
  return data?.items || [];
};

export const fetchArchivedReportById = async (id) => {
  const data = await requestJson(`/api/reports/archive/${encodeURIComponent(id)}`);
  return data?.item || null;
};

export const deleteArchivedReport = async (id) => {
  return requestJson(`/api/reports/archive/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

export const deleteArchivedReportsBySource = async (source) => {
  return requestJson(`/api/reports/archive?source=${encodeURIComponent(source)}`, {
    method: "DELETE",
  });
};

export const saveAdHocReport = async ({ content, label, userPrompt, provider, savedFrom }) => {
  return requestJson("/api/reports/archive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content, label, userPrompt, provider, savedFrom, ...getLocalTimestampPayload() }),
  });
};

export const fetchCoworkWeeklyPlans = async () => {
  const data = await requestJson("/api/reports/cowork-files");
  return data?.items || [];
};

export const fetchCoworkWeeklyPlanByFilename = async (filename) => {
  const data = await requestJson(`/api/reports/cowork-files/${encodeURIComponent(filename)}`);
  return data?.item || null;
};

export const saveCoworkWeeklyPlanToArchive = async ({ content, label, filename }) => {
  return requestJson("/api/reports/archive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content,
      label,
      filename,
      fromCoworkFile: true,
      ...getLocalTimestampPayload(),
    }),
  });
};

export const fetchPmAsks = async () => {
  const data = await requestJson("/api/project-managers/asks");
  return data?.items || [];
};

export const createPmAsk = async ({ title, whoAsked, note }) => {
  return requestJson("/api/project-managers/asks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, whoAsked, note }),
  });
};

export const updatePmAsk = async ({ id, title, whoAsked, note }) => {
  const body = {};
  if (typeof title === "string") body.title = title;
  if (typeof whoAsked === "string") body.whoAsked = whoAsked;
  if (typeof note === "string") body.note = note;
  return requestJson(`/api/project-managers/asks/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};

export const deletePmAsk = async (id) => {
  return requestJson(`/api/project-managers/asks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};
