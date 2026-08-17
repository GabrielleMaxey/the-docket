// Dashboard AI reports from the latest stored snapshot + configured LLM.

import {
  completeLlmText,
  formatUnableToGenerateReportError,
  resolveFirstReadyReportProvider,
} from "../lib/llmClient.mjs";
import { loadWeeklyDigestFromDb } from "../lib/weeklyDigest.mjs";
import { fetchLatestCommentTextBulk } from "../lib/jiraCommentText.mjs";
import {
  insertGeneratedReport,
  getGeneratedReportById,
  listGeneratedReports,
  deleteGeneratedReportById,
  deleteGeneratedReportsBySource,
  REPORT_SOURCES,
} from "../lib/reportArchive.mjs";
import {
  listCoworkWeeklyPlans,
  readCoworkWeeklyPlan,
} from "../lib/coworkWeeklyPlans.mjs";
import { createLogger } from "../lib/logger.mjs";
import { buildFieldMappingsMap, buildUnionScopeFromJqls, fallbackPresetJql } from "../lib/epicFilterJql.mjs";
import { buildReportDueWindowsAndLinks } from "../lib/reportWorkWeekLinks.mjs";
import {
  CAREER_REPORT_TYPES,
  buildOneOnOneSystemPrompt,
  buildPwbSystemPrompt,
  buildStatusReportSystemPrompt,
  buildWeekPlanSystemPrompt,
  isValidCareerReportType,
  isValidPwbPeriod,
  AUDIENCE_CONFIGS,
} from "../lib/aiInstructions.mjs";
import { computeOverallRollup, normalizePastDueLookbackYears } from "../../shared/dashboardMetrics.mjs";
import { mapEpicPresetRow, mapWatchedAssigneeRow } from "../db/schema.mjs";
import { buildDirectReportsJql, isCurrentUserMember, isJqlCurrentUser, looksLikeAccountId } from "../../shared/directReportsJql.mjs";
import { fetchJiraMyself } from "../lib/jiraSearchHelpers.mjs";

const log = createLogger("report");

const REPORT_MAX_TOKENS = 2048;

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

const isDirectReportAssigneeRow = (row) => {
  const queryType = String(row.queryType || row.query_type || "person").trim();
  const jql = String(row.jql || "").trim();
  return queryType === "direct_reports" || (queryType === "person" && Boolean(jql));
};

const isTranslatedPersonName = (person) => {
  const name = String(person?.resolvedDisplayName || person?.queryName || "").trim();
  if (!name || isJqlCurrentUser(name) || looksLikeAccountId(name)) {
    return false;
  }
  return true;
};

const sanitizeChartVariant = (value) => (String(value || "").trim() === "bar" ? "bar" : "pie");

const getClientArchiveTimestamp = (req) => String(req.body?.savedAtLocal || "").trim();

const getClientArchiveMeta = (req) => {
  const savedAtLocal = String(req.body?.savedAtLocal || "").trim();
  const savedTimeZone = String(req.body?.savedTimeZone || "").trim();
  return {
    ...(savedAtLocal ? { savedAtLocal } : {}),
    ...(savedTimeZone ? { savedTimeZone } : {}),
  };
};

const parseJsonObjectSafe = (raw) => {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const parseJsonArrayLength = (raw) => {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
};

const buildReportContext = ({ snapshot, epicMetrics, assigneeMetrics, windowContext }) => {
  const rollup = epicMetrics.length > 0 ? computeOverallRollup(
    epicMetrics.map((epic) => ({
      ...epic,
      completedIssues: epic.completedIssues ?? epic.closedIssues ?? 0,
      statusCounts: epic.statusCounts || parseJsonObjectSafe(epic.statusCountsJson),
    }))
  ) : null;
  const overallIssuePercent = rollup?.overallIssuePercent ?? snapshot.overallIssuePercent;
  const overallEpicPercent = rollup?.overallEpicPercent ?? snapshot.overallEpicPercent;
  const overallOverduePercent = rollup?.overallOverduePercent ?? snapshot.overallOverduePercent;
  const scopeNames = epicMetrics
    .map((epic) => epic.epicName || epic.epicKey)
    .filter(Boolean);

  const lines = [
    "## Overall Project Metrics",
    `- Report scope: ${scopeNames.length > 0 ? scopeNames.join("; ") : "snapshot projects"}`,
    `- Tasks resolved: ${Number(overallIssuePercent || 0).toFixed(1)}%`,
    `- Projects complete: ${Number(overallEpicPercent || 0).toFixed(1)}%`,
    `- Open tasks overdue: ${Number(overallOverduePercent || 0).toFixed(1)}%`,
    `- Snapshot captured: ${snapshot.refreshedAt || "unknown"}`,
  ];

  if (windowContext) {
    lines.push("", windowContext);
  }

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
        } catch {}
      }
    }
  }

  if (assigneeMetrics.length > 0) {
    lines.push("", "## Team Overdue Metrics");
    const people = assigneeMetrics.filter((person) => person.queryType !== "jql");
    const listed = people.length > 0 ? people : assigneeMetrics;
    const teamAssigned = listed.reduce(
      (sum, person) => sum + Number(person.totalAssigned || person.totalOpenCount || 0),
      0
    );
    const withOpen = listed.filter((person) => person.totalOpenCount > 0);
    const avgOpen =
      withOpen.length > 0
        ? withOpen.reduce((sum, person) => sum + person.totalOpenCount, 0) / withOpen.length
        : 0;

    if (listed.length === 0) {
      lines.push("- No team members with open tasks tracked.");
    } else {
      for (const person of listed) {
        const name = person.resolvedDisplayName || person.queryName || "Unknown";
        const pct =
          person.overduePercent == null ? "n/a" : Number(person.overduePercent || 0).toFixed(1);
        const assigned = Number(person.totalAssigned || person.totalOpenCount || 0);
        const share = teamAssigned > 0 ? ((assigned / teamAssigned) * 100).toFixed(1) : "0.0";
        const totalIssues = Number(person.totalIssues || 0);
        const resolved = Number(person.totalResolved || 0);
        const resolutionPct =
          totalIssues > 0 ? ((resolved / totalIssues) * 100).toFixed(1) : "n/a";
        const heavier = avgOpen > 0 && person.totalOpenCount > avgOpen * 1.25;
        lines.push(
          `- ${name}: ${person.overdueOpenCount} overdue / ${person.totalOpenCount} open (${pct}% overdue); assigned ${assigned} (${share}% of team assigned work); resolved ${resolved}/${totalIssues} (${resolutionPct}%); upcoming due ${person.upcomingDueCount || 0}${heavier ? "; heavier than team average open load" : ""}`
        );
      }
    }
  }

  return lines.join("\n");
};

const callLLMForReport = async ({ systemPrompt, context, label = "report" }) => {
  const provider = resolveFirstReadyReportProvider();
  log.info(`generating ${label} via ${provider}`);
  try {
    return await completeLlmText({
      systemPrompt,
      userMessage: context,
      maxTokens: REPORT_MAX_TOKENS,
      provider,
      forReports: true,
    });
  } catch (error) {
    throw new Error(formatUnableToGenerateReportError(provider, error));
  }
};

export const registerReportRoutes = (app, { db, dataDir, jiraRequest }) => {
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
  const getEpicPastDueModeStmt = db.prepare(
    "SELECT value FROM app_settings WHERE key = 'epic_past_due_mode'"
  );
  const listFieldMappingsStmt = db.prepare(
    "SELECT role, field_id, field_name FROM jira_field_mappings ORDER BY role ASC"
  );
  const getEpicPresetStmt = db.prepare("SELECT * FROM epic_presets WHERE id = ?");
  const listDirectReportWatchesStmt = db.prepare(
    "SELECT * FROM watched_assignees WHERE watch_type = 'direct_reports' ORDER BY sort_order ASC, id ASC"
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
      includePastDue: Boolean(snapshotRow.include_past_due),
      pastDueLookbackYears: normalizePastDueLookbackYears(
        snapshotRow.past_due_lookback_years ??
          (snapshotRow.extended_past_due_history ? 3 : 1)
      ),
      dueByDate: snapshotRow.due_by_date || null,
      dueByField: String(snapshotRow.due_by_field || "due_date").trim(),
    };

    // Filter to the requested subset of projects if the user chose specific ones.
    const presetEpicRows = epicRows.filter((row) => Number(row.epic_preset_id || 0) > 0);
    const filteredEpicRows = requestedEpicIds.length > 0
      ? presetEpicRows.filter((row) => requestedEpicIds.includes(Number(row.epic_preset_id || 0)))
      : presetEpicRows;

    const epicMetrics = filteredEpicRows.map((row) => ({
      epicKey: row.epic_key,
      epicName: row.epic_name,
      totalIssues: Number(row.total_issues || 0),
      openIssues: Number(row.open_issues || 0),
      closedIssues: Number(row.closed_issues || 0),
      completedIssues: Number(row.closed_issues || 0),
      overdueOpenIssues: Number(row.overdue_open_issues || 0),
      dueByOpenIssues: Number(row.due_by_open_issues || 0),
      issuePercent: Number(row.issue_percent || 0),
      epicPercent: Number(row.epic_percent || 0),
      isPastDue: Boolean(row.is_past_due),
      pastDueReason: row.past_due_reason,
      mostRecentDoneDate: row.most_recent_done_date,
      initialDoneDate: row.initial_done_date,
      projectEndDate: row.project_end_date,
      statusCountsJson: row.status_counts_json,
      statusCounts: parseJsonObjectSafe(row.status_counts_json),
      openStatusCounts: parseJsonObjectSafe(row.open_status_counts_json),
    }));

    const assigneeMetrics = assigneeRows.map((row) => {
      const workload = parseJsonObjectSafe(row.workload_counts_json);
      return {
        queryName: row.query_name,
        resolvedDisplayName: row.resolved_display_name,
        resolvedAccountId: String(row.resolved_account_id || "").trim(),
        queryType: String(row.query_type || "person").trim(),
        jql: String(row.jql || "").trim(),
        totalOpenCount: Number(row.total_open_count || 0),
        overdueOpenCount: Number(row.overdue_open_count || 0),
        overduePercent: row.overdue_percent == null ? null : Number(row.overdue_percent),
        totalAssigned: Number(workload.totalAssigned ?? row.total_open_count ?? 0),
        totalIssues: Number(workload.totalIssues || 0),
        totalResolved: Number(workload.totalResolved || 0),
        upcomingDueCount: parseJsonArrayLength(row.upcoming_due_issues_json),
        inProgress: Number(workload.inProgress || 0),
        backlog: Number(workload.backlog || 0),
      };
    });

    let epicMetricsForReport = epicMetrics;
    let assigneeMetricsForReport = assigneeMetrics;
    const isAdhocTeamReport = audienceKey === "direct_reports";
    let savedTeamQueries = [];
    let myself = null;
    if (isAdhocTeamReport) {
      savedTeamQueries = listDirectReportWatchesStmt.all().map(mapWatchedAssigneeRow).filter(Boolean);
      if (savedTeamQueries.length === 0) {
        return res.status(400).json({
          error:
            "No My Direct Reports query in Settings. Save people there, select the query on Dashboard, then Refresh contributors.",
        });
      }
      myself = typeof jiraRequest === "function" ? await fetchJiraMyself({ jiraRequest }) : null;
      assigneeMetricsForReport = assigneeMetrics
        .filter(isDirectReportAssigneeRow)
        .filter(isTranslatedPersonName)
        .filter(
          (person) =>
            !isCurrentUserMember(person.resolvedDisplayName || person.queryName, myself) &&
            !isCurrentUserMember(person.queryName, myself) &&
            !isCurrentUserMember(person.resolvedAccountId, myself)
        );
      if (assigneeMetricsForReport.length === 0) {
        return res.status(400).json({
          error:
            "Ad-hoc team report needs My Direct Reports people in the snapshot. Select the My Direct Reports chips on Dashboard, then click Refresh contributors.",
        });
      }
      epicMetricsForReport = [];
    }

    const mappingsByRole = buildFieldMappingsMap(listFieldMappingsStmt.all());
    const epicPastDueMode = String(getEpicPastDueModeStmt.get()?.value || "either").trim();
    const presetIdsForLinks = isAdhocTeamReport
      ? []
      : [
          ...new Set(
            (requestedEpicIds.length > 0
              ? requestedEpicIds
              : filteredEpicRows.map((row) => Number(row.epic_preset_id || 0))
            ).filter((id) => id > 0)
          ),
        ];
    const presetUnionScope = buildUnionScopeFromJqls(
      isAdhocTeamReport
        ? savedTeamQueries
            .map((watch) => buildDirectReportsJql(watch.memberNames, myself) || watch.jql)
            .filter(Boolean)
        : presetIdsForLinks
            .map((id) => mapEpicPresetRow(getEpicPresetStmt.get(id)))
            .filter(Boolean)
            .map((preset) => preset.jql || fallbackPresetJql(preset.epicKey))
    );
    const linkEpicMetrics = isAdhocTeamReport
      ? assigneeMetricsForReport.map((person) => ({
          overdueOpenIssues: person.overdueOpenCount,
          dueByOpenIssues: person.upcomingDueCount,
          openStatusCounts: {
            "In Progress": person.inProgress,
            Backlog: person.backlog,
          },
        }))
      : epicMetricsForReport;
    const dueWindows = buildReportDueWindowsAndLinks({
      snapshot,
      mappingsByRole,
      epicPastDueMode,
      presetUnionScope,
      epicMetrics: linkEpicMetrics,
    });

    const baseContext = buildReportContext({
      snapshot,
      epicMetrics: epicMetricsForReport,
      assigneeMetrics: assigneeMetricsForReport,
      windowContext: dueWindows.windowContext,
    });
    const context = additionalContext
      ? `${baseContext}\n\n## Additional User Context\n${additionalContext}`
      : baseContext;

    const systemParts = [
      config.instruction,
      "Base the report only on the data that follows. Do not invent names, metrics, or details.",
      "No preamble or sign-off. Use the requested headings only.",
    ];

    if (customInstructions) {
      systemParts.push(`\nAdditional standing instructions from app settings:\n${customInstructions}`);
    }

    const systemPrompt = systemParts.join("\n\n");

    try {
      const generated = await callLLMForReport({ systemPrompt, context, label: config.label });
      const report = dueWindows.appendedSection
        ? `${generated.trim()}\n\n${dueWindows.appendedSection}`
        : generated.trim();
      const archiveId = insertGeneratedReport(db, {
        source: REPORT_SOURCES.DASHBOARD,
        reportType: "dashboard_report",
        label: config.label,
        content: report,
        createdAt: getClientArchiveTimestamp(req),
        meta: {
          audience: audienceKey,
          epicPresetIds: requestedEpicIds,
          additionalContext,
          snapshotRefreshedAt: snapshot.refreshedAt,
          ...getClientArchiveMeta(req),
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
        error: error instanceof Error ? error.message : "Unable to generate report.",
      });
    }
  });

  // ─── Per-project report (WorkWeek task manager) ───────────────────────────
  app.post("/api/report/project", async (req, res) => {
    const label = String(req.body?.label || "Project").trim();
    const jql = String(req.body?.jql || "").trim();
    const summary = req.body?.summary || {};
    const customInstructions = String(getCustomInstructionsStmt.get()?.value || "").trim();
    const rawReportType = String(req.body?.reportType || "").trim();
    const careerReportType = isValidCareerReportType(rawReportType) ? rawReportType : null;
    const userGoals = String(req.body?.userGoals || "").trim();
    const companyGoals = String(req.body?.companyGoals || "").trim();

    if (careerReportType === CAREER_REPORT_TYPES.PWB && !isValidPwbPeriod(req.body?.pwbPeriod)) {
      return res.status(400).json({ error: "A valid PWB review period (quarterly, mid_year, or yearly) is required." });
    }
    const pwbPeriod = careerReportType === CAREER_REPORT_TYPES.PWB ? req.body.pwbPeriod : null;

    const contextLines = [
      `## Project: ${label}`,
    ];
    if (jql) {
      contextLines.push(`- Query (JQL): ${jql}`);
    }
    const totalCount = Number(summary.total) || 0;
    const closedCount = Number(summary.closed) || 0;
    const completionRatePercent = totalCount > 0 ? Math.round((closedCount / totalCount) * 1000) / 10 : null;
    contextLines.push(
      `- Total issues: ${summary.total || 0}`,
      `- Open: ${summary.open || 0} | Resolved: ${summary.closed || 0}`,
      `- Completion rate: ${completionRatePercent != null ? `${completionRatePercent}%` : "n/a (no issues in scope)"}`,
      `- Overdue: ${summary.overdue || 0}`,
      `- In Progress: ${summary.inProgress || 0}`,
      `- Ready for Verification: ${summary.readyForVerification || 0}`
    );
    if (summary.statusBreakdown && Object.keys(summary.statusBreakdown).length > 0) {
      const parts = Object.entries(summary.statusBreakdown)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      if (parts) contextLines.push(`- Status breakdown: ${parts}`);
    }
    if (Array.isArray(summary.topPriorities) && summary.topPriorities.length > 0) {
      // A Backlog-status issue with a recent Jira comment usually means real
      // work is happening but the status was never updated to reflect it -
      // exactly the kind of gap that makes "0 In Progress" look like a lull
      // when it might not be one. Checked only for Backlog items (not all
      // topPriorities) to keep the added Jira calls bounded.
      const backlogKeys = summary.topPriorities
        .filter((issue) => String(issue.status || "").trim().toLowerCase() === "backlog")
        .map((issue) => issue.key)
        .filter(Boolean);
      const staleStatusKeys = new Set();
      if (backlogKeys.length > 0) {
        try {
          const fourteenDaysAgo = new Date();
          fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
          const cutoff = fourteenDaysAgo.toISOString().slice(0, 10);
          const { items: latestComments } = await fetchLatestCommentTextBulk({
            issueKeys: backlogKeys,
            jiraRequest,
          });
          for (const key of backlogKeys) {
            const created = String(latestComments?.[key]?.created || "");
            if (created && created.slice(0, 10) >= cutoff) {
              staleStatusKeys.add(key);
            }
          }
        } catch (error) {
          log.warn(
            "Skipped backlog/comment status-hygiene check",
            error instanceof Error ? error.message : error
          );
        }
      }

      contextLines.push("", "### Top Priority Issues");
      for (const issue of summary.topPriorities) {
        const overdueFlag = issue.isOverdue ? " [OVERDUE]" : "";
        const staleStatusFlag = staleStatusKeys.has(issue.key)
          ? " [Backlog status, but has a Jira comment within the last 14 days - status may be stale]"
          : "";
        contextLines.push(
          `- ${issue.key}: ${issue.summary} (${issue.status}, assigned: ${issue.assignee})${overdueFlag}${staleStatusFlag}`
        );
      }
    }

    let systemPromptBase;
    let archiveReportType = "work_week_project_report";
    const archiveMeta = { summary, jql: jql || undefined };
    if (careerReportType === CAREER_REPORT_TYPES.ONE_ON_ONE) {
      systemPromptBase = buildOneOnOneSystemPrompt({ label, userGoals, companyGoals });
      archiveReportType = "work_week_one_on_one";
      archiveMeta.userGoals = userGoals || undefined;
      archiveMeta.companyGoals = companyGoals || undefined;
    } else if (careerReportType === CAREER_REPORT_TYPES.PWB) {
      systemPromptBase = buildPwbSystemPrompt({ label, period: pwbPeriod, userGoals, companyGoals });
      archiveReportType = "work_week_pwb_review";
      archiveMeta.pwbPeriod = pwbPeriod;
      archiveMeta.userGoals = userGoals || undefined;
      archiveMeta.companyGoals = companyGoals || undefined;
    } else {
      systemPromptBase = buildStatusReportSystemPrompt({ label });
    }
    const systemParts = [
      systemPromptBase,
      "Base your report ONLY on the data provided. Do not invent metrics or names.",
    ];
    if (customInstructions) systemParts.push(`\nAdditional instructions:\n${customInstructions}`);
    try {
      const report = await callLLMForReport({ systemPrompt: systemParts.join("\n\n"), context: contextLines.join("\n"), label });
      const archiveId = insertGeneratedReport(db, {
        source: REPORT_SOURCES.WORK_WEEK,
        reportType: archiveReportType,
        label,
        content: report,
        createdAt: getClientArchiveTimestamp(req),
        meta: { ...archiveMeta, ...getClientArchiveMeta(req) },
      });
      return res.json({ report, label, archiveId });
    } catch (error) {
      log.error("project report generation failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to generate report.",
      });
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

    const systemPrompt = buildWeekPlanSystemPrompt({ focusStyle, capacityHours, customInstructions });

    try {
      const plan = await callLLMForReport({ systemPrompt, context: contextLines.join("\n"), label: "week plan" });
      const archiveId = insertGeneratedReport(db, {
        source: REPORT_SOURCES.WORK_WEEK,
        reportType: "week_plan",
        label: "Week plan",
        content: plan,
        createdAt: getClientArchiveTimestamp(req),
        meta: {
          focusStyle,
          capacityHours,
          additionalContext,
          projectLabels: projects.map((p) => p.label),
          ...getClientArchiveMeta(req),
        },
      });
      return res.json({ plan, archiveId });
    } catch (error) {
      log.error("week plan generation failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Unable to generate report.",
      });
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

  app.get("/api/reports/cowork-files", (_req, res) => {
    try {
      const items = listCoworkWeeklyPlans(dataDir);
      return res.json({ items });
    } catch (error) {
      log.error("cowork files list failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to list CoWork weekly plans",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/reports/cowork-files/:filename", (req, res) => {
    try {
      const result = readCoworkWeeklyPlan(dataDir, req.params.filename);
      if (!result.ok) {
        return res.status(result.status || 400).json({ error: result.error });
      }
      return res.json({ item: result.item });
    } catch (error) {
      log.error("cowork file read failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to read CoWork weekly plan",
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

    const fromCoworkFile = Boolean(req.body?.fromCoworkFile);
    const filename = String(req.body?.filename || "").trim();

    if (fromCoworkFile) {
      const labelRaw = String(req.body?.label || "").trim();
      const label = labelRaw || filename || "Week plan";

      try {
        const archiveId = insertGeneratedReport(db, {
          source: REPORT_SOURCES.WORK_WEEK,
          reportType: "week_plan",
          label,
          content,
          createdAt: getClientArchiveTimestamp(req),
          meta: {
            fromCoworkFile: true,
            ...(filename ? { filename } : {}),
            ...getClientArchiveMeta(req),
          },
        });
        return res.json({ ok: true, archiveId, label });
      } catch (error) {
        log.error("cowork archive save failed", error instanceof Error ? error.message : error);
        return res.status(500).json({
          error: "Failed to save report",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const labelRaw = String(req.body?.label || "").trim();
    const label =
      labelRaw ||
      content.split(/\r?\n/).find((line) => line.trim())?.slice(0, 80) ||
      "Chat response";

    const userPrompt = String(req.body?.userPrompt || "").trim();
    const provider = String(req.body?.provider || "").trim();
    // Historically hardcoded to "chat" since this endpoint only ever had
    // one caller (Chat's own save button). Now accepts an override so
    // other pages (e.g. Project Managers) can save through the same
    // endpoint without every non-chat save being mislabeled as chat in
    // the archive - defaults to "chat" to keep the existing caller's
    // behavior exactly as it was.
    const savedFrom = String(req.body?.savedFrom || "").trim() || "chat";

    try {
      const archiveId = insertGeneratedReport(db, {
        source: REPORT_SOURCES.ADHOC,
        reportType: "chat_response",
        label,
        content,
        createdAt: getClientArchiveTimestamp(req),
        meta: {
          savedFrom,
          ...getClientArchiveMeta(req),
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

  app.delete("/api/reports/archive/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid report id" });
    }

    try {
      const deleted = deleteGeneratedReportById(db, id);
      if (!deleted) {
        return res.status(404).json({ error: "Report not found" });
      }
      return res.json({ ok: true, id });
    } catch (error) {
      log.error("archive delete failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to delete archived report",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Bulk-delete every report in one Past Reports tab. `source` is required
  // and must be a known value - unlike the list endpoint, where an empty
  // filter harmlessly means "show everything", an empty filter here would
  // mean "delete everything in the table", so that's refused rather than
  // silently allowed.
  app.delete("/api/reports/archive", (req, res) => {
    const source = String(req.query?.source || "").trim();
    if (!Object.values(REPORT_SOURCES).includes(source)) {
      return res.status(400).json({
        error: "A valid source query param is required (work_week, dashboard, or adhoc).",
      });
    }

    try {
      const deletedCount = deleteGeneratedReportsBySource(db, { source });
      return res.json({ ok: true, deletedCount });
    } catch (error) {
      log.error("archive bulk delete failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to delete archived reports",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
