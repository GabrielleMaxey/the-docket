// Dashboard AI reports from the latest stored snapshot + configured LLM.

import { completeLlmText, resolveFirstReadyReportProvider } from "../lib/llmClient.mjs";
import { loadWeeklyDigestFromDb } from "../lib/weeklyDigest.mjs";
import {
  insertGeneratedReport,
  getGeneratedReportById,
  listGeneratedReports,
  REPORT_SOURCES,
} from "../lib/reportArchive.mjs";
import { createLogger } from "../lib/logger.mjs";

const log = createLogger("report");

const REPORT_MAX_TOKENS = 2048;

const AUDIENCE_CONFIGS = {
  executive: {
    label: "Executive Summary",
    instruction: `You are writing an Executive Summary for senior leadership at Lumen.
Use clear business language — no Jira terminology or technical jargon. Be concise but complete.

Structure your report with these exact sections:
1. **Project Status Overview** — one-paragraph snapshot of overall health
2. **Key Highlights & Achievements** — what's going well, milestones reached
3. **Challenges & Risks** — overdue items, missed deadlines, concerns
4. **Work in Progress** — what the team is actively working on now
5. **Upcoming Action Items** — decisions or escalations leadership should be aware of

Tone: professional, confident, data-backed.`,
  },

  product_owner: {
    label: "Project Manager Summary",
    instruction: `You are writing a Project Manager Summary for Lumen.
Your role is to give a project manager everything they need to run, communicate, and close this project.

Address each of the following questions directly, using the metrics data provided:

1. **Business Goal & Success Metrics** — What does project completion look like based on the epic structure? How is progress currently being measured?
2. **Key Stakeholders & Decision Authority** — Who are the active contributors? Are there items awaiting decisions, approvals, or sign-off? Flag anything stalled.
3. **Deadline Realism** — What are the configured done dates? Is the current completion trajectory on track to meet them? Call out any past-due projects explicitly.
4. **Schedule & Budget Tracking** — Overall completion %, overdue rate, and whether the pace is sufficient to hit the deadline.
5. **Worst-Case Scenarios** — What risks could derail the project? Focus on overdue items, high overdue rates, stalled epics, and missed milestones.
6. **Delay Impact Analysis** — If the currently delayed or overdue tasks are not resolved soon, what is the realistic downstream impact on timeline and scope?
7. **Team Coordination Support** — Provide a summary paragraph suitable for use in daily or weekly stand-ups, a delivery date communication to stakeholders, and a closing note for final project closeout reports.

Be specific — use percentages, task counts, and epic names. Flag red-flag metrics clearly.
Tone: professional, action-oriented, project-management focused.`,
  },

  developer: {
    label: "Developer Report",
    instruction: `You are writing a status report for the development team at Lumen.
Be specific — include assignee names, overdue counts per person, and task keys where available.

Structure your report with these exact sections:
1. **Team Workload Summary** — open tasks per person, overall velocity
2. **Overdue Items by Assignee** — who has overdue work and how much
3. **Current Work in Progress** — what's actively being worked on
4. **Upcoming Tasks & Focus Areas** — what's coming up, what needs attention

Tone: practical, task-focused, peer-level.`,
  },
};

const sanitizeStatusCounts = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const counts = {};
  for (const [label, count] of Object.entries(value)) {
    const key = String(label || "").trim();
    const numeric = Number(count);
    if (key && numeric > 0) {
      counts[key] = numeric;
    }
  }

  return Object.keys(counts).length > 0 ? counts : null;
};

const sanitizeChartVariant = (value) => (String(value || "").trim() === "bar" ? "bar" : "pie");

const buildReportContext = ({ snapshot, epicMetrics, assigneeMetrics }) => {
  const lines = [
    "## Overall Project Metrics",
    `- Tasks resolved: ${Number(snapshot.overallIssuePercent || 0).toFixed(1)}%`,
    `- Projects complete: ${Number(snapshot.overallEpicPercent || 0).toFixed(1)}%`,
    `- Open tasks overdue: ${Number(snapshot.overallOverduePercent || 0).toFixed(1)}%`,
    `- Snapshot captured: ${snapshot.refreshedAt || "unknown"}`,
  ];

  if (epicMetrics.length > 0) {
    lines.push("", "## Projects & Epics");
    for (const epic of epicMetrics) {
      lines.push("", `### ${epic.epicName || epic.epicKey || "Unknown project"}`);
      lines.push(`- Total tasks: ${epic.totalIssues}`);
      lines.push(`- Open: ${epic.openIssues} | Resolved: ${epic.closedIssues}`);
      lines.push(`- Overdue open tasks: ${epic.overdueOpenIssues}`);
      lines.push(`- Completion: ${Number(epic.issuePercent || 0).toFixed(1)}%`);
      if (epic.isPastDue) {
        lines.push(`- PAST DUE (${epic.pastDueReason || "deadline missed"})`);
      }
      if (epic.mostRecentDoneDate) {
        lines.push(`- Most Recent Done Date: ${epic.mostRecentDoneDate}`);
      }
      if (epic.initialDoneDate) {
        lines.push(`- Initial Done Date: ${epic.initialDoneDate}`);
      }
      if (epic.projectEndDate) {
        lines.push(`- Project End Date: ${epic.projectEndDate}`);
      }
      if (epic.statusCountsJson) {
        try {
          const counts = JSON.parse(epic.statusCountsJson);
          const parts = Object.entries(counts)
            .filter(([, v]) => Number(v) > 0)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          if (parts) {
            lines.push(`- Status breakdown: ${parts}`);
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  }

  if (assigneeMetrics.length > 0) {
    lines.push("", "## Team Overdue Metrics");
    const withWork = assigneeMetrics.filter((p) => p.totalOpenCount > 0);
    if (withWork.length === 0) {
      lines.push("- No team members with open tasks tracked.");
    } else {
      for (const person of withWork) {
        const name = person.resolvedDisplayName || person.queryName || "Unknown";
        const pct = Number(person.overduePercent || 0).toFixed(1);
        lines.push(
          `- ${name}: ${person.overdueOpenCount} overdue / ${person.totalOpenCount} open (${pct}% overdue)`
        );
      }
    }
  }

  return lines.join("\n");
};

const callLLMForReport = async ({ systemPrompt, context, label = "report" }) => {
  log.info(`generating ${label}`);
  const provider = resolveFirstReadyReportProvider();
  return completeLlmText({
    systemPrompt,
    userMessage: context,
    maxTokens: REPORT_MAX_TOKENS,
    provider,
    forReports: true,
  });
};

export const registerReportRoutes = (app, { db }) => {
  const getLatestSnapshotStmt = db.prepare(
    "SELECT * FROM dashboard_snapshots ORDER BY refreshed_at DESC LIMIT 1"
  );
  const getEpicMetricsStmt = db.prepare(
    "SELECT * FROM dashboard_epic_metrics WHERE snapshot_id = ? ORDER BY rowid ASC"
  );
  const getAssigneeMetricsStmt = db.prepare(
    "SELECT * FROM dashboard_assignee_metrics WHERE snapshot_id = ? ORDER BY rowid ASC"
  );
  const getCustomInstructionsStmt = db.prepare(
    "SELECT value FROM app_settings WHERE key = 'chat_custom_instructions'"
  );

  app.post("/api/report/generate", async (req, res) => {
    const audienceKey = String(req.body?.audience || "executive").trim();
    const config = AUDIENCE_CONFIGS[audienceKey] || AUDIENCE_CONFIGS.executive;
    const requestedEpicIds = Array.isArray(req.body?.epicPresetIds)
      ? req.body.epicPresetIds.map(Number).filter((n) => n > 0)
      : [];
    const additionalContext = String(req.body?.additionalContext || "").trim();
    const statusCounts = sanitizeStatusCounts(req.body?.statusCounts);
    const chartVariant = sanitizeChartVariant(req.body?.chartVariant);

    const snapshotRow = getLatestSnapshotStmt.get();
    if (!snapshotRow) {
      return res.status(404).json({
        error: "No dashboard snapshot found. Run a Dashboard refresh first so there is data to report on.",
      });
    }

    const epicRows = getEpicMetricsStmt.all(snapshotRow.id);
    const assigneeRows = getAssigneeMetricsStmt.all(snapshotRow.id);
    const customInstructions = String(getCustomInstructionsStmt.get()?.value || "").trim();

    const snapshot = {
      refreshedAt: snapshotRow.refreshed_at,
      overallIssuePercent: snapshotRow.overall_issue_percent,
      overallEpicPercent: snapshotRow.overall_epic_percent,
      overallOverduePercent: snapshotRow.overall_overdue_percent,
    };

    // Filter to the requested subset of projects if the user chose specific ones.
    const filteredEpicRows = requestedEpicIds.length > 0
      ? epicRows.filter((row) => requestedEpicIds.includes(Number(row.epic_preset_id || 0)))
      : epicRows;

    const epicMetrics = filteredEpicRows.map((row) => ({
      epicKey: row.epic_key,
      epicName: row.epic_name,
      totalIssues: Number(row.total_issues || 0),
      openIssues: Number(row.open_issues || 0),
      closedIssues: Number(row.closed_issues || 0),
      overdueOpenIssues: Number(row.overdue_open_issues || 0),
      issuePercent: Number(row.issue_percent || 0),
      isPastDue: Boolean(row.is_past_due),
      pastDueReason: row.past_due_reason,
      mostRecentDoneDate: row.most_recent_done_date,
      initialDoneDate: row.initial_done_date,
      projectEndDate: row.project_end_date,
      statusCountsJson: row.status_counts_json,
    }));

    const assigneeMetrics = assigneeRows.map((row) => ({
      queryName: row.query_name,
      resolvedDisplayName: row.resolved_display_name,
      totalOpenCount: Number(row.total_open_count || 0),
      overdueOpenCount: Number(row.overdue_open_count || 0),
      overduePercent: Number(row.overdue_percent || 0),
    }));

    const baseContext = buildReportContext({ snapshot, epicMetrics, assigneeMetrics });
    const context = additionalContext
      ? `${baseContext}\n\n## Additional User Context\n${additionalContext}`
      : baseContext;

    const systemParts = [
      config.instruction,
      "Base your report ONLY on the data provided below. Do not invent names, metrics, or details.",
      "Keep the report professional and grounded in the actual numbers.",
    ];

    if (customInstructions) {
      systemParts.push(`\nAdditional standing instructions from app settings:\n${customInstructions}`);
    }

    const systemPrompt = systemParts.join("\n\n");

    try {
      const report = await callLLMForReport({ systemPrompt, context, label: config.label });
      const archiveId = insertGeneratedReport(db, {
        source: REPORT_SOURCES.DASHBOARD,
        reportType: "dashboard_report",
        label: config.label,
        content: report,
        meta: {
          audience: audienceKey,
          epicPresetIds: requestedEpicIds,
          additionalContext,
          snapshotRefreshedAt: snapshot.refreshedAt,
          ...(statusCounts ? { statusCounts, chartVariant } : {}),
        },
      });
      return res.json({
        report,
        audience: audienceKey,
        label: config.label,
        archiveId,
        ...(statusCounts ? { statusCounts, chartVariant } : {}),
      });
    } catch (error) {
      log.error("generation failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Report generation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // ─── Per-project report (WorkWeek task manager) ───────────────────────────
  app.post("/api/report/project", async (req, res) => {
    const label = String(req.body?.label || "Project").trim();
    const summary = req.body?.summary || {};
    const customInstructions = String(getCustomInstructionsStmt.get()?.value || "").trim();

    const contextLines = [
      `## Project: ${label}`,
      `- Total issues: ${summary.total || 0}`,
      `- Open: ${summary.open || 0} | Resolved: ${summary.closed || 0}`,
      `- Overdue: ${summary.overdue || 0}`,
      `- In Progress: ${summary.inProgress || 0}`,
      `- Ready for Verification: ${summary.readyForVerification || 0}`,
    ];
    if (summary.statusBreakdown && Object.keys(summary.statusBreakdown).length > 0) {
      const parts = Object.entries(summary.statusBreakdown)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      if (parts) contextLines.push(`- Status breakdown: ${parts}`);
    }
    if (Array.isArray(summary.topPriorities) && summary.topPriorities.length > 0) {
      contextLines.push("", "### Top Priority Issues");
      for (const issue of summary.topPriorities) {
        const overdueFlag = issue.isOverdue ? " [OVERDUE]" : "";
        contextLines.push(`- ${issue.key}: ${issue.summary} (${issue.status}, assigned: ${issue.assignee})${overdueFlag}`);
      }
    }
    const systemParts = [
      `You are writing a personal project status report for the assignee working on "${label}" at Lumen.
This report is written FROM the assignee's perspective and FOR their benefit — to help them understand their own workload, spot what needs attention, and feel clear on next steps.
Write in second person ("you have", "your open items") so it reads as direct, useful feedback to the person doing the work.

Summarize the project in 3-5 paragraphs:
- How the project is tracking overall (completion %, pace)
- What open items need the most attention, especially anything overdue
- What's in progress and what should come next
- Any risks or blockers to watch

Tone: supportive and honest — like a thoughtful colleague reviewing your work with you, not a manager writing a status update. No bullet lists — use flowing prose.`,
      "Base your report ONLY on the data provided. Do not invent metrics or names.",
    ];
    if (customInstructions) systemParts.push(`\nAdditional instructions:\n${customInstructions}`);
    try {
      const report = await callLLMForReport({ systemPrompt: systemParts.join("\n\n"), context: contextLines.join("\n"), label });
      const archiveId = insertGeneratedReport(db, {
        source: REPORT_SOURCES.WORK_WEEK,
        reportType: "work_week_project_report",
        label,
        content: report,
        meta: { summary },
      });
      return res.json({ report, label, archiveId });
    } catch (error) {
      log.error("project report generation failed", error instanceof Error ? error.message : error);
      return res.status(500).json({ error: "Project report generation failed", message: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // ─── Weekly plan (WorkWeek task manager) ──────────────────────────────────
  app.post("/api/plan/week", async (req, res) => {
    const projects = Array.isArray(req.body?.projects) ? req.body.projects : [];
    const focusStyle = String(req.body?.focusStyle || "balance").trim();
    const capacityHours = Number(req.body?.capacityHours) || 40;
    const additionalContext = String(req.body?.additionalContext || "").trim();
    const customInstructions = String(getCustomInstructionsStmt.get()?.value || "").trim();

    if (projects.length === 0) return res.status(400).json({ error: "No project data provided." });

    const focusInstructions = {
      balance: "Distribute effort across all active projects proportionally.",
      overdue: "Prioritize clearing overdue items first before taking on new work.",
      single: "Focus the majority of effort on the single most critical project.",
      meetings: "Keep the plan light — account for limited deep-work time this week.",
    };

    const contextLines = [
      "## Weekly Planning Context",
      `- Work week capacity: ${capacityHours} hours`,
      `- Focus approach: ${focusStyle}`,
    ];
    if (additionalContext) contextLines.push(`- Additional context: ${additionalContext}`);
    contextLines.push("", "## Active Projects");
    for (const proj of projects) {
      contextLines.push("", `### ${proj.label}`);
      contextLines.push(`- Total: ${proj.total} | Open: ${proj.open} | Overdue: ${proj.overdue}`);
      if (Array.isArray(proj.tasks) && proj.tasks.length > 0) {
        contextLines.push("Top open tasks (by priority):");
        for (const task of proj.tasks.slice(0, 10)) {
          const flag = task.isOverdue ? " [OVERDUE]" : "";
          contextLines.push(`  - ${task.key}: ${task.summary} (${task.status}, assigned: ${task.assignee})${flag}`);
        }
      }
    }

    const systemPrompt = [
      `You are a productivity coach helping a developer at Lumen plan their work week.
Create a practical, day-by-day plan (Monday–Friday) based on the task data below.
Focus approach: ${focusInstructions[focusStyle] || focusInstructions.balance}

Structure:
- **Monday – Friday**: 2–4 concrete tasks per day with issue keys
- **Key Risks**: overdue items or blockers to watch
- **Recommended Focus**: one sentence on the week's top priority

Rules:
- Only reference actual issue keys and summaries from the data below
- Keep each day realistic given ${capacityHours}h total capacity
- Flag overdue items with ⚠️`,
      "Base the plan ONLY on the data provided below.",
      ...(customInstructions ? [`\nAdditional instructions:\n${customInstructions}`] : []),
    ].join("\n\n");

    try {
      const plan = await callLLMForReport({ systemPrompt, context: contextLines.join("\n"), label: "week plan" });
      const archiveId = insertGeneratedReport(db, {
        source: REPORT_SOURCES.WORK_WEEK,
        reportType: "week_plan",
        label: "Week plan",
        content: plan,
        meta: { focusStyle, capacityHours, additionalContext, projectLabels: projects.map((p) => p.label) },
      });
      return res.json({ plan, archiveId });
    } catch (error) {
      log.error("week plan generation failed", error instanceof Error ? error.message : error);
      return res.status(500).json({ error: "Week plan generation failed", message: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/reports/weekly-digest", (_req, res) => {
    try {
      const digest = loadWeeklyDigestFromDb(db);
      if (!digest) {
        return res.status(404).json({
          error: "No dashboard snapshot found. Run a Dashboard refresh first.",
        });
      }
      return res.json({ digest });
    } catch (error) {
      log.error("weekly digest failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to build weekly digest",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/reports/archive", (req, res) => {
    const source = String(req.query?.source || "").trim();
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 100));

    try {
      const items = listGeneratedReports(db, { source, limit });
      return res.json({ items });
    } catch (error) {
      log.error("archive list failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to load archived reports",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/reports/archive", (req, res) => {
    const content = String(req.body?.content || "").trim();
    if (!content) {
      return res.status(400).json({ error: "Missing report content" });
    }

    const labelRaw = String(req.body?.label || "").trim();
    const label =
      labelRaw ||
      content.split(/\r?\n/).find((line) => line.trim())?.slice(0, 80) ||
      "Chat response";

    const userPrompt = String(req.body?.userPrompt || "").trim();
    const provider = String(req.body?.provider || "").trim();

    try {
      const archiveId = insertGeneratedReport(db, {
        source: REPORT_SOURCES.ADHOC,
        reportType: "chat_response",
        label,
        content,
        meta: {
          savedFrom: "chat",
          ...(userPrompt ? { userPrompt } : {}),
          ...(provider ? { provider } : {}),
        },
      });
      return res.json({ ok: true, archiveId, label });
    } catch (error) {
      log.error("archive save failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to save report",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/reports/archive/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid report id" });
    }

    try {
      const item = getGeneratedReportById(db, id);
      if (!item) {
        return res.status(404).json({ error: "Report not found" });
      }
      return res.json({ item });
    } catch (error) {
      log.error("archive get failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to load archived report",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
