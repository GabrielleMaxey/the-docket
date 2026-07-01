import { createLogger } from "../lib/logger.mjs";
import { completeLlmText, resolveFirstReadyReportProvider } from "../lib/llmClient.mjs";

const log = createLogger("jira-issue");

const ALLOWED_ISSUE_TYPES = new Set(["Story", "Task", "Bug"]);

export const registerJiraIssueRoutes = (app, { jiraRequest, ensureEnvOrRespond, resolveJiraUser }) => {
  app.get("/api/jira/projects", async (_req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      const result = await jiraRequest({
        pathWithQuery: "/rest/api/3/project/search?maxResults=100&orderBy=name&expand=description",
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
      log.info(`created issue ${issueKey} (${issueType}) in ${projectKey}`);
      return res.status(201).json({
        ok: true,
        issueKey,
        issueId: result.data?.id,
        self: result.data?.self,
      });
    } catch (error) {
      log.error("issue creation failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to create Jira issue",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // POST /api/jira/issues/generate-description
  // Generates a description (and optional subtasks for Stories) from a title + context.
  app.post("/api/jira/issues/generate-description", async (req, res) => {
    const summary = String(req.body?.summary || "").trim();
    const issueType = String(req.body?.issueType || "Story").trim();
    const epicName = String(req.body?.epicName || "").trim();
    const epicKey = String(req.body?.epicKey || "").trim();

    if (!summary) {
      return res.status(400).json({ error: "summary is required" });
    }

    const provider = resolveFirstReadyReportProvider();
    if (!provider) {
      return res.status(503).json({ error: "No AI provider configured. Set CHAT_PROVIDER or REPORT_PROVIDER in .env." });
    }

    const isStory = issueType === "Story";
    const isBug = issueType === "Bug";
    const context = [
      epicName && `Epic: ${epicName}`,
      epicKey && epicKey !== "JQL" && `Epic key: ${epicKey}`,
    ].filter(Boolean).join(" | ");

    // ── ODI Jira Standards (Confluence: Jira Standards ODI Project Space Standards) ──
    //
    // STORY format — Job Story exclusively:
    //   Summary (title) IS the job story: "When <situation>, I want <motivation>, so I can <outcome>."
    //   Description expands on situation, motivation, and desired outcome in prose, then adds
    //   any technical details a developer needs to carry out the work.
    //   Stories are NEVER assigned to an individual; they remain in Backlog until all sub-tasks close.
    //
    // SUB-TASK format — smallest trackable unit of work under a Story:
    //   Concrete, actionable implementation tasks. Each will be assigned to an individual.
    //   Title should be a short imperative: "Configure X", "Write unit tests for Y", "Deploy Z to UAT".
    //   Sub-tasks are created as Task issue type under the Story parent in Jira.
    //
    // BUG format:
    //   Description must include: what is broken, steps to reproduce, expected vs actual behavior,
    //   environment/system affected, and any known workaround.
    //   Priority: Low (no breakdown) | Medium (unexpected behavior) | High (large parts collapse)
    //   | Critical (full system/workflow shutdown).
    //
    // STRUCTURE: Project → Epic → Story → Sub-task  (or Epic → Bug)
    //   Stories only ever live under an Epic. Sub-tasks only ever live under a Story.

    const systemPrompt = isStory
      ? `You are a Jira issue writer for the Operations Devops Itential (ODI) program at Lumen.

ODI Story standards:
- The story TITLE (summary) must follow the Job Story format: "When <situation>, I want <motivation>, so I can <desired outcome>."
- If the title provided is not already in job story format, rewrite it into that format and return it as "summary".
- The description expands the job story in prose: explain the situation, motivation, and desired outcome in more detail, then add any technical context a developer needs.
- Keep the description under 200 words. Plain text only — no markdown, no asterisks, no bullet symbols.
- Stories are never assigned to individuals; they remain in Backlog until all sub-tasks are closed.

Sub-task standards (propose 2–5):
- Each sub-task is the smallest concrete unit of work needed to fulfil the story.
- Title format: short imperative phrase — "Configure X", "Implement Y handler", "Write tests for Z", "Deploy to UAT".
- Sub-tasks will be created as Task issue type under this story in Jira.`
      : isBug
      ? `You are a Jira issue writer for the Operations Devops Itential (ODI) program at Lumen.

ODI Bug standards:
- Description must include: what is broken, steps to reproduce, expected vs actual behavior, system/environment affected, and any known workaround.
- Suggest a priority: Low (no system breakdown), Medium (unexpected behavior, system still functional), High (large parts of the system collapse), Critical (complete system/workflow shutdown).
- Plain text only — no markdown, no asterisks, no bullet symbols. Under 200 words.`
      : `You are a Jira issue writer for the Operations Devops Itential (ODI) program at Lumen.
Write a clear, concise description for a Jira ${issueType}.
Plain text only — no markdown, no asterisks, no bullet symbols. Under 150 words.`;

    const userPrompt = isStory
      ? `Write an ODI-standard Jira Story description and sub-task list.

Issue type: Story
Title provided: ${summary}${context ? `\nContext: ${context}` : ""}

Respond with valid JSON only — no prose, no markdown fences:
{
  "summary": "When <situation>, I want <motivation>, so I can <desired outcome>.",
  "description": "Expanded description here — situation, motivation, outcome, technical details.",
  "subtasks": ["Imperative task title 1", "Imperative task title 2", "Imperative task title 3"]
}`
      : isBug
      ? `Write an ODI-standard Jira Bug description.

Issue type: Bug
Title: ${summary}${context ? `\nContext: ${context}` : ""}

Respond with valid JSON only — no prose, no markdown fences:
{
  "description": "Bug description here — what is broken, steps to reproduce, expected vs actual, environment, workaround if known.",
  "priority": "Low | Medium | High | Critical"
}`
      : `Write a Jira ${issueType} description.

Issue type: ${issueType}
Title: ${summary}${context ? `\nContext: ${context}` : ""}

Respond with valid JSON only — no prose, no markdown fences:
{
  "description": "the description here"
}`;

    try {
      log.info(`generating description for ${issueType}: "${summary}"`);
      const raw = await completeLlmText({ provider, systemPrompt, userPrompt, maxTokens: 700 });
      const cleaned = String(raw || "").replace(/```json|```/g, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return res.json({ description: cleaned, subtasks: [], summary: null, priority: null });
      }

      return res.json({
        summary: isStory ? String(parsed.summary || "").trim() || null : null,
        description: String(parsed.description || "").trim(),
        subtasks: isStory && Array.isArray(parsed.subtasks)
          ? parsed.subtasks.map((s) => String(s || "").trim()).filter(Boolean)
          : [],
        priority: isBug ? String(parsed.priority || "").trim() || null : null,
      });
    } catch (error) {
      log.error("generate-description failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "AI generation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};

export { ALLOWED_ISSUE_TYPES };
