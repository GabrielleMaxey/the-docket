import { getEffectiveDueDateForIssue } from "../utils/jiraIssueDoneDates.js";

// JQL has no months unit (`m` is minutes); `-3M` matched nothing.
export const monthsAgoDateString = (months) => {
  const d = new Date();
  d.setMonth(d.getMonth() - Number(months || 0));
  return d.toISOString().slice(0, 10);
};

const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

export const isIssueOverdueByEffectiveDueDate = (issue, dueDateContext, isOpen) => {
  if (!isOpen(issue)) {
    return false;
  }
  const effectiveDue = getEffectiveDueDateForIssue(issue, dueDateContext);
  if (!effectiveDue) {
    return false;
  }
  const today = new Date().toISOString().slice(0, 10);
  return effectiveDue < today;
};

export const buildSummaryFromIssues = (issues, jiraRowPriorities, dueDateContext, isOpen = isIssueOpen) => {
  const open = issues.filter(isOpen);
  return {
    total: issues.length,
    open: open.length,
    closed: issues.length - open.length,
    overdue: open.filter((iss) => isIssueOverdueByEffectiveDueDate(iss, dueDateContext, isOpen)).length,
    topPriorities: open
      .sort((a, b) => (jiraRowPriorities[a.key] || 99) - (jiraRowPriorities[b.key] || 99))
      .slice(0, 8)
      .map((iss) => ({
        key: iss.key,
        summary: iss.fields?.summary || iss.summary || "",
        status: iss.fields?.status?.name || iss.status || "",
        assignee: iss.fields?.assignee?.displayName || iss.assignee || "Unassigned",
        isOverdue: isIssueOverdueByEffectiveDueDate(iss, dueDateContext, isOpen),
      })),
  };
};
