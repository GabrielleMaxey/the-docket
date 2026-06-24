const DEFAULT_FIELD_MAPPINGS = [
  { role: "initial_done_date", fieldName: "Initial Done Date", fieldId: "" },
  { role: "most_recent_done_date", fieldName: "Most Recent Done Date", fieldId: "" },
  { role: "due_date", fieldName: "Due date", fieldId: "duedate" },
  { role: "project_end_date", fieldName: "Project End Date", fieldId: "" },
];

const DEFAULT_APP_SETTINGS = {
  epic_past_due_mode: "either",
  proxy_url: "",
};

export const initDatabase = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_metadata (
      issue_key TEXT PRIMARY KEY,
      note TEXT NOT NULL DEFAULT '',
      priority INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS epic_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      epic_key TEXT NOT NULL,
      epic_name TEXT NOT NULL,
      jira_filter_id TEXT,
      jql TEXT,
      preset_type TEXT NOT NULL DEFAULT 'epic',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jira_field_mappings (
      role TEXT PRIMARY KEY,
      field_id TEXT NOT NULL DEFAULT '',
      field_name TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS watched_assignees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      resolved_account_id TEXT,
      watch_type TEXT NOT NULL DEFAULT 'person',
      jql TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dashboard_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refreshed_at TEXT NOT NULL,
      epic_preset_ids_json TEXT NOT NULL DEFAULT '[]',
      include_past_due INTEGER NOT NULL DEFAULT 0,
      assignee_names_json TEXT NOT NULL DEFAULT '[]',
      watched_assignee_ids_json TEXT NOT NULL DEFAULT '[]',
      overall_issue_percent REAL NOT NULL DEFAULT 0,
      overall_epic_percent REAL NOT NULL DEFAULT 0,
      overall_overdue_percent REAL NOT NULL DEFAULT 0,
      status_counts_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS dashboard_epic_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      epic_preset_id INTEGER,
      epic_key TEXT NOT NULL,
      epic_name TEXT NOT NULL,
      issue_percent REAL NOT NULL DEFAULT 0,
      epic_percent REAL NOT NULL DEFAULT 0,
      overdue_percent REAL NOT NULL DEFAULT 0,
      total_issues INTEGER NOT NULL DEFAULT 0,
      closed_issues INTEGER NOT NULL DEFAULT 0,
      open_issues INTEGER NOT NULL DEFAULT 0,
      overdue_open_issues INTEGER NOT NULL DEFAULT 0,
      initial_done_date TEXT,
      most_recent_done_date TEXT,
      project_end_date TEXT,
      is_past_due INTEGER NOT NULL DEFAULT 0,
      past_due_reason TEXT,
      status_counts_json TEXT NOT NULL DEFAULT '{}',
      contributor_metrics_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (snapshot_id) REFERENCES dashboard_snapshots(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dashboard_assignee_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      query_name TEXT NOT NULL,
      resolved_display_name TEXT,
      resolved_account_id TEXT,
      overdue_percent REAL,
      overdue_open_count INTEGER NOT NULL DEFAULT 0,
      total_open_count INTEGER NOT NULL DEFAULT 0,
      overdue_issue_keys_json TEXT NOT NULL DEFAULT '[]',
      query_type TEXT NOT NULL DEFAULT 'person',
      jql TEXT,
      FOREIGN KEY (snapshot_id) REFERENCES dashboard_snapshots(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      oauth_tokens TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Run schema migrations before seed inserts so legacy DBs gain required
  // columns (for example app_settings.updated_at) before INSERT statements
  // reference them.
  migrateDatabase(db);
  seedFieldMappings(db);
  seedAppSettings(db);
};

const ensureColumn = (db, table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

const migrateDatabase = (db) => {
  ensureColumn(db, "epic_presets", "preset_type", "TEXT NOT NULL DEFAULT 'epic'");
  ensureColumn(db, "watched_assignees", "watch_type", "TEXT NOT NULL DEFAULT 'person'");
  ensureColumn(db, "watched_assignees", "jql", "TEXT");
  ensureColumn(db, "dashboard_snapshots", "watched_assignee_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "dashboard_assignee_metrics", "query_type", "TEXT NOT NULL DEFAULT 'person'");
  ensureColumn(db, "dashboard_assignee_metrics", "jql", "TEXT");
  ensureColumn(db, "dashboard_assignee_metrics", "workload_counts_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "dashboard_epic_metrics", "open_status_counts_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "dashboard_epic_metrics", "contributor_metrics_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "dashboard_snapshots", "due_by_date", "TEXT");
  ensureColumn(db, "dashboard_snapshots", "due_by_field", "TEXT NOT NULL DEFAULT 'most_recent_done_date'");
  ensureColumn(db, "dashboard_snapshots", "due_by_issues_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "dashboard_epic_metrics", "due_by_open_issues", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "app_settings", "updated_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
};

const seedFieldMappings = (db) => {
  const insert = db.prepare(`
    INSERT INTO jira_field_mappings (role, field_id, field_name, updated_at)
    VALUES (@role, @fieldId, @fieldName, CURRENT_TIMESTAMP)
    ON CONFLICT(role) DO NOTHING
  `);

  for (const row of DEFAULT_FIELD_MAPPINGS) {
    insert.run({
      role: row.role,
      fieldId: row.fieldId,
      fieldName: row.fieldName,
    });
  }
};

const seedAppSettings = (db) => {
  const insert = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (@key, @value, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO NOTHING
  `);

  for (const [key, value] of Object.entries(DEFAULT_APP_SETTINGS)) {
    insert.run({ key, value });
  }
};

export const formatEpicPresetLabel = (epicKey, epicName) =>
  `${String(epicKey || "").trim()} "${String(epicName || "").trim()}"`;

export const formatPresetLabel = (presetType, epicKey, epicName) => {
  if (String(presetType || "").trim() === "jql") {
    return String(epicName || "").trim();
  }

  return formatEpicPresetLabel(epicKey, epicName);
};

export const mapEpicPresetRow = (row) => {
  if (!row) {
    return null;
  }

  const presetType = String(row.preset_type || "epic").trim();
  const epicKey = String(row.epic_key || "").trim();
  const epicName = String(row.epic_name || "").trim();

  return {
    id: row.id,
    presetType,
    epicKey,
    epicName,
    jiraFilterId: String(row.jira_filter_id || "").trim(),
    jql: String(row.jql || "").trim(),
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    label: formatPresetLabel(presetType, epicKey, epicName),
  };
};

const parseJsonArray = (value) => {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseJsonObject = (value) => {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const mapDashboardSnapshotRow = (row, { epics = [], assignees = [] } = {}) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    refreshedAt: row.refreshed_at,
    epicPresetIds: parseJsonArray(row.epic_preset_ids_json).map((value) => Number(value)),
    includePastDue: Boolean(row.include_past_due),
    dueByDate: row.due_by_date || null,
    dueByField: String(row.due_by_field || "most_recent_done_date").trim(),
    dueByIssues: parseJsonArray(row.due_by_issues_json),
    assigneeNames: parseJsonArray(row.assignee_names_json).map((value) => String(value)),
    watchedAssigneeIds: parseJsonArray(row.watched_assignee_ids_json).map((value) => Number(value)),
    overallIssuePercent: Number(row.overall_issue_percent || 0),
    overallEpicPercent: Number(row.overall_epic_percent || 0),
    overallOverduePercent: Number(row.overall_overdue_percent || 0),
    statusCounts: parseJsonObject(row.status_counts_json),
    epics,
    assignees,
  };
};

export const mapDashboardEpicMetricRow = (row) => {
  const statusCounts = parseJsonObject(row.status_counts_json);

  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    epicPresetId: row.epic_preset_id ?? null,
    epicKey: String(row.epic_key || "").trim(),
    epicName: String(row.epic_name || "").trim(),
    label: formatPresetLabel(
      row.epic_key === "JQL" ? "jql" : "epic",
      row.epic_key,
      row.epic_name
    ),
    issuePercent: Number(row.issue_percent || 0),
    epicPercent: Number(row.epic_percent || 0),
    overduePercent: Number(row.overdue_percent || 0),
    totalIssues: Number(row.total_issues || 0),
    completedIssues: Number(row.closed_issues || 0),
    resolvedIssues: Math.max(
      Number(row.closed_issues || 0),
      Number(row.total_issues || 0) - Number(row.open_issues || 0)
    ),
    openIssues: Number(row.open_issues || 0),
    overdueOpenIssues: Number(row.overdue_open_issues || 0),
    dueByOpenIssues: Number(row.due_by_open_issues || 0),
    initialDoneDate: row.initial_done_date || null,
    mostRecentDoneDate: row.most_recent_done_date || null,
    projectEndDate: row.project_end_date || null,
    isPastDue: Boolean(row.is_past_due),
    pastDueReason: row.past_due_reason || null,
    statusCounts,
    openStatusCounts: parseJsonObject(row.open_status_counts_json),
    contributorMetrics: parseJsonArray(row.contributor_metrics_json).map((row) => ({
      name: String(row?.name || "").trim(),
      totalIssues: Number(row?.totalIssues || 0),
      resolvedIssues: Number(row?.resolvedIssues || 0),
      openIssues: Number(row?.openIssues || 0),
      overdueOpenIssues: Number(row?.overdueOpenIssues || 0),
      overduePercent: Number(row?.overduePercent || 0),
      inProgress: Number(row?.inProgress || 0),
      readyForVerification: Number(row?.readyForVerification || 0),
      openStatusCounts:
        row?.openStatusCounts && typeof row.openStatusCounts === "object"
          ? row.openStatusCounts
          : {},
      overdueIssues: Array.isArray(row?.overdueIssues) ? row.overdueIssues : [],
    })),
  };
};

export const mapDashboardAssigneeMetricRow = (row) => {
  const workloadCounts = parseJsonObject(row.workload_counts_json);

  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    queryName: String(row.query_name || "").trim(),
    resolvedDisplayName: String(row.resolved_display_name || "").trim(),
    resolvedAccountId: String(row.resolved_account_id || "").trim(),
    overduePercent: row.overdue_percent == null ? null : Number(row.overdue_percent),
    overdueOpenCount: Number(row.overdue_open_count || 0),
    totalOpenCount: Number(row.total_open_count || 0),
    overdueIssueKeys: parseJsonArray(row.overdue_issue_keys_json).map((value) => String(value)),
    queryType: String(row.query_type || "person").trim(),
    jql: String(row.jql || "").trim(),
    workloadCounts: {
      totalIssues: Number(workloadCounts.totalIssues || 0),
      totalAssigned: Number(workloadCounts.totalAssigned ?? row.total_open_count ?? 0),
      totalResolved: Number(
        workloadCounts.totalResolved ||
          Math.max(
            0,
            Number(workloadCounts.totalIssues || 0) - Number(workloadCounts.totalAssigned ?? row.total_open_count ?? 0)
          )
      ),
      pastDue: Number(workloadCounts.pastDue ?? row.overdue_open_count ?? 0),
      inProgress: Number(workloadCounts.inProgress || 0),
      backlog: Number(workloadCounts.backlog || 0),
      readyForVerification: Number(workloadCounts.readyForVerification || 0),
      other: Number(workloadCounts.other || 0),
    },
  };
};

export const mapWatchedAssigneeRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    displayName: String(row.display_name || "").trim(),
    watchType: String(row.watch_type || "person").trim(),
    jql: String(row.jql || "").trim(),
    resolvedAccountId: String(row.resolved_account_id || "").trim(),
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
  };
};
