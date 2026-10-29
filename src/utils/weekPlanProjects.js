import { toScoringInput, rankIssues } from "../../shared/workPriorityScore.mjs";
import { getEffectiveDueDateForIssue } from "./jiraIssueDoneDates.js";
import { isConfiguredJqlRun } from "./workWeekStorage.js";

const MAX_TASKS_PER_PROJECT = 10;

export const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

const rankOpenIssues = (run, openIssues, jiraRowPriorities, now) => {
  const dueContext = {
    dueFieldId: run.dueFieldId,
    mrdFieldId: run.mrdFieldId,
    parentMostRecentDoneDateByKey: run.parentMostRecentDoneDateByKey,
  };
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
      const openIssues = r.issues.filter(isIssueOpen);
      return {
        label: r.label || `Run ${(r.index || 0) + 1}`,
        total: r.issues.length,
        open: openIssues.length,
        overdue: r.issues.filter((i) => isIssueOpen(i) && i.isOverdue).length,
        tasks: rankOpenIssues(r, openIssues, jiraRowPriorities, now)
          .slice(0, MAX_TASKS_PER_PROJECT)
          .map(({ issue: i, score, reasons }) => ({
            key: i.key,
            summary: i.fields?.summary || i.summary || "",
            status: i.fields?.status?.name || i.status || "",
            assignee: i.fields?.assignee?.displayName || i.assignee || "Unassigned",
            isOverdue: Boolean(i.isOverdue),
            score,
            why: reasons,
          })),
      };
    });
};
