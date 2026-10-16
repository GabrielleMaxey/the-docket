import { fetchJiraSearchAll, fetchRecentlyNotedIssueKeys, fetchLatestJiraCommentsBulk, fetchFieldMappings,
  fetchIssueMetadataBulk, fetchTeamMetadataBulk, fetchTeamPriorityHealth } from "../services/jiraClient.js";
import { enrichRunWithParentDoneDates } from "../utils/jiraIssueDoneDates.js";
import { buildCombinedMetrics } from "./combinedWorkModel.js";
import { monthsAgoDateString, buildSummaryFromIssues } from "./reportSummary.js";

export const COMBINED_REPORT_CONTEXT = Object.freeze({ kind: "combined-work" });
export const combinedReportRunKey = (sites, options) => JSON.stringify({
  sources: [...new Set((sites || []).map(site => site.instanceId))].sort(), ...options,
});

export const buildCombinedReportSummary = sites => {
  const metrics = buildCombinedMetrics(sites);
  const notices = [];
  const sources = (sites || []).map(site => {
    const label = `${site.displayName || site.instanceId} (${site.siteHost || site.sourceContext?.siteHost || "unavailable"})`;
    if (site.status !== "complete") notices.push(`${label}: ${site.message || "Jira coverage incomplete"}`);
    if (site.hydrationError || site.hydrationReady === false) notices.push(`${label}: ${site.hydrationError || (!site.sourceContext || ["failed", "error"].includes(site.status) ? "Metadata and dates unavailable" : "Metadata and dates are still loading")}`);
    notices.push(...(site.reportNotices || []).map(notice => `${label}: ${notice}`));
    const issues = (site.issues || []).filter(issue => issue.combinedEligible !== false);
    const summary = buildSummaryFromIssues(issues, site.jiraRowPriorities || {}, site, issue => issue.fields?.status?.statusCategory?.key !== "done");
    return { instanceId: site.instanceId, displayName: site.displayName, siteHost: site.siteHost,
      ...summary, issues: issues.map(issue => ({
        key: issue.key, summary: issue.fields?.summary, status: issue.fields?.status?.name,
        note: site.jiraNotes?.[issue.key] ?? site.localMetadata?.[issue.key]?.note ?? "",
        localPlanning: { ...site.localMetadata?.[issue.key], ...site.planningMetaByKey?.[issue.key],
          startDate: site.startDateByKey?.[issue.key] ?? site.localMetadata?.[issue.key]?.startDate,
          completeDate: site.completeDateByKey?.[issue.key] ?? site.localMetadata?.[issue.key]?.completeDate },
        teamPlanning: { ...site.teamMetadata?.[issue.key], ...site.teamPlanningMetaByKey?.[issue.key],
          startDate: site.teamStartDateByKey?.[issue.key] ?? site.teamMetadata?.[issue.key]?.startDate,
          completeDate: site.teamCompleteDateByKey?.[issue.key] ?? site.teamMetadata?.[issue.key]?.completeDate },
        latestComment: site.latestComments?.[issue.key],
      })) };
  });
  return { total: metrics.total, open: metrics.open, closed: metrics.closed, overdue: metrics.overdue,
    inProgress: metrics.inProgress, entryCount: metrics.entryCount, sources, notices,
    incomplete: metrics.incomplete || notices.length > 0,
    topPriorities: sources.flatMap(site => site.topPriorities.map(issue => ({ ...issue, instanceId: site.instanceId, siteHost: site.siteHost }))).slice(0, 8) };
};

export const loadCombinedReportHistory = async ({ sites, months, signal }) => {
  const cutoff = monthsAgoDateString(months);
  const loaded = await Promise.all((sites || []).map(async site => {
    if (!site.sourceContext || site.sourceContext.kind !== "saved-site") return { ...site, issues: [], reportNotices: ["Saved source context unavailable; history was not queried."] };
    const siteContext = site.sourceContext;
    const reportNotices = [];
    const read = async (label, operation, fallback) => {
      signal?.throwIfAborted();
      try { return await operation(); } catch (error) {
        if (signal?.aborted || error?.name === "AbortError") throw error;
        reportNotices.push(`${label}: ${error.message || "Read failed"}`);
        return fallback;
      }
    };
    const [changed, notedKeys, assigned, mappings, teamHealth] = await Promise.all([
      read("Changed-work search", () => fetchJiraSearchAll({ siteContext, signal, maxTotal: 500,
        jql: `assignee = currentUser() AND (status changed after "${cutoff}" OR assignee changed after "${cutoff}") ORDER BY updated DESC` }), { issues: [] }),
      read("Recent notes", () => fetchRecentlyNotedIssueKeys(cutoff, { siteContext, signal }), []),
      read("Assigned-work search", () => fetchJiraSearchAll({ siteContext, signal, maxTotal: 500, jql: "assignee = currentUser()" }), { issues: [] }),
      read("Field mappings", () => fetchFieldMappings({ siteContext, signal }), site.fieldMappings || []),
      read("Team availability", () => fetchTeamPriorityHealth({ siteContext, signal }), null),
    ]);
    for (const result of [changed, assigned]) if (result.isComplete === false || result.issues?.length >= 500) reportNotices.push("History query reached its 500-issue bound or returned incomplete results.");
    const issues = new Map((changed.issues || []).map(issue => [issue.key, issue]));
    const noted = new Set(notedKeys);
    for (const issue of assigned.issues || []) if (noted.has(issue.key)) issues.set(issue.key, issue);
    const keys = [...new Set([...issues.keys(), ...(assigned.issues || []).map(issue => issue.key)])];
    const commentResult = keys.length ? await read("Latest comments", () => fetchLatestJiraCommentsBulk(keys, { siteContext, signal, includeCoverage: true }), { items: {} }) : { items: {} };
    const latestComments = commentResult.items;
    for (const key of Object.keys(commentResult.errors || {})) reportNotices.push(`${key}: Latest comment unavailable.`);
    for (const issue of assigned.issues || []) if (String(latestComments[issue.key]?.created || "").slice(0, 10) >= cutoff) issues.set(issue.key, issue);
    const allIssues = [...issues.values()];
    const [enriched, localMetadata, teamMetadata] = await Promise.all([
      read("Parent dates", () => enrichRunWithParentDoneDates({ issues: allIssues }, mappings, { siteContext, signal, propagateErrors: true }), {}),
      allIssues.length ? read("Local notes/planning", () => fetchIssueMetadataBulk([...issues.keys()], { siteContext, signal }), {}) : {},
      allIssues.length && teamHealth?.enabled === true && teamHealth?.configured === true ? read("Team planning", () => fetchTeamMetadataBulk([...issues.keys()], { siteContext, signal }), {}) : {},
    ]);
    signal?.throwIfAborted();
    return { ...site, ...enriched, issues: allIssues,
      localMetadata, teamMetadata, latestComments, reportNotices };
  }));
  return buildCombinedReportSummary(loaded);
};
