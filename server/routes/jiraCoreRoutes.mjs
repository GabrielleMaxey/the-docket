// Core Jira endpoints: connection test and JQL search.

import { getJiraSearchFields } from "../lib/jiraSearchFields.mjs";

const JIRA_SEARCH_JQL_PATH = "/rest/api/3/search/jql";

export const registerJiraCoreRoutes = (app, { jiraRequest, ensureEnvOrRespond, runJiraSearchRequest, db }) => {
  // GET /api/jira/myself
  app.get("/api/jira/myself", async (_req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      const result = await jiraRequest({ pathWithQuery: "/rest/api/3/myself" });
      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }
      return res.json(result.data);
    } catch (error) {
      return res.status(500).json({
        error: "Failed to call Jira",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // GET /api/jira/filters — returns only filters owned by the current user.
  app.get("/api/jira/filters", async (_req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      // /rest/api/3/filter/my returns an array of filters owned by the
      // authenticated user — not shared/public filters from other people.
      const result = await jiraRequest({
        pathWithQuery: "/rest/api/3/filter/my?expand=jql&orderBy=name",
      });
      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }
      // /filter/my returns a plain array (not paginated with a values key).
      const filters = Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.data?.values)
          ? result.data.values
          : [];
      return res.json(filters);
    } catch (error) {
      return res.status(500).json({
        error: "Failed to fetch Jira filters",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  const handleJiraSearch = async (jql, maxResults, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    if (!jql) {
      return res.status(400).json({ error: "Missing required field: jql" });
    }

    try {
      const result = await runJiraSearchRequest({
        jql,
        maxResults,
        fields: getJiraSearchFields(db),
      });
      if (!result.ok) {
        return res.status(result.status).json({
          ...(result.data || {}),
          endpoint: JIRA_SEARCH_JQL_PATH,
        });
      }
      return res.json(result.data);
    } catch (error) {
      return res.status(500).json({
        error: "Failed to call Jira search",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // POST /api/jira/search — preferred: JQL in JSON body avoids URL-encoding issues.
  app.post("/api/jira/search", async (req, res) => {
    const jql = String(req.body?.jql || "").trim();
    const maxResults = Number(req.body?.maxResults || 5);
    return handleJiraSearch(jql, maxResults, res);
  });

  // GET /api/jira/search — kept for curl/testing convenience.
  app.get("/api/jira/search", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const jql = String(req.query.jql || "").trim();
    const maxResults = Number(req.query.maxResults || 10);
    return handleJiraSearch(jql, maxResults, res);
  });
};
