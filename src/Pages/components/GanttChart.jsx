import React from "react";
import { fetchSharedPrograms, fetchGanttData } from "../../services/jiraClient";

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

const fmtMonthYear = (date) =>
  date.toLocaleDateString("en-US", { month: "short", year: "numeric" });

const STATUS_CATEGORY_COLOR = {
  "In Progress": "#3b82f6",
  "Done": "#94a3b8",
  "To Do": "#64748b",
};

const barColor = (statusCategory) =>
  STATUS_CATEGORY_COLOR[statusCategory] || "#64748b";

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

const JIRA_BASE_RE = /^https?:\/\/[^/]+/;

const issueUrl = (key) => {
  const base = window.__JIRA_BASE_URL__ || "";
  return base ? `${base}/browse/${key}` : null;
};

const GanttBar = ({ issue, rangeStart, rangeMs }) => {
  const start = parseDate(issue.startDate);
  const end = parseDate(issue.dueDate || issue.completeDate);

  if (!start || !end || end <= start) {
    return (
      <div className="pm-gantt-row-bars">
        <span className="pm-gantt-no-date">no start date</span>
      </div>
    );
  }

  const leftPct = Math.max(0, pct(start, rangeStart, rangeMs));
  const rightPct = Math.min(100, pct(end, rangeStart, rangeMs));
  const widthPct = Math.max(0.5, rightPct - leftPct);

  const url = issueUrl(issue.key);
  const style = {
    left: `${leftPct}%`,
    width: `${widthPct}%`,
    background: barColor(issue.statusCategory),
  };

  return (
    <div className="pm-gantt-row-bars">
      {url ? (
        <a
          className="pm-gantt-bar"
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          title={`${issue.key}: ${issue.summary}\n${issue.startDate} → ${issue.dueDate || issue.completeDate}`}
          style={style}
        >
          <span className="pm-gantt-bar-label">{issue.key}</span>
        </a>
      ) : (
        <div className="pm-gantt-bar" title={issue.summary} style={style}>
          <span className="pm-gantt-bar-label">{issue.key}</span>
        </div>
      )}
    </div>
  );
};

const GanttChart = () => {
  const [programs, setPrograms] = React.useState([]);
  const [slug, setSlug] = React.useState("");
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    fetchSharedPrograms()
      .then((items) => {
        const enabled = items.filter((p) => p.enabled !== false);
        setPrograms(enabled);
        if (enabled.length > 0) setSlug(enabled[0].slug);
      })
      .catch(() => {});
  }, []);

  const load = React.useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError("");
    fetchGanttData(slug)
      .then((d) => setData(d))
      .catch((err) => setError(err?.message || "Failed to load Gantt data"))
      .finally(() => setLoading(false));
  }, [slug]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const issues = data?.issues || [];

  // Compute date range from issues that have both start and due dates
  const datedIssues = issues.filter((i) => parseDate(i.startDate) && parseDate(i.dueDate || i.completeDate));
  const allStarts = datedIssues.map((i) => parseDate(i.startDate).getTime());
  const allEnds = datedIssues.map((i) => parseDate(i.dueDate || i.completeDate).getTime());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rangeStart = allStarts.length > 0
    ? addDays(new Date(Math.min(...allStarts)), -14)
    : addDays(today, -30);
  const rangeEnd = allEnds.length > 0
    ? addDays(new Date(Math.max(...allEnds)), 14)
    : addDays(today, 60);

  const rangeMs = rangeEnd.getTime() - rangeStart.getTime();
  const months = generateMonths(rangeStart, rangeEnd);
  const todayPct = Math.max(0, Math.min(100, pct(today, rangeStart, rangeMs)));

  const withDate = issues.filter((i) => parseDate(i.startDate));
  const withoutDate = issues.filter((i) => !parseDate(i.startDate));
  const sorted = [...withDate, ...withoutDate];

  return (
    <div className="pm-gantt">
      <div className="pm-gantt-toolbar">
        <div className="pm-gantt-toolbar-left">
          {programs.length > 0 ? (
            <select
              className="pm-gantt-program-select"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            >
              {programs.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.displayName}
                </option>
              ))}
            </select>
          ) : (
            <span className="pm-gantt-no-programs">
              No shared programs configured.
            </span>
          )}
        </div>
        <div className="pm-gantt-toolbar-right">
          {!loading && data && (
            <span className="pm-gantt-meta">
              {issues.length} issue{issues.length !== 1 ? "s" : ""}
              {withoutDate.length > 0
                ? ` · ${withoutDate.length} without start date`
                : ""}
            </span>
          )}
          <button
            type="button"
            className="pm-gantt-refresh"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="pm-gantt-error">{error}</div>
      ) : loading && !data ? (
        <div className="pm-gantt-loading">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="pm-gantt-empty">
          {slug ? "No issues found for this program." : "Select a program above."}
        </div>
      ) : (
        <div className="pm-gantt-chart">
          {/* Label column */}
          <div className="pm-gantt-labels">
            <div className="pm-gantt-label-header">Task</div>
            {sorted.map((issue) => (
              <div key={issue.key} className="pm-gantt-label-row">
                <span className="pm-gantt-label-key">{issue.key}</span>
                <span className="pm-gantt-label-summary" title={issue.summary}>
                  {issue.summary}
                </span>
                <span className="pm-gantt-label-assignee">{issue.assignee}</span>
              </div>
            ))}
          </div>

          {/* Timeline column */}
          <div className="pm-gantt-timeline">
            {/* Month headers */}
            <div className="pm-gantt-months">
              {months.map((m, i) => (
                <div
                  key={i}
                  className="pm-gantt-month"
                  style={{ width: `${m.widthPct}%` }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Rows */}
            <div className="pm-gantt-rows">
              {/* Today marker */}
              <div
                className="pm-gantt-today"
                style={{ left: `${todayPct}%` }}
                aria-label="Today"
              />

              {sorted.map((issue) => (
                <div key={issue.key} className="pm-gantt-row">
                  <GanttBar issue={issue} rangeStart={rangeStart} rangeMs={rangeMs} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GanttChart;
