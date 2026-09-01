// search_jira_issues tool for LLM chat (live JQL via jiraRequest).

const DEFAULT_SEARCH_FIELDS = [
  "summary",
  "status",
  "issuetype",
  "assignee",
  "duedate",
  "parent",
  "updated",
];

const MAX_RESULTS_CAP = 50;
const DEFAULT_MAX_RESULTS = 25;

export const JIRA_SEARCH_TOOL_NAME = "search_jira_issues";

export const JIRA_SEARCH_TOOL_DESCRIPTION =
  "Search Jira issues with a JQL (Jira Query Language) query. Use this when the " +
  "user asks about issues, projects, assignees, due dates, or statuses that aren't " +
  "already covered by the selected-epic context below — don't guess, search instead.";

export const JIRA_SEARCH_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    jql: {
      type: "string",
      description:
        "A valid JQL query, e.g. \"assignee = currentUser() AND statusCategory != Done ORDER BY duedate ASC\". Always include an ORDER BY clause.",
    },
    maxResults: {
      type: "integer",
      description: `Maximum number of issues to return (default ${DEFAULT_MAX_RESULTS}, max ${MAX_RESULTS_CAP}).`,
    },
  },
  required: ["jql"],
};

export const executeJiraSearch = async ({ jiraRequest, jql, maxResults }) => {
  const trimmedJql = String(jql || "").trim();
  if (!trimmedJql) {
    return { error: "jql is required" };
  }

  if (typeof jiraRequest !== "function") {
    return { error: "Jira search is not available on this server" };
  }

  const limit = Math.min(Math.max(Number(maxResults) || DEFAULT_MAX_RESULTS, 1), MAX_RESULTS_CAP);

  try {
    const result = await jiraRequest({
      method: "POST",
      pathWithQuery: "/rest/api/3/search/jql",
      body: {
        jql: trimmedJql,
        maxResults: limit,
        fields: DEFAULT_SEARCH_FIELDS,
      },
    });

    if (!result.ok) {
      const message =
        (Array.isArray(result.data?.errorMessages) && result.data.errorMessages.join("; ")) ||
        `Jira search failed (HTTP ${result.status})`;
      return { error: message };
    }

    const issues = Array.isArray(result.data?.issues) ? result.data.issues : [];

    return {
      jql: trimmedJql,
      total: result.data?.total ?? issues.length,
      issues: issues.map((issue) => ({
        key: issue.key,
        summary: issue.fields?.summary || "",
        status: issue.fields?.status?.name || "",
        issueType: issue.fields?.issuetype?.name || "",
        assignee: issue.fields?.assignee?.displayName || "Unassigned",
        dueDate: issue.fields?.duedate || null,
        epic: issue.fields?.parent?.key || null,
        updated: issue.fields?.updated || null,
      })),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Jira search failed" };
  }
};
