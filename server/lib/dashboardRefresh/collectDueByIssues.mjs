import { DUE_BY_ISSUES_CAP } from "./constants.mjs";

export const collectDueByIssues = (epicMetrics, dueByDate) => {
  if (!dueByDate) {
    return [];
  }

  return epicMetrics
    .flatMap((epic) => epic.dueByIssues || [])
    .sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) {
        return a.isOverdue ? -1 : 1;
      }
      return String(a.dueDate || "").localeCompare(String(b.dueDate || ""));
    })
    .slice(0, DUE_BY_ISSUES_CAP);
};
