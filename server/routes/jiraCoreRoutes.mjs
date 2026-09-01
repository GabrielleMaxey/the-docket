// Core Jira endpoints: connection test and JQL search.

import { getJiraSearchFields } from "../lib/jiraSearchFields.mjs";
import { createLogger } from "../lib/logger.mjs";
const log = createLogger("jira-core");

import { searchAllIssues, searchJiraUsers, fetchJiraUsersByAccountIds } from "../lib/jiraSearchHelpers.mjs";

const JIRA_SEARCH_JQL_PATH = "/rest/api/3/search/jql";

export const registerJiraCoreRoutes = (app, { jiraRequest, ensureEnvOrRespond, runJiraSearchRequest, db }) => {
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

  app.get("/api/jira/filters", async (_req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      // /rest/api/3/filter/my returns filters owned by the authenticated
      // user only - not shared/public filters from other people.
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

  // Resolves display names / emails for assignee updates.
  app.get("/api/jira/users/search", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const query = String(req.query.query || "").trim();
    if (!query) {
      return res.json({ items: [] });
    }

    try {
      const items = await searchJiraUsers({ query, jiraRequest });
      return res.json({ items });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to search Jira users",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Resolves raw Atlassian account IDs (e.g. saved in Direct Reports queries
  // before a display name/email was available) back to a human-readable name.
  app.post("/api/jira/users/resolve-bulk", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const accountIds = Array.isArray(req.body?.accountIds) ? req.body.accountIds : [];
    if (accountIds.length === 0) {
      return res.json({ items: {} });
    }

    try {
      const users = await fetchJiraUsersByAccountIds({ accountIds, jiraRequest });
      const items = {};
      for (const user of users) {
        items[user.accountId] = {
          displayName: user.displayName,
          emailAddress: user.emailAddress,
        };
      }
      return res.json({ items });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to resolve Jira users",
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

  // Preferred over the GET variant below: JQL in the JSON body avoids URL-encoding issues.
  app.post("/api/jira/search", async (req, res) => {
    const jql = String(req.body?.jql || "").trim();
    const maxResults = Number(req.body?.maxResults || 5);
    return handleJiraSearch(jql, maxResults, res);
  });

  // Paginated fetch up to maxTotal (cap 5000).
  app.post("/api/jira/search/all", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const jql = String(req.body?.jql || "").trim();
    if (!jql) {
      return res.status(400).json({ error: "Missing required field: jql" });
    }

    const maxTotal = Math.min(5000, Math.max(1, Number(req.body?.maxTotal || 200)));

    try {
      const { issues, total, loaded, isComplete } = await searchAllIssues({
        jql,
        runJiraSearchRequest,
        maxTotal,
      });
      return res.json({ issues, total, loaded, isComplete });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to call Jira search",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Kept for curl/testing convenience; POST /api/jira/search is preferred otherwise.
  app.get("/api/jira/search", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const jql = String(req.query.jql || "").trim();
    const maxResults = Number(req.query.maxResults || 10);
    return handleJiraSearch(jql, maxResults, res);
  });
};
