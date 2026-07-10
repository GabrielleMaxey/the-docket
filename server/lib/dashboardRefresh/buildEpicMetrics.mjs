import {
  computeContributorMetricsFromIssues,
  computeChildIssueMetrics,
  computeEpicPastDue,
  computeEpicPercent,
  computeOverallRollup,
  formatDateOnly,
  getFieldValue,
  isIssueOpen,
  rollupEpicPercentFromBreakdown,
} from "../../../shared/dashboardMetrics.mjs";
import {
  buildDashboardMetricsJql,
  buildPastDueJql,
  resolvePresetJql,
} from "../epicFilterJql.mjs";
import { fetchEpicIssue, resolveJiraUser, searchAllIssues } from "../jiraSearchHelpers.mjs";
import {
  buildEpicLevelDueByIssues,
  buildJqlEpicContext,
  filterEpicGroupsToOpenIssues,
} from "./dueByHelpers.mjs";
import { createLogger } from "../../lib/logger.mjs";

const log = createLogger("dashboard");

const buildContributorDueContext = (ctx, epicIssue) =>
  ctx.dueByOptions
    ? {
        dueByDate: ctx.dueByDate,
        dueByOptions: { ...ctx.dueByOptions, epicIssue },
      }
    : null;

const emptyEpicMetricFromPreset = (preset, error) => ({
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
  dueByOpenIssues: 0,
  dueByIssues: [],
  initialDoneDate: null,
  mostRecentDoneDate: null,
  projectEndDate: null,
  isPastDue: false,
  pastDueReason: null,
  statusCounts: {},
  openStatusCounts: {},
  contributorMetrics: [],
  childIssues: [],
  error,
});

const combineDueByIssues = (childMetrics, epicLevelDueBy) => {
  const combined = [...childMetrics.dueByIssues, ...epicLevelDueBy];
  return {
    combined,
    dueByOpenIssues: combined.filter((i) => !i.isOverdue).length,
  };
};

const buildEpicMetricRecord = ({
  epicPresetId,
  epicKey,
  epicName,
  childMetrics,
  epicIssue,
  epicPercent,
  isPastDue,
  pastDueReason,
  dueByIssues,
  dueByOpenIssues,
  iddFieldId,
  mrdFieldId,
  pedFieldId,
  overdueFieldIds = [],
  contributorDueByOptions = null,
}) => ({
  epicPresetId,
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
  dueByOpenIssues,
  dueByIssues,
  initialDoneDate: formatDateOnly(getFieldValue(epicIssue, iddFieldId)),
  mostRecentDoneDate: formatDateOnly(getFieldValue(epicIssue, mrdFieldId)),
  projectEndDate: formatDateOnly(getFieldValue(epicIssue, pedFieldId)),
  isPastDue,
  pastDueReason,
  statusCounts: childMetrics.statusCounts,
  openStatusCounts: childMetrics.openStatusCounts,
  contributorMetrics: computeContributorMetricsFromIssues(
    childMetrics.childIssues,
    childMetrics.dueFieldId,
    overdueFieldIds,
    contributorDueByOptions
  ),
  childIssues: childMetrics.childIssues,
});

const buildJqlEpicBreakdownFromContext = ({ epicKeyToIssues, issueCache, ctx }) => {
  const breakdown = [];

  for (const [epicKey, groupIssues] of epicKeyToIssues.entries()) {
    const epicIssue = issueCache.get(epicKey);
    const epicName = String(epicIssue?.fields?.summary || epicKey).trim() || epicKey;
    const childMetrics = computeChildIssueMetrics(
      groupIssues,
      epicKey,
      ctx.dueFieldId,
      null,
      ctx.overdueFieldIds,
      null
    );

    breakdown.push({
      epicKey,
      epicName,
      issuePercent: childMetrics.issuePercent,
      epicPercent: computeEpicPercent(epicIssue, ctx.mappingsByRole),
      totalIssues: childMetrics.totalIssues,
      completedIssues: childMetrics.completedIssues,
      openIssues: childMetrics.openIssues,
      initialDoneDate: formatDateOnly(getFieldValue(epicIssue, ctx.iddFieldId)),
      mostRecentDoneDate: formatDateOnly(getFieldValue(epicIssue, ctx.mrdFieldId)),
    });
  }

  breakdown.sort((left, right) => left.epicKey.localeCompare(right.epicKey));
  return breakdown;
};

const resolveJqlPresetDueByIssues = async ({
  childMetrics,
  epicKeyToIssues = null,
  issueCache = null,
  dueByDate,
  candidateFieldIds,
  mappingsByRole,
  jiraRequest,
  pastDueFloor,
  includePastDueInList,
  preferEpicCompareForChildren = false,
}) => {
  let jqlDueByIssues = [...childMetrics.dueByIssues];
  if (!dueByDate) {
    return jqlDueByIssues;
  }

  let openEpicKeyToIssues = epicKeyToIssues
    ? filterEpicGroupsToOpenIssues(epicKeyToIssues)
    : null;

  if (!openEpicKeyToIssues) {
    const context = await buildJqlEpicContext({
      issues: childMetrics.childIssues.filter((issue) => isIssueOpen(issue)),
      mappingsByRole,
      jiraRequest,
    });
    openEpicKeyToIssues = filterEpicGroupsToOpenIssues(context.epicKeyToIssues);
    issueCache = context.issueCache;
  }

  const existingDueByKeys = new Set(jqlDueByIssues.map((i) => i.key));
  const keysReplacedByEpicDueBy = new Set();
  const epicDueByAdditions = [];

  for (const [epicKey, epicChildIssues] of openEpicKeyToIssues.entries()) {
    const epicIssue = issueCache?.get(epicKey) ||
      (await fetchEpicIssue({ epicKey, mappingsByRole, jiraRequest }));
    if (!epicIssue) {
      log.warn(`due-by: skipping ${epicKey} — could not fetch epic`);
      continue;
    }

    const epicLevelDueBy = buildEpicLevelDueByIssues({
      epicIssue,
      childIssues: epicChildIssues,
      epicKey,
      dueByDate,
      candidateFieldIds,
      existingDueByKeys,
      pastDueFloor,
      includePastDueInList,
    });

    if (epicLevelDueBy.length === 0) {
      continue;
    }

    if (preferEpicCompareForChildren) {
      for (const issue of epicChildIssues) {
        keysReplacedByEpicDueBy.add(String(issue.key || ""));
      }
    }

    for (const item of epicLevelDueBy) {
      existingDueByKeys.add(item.key);
      epicDueByAdditions.push(item);
    }
  }

  if (preferEpicCompareForChildren && keysReplacedByEpicDueBy.size > 0) {
    jqlDueByIssues = jqlDueByIssues.filter((item) => !keysReplacedByEpicDueBy.has(item.key));
  }

  return [...jqlDueByIssues, ...epicDueByAdditions];
};

export const buildPastDueOnlyEpicMetrics = async ({
  ctx,
  jiraRequest,
  runJiraSearchRequest,
}) => {
  const epicMetrics = [];
  const scopedChildIssues = [];
  log.info("dashboard query type: past_due");
  const pastDueJql = buildPastDueJql({
    mappingsByRole: ctx.mappingsByRole,
    epicPastDueMode: ctx.epicPastDueMode,
    epicKeys: [],
    pastDueFloorDate: ctx.pastDueFloor,
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
      (await fetchEpicIssue({ epicKey, mappingsByRole: ctx.mappingsByRole, jiraRequest }));
    const epicName = String(epicIssue?.fields?.summary || epicKey).trim() || epicKey;
    const childMetrics = computeChildIssueMetrics(
      group.issues,
      epicKey,
      ctx.dueFieldId,
      ctx.dueByDate,
      ctx.overdueFieldIds,
      ctx.dueByOptions ? { ...ctx.dueByOptions, epicIssue } : null
    );
    const epicPercent = computeEpicPercent(epicIssue, ctx.mappingsByRole);
    const { isPastDue, pastDueReason } = computeEpicPastDue({
      epicIssue,
      mappingsByRole: ctx.mappingsByRole,
      epicPastDueMode: ctx.epicPastDueMode,
      pastDueFloor: ctx.pastDueFloor,
      trackPastDue: ctx.includePastDue,
    });

    const contributorDueByOptions = buildContributorDueContext(ctx, epicIssue);

    let childDueByForEpic = childMetrics.dueByIssues;
    const openChildKeys = new Set(
      childMetrics.childIssues
        .filter((issue) => isIssueOpen(issue))
        .map((issue) => String(issue.key || ""))
    );

    const epicLevelDueBy = buildEpicLevelDueByIssues({
      epicIssue,
      childIssues: childMetrics.childIssues,
      epicKey,
      dueByDate: ctx.dueByDate,
      candidateFieldIds: ctx.candidateFieldIds,
      existingDueByKeys: new Set(childDueByForEpic.map((i) => i.key)),
      pastDueFloor: ctx.pastDueFloor,
      includePastDueInList: ctx.includePastDue,
    });

    if (ctx.dueByOptions?.preferEpicCompareForChildren && epicLevelDueBy.length > 0) {
      childDueByForEpic = childMetrics.dueByIssues.filter((item) => !openChildKeys.has(item.key));
    }

    const { combined, dueByOpenIssues } = combineDueByIssues(
      { ...childMetrics, dueByIssues: childDueByForEpic },
      epicLevelDueBy
    );

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
      dueByOpenIssues,
      dueByIssues: combined,
      initialDoneDate: formatDateOnly(getFieldValue(epicIssue, ctx.iddFieldId)),
      mostRecentDoneDate: formatDateOnly(getFieldValue(epicIssue, ctx.mrdFieldId)),
      projectEndDate: formatDateOnly(getFieldValue(epicIssue, ctx.pedFieldId)),
      isPastDue,
      pastDueReason,
      statusCounts: childMetrics.statusCounts,
      openStatusCounts: childMetrics.openStatusCounts,
      contributorMetrics: computeContributorMetricsFromIssues(
        childMetrics.childIssues,
        ctx.dueFieldId,
        ctx.overdueFieldIds,
        contributorDueByOptions
      ),
      childIssues: childMetrics.childIssues,
    });

    scopedChildIssues.push(...childMetrics.childIssues);
  }

  return { epicMetrics, scopedChildIssues };
};

export const buildEpicMetricsFromPresets = async ({
  ctx,
  selectedPresets,
  jiraRequest,
  runJiraSearchRequest,
}) => {
  const epicMetrics = [];
  const scopedChildIssues = [];

  for (const preset of selectedPresets) {
    log.info(`dashboard query type: ${preset.presetType}`);
    const jql = await resolvePresetJql({ preset, jiraRequest });
    if (!jql) {
      epicMetrics.push(
        emptyEpicMetricFromPreset(preset, "No JQL configured for this epic preset.")
      );
      continue;
    }

    const metricsJql = buildDashboardMetricsJql(jql) || jql;
    let issues = [];
    try {
      ({ issues } = await searchAllIssues({ jql: metricsJql, runJiraSearchRequest }));
    } catch (error) {
      log.error(`preset "${preset.epicName}" — Jira search failed: ${error instanceof Error ? error.message : error}`);
      epicMetrics.push(
        emptyEpicMetricFromPreset(
          preset,
          error instanceof Error ? error.message : "Jira search failed for this preset."
        )
      );
      continue;
    }

    if (preset.presetType === "jql") {
      const childMetrics = computeChildIssueMetrics(
        issues,
        "",
        ctx.dueFieldId,
        ctx.dueByDate,
        ctx.overdueFieldIds,
        ctx.dueByOptions
      );
      childMetrics.dueFieldId = ctx.dueFieldId;

      const jqlEpicContext = await buildJqlEpicContext({
        issues,
        mappingsByRole: ctx.mappingsByRole,
        jiraRequest,
      });
      const epicBreakdown = buildJqlEpicBreakdownFromContext({
        epicKeyToIssues: jqlEpicContext.epicKeyToIssues,
        issueCache: jqlEpicContext.issueCache,
        ctx,
      });
      const epicPercent = rollupEpicPercentFromBreakdown(epicBreakdown);

      const jqlDueByIssues = await resolveJqlPresetDueByIssues({
        childMetrics,
        epicKeyToIssues: jqlEpicContext.epicKeyToIssues,
        issueCache: jqlEpicContext.issueCache,
        dueByDate: ctx.dueByDate,
        candidateFieldIds: ctx.candidateFieldIds,
        mappingsByRole: ctx.mappingsByRole,
        jiraRequest,
        pastDueFloor: ctx.pastDueFloor,
        includePastDueInList: ctx.includePastDue,
        preferEpicCompareForChildren: Boolean(ctx.dueByOptions?.preferEpicCompareForChildren),
      });

      epicMetrics.push({
        epicPresetId: preset.id,
        epicKey: preset.epicKey,
        epicName: preset.epicName,
        issuePercent: childMetrics.issuePercent,
        epicPercent,
        epicBreakdown,
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
        contributorMetrics: computeContributorMetricsFromIssues(
        childMetrics.childIssues,
        ctx.dueFieldId,
        ctx.overdueFieldIds
      ),
        childIssues: childMetrics.childIssues,
      });
      scopedChildIssues.push(...childMetrics.childIssues);
      continue;
    }

    const epicIssue = await fetchEpicIssue({
      epicKey: preset.epicKey,
      mappingsByRole: ctx.mappingsByRole,
      jiraRequest,
    });

    const childMetrics = computeChildIssueMetrics(
      issues,
      preset.epicKey,
      ctx.dueFieldId,
      ctx.dueByDate,
      ctx.overdueFieldIds,
      ctx.dueByOptions ? { ...ctx.dueByOptions, epicIssue } : null
    );
    const epicPercent = computeEpicPercent(epicIssue, ctx.mappingsByRole);
    const { isPastDue, pastDueReason } = computeEpicPastDue({
      epicIssue,
      mappingsByRole: ctx.mappingsByRole,
      epicPastDueMode: ctx.epicPastDueMode,
      pastDueFloor: ctx.pastDueFloor,
      trackPastDue: ctx.includePastDue,
    });

    const contributorDueByOptions = buildContributorDueContext(ctx, epicIssue);

    let childDueByForEpic = childMetrics.dueByIssues;
    const openChildKeys = new Set(
      childMetrics.childIssues
        .filter((issue) => isIssueOpen(issue))
        .map((issue) => String(issue.key || ""))
    );

    const epicLevelDueBy = buildEpicLevelDueByIssues({
      epicIssue,
      childIssues: childMetrics.childIssues,
      epicKey: preset.epicKey,
      dueByDate: ctx.dueByDate,
      candidateFieldIds: ctx.candidateFieldIds,
      existingDueByKeys: new Set(childDueByForEpic.map((i) => i.key)),
      pastDueFloor: ctx.pastDueFloor,
      includePastDueInList: ctx.includePastDue,
    });

    if (ctx.dueByOptions?.preferEpicCompareForChildren && epicLevelDueBy.length > 0) {
      childDueByForEpic = childMetrics.dueByIssues.filter((item) => !openChildKeys.has(item.key));
    }

    const { combined, dueByOpenIssues } = combineDueByIssues(
      { ...childMetrics, dueByIssues: childDueByForEpic },
      epicLevelDueBy
    );

    epicMetrics.push(
      buildEpicMetricRecord({
        epicPresetId: preset.id,
        epicKey: preset.epicKey,
        epicName: preset.epicName,
        childMetrics: { ...childMetrics, dueFieldId: ctx.dueFieldId },
        epicIssue,
        epicPercent,
        isPastDue,
        pastDueReason,
        dueByIssues: combined,
        dueByOpenIssues,
        iddFieldId: ctx.iddFieldId,
        mrdFieldId: ctx.mrdFieldId,
        pedFieldId: ctx.pedFieldId,
        overdueFieldIds: ctx.overdueFieldIds,
        contributorDueByOptions,
      })
    );

    scopedChildIssues.push(...childMetrics.childIssues);
  }

  return { epicMetrics, scopedChildIssues };
};

export const buildEpicMetricsForRefresh = async ({
  ctx,
  selectedPresets,
  jiraRequest,
  runJiraSearchRequest,
}) => {
  if (selectedPresets.length === 0 && ctx.includePastDue) {
    return buildPastDueOnlyEpicMetrics({ ctx, jiraRequest, runJiraSearchRequest });
  }

  return buildEpicMetricsFromPresets({
    ctx,
    selectedPresets,
    jiraRequest,
    runJiraSearchRequest,
  });
};

export { computeOverallRollup };
