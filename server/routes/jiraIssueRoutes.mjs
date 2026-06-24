const ALLOWED_ISSUE_TYPES = new Set(["Story", "Task", "Bug"]);

export const registerJiraIssueRoutes = (app, { jiraRequest, ensureEnvOrRespond, resolveJiraUser }) => {
  app.get("/api/jira/projects", async (_req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      const result = await jiraRequest({
        pathWithQuery: "/rest/api/3/project/search?maxResults=100&orderBy=name",
      });
      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }

      const values = Array.isArray(result.data?.values) ? result.data.values : [];
      return res.json({
        items: values.map((project) => ({
          key: String(project.key || "").trim(),
          name: String(project.name || "").trim(),
          id: String(project.id || "").trim(),
        })),
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to list Jira projects",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/jira/projects/:key/createmeta", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const projectKey = String(req.params.key || "").trim();
    if (!projectKey) {
      return res.status(400).json({ error: "Project key is required" });
    }

    try {
      const result = await jiraRequest({
        pathWithQuery: `/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&expand=projects.issuetypes.fields`,
      });
      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }

      const projects = Array.isArray(result.data?.projects) ? result.data.projects : [];
      const project = projects.find((item) => String(item.key || "") === projectKey) || projects[0];
      const issueTypes = Array.isArray(project?.issuetypes) ? project.issuetypes : [];
      const allowed = issueTypes
        .filter((type) => ALLOWED_ISSUE_TYPES.has(String(type.name || "").trim()))
        .map((type) => ({
          id: String(type.id || "").trim(),
          name: String(type.name || "").trim(),
        }));

      return res.json({
        projectKey,
        issueTypes: allowed,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to load create metadata",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/jira/issues", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const projectKey = String(req.body?.projectKey || "ODI").trim();
    const issueType = String(req.body?.issueType || "Story").trim();
    const summary = String(req.body?.summary || "").trim();
    const description = String(req.body?.description || "").trim();
    const epicKey = String(req.body?.epicKey || "").trim();
    const assignee = String(req.body?.assignee || "").trim();

    if (!summary) {
      return res.status(400).json({ error: "Summary is required" });
    }

    if (!ALLOWED_ISSUE_TYPES.has(issueType)) {
      return res.status(400).json({
        error: "Invalid issue type",
        allowed: [...ALLOWED_ISSUE_TYPES],
      });
    }

    const fields = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType },
    };

    if (epicKey) {
      fields.parent = { key: epicKey };
    }

    if (description) {
      fields.description = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: description }],
          },
        ],
      };
    }

    if (assignee) {
      const resolvedUser = await resolveJiraUser({ query: assignee, jiraRequest });
      if (resolvedUser?.accountId) {
        fields.assignee = { id: resolvedUser.accountId };
      }
    }

    try {
      const result = await jiraRequest({
        method: "POST",
        pathWithQuery: "/rest/api/3/issue",
        body: { fields },
      });
      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }

      const issueKey = String(result.data?.key || "").trim();
      return res.status(201).json({
        ok: true,
        issueKey,
        issueId: result.data?.id,
        self: result.data?.self,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to create Jira issue",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};

export { ALLOWED_ISSUE_TYPES };
