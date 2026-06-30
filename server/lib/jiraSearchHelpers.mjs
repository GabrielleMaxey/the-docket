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
  const exact = users.find((user) => {
    const displayName = String(user?.displayName || "").toLowerCase();
    const email = String(user?.emailAddress || "").toLowerCase();
    const normalizedQuery = assigneeRaw.toLowerCase();
    return displayName === normalizedQuery || email === normalizedQuery;
  });

  const selectedUser = exact || users[0];
  if (!selectedUser) {
    return null;
  }

  return {
    accountId: String(selectedUser.accountId || "").trim(),
    displayName: String(
      selectedUser.displayName || selectedUser.emailAddress || assigneeRaw
    ).trim(),
    emailAddress: String(selectedUser.emailAddress || "").trim(),
  };
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
