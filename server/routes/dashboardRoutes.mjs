import {
  mapDashboardAssigneeMetricRow,
  mapDashboardEpicMetricRow,
  mapDashboardSnapshotRow,
  mapEpicPresetRow,
  mapWatchedAssigneeRow,
} from "../db/schema.mjs";
import {
  buildDashboardMetricsJql,
  buildFieldMappingsMap,
  buildPastDueJql,
  resolvePresetJql,
} from "../lib/epicFilterJql.mjs";
import {
  computeAssigneeMetrics,
  computeContributorMetricsFromIssues,
  computeChildIssueMetrics,
  computeEpicPastDue,
  computeEpicPercent,
  computeJqlWatchMetricsByAssignee,
  computeOverallRollup,
  formatDateOnly,
  getFieldValue,
  getIssueStatusName,
  isIssueOpen,
  parseJiraDate,
} from "../../shared/dashboardMetrics.mjs";
import { fetchEpicIssue, resolveJiraUser, searchAllIssues } from "../lib/jiraSearchHelpers.mjs";

// When a due date is set on the Epic itself rather than on individual child
// tasks (the common Lumen pattern), child tasks inherit no duedate field and
// won't match the date-range check on their own. This helper closes that gap:
// candidateFieldIds controls which date fields to check on the epic — the
// caller decides based on the user's "Initial Done Date" vs
// "Most Recent Done Date" selection.
const buildEpicLevelDueByIssues = ({
  epicIssue,
  childIssues,
  epicKey,
  dueByDate,
  candidateFieldIds,
  existingDueByKeys,
}) => {
  if (!dueByDate || !epicIssue || !childIssues.length || !candidateFieldIds.length) {
    return [];
  }

  const cutoff = new Date(dueByDate + "T23:59:59");
  const today = new Date();

  // Check each candidate field and pick the earliest date within the cutoff.
  let epicDueDate = null;
  let epicDueValue = null;

  for (const fieldId of candidateFieldIds) {
    const value = getFieldValue(epicIssue, fieldId);
    if (!value) {
      continue;
    }

    const date = parseJiraDate(value);
    if (!date || date > cutoff) {
      continue;
    }

    if (!epicDueDate || date < epicDueDate) {
      epicDueDate = date;
      epicDueValue = value;
    }
  }

  if (!epicDueDate) {
    return [];
  }

  const epicIsOverdue = epicDueDate < today;
  const epicDueDateStr = formatDateOnly(epicDueValue);

  return childIssues
    .filter(
      (issue) =>
        isIssueOpen(issue) && !existingDueByKeys.has(String(issue.key || ""))
    )
    .map((issue) => ({
      key: String(issue.key || ""),
      summary: String(issue.fields?.summary || ""),
      status: getIssueStatusName(issue),
      assignee: String(issue.fields?.assignee?.displayName || "Unassigned"),
      dueDate: epicDueDateStr,
      issueType: String(issue.fields?.issuetype?.name || ""),
      epicKey: String(epicKey || ""),
      self: String(issue.self || ""),
      isOverdue: epicIsOverdue,
    }));
};

// Map the user's field selection to the actual Jira field IDs to check.
const resolveCandidateFieldIds = (dueByField, { dueFieldId, mrdFieldId, iddFieldId, pedFieldId }) => {
  if (dueByField === "initial_done_date") {
    return [iddFieldId].filter(Boolean);
  }
  if (dueByField === "most_recent_done_date") {
    return [mrdFieldId].filter(Boolean);
  }
  // Default / "both": check all configured fields.
  return [dueFieldId, mrdFieldId, iddFieldId, pedFieldId].filter(Boolean);
};

const EPIC_PAST_DUE_MODES = new Set(["most_recent_done_date", "project_end_date", "either"]);

const loadLatestSnapshot = (db, stmts) => {
  const snapshotRow = stmts.getLatestSnapshotStmt.get();
  if (!snapshotRow) {
    return null;
  }

  const epics = stmts.listEpicMetricsForSnapshotStmt
    .all(snapshotRow.id)
    .map(mapDashboardEpicMetricRow);
  const assignees = stmts.listAssigneeMetricsForSnapshotStmt
    .all(snapshotRow.id)
    .map(mapDashboardAssigneeMetricRow);

  return mapDashboardSnapshotRow(snapshotRow, { epics, assignees });
};

export const registerDashboardRoutes = (
  app,
  { db, jiraRequest, ensureEnvOrRespond, runJiraSearchRequest }
) => {
  const listFieldMappingsStmt = db.prepare(
    "SELECT role, field_id, field_name FROM jira_field_mappings ORDER BY role ASC"
  );
  const listSettingsStmt = db.prepare("SELECT key, value FROM app_settings");
  const getEpicPresetStmt = db.prepare("SELECT * FROM epic_presets WHERE id = ?");
  const getWatchedAssigneeStmt = db.prepare("SELECT * FROM watched_assignees WHERE id = ?");

  const getLatestSnapshotStmt = db.prepare(
    "SELECT * FROM dashboard_snapshots ORDER BY refreshed_at DESC, id DESC LIMIT 1"
  );
  const listEpicMetricsForSnapshotStmt = db.prepare(
    "SELECT * FROM dashboard_epic_metrics WHERE snapshot_id = ? ORDER BY id ASC"
  );
  const listAssigneeMetricsForSnapshotStmt = db.prepare(
    "SELECT * FROM dashboard_assignee_metrics WHERE snapshot_id = ? ORDER BY id ASC"
  );

  const deleteAllAssigneeMetricsStmt = db.prepare("DELETE FROM dashboard_assignee_metrics");
  const deleteAllEpicMetricsStmt = db.prepare("DELETE FROM dashboard_epic_metrics");
  const deleteAllSnapshotsStmt = db.prepare("DELETE FROM dashboard_snapshots");

  const insertSnapshotStmt = db.prepare(`
    INSERT INTO dashboard_snapshots (
      refreshed_at,
      epic_preset_ids_json,
      include_past_due,
      due_by_date,
      due_by_field,
      due_by_issues_json,
      assignee_names_json,
      watched_assignee_ids_json,
      overall_issue_percent,
      overall_epic_percent,
      overall_overdue_percent,
      status_counts_json
    ) VALUES (
      @refreshedAt,
      @epicPresetIdsJson,
      @includePastDue,
      @dueByDate,
      @dueByField,
      @dueByIssuesJson,
      @assigneeNamesJson,
      @watchedAssigneeIdsJson,
      @overallIssuePercent,
      @overallEpicPercent,
      @overallOverduePercent,
      @statusCountsJson
    )
  `);

  const insertEpicMetricStmt = db.prepare(`
    INSERT INTO dashboard_epic_metrics (
      snapshot_id,
      epic_preset_id,
      epic_key,
      epic_name,
      issue_percent,
      epic_percent,
      overdue_percent,
      total_issues,
      closed_issues,
      open_issues,
      overdue_open_issues,
      due_by_open_issues,
      initial_done_date,
      most_recent_done_date,
      project_end_date,
      is_past_due,
      past_due_reason,
      status_counts_json,
      open_status_counts_json,
      contributor_metrics_json
    ) VALUES (
      @snapshotId,
      @epicPresetId,
      @epicKey,
      @epicName,
      @issuePercent,
      @epicPercent,
      @overduePercent,
      @totalIssues,
      @closedIssues,
      @openIssues,
      @overdueOpenIssues,
      @dueByOpenIssues,
      @initialDoneDate,
      @mostRecentDoneDate,
      @projectEndDate,
      @isPastDue,
      @pastDueReason,
      @statusCountsJson,
      @openStatusCountsJson,
      @contributorMetricsJson
    )
  `);

  const insertAssigneeMetricStmt = db.prepare(`
    INSERT INTO dashboard_assignee_metrics (
      snapshot_id,
      query_name,
      resolved_display_name,
      resolved_account_id,
      overdue_percent,
      overdue_open_count,
      total_open_count,
      overdue_issue_keys_json,
      query_type,
      jql,
      workload_counts_json
    ) VALUES (
      @snapshotId,
      @queryName,
      @resolvedDisplayName,
      @resolvedAccountId,
      @overduePercent,
      @overdueOpenCount,
      @totalOpenCount,
      @overdueIssueKeysJson,
      @queryType,
      @jql,
      @workloadCountsJson
    )
  `);

  const stmts = {
    getLatestSnapshotStmt,
    listEpicMetricsForSnapshotStmt,
    listAssigneeMetricsForSnapshotStmt,
  };

  const readSettingsMap = () => {
    const rows = listSettingsStmt.all();
    return rows.reduce((acc, row) => {
      acc[row.key] = String(row.value ?? "");
      return acc;
    }, {});
  };

  app.get("/api/dashboard/metrics", (_req, res) => {
    const snapshot = loadLatestSnapshot(db, stmts);
    return res.json({ snapshot });
  });

  app.post("/api/dashboard/refresh", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const epicPresetIds = Array.isArray(req.body?.epicPresetIds)
      ? req.body.epicPresetIds.map((value) => Number(value)).filter((value) => value > 0)
      : [];
    const includePastDue = Boolean(req.body?.includePastDue);
    const dueByDate = (() => {
      const raw = String(req.body?.dueByDate || "").trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
    })();
    const dueByField = ["initial_done_date", "most_recent_done_date"].includes(req.body?.dueByField)
      ? req.body.dueByField
      : "most_recent_done_date";
    const assigneeNames = Array.isArray(req.body?.assigneeNames)
      ? req.body.assigneeNames.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const watchedAssigneeIds = Array.isArray(req.body?.watchedAssigneeIds)
      ? req.body.watchedAssigneeIds.map((value) => Number(value)).filter((value) => value > 0)
      : [];

    if (epicPresetIds.length === 0 && !includePastDue) {
      return res.status(400).json({
        error: "Select at least one epic preset or Past Due Projects",
      });
    }

    const settings = readSettingsMap();
    const epicPastDueMode = EPIC_PAST_DUE_MODES.has(settings.epic_past_due_mode)
      ? settings.epic_past_due_mode
      : "either";
    const mappingsByRole = buildFieldMappingsMap(listFieldMappingsStmt.all());
    const dueFieldId = mappingsByRole.get("due_date")?.fieldId || "duedate";
    const iddFieldId = mappingsByRole.get("initial_done_date")?.fieldId;
    const mrdFieldId = mappingsByRole.get("most_recent_done_date")?.fieldId;
    const pedFieldId = mappingsByRole.get("project_end_date")?.fieldId;
    const candidateFieldIds = resolveCandidateFieldIds(dueByField, { dueFieldId, mrdFieldId, iddFieldId, pedFieldId });

    const selectedPresets = epicPresetIds
      .map((id) => getEpicPresetStmt.get(id))
      .filter(Boolean)
      .map(mapEpicPresetRow);

    const epicMetrics = [];
    const scopedChildIssues = [];

    try {
      if (selectedPresets.length === 0 && includePastDue) {
        const pastDueJql = buildPastDueJql({
          mappingsByRole,
          epicPastDueMode,
          epicKeys: [],
        });
        const { issues } = await searchAllIssues({ jql: pastDueJql, runJiraSearchRequest });
        const groups = new Map();

        for (const issue of issues) {
          const issueKey = String(issue.key || "").trim();
          const isEpic = String(issue.fields?.issuetype?.name || "").toLowerCase() === "epic";
          const epicKey = isEpic ? issueKey : String(issue.fields?.parent?.key || issueKey).trim();
          if (!groups.has(epicKey)) {
            groups.set(epicKey, { epicIssue: isEpic ? issue : null, issues: [] });
          }
          const group = groups.get(epicKey);
          if (isEpic && !group.epicIssue) {
            group.epicIssue = issue;
          }
          group.issues.push(issue);
        }

        for (const [epicKey, group] of groups.entries()) {
          const epicIssue =
            group.epicIssue ||
            (await fetchEpicIssue({ epicKey, mappingsByRole, jiraRequest }));
          const epicName =
            String(epicIssue?.fields?.summary || epicKey).trim() || epicKey;
          const childMetrics = computeChildIssueMetrics(group.issues, epicKey, dueFieldId, dueByDate);
          const epicPercent = computeEpicPercent(epicIssue, mappingsByRole);
          const { isPastDue, pastDueReason } = computeEpicPastDue({
            epicIssue,
            mappingsByRole,
            epicPastDueMode,
          });

          const epicLevelDueBy = buildEpicLevelDueByIssues({
            epicIssue,
            childIssues: childMetrics.childIssues,
            epicKey,
            dueByDate,
            candidateFieldIds,
            existingDueByKeys: new Set(childMetrics.dueByIssues.map((i) => i.key)),
          });
          const combinedDueByIssues1 = [...childMetrics.dueByIssues, ...epicLevelDueBy];

          epicMetrics.push({
            epicPresetId: null,
            epicKey,
            epicName,
            issuePercent: childMetrics.issuePercent,
            epicPercent,
            overduePercent: childMetrics.overduePercent,
            totalIssues: childMetrics.totalIssues,
            completedIssues: childMetrics.completedIssues,
            resolvedIssues: childMetrics.resolvedIssues,
            openIssues: childMetrics.openIssues,
            overdueOpenIssues: childMetrics.overdueOpenIssues,
            dueByOpenIssues: combinedDueByIssues1.filter((i) => !i.isOverdue).length,
            dueByIssues: combinedDueByIssues1,
            initialDoneDate: formatDateOnly(getFieldValue(epicIssue, iddFieldId)),
            mostRecentDoneDate: formatDateOnly(getFieldValue(epicIssue, mrdFieldId)),
            projectEndDate: formatDateOnly(getFieldValue(epicIssue, pedFieldId)),
            isPastDue,
            pastDueReason,
            statusCounts: childMetrics.statusCounts,
            openStatusCounts: childMetrics.openStatusCounts,
            contributorMetrics: computeContributorMetricsFromIssues(childMetrics.childIssues, dueFieldId),
            childIssues: childMetrics.childIssues,
          });

          scopedChildIssues.push(...childMetrics.childIssues);
        }
      } else {
        for (const preset of selectedPresets) {
        const jql = await resolvePresetJql({ preset, jiraRequest });
        if (!jql) {
          epicMetrics.push({
            epicPresetId: preset.id,
            epicKey: preset.epicKey,
            epicName: preset.epicName,
            issuePercent: 0,
            epicPercent: 0,
            overduePercent: 0,
            totalIssues: 0,
            completedIssues: 0,
            resolvedIssues: 0,
            openIssues: 0,
            overdueOpenIssues: 0,
            initialDoneDate: null,
            mostRecentDoneDate: null,
            projectEndDate: null,
            isPastDue: false,
            pastDueReason: null,
            statusCounts: {},
            openStatusCounts: {},
            contributorMetrics: [],
            childIssues: [],
            error: "No JQL configured for this epic preset.",
          });
          continue;
        }

        const metricsJql = buildDashboardMetricsJql(jql) || jql;
        const { issues } = await searchAllIssues({ jql: metricsJql, runJiraSearchRequest });

        if (preset.presetType === "jql") {
          const childMetrics = computeChildIssueMetrics(issues, "", dueFieldId, dueByDate);

          // JQL presets return tasks, not epics. If a due-by date is set we
          // need to check the *parent epic's* date fields because tasks in
          // Lumen typically carry no duedate of their own.
          //
          // Lumen hierarchy: Epic -> Story -> Task/Sub-task. The JQL may return
          // Stories (parent IS the Epic) or Tasks (parent is a Story, one level
          // above the Epic). We detect this via the parent's issuetype and walk
          // up one extra level when needed to always reach the actual Epic.
          let jqlDueByIssues = [...childMetrics.dueByIssues];
          if (dueByDate) {
            // Step 1 - group open issues by immediate parent key, noting
            // whether that parent is already an Epic.
            const parentKeyToGroup = new Map();
            for (const issue of childMetrics.childIssues) {
              if (!isIssueOpen(issue)) continue;
              const parentKey = String(issue.fields?.parent?.key || "").trim();
              if (!parentKey) continue;
              const parentIssuetype = String(
                issue.fields?.parent?.fields?.issuetype?.name || ""
              ).toLowerCase();
              if (!parentKeyToGroup.has(parentKey)) {
                parentKeyToGroup.set(parentKey, { issues: [], isEpic: parentIssuetype === "epic" });
              }
              parentKeyToGroup.get(parentKey).issues.push(issue);
            }

            // Step 2 - resolve to the actual Epic key. If the immediate parent
            // is a Story/Task, fetch it to get its parent (the Epic).
            // Deduplicate so each Epic is fetched only once.
            const epicKeyToIssues = new Map();
            for (const [parentKey, { issues: groupIssues, isEpic }] of parentKeyToGroup.entries()) {
              let resolvedEpicKey = parentKey;
              if (!isEpic) {
                const parentData = await fetchEpicIssue({ epicKey: parentKey, mappingsByRole, jiraRequest });
                const grandparentKey = String(parentData?.fields?.parent?.key || "").trim();
                if (grandparentKey) resolvedEpicKey = grandparentKey;
              }
              if (!epicKeyToIssues.has(resolvedEpicKey)) {
                epicKeyToIssues.set(resolvedEpicKey, []);
              }
              epicKeyToIssues.get(resolvedEpicKey).push(...groupIssues);
            }

            // Step 3 - fetch each Epic and apply the due-date check.
            const existingDueByKeys = new Set(jqlDueByIssues.map((i) => i.key));
            for (const [epicKey, epicChildIssues] of epicKeyToIssues.entries()) {
              const epicIssue = await fetchEpicIssue({ epicKey, mappingsByRole, jiraRequest });
              if (!epicIssue) continue;

              const epicLevelDueBy = buildEpicLevelDueByIssues({
                epicIssue,
                childIssues: epicChildIssues,
                epicKey,
                dueByDate,
                candidateFieldIds,
                existingDueByKeys,
              });

              for (const item of epicLevelDueBy) {
                existingDueByKeys.add(item.key);
                jqlDueByIssues.push(item);
              }
            }
          }

          epicMetrics.push({
            epicPresetId: preset.id,
            epicKey: preset.epicKey,
            epicName: preset.epicName,
            issuePercent: childMetrics.issuePercent,
            epicPercent: 0,
            overduePercent: childMetrics.overduePercent,
            totalIssues: childMetrics.totalIssues,
            completedIssues: childMetrics.completedIssues,
            resolvedIssues: childMetrics.resolvedIssues,
            openIssues: childMetrics.openIssues,
            overdueOpenIssues: childMetrics.overdueOpenIssues,
            dueByOpenIssues: jqlDueByIssues.filter((i) => !i.isOverdue).length,
            dueByIssues: jqlDueByIssues,
            initialDoneDate: null,
            mostRecentDoneDate: null,
            projectEndDate: null,
            isPastDue: false,
            pastDueReason: null,
            statusCounts: childMetrics.statusCounts,
            openStatusCounts: childMetrics.openStatusCounts,
            contributorMetrics: computeContributorMetricsFromIssues(childMetrics.childIssues, dueFieldId),
            childIssues: childMetrics.childIssues,
          });
          scopedChildIssues.push(...childMetrics.childIssues);
          continue;
        }

        const epicIssue = await fetchEpicIssue({
          epicKey: preset.epicKey,
          mappingsByRole,
          jiraRequest,
        });

        const childMetrics = computeChildIssueMetrics(issues, preset.epicKey, dueFieldId, dueByDate);
        const epicPercent = computeEpicPercent(epicIssue, mappingsByRole);
        const { isPastDue, pastDueReason } = computeEpicPastDue({
          epicIssue,
          mappingsByRole,
          epicPastDueMode,
        });

        const epicLevelDueBy = buildEpicLevelDueByIssues({
          epicIssue,
          childIssues: childMetrics.childIssues,
          epicKey: preset.epicKey,
          dueByDate,
          candidateFieldIds,
          existingDueByKeys: new Set(childMetrics.dueByIssues.map((i) => i.key)),
        });
        const combinedDueByIssues3 = [...childMetrics.dueByIssues, ...epicLevelDueBy];

        epicMetrics.push({
          epicPresetId: preset.id,
          epicKey: preset.epicKey,
          epicName: preset.epicName,
          issuePercent: childMetrics.issuePercent,
          epicPercent,
          overduePercent: childMetrics.overduePercent,
          totalIssues: childMetrics.totalIssues,
          completedIssues: childMetrics.completedIssues,
          resolvedIssues: childMetrics.resolvedIssues,
          openIssues: childMetrics.openIssues,
          overdueOpenIssues: childMetrics.overdueOpenIssues,
          dueByOpenIssues: combinedDueByIssues3.filter((i) => !i.isOverdue).length,
          dueByIssues: combinedDueByIssues3,
          initialDoneDate: formatDateOnly(getFieldValue(epicIssue, iddFieldId)),
          mostRecentDoneDate: formatDateOnly(getFieldValue(epicIssue, mrdFieldId)),
          projectEndDate: formatDateOnly(getFieldValue(epicIssue, pedFieldId)),
          isPastDue,
          pastDueReason,
          statusCounts: childMetrics.statusCounts,
          openStatusCounts: childMetrics.openStatusCounts,
          contributorMetrics: computeContributorMetricsFromIssues(childMetrics.childIssues, dueFieldId),
          childIssues: childMetrics.childIssues,
        });

        scopedChildIssues.push(...childMetrics.childIssues);
      }
      }

      const rollup = computeOverallRollup(epicMetrics);
      const refreshedAt = new Date().toISOString();

      // Collect all due-by issues across epics, sort by due date, cap at 200.
      const DUE_BY_ISSUES_CAP = 200;
      const allDueByIssues = dueByDate
        ? epicMetrics
            .flatMap((epic) => epic.dueByIssues || [])
            .sort((a, b) => {
              // Past-due first, then upcoming sorted by date ascending.
              if (a.isOverdue !== b.isOverdue) {
                return a.isOverdue ? -1 : 1;
              }
              return String(a.dueDate || "").localeCompare(String(b.dueDate || ""));
            })
            .slice(0, DUE_BY_ISSUES_CAP)
        : [];

      const assigneeMetrics = [];
      for (const queryName of assigneeNames) {
        const resolvedUser = await resolveJiraUser({ query: queryName, jiraRequest });
        const metrics = computeAssigneeMetrics(
          scopedChildIssues,
          queryName,
          resolvedUser?.displayName,
          dueFieldId
        );

        assigneeMetrics.push({
          queryType: "person",
          jql: "",
          queryName,
          resolvedDisplayName: resolvedUser?.displayName || queryName,
          resolvedAccountId: resolvedUser?.accountId || "",
          ...metrics,
        });
      }

      for (const watchedId of watchedAssigneeIds) {
        const watchedRow = getWatchedAssigneeStmt.get(watchedId);
        if (!watchedRow) {
          continue;
        }

        const watched = mapWatchedAssigneeRow(watchedRow);
        if (watched.watchType === "jql") {
          try {
            const metricsJql = buildDashboardMetricsJql(watched.jql) || watched.jql;
            const { issues } = await searchAllIssues({
              jql: metricsJql,
              runJiraSearchRequest,
            });
            const byAssignee = computeJqlWatchMetricsByAssignee(
              issues,
              scopedChildIssues,
              dueFieldId
            );

            if (byAssignee.length === 0) {
              assigneeMetrics.push({
                queryType: "jql",
                jql: watched.jql,
                queryName: watched.displayName,
                resolvedDisplayName: watched.displayName,
                resolvedAccountId: "",
                overduePercent: null,
                overdueOpenCount: 0,
                totalOpenCount: 0,
                overdueIssueKeys: [],
                workloadCounts: {
                  totalIssues: 0,
                  totalAssigned: 0,
                  totalResolved: 0,
                  pastDue: 0,
                  inProgress: 0,
                  backlog: 0,
                  readyForVerification: 0,
                  other: 0,
                },
              });
              continue;
            }

            for (const row of byAssignee) {
              assigneeMetrics.push({
                queryType: "jql",
                jql: watched.jql,
                queryName: row.queryName,
                resolvedDisplayName: row.resolvedDisplayName,
                resolvedAccountId: row.resolvedAccountId,
                overduePercent: row.overduePercent,
                overdueOpenCount: row.overdueOpenCount,
                totalOpenCount: row.totalOpenCount,
                overdueIssueKeys: row.overdueIssueKeys,
                workloadCounts: row.workloadCounts,
              });
            }
          } catch (error) {
            assigneeMetrics.push({
              queryType: "jql",
              jql: watched.jql,
              queryName: watched.displayName,
              resolvedDisplayName: watched.displayName,
              resolvedAccountId: "",
              overduePercent: null,
              overdueOpenCount: 0,
              totalOpenCount: 0,
              overdueIssueKeys: [],
              workloadCounts: {
                totalIssues: 0,
                totalAssigned: 0,
                totalResolved: 0,
                pastDue: 0,
                inProgress: 0,
                backlog: 0,
                readyForVerification: 0,
                other: 0,
              },
              error: error instanceof Error ? error.message : "JQL watch failed",
            });
          }
          continue;
        }

        const resolvedUser = await resolveJiraUser({ query: watched.displayName, jiraRequest });
        const metrics = computeAssigneeMetrics(
          scopedChildIssues,
          watched.displayName,
          resolvedUser?.displayName,
          dueFieldId
        );

        assigneeMetrics.push({
          queryType: "person",
          jql: "",
          queryName: watched.displayName,
          resolvedDisplayName: resolvedUser?.displayName || watched.displayName,
          resolvedAccountId: resolvedUser?.accountId || watched.resolvedAccountId || "",
          ...metrics,
        });
      }

      const persistSnapshot = db.transaction(() => {
        deleteAllAssigneeMetricsStmt.run();
        deleteAllEpicMetricsStmt.run();
        deleteAllSnapshotsStmt.run();

        const snapshotResult = insertSnapshotStmt.run({
          refreshedAt,
          epicPresetIdsJson: JSON.stringify(epicPresetIds),
          includePastDue: includePastDue ? 1 : 0,
          dueByDate: dueByDate || null,
          dueByField,
          dueByIssuesJson: JSON.stringify(allDueByIssues),
          assigneeNamesJson: JSON.stringify(assigneeNames),
          watchedAssigneeIdsJson: JSON.stringify(watchedAssigneeIds),
          overallIssuePercent: rollup.overallIssuePercent,
          overallEpicPercent: rollup.overallEpicPercent,
          overallOverduePercent: rollup.overallOverduePercent,
          statusCountsJson: JSON.stringify(rollup.statusCounts),
        });

        const snapshotId = snapshotResult.lastInsertRowid;

        for (const epic of epicMetrics) {
          insertEpicMetricStmt.run({
            snapshotId,
            epicPresetId: epic.epicPresetId,
            epicKey: epic.epicKey,
            epicName: epic.epicName,
            issuePercent: epic.issuePercent,
            epicPercent: epic.epicPercent,
            overduePercent: epic.overduePercent,
            totalIssues: epic.totalIssues,
            closedIssues: epic.completedIssues,
            openIssues: epic.openIssues,
            overdueOpenIssues: epic.overdueOpenIssues,
            dueByOpenIssues: epic.dueByOpenIssues ?? 0,
            initialDoneDate: epic.initialDoneDate,
            mostRecentDoneDate: epic.mostRecentDoneDate,
            projectEndDate: epic.projectEndDate,
            isPastDue: epic.isPastDue ? 1 : 0,
            pastDueReason: epic.pastDueReason,
            statusCountsJson: JSON.stringify(epic.statusCounts || {}),
            openStatusCountsJson: JSON.stringify(epic.openStatusCounts || {}),
            contributorMetricsJson: JSON.stringify(epic.contributorMetrics || []),
          });
        }

        for (const assignee of assigneeMetrics) {
          insertAssigneeMetricStmt.run({
            snapshotId,
            queryName: assignee.queryName,
            resolvedDisplayName: assignee.resolvedDisplayName,
            resolvedAccountId: assignee.resolvedAccountId,
            overduePercent: assignee.overduePercent,
            overdueOpenCount: assignee.overdueOpenCount,
            totalOpenCount: assignee.totalOpenCount,
            overdueIssueKeysJson: JSON.stringify(assignee.overdueIssueKeys || []),
            queryType: assignee.queryType || "person",
            jql: assignee.jql || "",
            workloadCountsJson: JSON.stringify(assignee.workloadCounts || {}),
          });
        }

        return snapshotId;
      });

      persistSnapshot();

      const snapshot = loadLatestSnapshot(db, stmts);
      return res.json({ snapshot });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to refresh dashboard metrics",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
