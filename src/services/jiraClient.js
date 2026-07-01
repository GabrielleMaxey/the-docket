import { buildApiUrl } from "./apiBase.js";

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
    return data.errorMessages.map((item) => formatErrorDetail(item)).filter(Boolean).join(" ");
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

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(extractJiraErrorMessage(data, response.status));
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

export const pushJiraIssueNote = async ({ issueKey, note }) => {
  return requestJson(`/api/jira/issues/${encodeURIComponent(issueKey)}/comment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ note }),
  });
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

export const updateJiraIssueAssignee = async ({ issueKey, assignee }) => {
  return requestJson(`/api/jira/issues/${encodeURIComponent(issueKey)}/assignee`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assignee }),
  });
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

export const saveIssueMetadata = async ({ issueKey, note, priority }) => {
  const body = {};
  if (typeof note === "string") {
    body.note = note;
  }
  if (priority !== undefined) {
    body.priority = priority;
  }

  return requestJson(`/api/jira/issue-metadata/${encodeURIComponent(issueKey)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
};

export const fetchEpicPresets = async () => {
  const data = await requestJson("/api/epic-presets");
  return data?.items || [];
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

export const refreshDashboardMetrics = async (payload) => {
  const data = await requestJson("/api/dashboard/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
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

export const createJiraIssue = async (payload) => {
  return requestJson("/api/jira/issues", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
};

export const generateProjectReport = async ({ label, summary }) => {
  return requestJson("/api/report/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, summary }),
  });
};

export const generateWeekPlan = async ({ projects, focusStyle, capacityHours, additionalContext }) => {
  return requestJson("/api/plan/week", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projects, focusStyle, capacityHours, additionalContext }),
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
