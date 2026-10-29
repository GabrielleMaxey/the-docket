import { toScoringInput, rankIssues } from "../../shared/workPriorityScore.mjs";
import { getEffectiveDueDateForIssue } from "./jiraIssueDoneDates.js";
import { isConfiguredJqlRun } from "./workWeekStorage.js";
import { isIssueOverdueByEffectiveDueDate } from "../Pages/reportSummary.js";

const MAX_TASKS_PER_PROJECT = 10;

export const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

const dueContextForRun = (run) => ({
  dueFieldId: run.dueFieldId,
  mrdFieldId: run.mrdFieldId,
  parentMostRecentDoneDateByKey: run.parentMostRecentDoneDateByKey,
});

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

export const buildWeekPlanProjects = (jqlRuns, jiraRowPriorities, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();
  return (jqlRuns || [])
    .filter((r) => isConfiguredJqlRun(r) && r.issues?.length > 0)
    .map((r) => {
      const openIssues = r.issues.filter(isIssueOpen).map((i) => withDraftDue(i, r, options.dueDateDrafts));
      // Same overdue rule as the metrics page (effective due date strictly before today).
      const dueContext = dueContextForRun(r);
      const overdueKeys = new Set(
        openIssues.filter((i) => isIssueOverdueByEffectiveDueDate(i, dueContext, isIssueOpen)).map((i) => i.key)
      );
      return {
        label: r.label || `Run ${(r.index || 0) + 1}`,
        total: r.issues.length,
        open: openIssues.length,
        overdue: overdueKeys.size,
        tasks: rankOpenIssues(r, openIssues, jiraRowPriorities, now)
          .slice(0, MAX_TASKS_PER_PROJECT)
          .map(({ issue: i, score, reasons }) => ({
            key: i.key,
            summary: i.fields?.summary || i.summary || "",
            status: i.fields?.status?.name || i.status || "",
            assignee: i.fields?.assignee?.displayName || i.assignee || "Unassigned",
            isOverdue: overdueKeys.has(i.key),
            score,
            why: reasons,
          })),
      };
    });
};
