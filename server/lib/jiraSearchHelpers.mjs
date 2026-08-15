import { chunkValues, ISSUE_KEY_BATCH_SIZE } from "../../shared/jiraBatch.mjs";
import { extractAccountIdFromInput } from "../../shared/directReportsJql.mjs";

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

  const accountId = String(user?.accountId || "").trim();
  const queryAccountId = extractAccountIdFromInput(rawQuery);
  if (accountId && (accountId === String(rawQuery || "").trim() || accountId === queryAccountId)) {
    return 100;
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

  const accountId = extractAccountIdFromInput(assigneeRaw);
  if (accountId) {
    const byAccountId = await fetchJiraUserByAccountId({ accountId, jiraRequest });
    return byAccountId?.displayName ? [byAccountId] : [];
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

export const fetchJiraUserByAccountId = async ({ accountId, jiraRequest }) => {
  const id = extractAccountIdFromInput(accountId) || String(accountId || "").trim();
  if (!id || typeof jiraRequest !== "function") {
    return null;
  }

  const paths = [
    `/rest/api/3/user?accountId=${encodeURIComponent(id)}`,
    `/rest/api/3/user/search?accountId=${encodeURIComponent(id)}`,
    `/rest/api/3/user/bulk?accountId=${encodeURIComponent(id)}&maxResults=1`,
  ];

  for (const pathWithQuery of paths) {
    const result = await jiraRequest({ pathWithQuery });
    if (!result?.ok) {
      continue;
    }
    const payload = result.data;
    const rawUser = Array.isArray(payload)
      ? payload[0]
      : Array.isArray(payload?.values)
        ? payload.values[0]
        : payload;
    const user = mapJiraUserRow(rawUser);
    if (user.accountId) {
      return user;
    }
  }

  return null;
};

export const fetchJiraUsersByAccountIds = async ({ accountIds, jiraRequest }) => {
  const ids = [
    ...new Set(
      (accountIds || [])
        .map((value) => extractAccountIdFromInput(value))
        .filter(Boolean)
    ),
  ];
  const resolved = new Map();
  if (ids.length === 0 || typeof jiraRequest !== "function") {
    return [];
  }

  const params = ids.map((id) => `accountId=${encodeURIComponent(id)}`).join("&");
  const bulk = await jiraRequest({
    pathWithQuery: `/rest/api/3/user/bulk?${params}&maxResults=${Math.max(ids.length, 1)}`,
  });
  const bulkUsers = Array.isArray(bulk?.data?.values)
    ? bulk.data.values
    : Array.isArray(bulk?.data)
      ? bulk.data
      : [];
  for (const raw of bulkUsers) {
    const user = mapJiraUserRow(raw);
    if (user.accountId) {
      resolved.set(user.accountId, user);
    }
  }

  for (const id of ids) {
    if (resolved.has(id)) {
      continue;
    }
    const user = await fetchJiraUserByAccountId({ accountId: id, jiraRequest });
    if (user?.accountId) {
      resolved.set(user.accountId, user);
    }
  }

  return [...resolved.values()];
};

export const fetchJiraMyself = async ({ jiraRequest }) => {
  if (typeof jiraRequest !== "function") {
    return null;
  }
  const result = await jiraRequest({ pathWithQuery: "/rest/api/3/myself" });
  if (!result?.ok) {
    return null;
  }
  const user = mapJiraUserRow(result.data);
  return user.accountId || user.displayName ? user : null;
};

export const resolveJiraUser = async ({ query, jiraRequest }) => {
  const assigneeRaw = String(query || "").trim();
  if (!assigneeRaw) {
    return null;
  }

  const accountId = extractAccountIdFromInput(assigneeRaw);
  if (accountId) {
    const byAccountId = await fetchJiraUserByAccountId({ accountId, jiraRequest });
    if (byAccountId) {
      return byAccountId;
    }
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
  const uniqueFields = [...new Set(getEpicIssueFieldIds(mappingsByRole))].join(",");
  const result = await jiraRequest({
    pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(epicKey)}?fields=${encodeURIComponent(uniqueFields)}`,
  });

  if (!result.ok) {
    return null;
  }

  return result.data;
};

export const getEpicIssueFieldIds = (mappingsByRole) =>
  [
    "summary",
    "status",
    "issuetype",
    "parent",
    "duedate",
    mappingsByRole.get("initial_done_date")?.fieldId,
    mappingsByRole.get("most_recent_done_date")?.fieldId,
    mappingsByRole.get("project_end_date")?.fieldId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

export const fetchIssuesByKeys = async ({ keys, jiraRequest, fields }) => {
  const uniqueKeys = [...new Set(keys.map((key) => String(key || "").trim()).filter(Boolean))];
  if (uniqueKeys.length === 0) {
    return [];
  }

  const fieldList = [...new Set(fields.map((field) => String(field || "").trim()).filter(Boolean))];
  const issues = [];

  for (const batch of chunkValues(uniqueKeys, ISSUE_KEY_BATCH_SIZE)) {
    const result = await jiraRequest({
      method: "POST",
      pathWithQuery: "/rest/api/3/search/jql",
      body: {
        jql: `key in (${batch.join(",")}) ORDER BY key ASC`,
        maxResults: batch.length,
        fields: fieldList,
      },
    });

    if (!result.ok) {
      throw new Error(
        result.data?.errorMessages?.join(" ") ||
          result.data?.message ||
          "Failed to load issues from Jira"
      );
    }

    issues.push(...(Array.isArray(result.data?.issues) ? result.data.issues : []));
  }

  return issues;
};

export const loadIssuesIntoCache = async ({ keys, issueCache, jiraRequest, fields, replace = false }) => {
  const uniqueKeys = [...new Set(keys.map((key) => String(key || "").trim()).filter(Boolean))];
  const missingKeys = uniqueKeys.filter((key) => replace || !issueCache.has(key));
  if (missingKeys.length === 0) {
    return issueCache;
  }

  if (replace) {
    for (const key of missingKeys) {
      issueCache.delete(key);
    }
  }

  const issues = await fetchIssuesByKeys({ keys: missingKeys, jiraRequest, fields });
  for (const issue of issues) {
    const issueKey = String(issue?.key || "").trim();
    if (issueKey) {
      issueCache.set(issueKey, issue);
    }
  }

  return issueCache;
};
