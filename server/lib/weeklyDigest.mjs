const parseJsonArray = (value) => {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const formatPct = (value) => `${Number(value || 0).toFixed(1)}%`;

export const buildWeeklyDigestMarkdown = ({
  snapshot,
  epicMetrics = [],
  assigneeMetrics = [],
  dueByIssues = [],
}) => {
  if (!snapshot) {
    return "";
  }

  const refreshedAt = snapshot.refreshedAt || snapshot.refreshed_at || "unknown";
  const lines = [
    `# Weekly digest — ${refreshedAt}`,
    "",
    "## Overall",
    `- Tasks resolved: ${formatPct(snapshot.overallIssuePercent ?? snapshot.overall_issue_percent)}`,
    `- Projects complete: ${formatPct(snapshot.overallEpicPercent ?? snapshot.overall_epic_percent)}`,
    `- Open tasks overdue: ${formatPct(snapshot.overallOverduePercent ?? snapshot.overall_overdue_percent)}`,
    "",
  ];

  const pastDueEpics = epicMetrics.filter((epic) => epic.isPastDue);
  if (pastDueEpics.length > 0) {
    lines.push("## Past-due projects");
    for (const epic of pastDueEpics) {
      lines.push(
        `- **${epic.epicName || epic.epicKey}**: ${epic.overdueOpenIssues ?? epic.overdue_open_issues ?? 0} overdue open / ${epic.openIssues ?? epic.open_issues ?? 0} open`
      );
    }
    lines.push("");
  }

  const overduePeople = assigneeMetrics
    .filter((person) => Number(person.overdueOpenCount ?? person.overdue_open_count ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(b.overdueOpenCount ?? b.overdue_open_count ?? 0) -
        Number(a.overdueOpenCount ?? a.overdue_open_count ?? 0)
    );

  if (overduePeople.length > 0) {
    lines.push("## Contributor overload (overdue open)");
    for (const person of overduePeople.slice(0, 12)) {
      const name = person.resolvedDisplayName || person.queryName || "Unknown";
      const overdue = Number(person.overdueOpenCount ?? person.overdue_open_count ?? 0);
      const open = Number(person.totalOpenCount ?? person.total_open_count ?? 0);
      lines.push(`- **${name}**: ${overdue} overdue / ${open} open`);
    }
    lines.push("");
  }

  const pastDueTasks = dueByIssues.filter((issue) => issue.isOverdue);
  const upcomingTasks = dueByIssues.filter((issue) => !issue.isOverdue && issue.dueDate);

  if (pastDueTasks.length > 0) {
    lines.push("## Top past-due tasks");
    for (const issue of pastDueTasks.slice(0, 15)) {
      lines.push(`- ${issue.key} — ${issue.summary || "(no summary)"} (due ${issue.dueDate || "—"})`);
    }
    lines.push("");
  }

  if (upcomingTasks.length > 0) {
    lines.push("## Upcoming due (sample)");
    for (const issue of upcomingTasks.slice(0, 15)) {
      lines.push(`- ${issue.key} — ${issue.summary || "(no summary)"} (due ${issue.dueDate || "—"})`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("_Generated from the latest Dashboard refresh in Task Manager._");
  return lines.join("\n");
};

export const loadWeeklyDigestFromDb = (db) => {
  const snapshotRow = db
    .prepare("SELECT * FROM dashboard_snapshots ORDER BY refreshed_at DESC LIMIT 1")
    .get();

  if (!snapshotRow) {
    return null;
  }

  const epicRows = db
    .prepare("SELECT * FROM dashboard_epic_metrics WHERE snapshot_id = ? ORDER BY rowid ASC")
    .all(snapshotRow.id);

  const assigneeRows = db
    .prepare("SELECT * FROM dashboard_assignee_metrics WHERE snapshot_id = ? ORDER BY rowid ASC")
    .all(snapshotRow.id);

  const dueByIssues = parseJsonArray(snapshotRow.due_by_issues_json);

  const epicMetrics = epicRows.map((row) => ({
    epicKey: row.epic_key,
    epicName: row.epic_name,
    openIssues: Number(row.open_issues || 0),
    overdueOpenIssues: Number(row.overdue_open_issues || 0),
    isPastDue: Boolean(row.is_past_due),
  }));

  const assigneeMetrics = assigneeRows.map((row) => ({
    queryName: row.query_name,
    resolvedDisplayName: row.resolved_display_name,
    totalOpenCount: Number(row.total_open_count || 0),
    overdueOpenCount: Number(row.overdue_open_count || 0),
    overduePercent: Number(row.overdue_percent || 0),
  }));

  const snapshot = {
    refreshedAt: snapshotRow.refreshed_at,
    overallIssuePercent: snapshotRow.overall_issue_percent,
    overallEpicPercent: snapshotRow.overall_epic_percent,
    overallOverduePercent: snapshotRow.overall_overdue_percent,
  };

  return buildWeeklyDigestMarkdown({
    snapshot,
    epicMetrics,
    assigneeMetrics,
    dueByIssues,
  });
};
