const WORK_WEEK_TYPES = new Set(["work_week_project_report", "week_plan"]);
const DASHBOARD_TYPES = new Set(["dashboard_report"]);
const AD_HOC_TYPES = new Set(["chat_response"]);

export const REPORT_SOURCES = {
  WORK_WEEK: "work_week",
  DASHBOARD: "dashboard",
  ADHOC: "adhoc",
};

const parseMeta = (value) => {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const mapGeneratedReportRow = (row, { includeContent = false } = {}) => {
  if (!row) {
    return null;
  }

  const meta = parseMeta(row.meta_json);
  const item = {
    id: Number(row.id),
    source: String(row.source || "").trim(),
    reportType: String(row.report_type || "").trim(),
    label: String(row.label || "").trim(),
    createdAt: row.created_at,
    meta,
  };

  if (includeContent) {
    item.content = String(row.content || "");
    item.report = item.content;
  }

  return item;
};

const normalizeCreatedAt = (value) => {
  const timestamp = String(value || "").trim();
  if (!timestamp) {
    return new Date().toISOString();
  }

  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : timestamp;
};

export const insertGeneratedReport = (
  db,
  { source, reportType, label, content, meta = {}, createdAt }
) => {
  const stmt = db.prepare(`
    INSERT INTO generated_reports (source, report_type, label, content, meta_json, created_at)
    VALUES (@source, @reportType, @label, @content, @metaJson, @createdAt)
  `);

  const result = stmt.run({
    source: String(source || "").trim(),
    reportType: String(reportType || "").trim(),
    label: String(label || "Report").trim(),
    content: String(content || ""),
    metaJson: JSON.stringify(meta && typeof meta === "object" ? meta : {}),
    createdAt: normalizeCreatedAt(createdAt),
  });

  return Number(result.lastInsertRowid);
};

export const listGeneratedReports = (db, { source, limit = 100 } = {}) => {
  const normalizedSource = String(source || "").trim();
  let rows;

  if (normalizedSource === REPORT_SOURCES.WORK_WEEK) {
    rows = db
      .prepare(
        `SELECT id, source, report_type, label, meta_json, created_at
         FROM generated_reports
         WHERE report_type IN ('work_week_project_report', 'week_plan')
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT ?`
      )
      .all(limit);
  } else if (normalizedSource === REPORT_SOURCES.DASHBOARD) {
    rows = db
      .prepare(
        `SELECT id, source, report_type, label, meta_json, created_at
         FROM generated_reports
         WHERE report_type = 'dashboard_report'
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT ?`
      )
      .all(limit);
  } else if (normalizedSource === REPORT_SOURCES.ADHOC) {
    rows = db
      .prepare(
        `SELECT id, source, report_type, label, meta_json, created_at
         FROM generated_reports
         WHERE source = 'adhoc' OR report_type = 'chat_response'
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT ?`
      )
      .all(limit);
  } else {
    rows = db
      .prepare(
        `SELECT id, source, report_type, label, meta_json, created_at
         FROM generated_reports
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT ?`
      )
      .all(limit);
  }

  return rows.map((row) => mapGeneratedReportRow(row));
};

export const getGeneratedReportById = (db, id) => {
  const row = db
    .prepare(
      `SELECT id, source, report_type, label, content, meta_json, created_at
       FROM generated_reports
       WHERE id = ?`
    )
    .get(Number(id));

  return mapGeneratedReportRow(row, { includeContent: true });
};

export const isWorkWeekReportType = (reportType) => WORK_WEEK_TYPES.has(reportType);
export const isDashboardReportType = (reportType) => DASHBOARD_TYPES.has(reportType);
export const isAdHocReportType = (reportType) => AD_HOC_TYPES.has(reportType);
