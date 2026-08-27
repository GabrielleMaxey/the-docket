import React from "react";
import { fetchSharedPrograms, fetchGanttData } from "../../services/jiraClient";
import { getStatusColor } from "../../utils/statusScale";

const parseDate = (str) => {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
};

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const diffDays = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000);

const fmtMonthYear = (date) =>
  date.toLocaleDateString("en-US", { month: "short", year: "numeric" });

const fmtShort = (str) => {
  const d = parseDate(str);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
};

const OVERDUE_COLOR = "#dc2626";

const barColor = (issue, today, statusIndex) => {
  if (issue.statusCategory !== "Done") {
    const due = parseDate(issue.dueDate || issue.completeDate);
    if (due && due < today) return OVERDUE_COLOR;
  }
  return getStatusColor(issue.status, statusIndex);
};

const generateMonths = (start, end) => {
  const months = [];
  const totalMs = end.getTime() - start.getTime();
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const mStart = Math.max(cur.getTime(), start.getTime());
    const mEnd = Math.min(next.getTime(), end.getTime());
    months.push({
      label: fmtMonthYear(cur),
      widthPct: ((mEnd - mStart) / totalMs) * 100,
    });
    cur = next;
  }
  return months;
};

const pct = (date, rangeStart, rangeMs) =>
  ((date.getTime() - rangeStart.getTime()) / rangeMs) * 100;

const issueUrl = (key) => {
  const base = window.__JIRA_BASE_URL__ || "";
  return base ? `${base}/browse/${key}` : null;
};

const assigneeInitials = (name) => {
  const trimmed = String(name || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "unassigned") return "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const escapeCsvField = (value) => {
  const str = String(value === null || value === undefined ? "" : value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const csvRow = (fields) => fields.map(escapeCsvField).join(",");

const EXPORT_CSV_HEADER = [
  "Key",
  "Summary",
  "Status",
  "Status Category",
  "Assignee",
  "Start Date",
  "Due / Complete Date",
  "Planned Start",
  "Planned Finish",
  "Requestor",
];

const buildPlanReportCsv = (issues) => {
  const rows = [csvRow(EXPORT_CSV_HEADER)];
  for (const issue of issues) {
    rows.push(
      csvRow([
        issue.key,
        issue.summary,
        issue.status,
        issue.statusCategory,
        issue.assignee,
        issue.startDate,
        issue.dueDate || issue.completeDate,
        issue.plannedStart,
        issue.plannedFinish,
        issue.requestor,
      ])
    );
  }
  return rows.join("\r\n");
};

const buildPlanReportMarkdown = (displayName, issues) => {
  const lines = [`# Gantt Plan — ${displayName}`, "", `_Generated ${new Date().toLocaleString()}_`, ""];
  lines.push("| Key | Summary | Status | Assignee | Start | Due/Complete | Planned Start | Planned Finish | Requestor |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const issue of issues) {
    lines.push(
      `| ${issue.key} | ${(issue.summary || "").replace(/\|/g, "\\|")} | ${issue.status || ""} | ${issue.assignee || ""} | ${issue.startDate || ""} | ${issue.dueDate || issue.completeDate || ""} | ${issue.plannedStart || ""} | ${issue.plannedFinish || ""} | ${issue.requestor || ""} |`
    );
  }
  return lines.join("\n");
};

const downloadBlob = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const GanttTooltip = ({ issue, x, y, today }) => {
  const end = parseDate(issue.dueDate || issue.completeDate);
  const planEnd = parseDate(issue.plannedFinish);
  const isOverdue = issue.statusCategory !== "Done" && end && end < today;

  let delta = null;
  if (planEnd && end && issue.statusCategory !== "Done") {
    const d = diffDays(planEnd, end);
    if (d > 0) delta = { text: `${d}d behind plan`, cls: "pm-gantt-tooltip-late" };
    else if (d < 0) delta = { text: `${Math.abs(d)}d ahead of plan`, cls: "pm-gantt-tooltip-ahead" };
    else delta = { text: "on plan", cls: "" };
  }

  const style = {
    position: "fixed",
    left: Math.min(x + 14, (window.innerWidth || 800) - 270),
    top: y - 8,
    transform: "translateY(-100%)",
    zIndex: 9999,
    pointerEvents: "none",
  };

  return (
    <div className="pm-gantt-tooltip" style={style}>
      <div className="pm-gantt-tooltip-key">
        {issue.key}
        {isOverdue && <span className="pm-gantt-tooltip-overdue-badge">Overdue</span>}
      </div>
      <div className="pm-gantt-tooltip-summary">{issue.summary}</div>
      <div className="pm-gantt-tooltip-grid">
        <span>Status</span><span>{issue.status || "—"}</span>
        <span>Assignee</span><span>{issue.assignee || "—"}</span>
        {issue.requestor ? <><span>Requestor</span><span>{issue.requestor}</span></> : null}
        <span>Start</span><span>{fmtShort(issue.startDate)}</span>
        <span>Due / Complete</span><span>{fmtShort(issue.dueDate || issue.completeDate)}</span>
        {issue.plannedStart ? <><span>Planned start</span><span>{fmtShort(issue.plannedStart)}</span></> : null}
        {issue.plannedFinish ? <><span>Planned finish</span><span>{fmtShort(issue.plannedFinish)}</span></> : null}
        {delta ? <><span>vs Plan</span><span className={delta.cls}>{delta.text}</span></> : null}
      </div>
    </div>
  );
};

const GanttBar = ({ issue, statusIndex, rangeStart, rangeMs, today, onMouseEnter, onMouseMove, onMouseLeave }) => {
  const start = parseDate(issue.startDate);
  const end = parseDate(issue.dueDate || issue.completeDate);
  const planStart = parseDate(issue.plannedStart);
  const planEnd = parseDate(issue.plannedFinish);

  const hasActualBar = start && end && end > start;
  const hasPlanBar = planStart && planEnd && planEnd > planStart;

  if (!hasActualBar && !hasPlanBar) {
    return (
      <div className="pm-gantt-row-bars" onMouseLeave={onMouseLeave}>
        <span className="pm-gantt-no-date">no dates</span>
      </div>
    );
  }

  const url = issueUrl(issue.key);
  const color = barColor(issue, today, statusIndex);

  const renderBar = (s, e, className, barStyle) => {
    const leftPct = Math.max(0, pct(s, rangeStart, rangeMs));
    const rightPct = Math.min(100, pct(e, rangeStart, rangeMs));
    const widthPct = Math.max(0.3, rightPct - leftPct);
    const style = { left: `${leftPct}%`, width: `${widthPct}%`, ...barStyle };
    const handlers = {
      onMouseEnter: (e) => onMouseEnter(issue, e),
      onMouseMove,
      onMouseLeave,
    };
    return url ? (
      <a
        key={className}
        className={`pm-gantt-bar ${className}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        style={style}
        {...handlers}
      >
        <span className="pm-gantt-bar-label">{issue.key}</span>
      </a>
    ) : (
      <div key={className} className={`pm-gantt-bar ${className}`} style={style} {...handlers}>
        <span className="pm-gantt-bar-label">{issue.key}</span>
      </div>
    );
  };

  return (
    <div className="pm-gantt-row-bars">
      {hasPlanBar &&
        renderBar(planStart, planEnd, "pm-gantt-bar--plan", {
          background: "transparent",
          border: "2px dashed var(--pm-gantt-plan-bar-color, #a0a0c0)",
          opacity: 0.65,
        })}
      {hasActualBar && renderBar(start, end, "pm-gantt-bar--actual", { background: color })}
    </div>
  );
};

// Status colors/labels now come from getStatusColor per-issue (see filter chips,
// which double as a dynamic legend for whatever statuses are actually in view).
const GanttLegend = () => (
  <div className="pm-gantt-legend">
    <span className="pm-gantt-legend-item">
      <span className="pm-gantt-legend-swatch" style={{ background: OVERDUE_COLOR }} />
      Overdue
    </span>
    <span className="pm-gantt-legend-item">
      <span className="pm-gantt-legend-swatch pm-gantt-legend-swatch--plan" />
      Planned (dashed)
    </span>
  </div>
);

// Preferred left-to-right workflow order for known statuses; anything unrecognized
// (custom workflow states) sorts alphabetically after these, terminal states last.
const KNOWN_STATUS_ORDER = ["In Progress", "Ready for Verification", "Analyzing", "Ready for Work", "Backlog"];
const PINNED_SLUG = "__pinned__";
const ZOOM_LABELS = { "30d": "30 day", "3mo": "3 mo", "6mo": "6 mo", "1yr": "1 yr", all: "All" };

const orderStatuses = (statuses, isDoneStatus) => {
  const known = KNOWN_STATUS_ORDER.filter((s) => statuses.includes(s));
  const rest = statuses
    .filter((s) => !KNOWN_STATUS_ORDER.includes(s))
    .sort((a, b) => a.localeCompare(b));
  const [doneRest, activeRest] = [rest.filter(isDoneStatus), rest.filter((s) => !isDoneStatus(s))];
  return [...known, ...activeRest, ...doneRest];
};

const sortGroup = (items) => {
  const dated = items
    .filter((i) => parseDate(i.startDate))
    .sort((a, b) => parseDate(a.startDate).getTime() - parseDate(b.startDate).getTime());
  return [...dated, ...items.filter((i) => !parseDate(i.startDate))];
};

const GanttChart = () => {
  const [programs, setPrograms] = React.useState([]);
  const [slug, setSlug] = React.useState(PINNED_SLUG);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [zoom, setZoom] = React.useState("all");
  const [hiddenStatuses, setHiddenStatuses] = React.useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = React.useState(new Set());
  const [tooltip, setTooltip] = React.useState(null);

  React.useEffect(() => {
    fetchSharedPrograms()
      .then((items) => setPrograms(items.filter((p) => p.enabled !== false)))
      .catch(() => {});
  }, []);

  const load = React.useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError("");
    fetchGanttData(slug)
      .then((d) => setData(d))
      .catch((err) => {
        const msg = err?.message || "";
        if (msg.toLowerCase().includes("jira environment") || msg.toLowerCase().includes("missing required")) {
          setError("Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in your .env file and restart the API server.");
        } else {
          setError(msg || "Failed to load Gantt data");
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  React.useEffect(() => { void load(); }, [load]);

  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const issues = data?.issues || [];

  const allStarts = issues
    .flatMap((i) => [parseDate(i.startDate)?.getTime(), parseDate(i.plannedStart)?.getTime()])
    .filter(Boolean);
  const allEnds = issues
    .flatMap((i) => [
      parseDate(i.dueDate || i.completeDate)?.getTime(),
      parseDate(i.plannedFinish)?.getTime(),
    ])
    .filter(Boolean);

  const dataRangeStart =
    allStarts.length > 0 ? addDays(new Date(Math.min(...allStarts)), -14) : addDays(today, -30);
  const dataRangeEnd =
    allEnds.length > 0 ? addDays(new Date(Math.max(...allEnds)), 14) : addDays(today, 60);

  const rangeStart =
    zoom === "30d" ? addDays(today, -3)
    : zoom === "3mo" ? addDays(today, -30)
    : zoom === "6mo" ? addDays(today, -60)
    : zoom === "1yr" ? addDays(today, -90)
    : dataRangeStart;
  const rangeEnd =
    zoom === "30d" ? addDays(today, 27)
    : zoom === "3mo" ? addDays(today, 62)
    : zoom === "6mo" ? addDays(today, 124)
    : zoom === "1yr" ? addDays(today, 275)
    : dataRangeEnd;

  const rangeMs = rangeEnd.getTime() - rangeStart.getTime();
  const months = generateMonths(rangeStart, rangeEnd);
  const todayPct = Math.max(0, Math.min(100, pct(today, rangeStart, rangeMs)));

  const statusCategoryByStatus = {};
  for (const i of issues) {
    if (i.status) statusCategoryByStatus[i.status] = i.statusCategory;
  }
  const isDoneStatus = (status) => statusCategoryByStatus[status] === "Done";
  const statuses = orderStatuses(
    [...new Set(issues.map((i) => i.status).filter(Boolean))],
    isDoneStatus
  );
  const visibleIssues = issues.filter((i) => !hiddenStatuses.has(i.status));

  const groups = [];
  for (const status of statuses) {
    const items = sortGroup(visibleIssues.filter((i) => i.status === status));
    if (items.length > 0) groups.push({ key: status, label: status, items });
  }

  const flatRows = [];
  for (const group of groups) {
    flatRows.push({ type: "header", group });
    if (!collapsedGroups.has(group.key)) {
      for (const issue of group.items) flatRows.push({ type: "issue", issue });
    }
  }

  const toggleGroup = (key) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleStatus = (cat) =>
    setHiddenStatuses((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  const handleMouseEnter = (issue, e) => setTooltip({ issue, x: e.clientX, y: e.clientY });
  const handleMouseMove = (e) =>
    setTooltip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
  const handleMouseLeave = () => setTooltip(null);

  const visibleCount = visibleIssues.length;
  const noDateCount = visibleIssues.filter((i) => !parseDate(i.startDate)).length;

  const exportFilenameBase = `gantt_plan_${(data?.displayName || slug).replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${new Date().toISOString().slice(0, 10)}`;

  const handleExportCsv = () => {
    if (visibleIssues.length === 0) return;
    downloadBlob(`﻿${buildPlanReportCsv(visibleIssues)}`, `${exportFilenameBase}.csv`, "text/csv;charset=utf-8");
  };

  const handleExportMarkdown = () => {
    if (visibleIssues.length === 0) return;
    downloadBlob(
      buildPlanReportMarkdown(data?.displayName || slug, visibleIssues),
      `${exportFilenameBase}.md`,
      "text/markdown;charset=utf-8"
    );
  };

  const emptyMsg =
    slug === PINNED_SLUG
      ? "No pinned issues. Open the planning panel for any issue in Task Manager and check 'Pin to Gantt'."
      : "No issues found for this program.";

  return (
    <div className="pm-gantt">
      {/* Row 1: program select + meta + refresh */}
      <div className="pm-gantt-toolbar">
        <div className="pm-gantt-toolbar-left">
          <select
            className="pm-gantt-program-select"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          >
            <option value={PINNED_SLUG}>Pinned Issues</option>
            {programs.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="pm-gantt-toolbar-right">
          {!loading && data && (
            <span className="pm-gantt-meta">
              {visibleCount} issue{visibleCount !== 1 ? "s" : ""}
              {noDateCount > 0 ? ` · ${noDateCount} without dates` : ""}
            </span>
          )}
          {!loading && data && visibleIssues.length > 0 ? (
            <>
              <button type="button" className="pm-gantt-refresh" onClick={handleExportMarkdown}>
                Export (.md)
              </button>
              <button type="button" className="pm-gantt-refresh" onClick={handleExportCsv}>
                Export (.csv)
              </button>
            </>
          ) : null}
          <button type="button" className="pm-gantt-refresh" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Row 2: zoom + status filters */}
      {data && (
        <div className="pm-gantt-controls">
          <div className="pm-gantt-zoom">
            {Object.entries(ZOOM_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`pm-gantt-zoom-btn${zoom === key ? " pm-gantt-zoom-btn--active" : ""}`}
                onClick={() => setZoom(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {statuses.length > 1 && (
            <div className="pm-gantt-filters">
              {statuses.map((status, index) => (
                <button
                  key={status}
                  type="button"
                  className={`pm-gantt-filter-chip${hiddenStatuses.has(status) ? " pm-gantt-filter-chip--off" : ""}`}
                  onClick={() => toggleStatus(status)}
                >
                  <span
                    className="pm-gantt-filter-dot"
                    style={{ background: getStatusColor(status, index) }}
                  />
                  {status}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {data && <GanttLegend />}

      {/* Chart body */}
      {error ? (
        <div className="pm-gantt-error">{error}</div>
      ) : loading && !data ? (
        <div className="pm-gantt-loading">Loading…</div>
      ) : !loading && flatRows.length === 0 ? (
        <div className="pm-gantt-empty">{emptyMsg}</div>
      ) : flatRows.length > 0 ? (
        <div className="pm-gantt-chart">
          {/* Label column */}
          <div className="pm-gantt-labels">
            <div className="pm-gantt-label-header">Task</div>
            {flatRows.map((row) =>
              row.type === "header" ? (
                <div
                  key={`lh-${row.group.key}`}
                  className="pm-gantt-group-label-header"
                  onClick={() => toggleGroup(row.group.key)}
                >
                  <span className="pm-gantt-group-chevron">
                    {collapsedGroups.has(row.group.key) ? "▶" : "▼"}
                  </span>
                  <span
                    className="pm-gantt-group-dot"
                    style={{ background: getStatusColor(row.group.label, statuses.indexOf(row.group.label)) }}
                  />
                  <span className="pm-gantt-group-name">{row.group.label}</span>
                  <span className="pm-gantt-group-count">({row.group.items.length})</span>
                </div>
              ) : (
                <div key={row.issue.key} className="pm-gantt-label-row">
                  <span className="pm-gantt-label-top">
                    <span className="pm-gantt-label-key">{row.issue.key}</span>
                    {assigneeInitials(row.issue.assignee) ? (
                      <span className="pm-gantt-label-assignee" title={row.issue.assignee}>
                        {assigneeInitials(row.issue.assignee)}
                      </span>
                    ) : null}
                  </span>
                  <span className="pm-gantt-label-summary" title={row.issue.summary}>
                    {row.issue.summary}
                  </span>
                </div>
              )
            )}
          </div>

          {/* Timeline column */}
          <div className="pm-gantt-timeline">
            <div className="pm-gantt-months">
              {months.map((m, i) => (
                <div key={i} className="pm-gantt-month" style={{ width: `${m.widthPct}%` }}>
                  {m.label}
                </div>
              ))}
            </div>
            <div className="pm-gantt-rows">
              <div className="pm-gantt-today" style={{ left: `${todayPct}%` }} aria-label="Today" />
              {flatRows.map((row) =>
                row.type === "header" ? (
                  <div
                    key={`th-${row.group.key}`}
                    className="pm-gantt-group-timeline-header"
                    onClick={() => toggleGroup(row.group.key)}
                  />
                ) : (
                  <div key={row.issue.key} className="pm-gantt-row">
                    <GanttBar
                      issue={row.issue}
                      statusIndex={statuses.indexOf(row.issue.status)}
                      rangeStart={rangeStart}
                      rangeMs={rangeMs}
                      today={today}
                      onMouseEnter={handleMouseEnter}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                    />
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tooltip && (
        <GanttTooltip issue={tooltip.issue} x={tooltip.x} y={tooltip.y} today={today} />
      )}
    </div>
  );
};

export default GanttChart;
