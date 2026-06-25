const truncateText = (value, max = 6000) => {
  const text = String(value || "").trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}\n…[truncated]`;
};

export const formatChatSessionContext = (sessionContext) => {
  if (!sessionContext || typeof sessionContext !== "object") {
    return "";
  }

  const lines = [];
  const queries = Array.isArray(sessionContext.jqlQueries) ? sessionContext.jqlQueries : [];

  if (queries.length > 0) {
    lines.push("Work Week JQL queries (cached results from the user's browser):");
    for (const query of queries) {
      const jqlPart = query.jql ? ` JQL "${query.jql}"` : "";
      lines.push(
        `- ${query.label || "Query"}:${jqlPart} — ${query.total ?? 0} total, ${query.open ?? 0} open, ${query.pastDue ?? 0} past due, ${query.upcomingDue ?? 0} upcoming due`
      );
      if (query.error) {
        lines.push(`  Query error: ${query.error}`);
      }
      for (const issue of query.topIssues || []) {
        let timingTag = "";
        if (issue.isPastDue) {
          timingTag = issue.dueDate ? ` [PAST DUE — was ${issue.dueDate}]` : " [PAST DUE]";
        } else if (issue.isUpcomingDue && issue.dueDate) {
          timingTag = ` [UPCOMING DUE ${issue.dueDate}]`;
        } else if (issue.dueDate) {
          timingTag = ` [due ${issue.dueDate}]`;
        }
        lines.push(
          `  · ${issue.key} (${issue.issueType || "Issue"}): ${issue.summary || "(no summary)"} (${issue.status || "Unknown"}) — ${issue.assignee || "Unassigned"}${timingTag}`
        );
      }
    }
  }

  const snapshot = sessionContext.dashboardSnapshot;
  if (snapshot?.refreshedAt) {
    lines.push(
      "",
      `Dashboard metrics snapshot (refreshed ${snapshot.refreshedAt}):`,
      `Overall — ${snapshot.overallIssuePercent}% issues resolved, ${snapshot.overallEpicPercent}% epics complete, ${snapshot.overallOverduePercent}% of open tasks past due (missed due dates)`
    );
    if (snapshot.dueByDate) {
      lines.push(
        `Due-by filter through ${snapshot.dueByDate}: ${snapshot.dueByPastDueCount ?? 0} past due, ${snapshot.dueByUpcomingCount ?? 0} upcoming due`
      );
    }
    if (snapshot.includePastDue) {
      lines.push("Past-due epic projects filter was included in this snapshot.");
    }
    for (const epic of snapshot.epics || []) {
      const epicPastDue = epic.isPastDueEpic ? " [EPIC PAST DUE]" : "";
      const upcomingPart =
        snapshot.dueByDate && epic.upcomingDueByCount > 0
          ? `, ${epic.upcomingDueByCount} upcoming due by ${snapshot.dueByDate}`
          : "";
      lines.push(
        `- ${epic.label || epic.epicKey}: ${epic.issuePercent}% complete, ${epic.overduePercent}% of open tasks past due (${epic.openIssues} open)${upcomingPart}${epicPastDue}`
      );
    }
    if (snapshot.assigneeCount > 0) {
      lines.push(`Individual contributor metrics: ${snapshot.assigneeCount} watched assignee row(s) in snapshot.`);
    }
  }

  const artifacts = Array.isArray(sessionContext.artifacts) ? sessionContext.artifacts : [];
  if (artifacts.length > 0) {
    lines.push(
      "",
      "Generated reports and plans (already produced in this app — cite these when the user asks about reports, plans, or summaries they generated):"
    );
    for (const artifact of artifacts) {
      const audience = artifact.meta?.audience ? ` (${artifact.meta.audience})` : "";
      lines.push(`--- ${artifact.type || "report"}: ${artifact.label || "Untitled"}${audience} @ ${artifact.generatedAt || "unknown time"} ---`);
      lines.push(truncateText(artifact.content));
      lines.push("");
    }
  }

  return lines.join("\n").trim();
};
