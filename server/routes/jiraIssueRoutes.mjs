import { createLogger } from "../lib/logger.mjs";
import { completeLlmText, resolveFirstReadyReportProvider } from "../lib/llmClient.mjs";
import { buildAiDraftSystemPrompt, buildAiDraftUserPrompt } from "../lib/aiInstructions.mjs";
import { searchAllIssues } from "../lib/jiraSearchHelpers.mjs";
import { loadParentCandidatesFromJql } from "../lib/jiraParentCandidates.mjs";
import { getJiraSearchFields } from "../lib/jiraSearchFields.mjs";
import {
  buildEpicStoriesJql,
  buildJiraCreatePayload,
  formatJiraApiError,
  loadCreateFieldOptions,
} from "../lib/jiraCreateIssueFields.mjs";
import {
  buildAiHelperIntakePrompt,
  normalizeAiHelperIntake,
  validateAiHelperIntake,
} from "../../shared/aiHelperIntake.mjs";
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

const buildGenerateDescriptionResponse = (parsed, { isStory, isBug, allowSummary = false }) => {
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
    summary: isStory || allowSummary ? String(parsed?.summary || "").trim() || null : null,
    description,
    subtasks,
    priority: isBug ? String(parsed?.priority || "").trim() || null : null,
  };
};

export const registerJiraIssueRoutes = (
  app,
  { db, jiraRequest, ensureEnvOrRespond, resolveJiraUser, runJiraSearchRequest }
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

  app.get("/api/jira/projects/:key/create-field-options", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const projectKey = String(req.params.key || "").trim();
    if (!projectKey) {
      return res.status(400).json({ error: "Project key is required" });
    }

    const issueTypeName = String(req.query.issueType || "Story").trim() || "Story";

    try {
      const options = await loadCreateFieldOptions({
        projectKey,
        issueTypeName,
        jiraRequest,
      });
      return res.json({ projectKey, issueType: issueTypeName, ...options });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to load create field options",
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
        searchFields: getJiraSearchFields(db),
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

    const projectKey = String(req.body?.projectKey || "").trim();
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
    const overrideDescriptionStandards = Boolean(req.body?.overrideDescriptionStandards);

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
      skipDescriptionStandards: overrideDescriptionStandards,
    });
    if (!standardsCheck.valid) {
      log.warn(`create ${issueType} rejected: issue standards`, {
        epicKey,
        overrideDescriptionStandards,
        errors: standardsCheck.errors,
      });
      return res.status(400).json({
        error: "Issue does not meet Jira standards",
        errors: standardsCheck.errors,
      });
    }

    if (overrideDescriptionStandards) {
      log.warn(`create ${issueType}: description standards overridden`, {
        epicKey,
        summary,
      });
    }

    const parentErrors = await validateParentForCreate({
      issueType,
      parentKey: epicKey,
      isSubtask,
      jiraRequest,
    });
    if (parentErrors.length > 0) {
      log.warn(`create ${issueType} rejected: invalid parent ${epicKey}`, {
        parentKey: epicKey,
        errors: parentErrors,
      });
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
      isSubtask,
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

  // Generates a description (and optional subtasks for Stories) from a title + context.
  app.post("/api/jira/issues/generate-description", async (req, res) => {
    const summary = String(req.body?.summary || "").trim();
    const issueType = String(req.body?.issueType || "Story").trim();
    const epicName = String(req.body?.epicName || "").trim();
    const epicKey = String(req.body?.epicKey || "").trim();
    const intake = normalizeAiHelperIntake(issueType, req.body?.intake);
    const hasIntake = Object.keys(intake).length > 0;

    // With guided intake the AI derives the title, so a summary is only required without it.
    if (!summary && !hasIntake) {
      return res.status(400).json({ error: "summary is required" });
    }

    if (hasIntake) {
      const intakeCheck = validateAiHelperIntake(issueType, intake);
      if (!intakeCheck.valid) {
        return res.status(400).json({
          error: intakeCheck.errors[0],
          errors: intakeCheck.errors,
          missingFieldIds: intakeCheck.missingFieldIds,
        });
      }
    }

    const provider = resolveFirstReadyReportProvider();
    if (!provider) {
      return res.status(503).json({ error: "No AI provider configured. Set CHAT_PROVIDER or REPORT_PROVIDER in .env." });
    }

    const isStory = issueType === "Story";
    const isBug = issueType === "Bug";
    const contextParts = [];
    if (isStory || isBug) {
      if (epicName) contextParts.push(`Epic: ${epicName}`);
      if (epicKey && epicKey !== "JQL") contextParts.push(`Epic key: ${epicKey}`);
    } else {
      // For Tasks, epicKey is the parent Story key (Tasks parent to Stories, not Epics)
      if (epicKey && epicKey !== "JQL") contextParts.push(`Parent Story key: ${epicKey}`);
      if (epicName) contextParts.push(`Epic: ${epicName}`);
    }
    const context = contextParts.join(" | ");

    const systemPrompt = buildAiDraftSystemPrompt({ isStory, isBug, hasIntake });
    const userPrompt = buildAiDraftUserPrompt({
      summary,
      context,
      isStory,
      isBug,
      intakeBlock: hasIntake ? buildAiHelperIntakePrompt(issueType, intake) : "",
    });

    try {
      log.info(
        `generating description for ${issueType}: "${summary || "(from AI helper intake)"}"${hasIntake ? " with guided intake" : ""}`
      );
      const maxTokens = isStory ? 1400 : isBug ? 900 : 600;
      const raw = await completeLlmText({ provider, systemPrompt, userMessage: userPrompt, maxTokens });
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

      return res.json(
        buildGenerateDescriptionResponse(parsed, { isStory, isBug, allowSummary: hasIntake })
      );
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
