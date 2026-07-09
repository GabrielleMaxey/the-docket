import { createLogger } from "../lib/logger.mjs";
import { completeLlmText, resolveFirstReadyReportProvider } from "../lib/llmClient.mjs";
import { searchAllIssues } from "../lib/jiraSearchHelpers.mjs";
import { loadParentCandidatesFromJql } from "../lib/jiraParentCandidates.mjs";
import {
  buildEpicStoriesJql,
  buildJiraCreatePayload,
  formatJiraApiError,
} from "../lib/jiraCreateIssueFields.mjs";
import { descriptionTextToAdf } from "../../shared/jiraDescriptionAdf.mjs";
import { isEpicIssueType } from "../../shared/dashboardMetrics.mjs";
import {
  isStoryIssueTypeName,
  normalizeOdiBugPriority,
  validateOdiIssueCreate,
} from "../../shared/odiIssueStandards.mjs";

const log = createLogger("jira-issue");

const ALLOWED_ISSUE_TYPES = new Set(["Story", "Task", "Bug"]);

const fetchIssueTypeSummary = async ({ issueKey, jiraRequest }) => {
  const result = await jiraRequest({
    pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,issuetype`,
  });

  if (!result.ok) {
    return null;
  }

  const issueType = String(result.data?.fields?.issuetype?.name || "").trim();
  return {
    issueKey,
    summary: String(result.data?.fields?.summary || "").trim(),
    issueType,
    isEpic: isEpicIssueType(issueType),
    isStory: isStoryIssueTypeName(issueType),
  };
};

const validateParentForCreate = async ({ issueType, parentKey, isSubtask, jiraRequest }) => {
  const parent = await fetchIssueTypeSummary({ issueKey: parentKey, jiraRequest });
  if (!parent) {
    return [`Parent issue ${parentKey} was not found in Jira.`];
  }

  const errors = [];
  if (issueType === "Story" || issueType === "Bug") {
    if (!parent.isEpic) {
      errors.push(`${issueType}s must be created under an Epic. ${parentKey} is a ${parent.issueType}.`);
    }
  } else if (issueType === "Task") {
    if (!parent.isStory) {
      const label = isSubtask ? "Sub-tasks" : "Tasks";
      errors.push(`${label} must be created under a Story. ${parentKey} is a ${parent.issueType}.`);
    }
  }

  return errors;
};

const normalizeStringList = (items) =>
  Array.isArray(items)
    ? items.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

const normalizeDescriptionSections = (sections) => {
  if (!Array.isArray(sections)) {
    return [];
  }

  return sections
    .map((section) => ({
      label: String(section?.label || section?.heading || "").trim(),
      items: normalizeStringList(section?.items),
    }))
    .filter((section) => section.label && section.items.length > 0);
};

const formatDescriptionSection = (label, items) => {
  const lines = normalizeStringList(items);
  if (lines.length === 0) {
    return "";
  }

  return `${label}:\n${lines.map((line) => `- ${line}`).join("\n")}`;
};

const buildFormattedDescription = ({ overview, sections }) => {
  const parts = [];
  const overviewText = String(overview || "").trim();
  if (overviewText) {
    parts.push(overviewText);
  }

  for (const section of normalizeDescriptionSections(sections)) {
    const block = formatDescriptionSection(section.label, section.items);
    if (block) {
      parts.push(block);
    }
  }

  return parts.join("\n\n");
};

const buildGenerateDescriptionResponse = (parsed, { isStory, isBug }) => {
  const questions = normalizeStringList(parsed?.questions).slice(0, isStory ? 3 : 4);
  const needsClarification = Boolean(parsed?.needsClarification) || questions.length > 0;
  const overview = String(parsed?.overview || "").trim();
  const sections = normalizeDescriptionSections(parsed?.sections);
  let description = buildFormattedDescription({ overview, sections });

  if (!description) {
    description = String(parsed?.description || "").trim();
  }

  const subtasks =
    isStory && !needsClarification && Array.isArray(parsed?.subtasks)
      ? parsed.subtasks.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

  return {
    needsClarification,
    questions,
    summary: isStory ? String(parsed?.summary || "").trim() || null : null,
    description,
    subtasks,
    priority: isBug ? String(parsed?.priority || "").trim() || null : null,
  };
};

const DESCRIPTION_FORMAT_RULES = `Description formatting rules:
- Start with "overview": 1–2 short sentences only. State the problem or goal plainly — no filler.
- Follow with "sections": each has a clear "label" and "items" array of bullet lines (plain text, no markdown).
- Use hyphen bullets in the final description (built server-side). Each bullet must be one concrete, actionable line.
- If the title is vague, missing reproduction detail, or ambiguous, set "needsClarification": true and ask 2–4 specific "questions". Still provide your best partial draft when possible.
- Omit sections that do not apply; do not invent environment or steps you cannot infer.`;

const STORY_EVALUATION_RULES = `Story goal evaluation (required):
- Every Story must define three elements:
  1. Situation — when/where/for whom is this needed?
  2. Ask — what capability, change, or deliverable is being requested?
  3. Result / goal outcome — what concrete result proves success ("so I can…")?
- The summary (job story) and overview must make the ask and result/goal outcome explicit.
- Include "Ask" and "Goal / outcome" sections in "sections" when the story is fully defined.
- Sub-tasks must each trace directly to achieving the stated goal outcome — no generic filler tasks.
- If you cannot confidently infer the situation, ask, OR result/goal from the user's title/prompt, set "needsClarification": true.
- When needsClarification is true: ask exactly 2–3 targeted questions (never more than 3), return "subtasks": [], and still return your best partial summary/overview draft.
- Only propose subtasks when the story is fully defined.`;

export const registerJiraIssueRoutes = (
  app,
  { jiraRequest, ensureEnvOrRespond, resolveJiraUser, runJiraSearchRequest }
) => {
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

  app.get("/api/jira/issues/:issueKey/summary", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const issueKey = String(req.params.issueKey || "").trim().toUpperCase();
    if (!issueKey) {
      return res.status(400).json({ error: "Issue key is required" });
    }

    try {
      const summary = await fetchIssueTypeSummary({ issueKey, jiraRequest });
      if (!summary) {
        return res.status(404).json({ error: "Issue not found", issueKey });
      }

      return res.json(summary);
    } catch (error) {
      return res.status(500).json({
        error: "Failed to load issue summary",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/jira/epics/:epicKey/parent-options", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const epicKey = String(req.params.epicKey || "").trim().toUpperCase();
    if (!epicKey) {
      return res.status(400).json({ error: "Epic key is required" });
    }

    try {
      const epic = await fetchIssueTypeSummary({ issueKey: epicKey, jiraRequest });
      if (!epic) {
        return res.status(404).json({ error: "Epic not found", epicKey });
      }
      if (!epic.isEpic) {
        return res.status(400).json({
          error: "Issue is not an Epic",
          issueKey: epicKey,
          issueType: epic.issueType,
        });
      }

      const search = await searchAllIssues({
        jql: buildEpicStoriesJql(epicKey),
        maxTotal: 200,
        runJiraSearchRequest,
      });

      const stories = (search?.issues || []).map((issue) => ({
        key: String(issue?.key || "").trim(),
        summary: String(issue?.fields?.summary || "").trim(),
      }));

      return res.json({
        epic: {
          key: epic.issueKey,
          summary: epic.summary,
        },
        stories,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to load epic parent options",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/jira/issues/parent-candidates", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const jql = String(req.body?.jql || "").trim();
    if (!jql) {
      return res.status(400).json({ error: "jql is required" });
    }

    const maxTotal = Math.min(200, Math.max(1, Number(req.body?.maxTotal || 100)));

    try {
      const candidates = await loadParentCandidatesFromJql({
        jql,
        maxTotal,
        jiraRequest,
        runJiraSearchRequest,
      });
      return res.json(candidates);
    } catch (error) {
      return res.status(500).json({
        error: "Failed to load parent candidates from JQL",
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
    const isSubtask = Boolean(req.body?.isSubtask);
    const parentRole = String(req.body?.parentRole || "").trim();
    const priority = normalizeOdiBugPriority(req.body?.priority);
    const component = String(req.body?.component || "").trim();
    const verticalComponent = String(req.body?.verticalComponent || "").trim();
    const bugTracking = String(req.body?.bugTracking || "").trim();

    if (!summary) {
      return res.status(400).json({ error: "Summary is required" });
    }

    if (!ALLOWED_ISSUE_TYPES.has(issueType)) {
      return res.status(400).json({
        error: "Invalid issue type",
        allowed: [...ALLOWED_ISSUE_TYPES],
      });
    }

    const standardsCheck = validateOdiIssueCreate({
      issueType,
      summary,
      description,
      epicKey,
      assignee,
      isSubtask,
      parentRole,
      priority: priority || "",
    });
    if (!standardsCheck.valid) {
      return res.status(400).json({
        error: "Issue does not meet ODI Jira standards",
        errors: standardsCheck.errors,
      });
    }

    const parentErrors = await validateParentForCreate({
      issueType,
      parentKey: epicKey,
      isSubtask,
      jiraRequest,
    });
    if (parentErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid parent for issue type",
        errors: parentErrors,
      });
    }

    let assigneeAccountId = "";
    if (assignee) {
      const resolvedUser = await resolveJiraUser({ query: assignee, jiraRequest });
      if (resolvedUser?.accountId) {
        assigneeAccountId = resolvedUser.accountId;
      }
    }

    const descriptionAdf = descriptionTextToAdf(description);
    const createPayload = await buildJiraCreatePayload({
      projectKey,
      issueType,
      summary,
      descriptionAdf,
      parentKey: epicKey,
      parentRole,
      assigneeAccountId,
      odiPriority: priority || "",
      component,
      verticalComponent,
      bugTracking,
      jiraRequest,
    });

    if (!createPayload.ok) {
      return res.status(createPayload.status || 400).json({
        error: createPayload.error,
        errors: [createPayload.error],
      });
    }

    try {
      const result = await jiraRequest({
        method: "POST",
        pathWithQuery: "/rest/api/3/issue",
        body: { fields: createPayload.fields },
      });
      if (!result.ok) {
        const jiraError = formatJiraApiError(result.data);
        log.error(`Jira create rejected (${issueType}): ${jiraError}`);
        return res.status(result.status).json({
          ...result.data,
          error: jiraError,
          errors: [jiraError],
        });
      }

      const issueKey = String(result.data?.key || "").trim();
      log.info(
        `created issue ${issueKey} (${createPayload.issueTypeUsed}${createPayload.linkMode ? ` via ${createPayload.linkMode}` : ""}) in ${projectKey}`
      );
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
- The story TITLE (summary) must follow the Job Story format: "When <situation>, I want <motivation/ask>, so I can <result/goal outcome>."
- If the title provided is not already in job story format, rewrite it into that format and return it as "summary". Keep the summary to one concise sentence (under 25 words when possible).
- The overview must state the ask and the result/goal outcome in 1–2 sentences only.
- Stories are never assigned to individuals; they remain in Backlog until all sub-tasks are closed.

Sub-task standards (only when the story is fully defined — propose 2–5):
- Each sub-task is the smallest concrete unit of work needed to achieve the stated goal outcome.
- Title format: short imperative phrase — "Configure X", "Implement Y handler", "Write tests for Z", "Deploy to UAT".
- Sub-tasks will be created as Task issue type under this story in Jira.

${STORY_EVALUATION_RULES}

${DESCRIPTION_FORMAT_RULES}`
      : isBug
      ? `You are a Jira issue writer for the Operations Devops Itential (ODI) program at Lumen.

ODI Bug standards:
- Overview: 1–2 sentences describing what is broken and user impact.
- Use clearly labeled sections with bullet items. Prefer these labels when applicable:
  - Steps to reproduce
  - Expected behavior
  - Actual behavior
  - Environment / systems affected
  - Suggested troubleshooting
  - Development / fix approach
- Suggest a priority: Low (no system breakdown), Medium (unexpected behavior, system still functional), High (large parts of the system collapse), Critical (complete system/workflow shutdown).
- Ask clarifying questions when reproduction steps, environment, or expected behavior cannot be inferred from the title.

${DESCRIPTION_FORMAT_RULES}`
      : `You are a Jira issue writer for the Operations Devops Itential (ODI) program at Lumen.
Write a clear, concise description for a Jira ${issueType}.
Overview: 1–2 sentences. Follow with labeled bullet sections for implementation or troubleshooting steps as needed.

${DESCRIPTION_FORMAT_RULES}`;

    const userPrompt = isStory
      ? `Write an ODI-standard Jira Story draft. First evaluate whether situation, ask, and result/goal outcome are fully defined from the title below.

Issue type: Story
Title provided: ${summary}${context ? `\nContext: ${context}` : ""}

If situation, ask, or goal outcome is missing or vague, set needsClarification true, ask 2–3 questions, return subtasks as [], and provide only a best-effort partial draft.

Respond with valid JSON only — no prose, no markdown fences:
{
  "needsClarification": false,
  "questions": [],
  "summary": "When <situation>, I want <ask>, so I can <result/goal outcome>.",
  "overview": "One or two sentences naming the ask and the measurable goal outcome.",
  "sections": [
    { "label": "Ask", "items": ["What is being requested"] },
    { "label": "Goal / outcome", "items": ["How we know this succeeded"] },
    { "label": "Development work", "items": ["Concrete step tied to the goal"] }
  ],
  "subtasks": ["Imperative task title 1", "Imperative task title 2"]
}`
      : isBug
      ? `Write an ODI-standard Jira Bug draft.

Issue type: Bug
Title: ${summary}${context ? `\nContext: ${context}` : ""}

Respond with valid JSON only — no prose, no markdown fences:
{
  "needsClarification": false,
  "questions": [],
  "overview": "One or two concise sentences on what is broken and the impact.",
  "sections": [
    { "label": "Steps to reproduce", "items": ["Step one", "Step two"] },
    { "label": "Suggested troubleshooting", "items": ["Check X", "Verify Y"] },
    { "label": "Development / fix approach", "items": ["Fix Z in service A"] }
  ],
  "priority": "Low | Medium | High | Critical"
}`
      : `Write a Jira ${issueType} draft.

Issue type: ${issueType}
Title: ${summary}${context ? `\nContext: ${context}` : ""}

Respond with valid JSON only — no prose, no markdown fences:
{
  "needsClarification": false,
  "questions": [],
  "overview": "One or two concise sentences.",
  "sections": [
    { "label": "Development work", "items": ["Concrete step"] }
  ]
}`;

    try {
      log.info(`generating description for ${issueType}: "${summary}"`);
      const raw = await completeLlmText({ provider, systemPrompt, userMessage: userPrompt, maxTokens: 900 });
      const cleaned = String(raw || "").replace(/```json|```/g, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return res.json({
          needsClarification: false,
          questions: [],
          description: cleaned,
          subtasks: [],
          summary: null,
          priority: null,
        });
      }

      return res.json(buildGenerateDescriptionResponse(parsed, { isStory, isBug }));
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
