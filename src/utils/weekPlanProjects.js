import { toScoringInput, rankIssues } from "../../shared/workPriorityScore.mjs";
import { getEffectiveDueDateForIssue } from "./jiraIssueDoneDates.js";
import { isConfiguredJqlRun } from "./workWeekStorage.js";
import { isIssueOverdueForMetrics } from "../../shared/dashboardMetrics.mjs";

const MAX_TASKS_PER_PROJECT = 10;

export const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

// Same rule as the Metrics page: only the issue's own due date counts. The "most recent done
// date" fallback some views use is deliberately left out so the plan never calls a task overdue
// when the Metrics page does not.
const dueContextForRun = (run) => ({ dueFieldId: run.dueFieldId });

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// A due date typed into the results table counts immediately, whether or not the
// user has chosen to update Jira with it. Empty/invalid drafts are ignored.
const withDraftDue = (issue, run, dueDateDrafts) => {
  const draft = String(dueDateDrafts?.[issue.key] ?? "").trim();
  if (!DATE_ONLY.test(draft)) return issue;
  const dueId = String(run.dueFieldId || "duedate").trim() || "duedate";
  return { ...issue, fields: { ...issue.fields, [dueId]: draft } };
};

const rankOpenIssues = (run, openIssues, jiraRowPriorities, now) => {
  const dueContext = dueContextForRun(run);
  const inputs = openIssues.map((issue) => ({
    ...toScoringInput(issue, {
      effectiveDueDate: getEffectiveDueDateForIssue(issue, dueContext),
      manualPriority: jiraRowPriorities?.[issue.key],
    }),
    issue,
  }));
  return rankIssues(inputs, { now });
};

// Team mode merges team priorities over the user's own (team wins). The week plan can leave the
// team values out and rank on the user's own manual priorities only.
export const pickPlanPriorities = ({ includeTeam, teamEnabled, merged, local }) =>
  teamEnabled && !includeTeam ? local || {} : merged || {};

const norm = (v) => String(v || "").trim().toLowerCase();

// True when the issue is assigned to the signed-in Jira user. accountId is the reliable match;
// display name is the fallback for issues that only carry a name. Unassigned never matches.
export const isAssignedToUser = (issue, user) => {
  const assignee = issue?.fields?.assignee;
  const name = norm(assignee?.displayName || issue?.assignee);
  if (!assignee?.accountId && (!name || name === "unassigned")) return false;
  if (user?.accountId && assignee?.accountId) return user.accountId === assignee.accountId;
  return Boolean(name) && name === norm(user?.displayName);
};

// Drill-down tabs exist to look at someone else's (or an arbitrary) set of issues, so they never
// belong in a plan of the user's own week.
const isPlannableRun = (r) => isConfiguredJqlRun(r) && !r.isDrillDown && !r.isPendingDrillDown;

export const buildWeekPlanProjects = (jqlRuns, jiraRowPriorities, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();
  const user = options.currentUser?.accountId || options.currentUser?.displayName ? options.currentUser : null;
  const mine = (i) => !user || isAssignedToUser(i, user);
  return (jqlRuns || [])
    .filter((r) => isPlannableRun(r) && r.issues?.length > 0)
    .map((r) => {
      const openIssues = r.issues
        .filter((i) => isIssueOpen(i) && mine(i))
        .map((i) => withDraftDue(i, r, options.dueDateDrafts));
      const dueFieldId = String(r.dueFieldId || "").trim() || "duedate";
      const overdueKeys = new Set(
        openIssues.filter((i) => isIssueOverdueForMetrics(i, dueFieldId, [], null)).map((i) => i.key)
      );
      return {
        label: r.label || `Run ${(r.index || 0) + 1}`,
        total: r.issues.filter(mine).length,
        open: openIssues.length,
        overdue: overdueKeys.size,
        tasks: rankOpenIssues(r, openIssues, jiraRowPriorities, now)
          .slice(0, MAX_TASKS_PER_PROJECT)
          .map(({ issue: i, score, reasons, dueDate, blocksKeys, blockedByKeys }) => ({
            key: i.key,
            summary: i.fields?.summary || i.summary || "",
            status: i.fields?.status?.name || i.status || "",
            assignee: i.fields?.assignee?.displayName || i.assignee || "Unassigned",
            isOverdue: overdueKeys.has(i.key),
            score,
            why: reasons,
            dueDate: dueDate || null,
            blocks: blocksKeys || [],
            blockedBy: blockedByKeys || [],
          })),
      };
    });
};

// When the signed-in user is unknown the plan can't be limited to their issues. The plan text
// then opens with a note saying exactly which data it used. Returns "" when the plan is filtered
// to the user (nothing to flag).
export const describePlanScope = ({ currentUser, projects }) => {
  if (currentUser?.accountId || currentUser?.displayName) return "";
  const list = Array.isArray(projects) ? projects : [];
  const tabs = list.map((p) => `${p.label} (${p.open} open)`).join(", ") || "none";
  return (
    "> **Data used:** I couldn't identify your Jira user, so this plan covers **all open issues in your tabs, " +
    "whoever they are assigned to** (not only yours): " +
    `${tabs}. Drill-down tabs are excluded.\n\n`
  );
};
