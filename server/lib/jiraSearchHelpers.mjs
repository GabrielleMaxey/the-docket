export const normalizeJiraUserQuery = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const scoreJiraUserMatch = (user, rawQuery) => {
  const query = normalizeJiraUserQuery(rawQuery);
  if (!query) {
    return 0;
  }

  const displayName = normalizeJiraUserQuery(user?.displayName);
  const email = String(user?.emailAddress || "").trim().toLowerCase();
  const emailLocal = normalizeJiraUserQuery(email.split("@")[0]);

  if (displayName === query || email === rawQuery.trim().toLowerCase() || emailLocal === query) {
    return 100;
  }
  if (displayName.startsWith(query) || query.startsWith(displayName)) {
    return 80;
  }
  if (displayName.includes(query) || query.includes(displayName)) {
    return 60;
  }
  if (emailLocal.includes(query) || query.includes(emailLocal)) {
    return 50;
  }

  return 0;
};

export const mapJiraUserRow = (user) => ({
  accountId: String(user?.accountId || "").trim(),
  displayName: String(user?.displayName || "").trim(),
  emailAddress: String(user?.emailAddress || "").trim(),
});

export const pickBestJiraUser = (users, rawQuery) => {
  if (!Array.isArray(users) || users.length === 0) {
    return null;
  }

  const query = String(rawQuery || "").trim();
  if (!query) {
    return null;
  }

  const ranked = users
    .map((user) => ({ user, score: scoreJiraUserMatch(user, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0) {
    return users.length === 1 && query.length >= 2 ? users[0] : null;
  }

  if (ranked.length >= 2 && ranked[0].score === ranked[1].score && ranked[0].score < 100) {
    return null;
  }

  return ranked[0].user;
};

export const searchJiraUsers = async ({ query, jiraRequest, maxResults = 20 }) => {
  const assigneeRaw = String(query || "").trim();
  if (!assigneeRaw) {
    return [];
  }

  const searchResult = await jiraRequest({
    pathWithQuery: `/rest/api/3/user/search?query=${encodeURIComponent(assigneeRaw)}&maxResults=${maxResults}`,
  });

  if (!searchResult.ok) {
    return [];
  }

  const users = Array.isArray(searchResult.data) ? searchResult.data : [];
  const ranked = users
    .map((user) => ({ user, score: scoreJiraUserMatch(user, assigneeRaw) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const ordered =
    ranked.length > 0 ? ranked.map((entry) => entry.user) : assigneeRaw.length >= 2 ? users : [];

  const seen = new Set();
  return ordered
    .map(mapJiraUserRow)
    .filter((user) => {
      if (!user.displayName || seen.has(user.accountId)) {
        return false;
      }
      seen.add(user.accountId);
      return true;
    });
};

export const resolveJiraUser = async ({ query, jiraRequest }) => {
  const assigneeRaw = String(query || "").trim();
  if (!assigneeRaw) {
    return null;
  }

  const searchResult = await jiraRequest({
    pathWithQuery: `/rest/api/3/user/search?query=${encodeURIComponent(assigneeRaw)}&maxResults=20`,
  });

  if (!searchResult.ok) {
    return null;
  }

  const users = Array.isArray(searchResult.data) ? searchResult.data : [];
  const selectedUser = pickBestJiraUser(users, assigneeRaw);
  if (!selectedUser) {
    return null;
  }

  return mapJiraUserRow(selectedUser);
};

export const searchAllIssues = async ({ jql, runJiraSearchRequest, batchSize = 100, maxTotal = 5000 }) => {
  const issues = [];
  let nextPageToken = "";
  let jiraTotal = null;

  while (issues.length < maxTotal) {
    const result = await runJiraSearchRequest(jql, {
      maxResults: Math.min(batchSize, maxTotal - issues.length),
      ...(nextPageToken ? { nextPageToken } : {}),
    });
    if (!result.ok) {
      throw new Error(
        result.data?.errorMessages?.join(" ") ||
          result.data?.error ||
          result.data?.message ||
          "Jira search failed"
      );
    }

    const batch = Array.isArray(result.data?.issues) ? result.data.issues : [];
    if (jiraTotal === null) {
      const reported = Number(result.data?.total);
      if (Number.isFinite(reported) && reported >= 0) {
        jiraTotal = reported;
      }
    }

    issues.push(...batch);

    if (batch.length === 0 || result.data?.isLast) {
      break;
    }

    nextPageToken = String(result.data?.nextPageToken || "").trim();
    if (!nextPageToken) {
      break;
    }
  }

  const loaded = issues.length;
  const total = jiraTotal ?? loaded;
  const isComplete = loaded >= total || loaded >= maxTotal;

  return {
    issues: issues.slice(0, maxTotal),
    total,
    loaded: Math.min(loaded, maxTotal),
    isComplete,
  };
};

export const fetchEpicIssue = async ({ epicKey, mappingsByRole, jiraRequest }) => {
  const fieldIds = [
    "summary",
    "status",
    "issuetype",
    "parent",       // needed to walk up Story → Epic when fetching intermediate parents
    "duedate",
    mappingsByRole.get("initial_done_date")?.fieldId,
    mappingsByRole.get("most_recent_done_date")?.fieldId,
    mappingsByRole.get("project_end_date")?.fieldId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const uniqueFields = [...new Set(fieldIds)].join(",");
  const result = await jiraRequest({
    pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(epicKey)}?fields=${encodeURIComponent(uniqueFields)}`,
  });

  if (!result.ok) {
    return null;
  }

  return result.data;
};
