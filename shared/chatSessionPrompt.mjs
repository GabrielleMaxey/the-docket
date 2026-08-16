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

// Formats the currently-loaded "Evaluate an Epic" panel data (see
// EpicEvaluationPanel.jsx / GET /api/jira/epics/:epicKey/workload) for the
// chat system prompt, so follow-up questions about that epic can be
// answered from real fetched data instead of the thin selectedEpics
// key/name/JQL context. The client passes the SAME data it already fetched
// to render the panel - no server re-fetch needed.
export const formatEpicEvaluationContext = (epicEvaluation) => {
  if (!epicEvaluation || typeof epicEvaluation !== "object" || !epicEvaluation.epic?.key) {
    return "";
  }

  const { epic, workload, contributors, blockers } = epicEvaluation;
  const lines = [
    `Epic ${epic.key} — "${epic.summary || "Untitled"}" (${epic.status || "Unknown status"}) is loaded in the Evaluate an Epic panel. Answer workload/timeline/blocker questions about this epic from the data below, not from the thin "Selected epics" list above.`,
  ];

  const timelineParts = [];
  if (epic.projectEndDate) timelineParts.push(`Project End Date ${epic.projectEndDate}`);
  if (epic.mostRecentDoneDate) timelineParts.push(`Most Recent Done Date ${epic.mostRecentDoneDate}`);
  if (epic.initialDoneDate) timelineParts.push(`Initial Done Date ${epic.initialDoneDate}`);
  lines.push(
    `Timeline: ${timelineParts.length > 0 ? timelineParts.join(", ") : "no PED/MRD/IDD set on this epic"}.`
  );

  if (workload) {
    lines.push(
      `Workload: ${workload.total ?? 0} total tasks, ${workload.open ?? 0} open, ${workload.closed ?? 0} closed, ${workload.overdue ?? 0} overdue (by each task's own raw due date - this org largely doesn't set those, so 0 here often just means no due dates were set, not that nothing is overdue).`
    );
    const statusCounts = workload.statusCounts || {};
    const statusParts = Object.entries(statusCounts).map(([status, count]) => `${status}: ${count}`);
    if (statusParts.length > 0) {
      lines.push(`Status breakdown: ${statusParts.join(", ")}.`);
    }
  }

  if (Array.isArray(contributors) && contributors.length > 0) {
    lines.push("Contributors:");
    for (const c of contributors) {
      lines.push(`- ${c.name}: ${c.totalIssues} total (${c.openIssues} open, ${c.resolvedIssues} resolved, ${c.inProgress} in progress)`);
    }
  }

  if (Array.isArray(blockers) && blockers.length > 0) {
    lines.push(
      "Potential cross-team blockers (tasks with a Jira issue link to a DIFFERENT project - a reasonable proxy for \"involves another team\", not a certainty; a same-project link could still involve another team, and this doesn't check comments/descriptions):"
    );
    for (const b of blockers) {
      const linkParts = (b.crossTeamLinks || [])
        .map((link) => `${link.linkType} ${link.linkedKey} (${link.linkedProject}, ${link.linkedStatus || "unknown status"})`)
        .join("; ");
      lines.push(`- ${b.key} (${b.status}, ${b.assignee}): ${linkParts}`);
    }
  } else {
    lines.push("No cross-team blocker candidates detected among this epic's tasks.");
  }

  return lines.join("\n");
};
