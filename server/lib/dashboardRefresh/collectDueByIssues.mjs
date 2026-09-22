import { DUE_BY_ISSUES_CAP } from "./constants.mjs";

// A single issue can be picked up by more than one epic/JQL preset (e.g. an
// epic preset and an overlapping JQL preset both matching the same issue),
// so de-dupe by key when merging across presets — otherwise the same issue
// renders twice downstream (dashboard due-by list, upcoming-due banner, etc).
const dedupeByKey = (issues) => {
  const seen = new Set();
  const deduped = [];

  for (const issue of issues) {
    const key = String(issue?.key || "");
    if (key && seen.has(key)) {
      continue;
    }
    if (key) {
      seen.add(key);
    }
    deduped.push(issue);
  }

  return deduped;
};

export const collectDueByIssues = (epicMetrics, dueByDate) => {
  if (!dueByDate) {
    return [];
  }

  return dedupeByKey(epicMetrics.flatMap((epic) => epic.dueByIssues || []))
    .sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) {
        return a.isOverdue ? -1 : 1;
      }
      return String(a.dueDate || "").localeCompare(String(b.dueDate || ""));
    })
    .slice(0, DUE_BY_ISSUES_CAP);
};
