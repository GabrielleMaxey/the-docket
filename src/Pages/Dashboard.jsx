import React from "react";
import {
  Button,
  Container,
  Header,
  Message,
  Segment,
} from "semantic-ui-react";
import EpicFilterPanel from "./components/EpicFilterPanel";
import { useEpicFilters } from "./hooks/useEpicFilters";
import { useFlash } from "./hooks/useFlash";
import { usePersistedState } from "./hooks/usePersistedState";
import StatusPieChart from "../components/StatusPieChart";
import { formatPercent, formatTimestamp } from "../utils/format";
import {
  isClosedLikeStatus as isClosedLikeStatusName,
  getTerminalIssueCount,
} from "../../shared/dashboardMetrics.mjs";
import {
  fetchDashboardMetrics,
  fetchJiraHealth,
  fetchWatchedAssignees,
  generateReport,
  refreshDashboardMetrics,
} from "../services/jiraClient";
import "./dashboard.css";

const sameNumberSet = (left, right) => {
  const a = [...left].map(Number).sort((x, y) => x - y);
  const b = [...right].map(Number).sort((x, y) => x - y);
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
};

const sameStringSet = (left, right) => {
  const a = [...left].map((value) => String(value).trim().toLowerCase()).sort();
  const b = [...right].map((value) => String(value).trim().toLowerCase()).sort();
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
};

const getDueBrowseUrl = (issue, jiraBaseUrl) => {
  if (issue.self) {
    try {
      const parsed = new URL(issue.self);
      return `${parsed.protocol}//${parsed.host}/browse/${encodeURIComponent(issue.key)}`;
    } catch {
      // fall through
    }
  }
  if (jiraBaseUrl && issue.key) {
    return `${jiraBaseUrl}/browse/${encodeURIComponent(issue.key)}`;
  }
  return null;
};

const pastDueBadgeLabel = (reason) => {
  if (reason === "mrd") {
    return "Past due (MRDD)";
  }
  if (reason === "project_end") {
    return "Past due (Project End)";
  }
  return "Past due";
};

const TERMINAL_STATUS_LABEL = "Resolved/Closed/Done";

const buildEpicPieStatusCounts = (epic) => {
  const pie = {};
  const openCounts =
    epic?.openStatusCounts && Object.keys(epic.openStatusCounts).length > 0
      ? epic.openStatusCounts
      : Object.fromEntries(
          Object.entries(epic?.statusCounts || {}).filter(
            ([status]) => !isClosedLikeStatusName(status)
          )
        );

  for (const [status, count] of Object.entries(openCounts)) {
    const value = Number(count) || 0;
    if (value > 0) {
      pie[status] = value;
    }
  }

  const terminal = getTerminalIssueCount(epic || {});
  if (terminal > 0) {
    pie[TERMINAL_STATUS_LABEL] = terminal;
  }

  return pie;
};

// Collapse all resolved/closed/done statuses into one terminal slice so the
// overall chart matches the per-project and per-contributor charts (which show
// a single "Resolved/Closed/Done" slice rather than separate Closed + Resolved).
const collapseTerminalStatusCounts = (statusCounts) => {
  const collapsed = {};
  let terminal = 0;

  for (const [status, count] of Object.entries(statusCounts || {})) {
    const value = Number(count) || 0;
    if (value <= 0) continue;
    if (isClosedLikeStatusName(status)) {
      terminal += value;
    } else {
      collapsed[status] = (collapsed[status] || 0) + value;
    }
  }

  if (terminal > 0) {
    collapsed[TERMINAL_STATUS_LABEL] = terminal;
  }

  return collapsed;
};

const getOpenStatusCounts = (source) => {
  if (source?.openStatusCounts && Object.keys(source.openStatusCounts).length > 0) {
    return source.openStatusCounts;
  }

  return Object.fromEntries(
    Object.entries(source?.statusCounts || {}).filter(([status]) => !isClosedLikeStatusName(status))
  );
};

const sumStatusCount = (statusCounts, ...targets) => {
  const normalizedTargets = new Set(targets.map((target) => String(target).trim().toLowerCase()));
  let sum = 0;

  for (const [status, count] of Object.entries(statusCounts || {})) {
    if (normalizedTargets.has(String(status).trim().toLowerCase())) {
      sum += Number(count) || 0;
    }
  }

  return sum;
};

const getWorkloadStatusCounts = (source) => {
  const openCounts = getOpenStatusCounts(source);

  return {
    inProgress: sumStatusCount(openCounts, "in progress"),
    readyForVerification: sumStatusCount(openCounts, "ready for verification"),
  };
};

const sumEpicMetrics = (epics) => {
  const statusCounts = {};
  const openStatusCounts = {};
  let totalIssues = 0;
  let resolvedIssues = 0;
  let openIssues = 0;
  let inProgress = 0;
  let readyForVerification = 0;

  for (const epic of epics) {
    totalIssues += Number(epic.totalIssues || 0);
    openIssues += Number(epic.openIssues || 0);
    resolvedIssues += getTerminalIssueCount(epic);

    const workloadStatuses = getWorkloadStatusCounts(epic);
    inProgress += workloadStatuses.inProgress;
    readyForVerification += workloadStatuses.readyForVerification;

    for (const [status, count] of Object.entries(epic.statusCounts || {})) {
      statusCounts[status] = (statusCounts[status] || 0) + Number(count || 0);
    }

    for (const [status, count] of Object.entries(epic.openStatusCounts || {})) {
      openStatusCounts[status] = (openStatusCounts[status] || 0) + Number(count || 0);
    }
  }

  return {
    statusCounts,
    openStatusCounts,
    totalIssues,
    resolvedIssues,
    openIssues,
    inProgress,
    readyForVerification,
  };
};

const workloadCountsToPieData = (counts) => {
  const data = {
    "Past Due": Number(counts?.pastDue || 0),
    "In Progress": Number(counts?.inProgress || 0),
    Backlog: Number(counts?.backlog || 0),
    "Ready for Verification": Number(counts?.readyForVerification || 0),
  };

  const resolved =
    Number(counts?.totalResolved) ||
    Math.max(0, Number(counts?.totalIssues) - Number(counts?.totalAssigned));
  if (resolved > 0) {
    data[TERMINAL_STATUS_LABEL] = resolved;
  }

  const other = Number(counts?.other || 0);
  if (other > 0) {
    data.Other = other;
  }

  return data;
};

const EpicMetricsSummary = ({ epics, chartVariant }) => {
  const totals = React.useMemo(() => sumEpicMetrics(epics), [epics]);

  return (
    <div className="dashboard-epic-metrics-summary">
      <div className="dashboard-epic-metrics-totals">
        <p className="dashboard-epic-metrics-total-line">
          <strong>Total issues:</strong> {totals.totalIssues}
        </p>
        <p className="dashboard-assignee-meta">
          {totals.resolvedIssues} resolved · {totals.openIssues} open · {totals.inProgress} in progress
          · {totals.readyForVerification} ready for verification
        </p>
      </div>
      <StatusPieChart statusCounts={buildEpicPieStatusCounts(totals)} size={150} variant={chartVariant} />
    </div>
  );
};

const STATUS_BAR_COLOR_MAP = {
  "resolved / closed / done": "#22c55e",
  "resolved/closed/done": "#22c55e",
  "in progress": "#0ea5e9",
  "backlog": "#94a3b8",
  "ready for verification": "#8b5cf6",
  "ready for work": "#f59e0b",
  "analyzing": "#ec4899",
  "past due (of open)": "#ef4444",
  "past due": "#ef4444",
  "open tasks overdue": "#ef4444",
  "other": "#64748b",
};

const getMetricBarColor = (label) => {
  const key = String(label || "").toLowerCase().trim();
  return STATUS_BAR_COLOR_MAP[key] || null;
};

const MetricBar = ({ label, value, count }) => {
  const barColor = getMetricBarColor(label);
  return (
  <div className="dashboard-metric-row">
    <div className="dashboard-metric-label">
      <span>{label}</span>
      <span>
        {count != null ? <span className="dashboard-metric-count">{count} · </span> : null}
        <strong>{formatPercent(value)}</strong>
      </span>
    </div>
    <div className="dashboard-progress" aria-hidden="true">
      <div
        className="dashboard-progress-fill"
        style={{
          width: `${Math.min(100, Math.max(0, Number(value) || 0))}%`,
          ...(barColor ? { background: barColor } : {}),
        }}
      />
    </div>
  </div>
  );
};

const getAssigneeStatusMessage = (person) => {
  if (person.totalOpenCount === 0) {
    if (person.queryType === "jql") {
      return "No open issues in scope.";
    }
    return "No open issues assigned.";
  }
  if (person.overdueOpenCount === 0) {
    return "No overdue tasks found.";
  }
  return `${formatPercent(person.overduePercent)} overdue`;
};

const AssigneeMetricCard = ({ person }) => {
  const counts = person.workloadCounts || {};
  const total = Number(counts.totalIssues || 0);
  const pct = (n) => total > 0 ? (Number(n || 0) / total) * 100 : 0;
  const resolved = Number(counts.totalResolved || 0);
  const open = Number(counts.totalAssigned || 0);

  return (
    <div className="dashboard-assignee-card">
      <h4>
        {person.resolvedDisplayName || person.queryName}
        {person.queryType === "jql" ? (
          <span className="dashboard-badge dashboard-badge-jql">JQL</span>
        ) : null}
      </h4>
      {total > 0 ? (
        <p className="dashboard-assignee-meta">
          {total} total &middot; {open} open &middot; {resolved} resolved
        </p>
      ) : (
        <p className="dashboard-assignee-meta">{getAssigneeStatusMessage(person)}</p>
      )}
      {total > 0 ? (
        <div className="dashboard-assignee-metrics">
          <MetricBar label="Resolved / Closed / Done" value={pct(resolved)} count={resolved} />
          {Number(counts.inProgress) > 0 ? <MetricBar label="In Progress" value={pct(counts.inProgress)} count={counts.inProgress} /> : null}
          {Number(counts.readyForVerification) > 0 ? <MetricBar label="Ready for Verification" value={pct(counts.readyForVerification)} count={counts.readyForVerification} /> : null}
          {Number(counts.readyForWork) > 0 ? <MetricBar label="Ready For Work" value={pct(counts.readyForWork)} count={counts.readyForWork} /> : null}
          {Number(counts.analyzing) > 0 ? <MetricBar label="Analyzing" value={pct(counts.analyzing)} count={counts.analyzing} /> : null}
          {Number(counts.backlog) > 0 ? <MetricBar label="Backlog" value={pct(counts.backlog)} count={counts.backlog} /> : null}
          {Number(counts.other) > 0 ? <MetricBar label="Other" value={pct(counts.other)} count={counts.other} /> : null}
          {Number(counts.pastDue) > 0 ? (
            <MetricBar
              label="Past Due (of open)"
              value={open > 0 ? (Number(counts.pastDue) / open) * 100 : 0}
              count={counts.pastDue}
            />
          ) : null}
        </div>
      ) : null}
      {person.overdueIssueKeys?.length > 0 ? (
        <p className="dashboard-overdue-keys">{person.overdueIssueKeys.join(", ")}</p>
      ) : null}
    </div>
  );
};

const EpicMetricCard = ({ epic, jiraBaseUrl, dueByDate, chartVariant, includePastDue }) => {
  const isJqlPreset = epic.epicKey === "JQL";
  const workloadStatuses = React.useMemo(() => getWorkloadStatusCounts(epic), [epic]);
  const contributorMetrics = Array.isArray(epic.contributorMetrics)
    ? epic.contributorMetrics.filter((row) => Number(row.totalIssues || 0) > 0)
    : [];
  const jiraUrl =
    !isJqlPreset && jiraBaseUrl
      ? `${jiraBaseUrl}/browse/${encodeURIComponent(epic.epicKey)}`
      : null;
  const [isCardOpen, setIsCardOpen] = React.useState(true);

  return (
    <div className="dashboard-epic-card">
      <div className="dashboard-epic-card-head">
        <h3 className="dashboard-epic-card-title">
          {jiraUrl ? (
            <a href={jiraUrl} target="_blank" rel="noreferrer">
              {epic.label}
            </a>
          ) : (
            epic.label
          )}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {epic.isPastDue ? (
            <span className="dashboard-badge">{pastDueBadgeLabel(epic.pastDueReason)}</span>
          ) : null}
          {isJqlPreset ? <span className="dashboard-badge dashboard-badge-jql">JQL</span> : null}
          <button
            type="button"
            onClick={() => setIsCardOpen((o) => !o)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "1.1rem", lineHeight: 1, padding: "0.1rem 0.25rem", transform: isCardOpen ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.18s" }}
            aria-label={isCardOpen ? "Collapse" : "Expand"}
          >
            ›
          </button>
        </div>
      </div>

      {isCardOpen ? (
        <>
          {getTerminalIssueCount(epic) > 0 || Object.keys(epic.statusCounts || {}).length > 0 ? (
            <div className="dashboard-epic-status-breakdown">
              <StatusPieChart
                statusCounts={buildEpicPieStatusCounts(epic)}
                size={160}
                className="dashboard-pie-chart--compact"
                variant={chartVariant}
              />
            </div>
          ) : null}

      <MetricBar label="Tasks resolved" value={epic.issuePercent} />
      {workloadStatuses.inProgress > 0 ? (
        <MetricBar
          label="In Progress"
          value={epic.totalIssues > 0 ? (workloadStatuses.inProgress / epic.totalIssues) * 100 : 0}
        />
      ) : null}
      {!isJqlPreset ? <MetricBar label="Project complete" value={epic.epicPercent} /> : null}
      <MetricBar label="Open tasks overdue" value={epic.overduePercent} />

      {epic.totalIssues === 0 ? (
        <p className="dashboard-assignee-meta">No issues found.</p>
      ) : (
        <p className="dashboard-assignee-meta">
          {getTerminalIssueCount(epic)} resolved · {epic.overdueOpenIssues} overdue open / {epic.openIssues}{" "}
          open · {workloadStatuses.inProgress} in progress · {workloadStatuses.readyForVerification} ready
          for verification
          {dueByDate && epic.dueByOpenIssues > 0 ? (
            <strong className="dashboard-due-by-count">
              {" "}&middot; {epic.dueByOpenIssues} due by {dueByDate}
            </strong>
          ) : null}
        </p>
      )}

      <div className="dashboard-dates">
        {!isJqlPreset && epic.initialDoneDate ? <p>Initial Done Date: {epic.initialDoneDate}</p> : null}
        {!isJqlPreset && epic.mostRecentDoneDate ? (
          <p>Most Recent Done Date: {epic.mostRecentDoneDate}</p>
        ) : null}
        {!isJqlPreset && epic.projectEndDate ? <p>Project End Date: {epic.projectEndDate}</p> : null}
      </div>

      {contributorMetrics.length > 0 ? (
        <div className="dashboard-epic-contributors">
          <p className="dashboard-epic-contributors-title">Individual contributors — {epic.label}</p>
          <div className="dashboard-epic-contributor-list">
            {contributorMetrics.map((person) => (
              <div key={person.name} className="dashboard-epic-contributor-row">
                <div className="dashboard-epic-contributor-head">
                  <span className="dashboard-epic-contributor-name">{person.name}</span>
                  <span className="dashboard-epic-contributor-stats">
                    {person.openIssues} open · {person.resolvedIssues} resolved
                    {person.overdueOpenIssues > 0 ? ` · ${person.overdueOpenIssues} overdue` : ""}
                  </span>
                </div>
                {getTerminalIssueCount(person) > 0 ||
                Object.keys(person.openStatusCounts || {}).length > 0 ? (
                  <div className="dashboard-epic-contributor-chart">
                    <StatusPieChart
                      statusCounts={buildEpicPieStatusCounts(person)}
                      size={110}
                      className="dashboard-pie-chart--compact"
                      variant={chartVariant}
                    />
                  </div>
                ) : null}
                {person.openIssues > 0 ? (
                  <div className="dashboard-epic-contributor-overdue-wrap">
                    <div className="dashboard-progress" aria-hidden="true">
                      <div
                        className="dashboard-progress-fill"
                        style={{ width: `${Math.min(100, Math.max(0, Number(person.overduePercent) || 0))}%` }}
                      />
                    </div>
                    <span className="dashboard-epic-contributor-overdue-label">
                      {formatPercent(person.overduePercent)} overdue of open
                    </span>
                  </div>
                ) : null}
                {includePastDue &&
                Array.isArray(person.overdueIssues) &&
                person.overdueIssues.length > 0 ? (
                  <ul className="dashboard-epic-contributor-overdue-list">
                    {person.overdueIssues.map((task) => (
                      <li key={task.key} className="dashboard-epic-contributor-overdue-item">
                        {jiraBaseUrl && task.key ? (
                          <a
                            href={`${jiraBaseUrl}/browse/${encodeURIComponent(task.key)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="dashboard-epic-contributor-overdue-key"
                          >
                            {task.key}
                          </a>
                        ) : (
                          <span className="dashboard-epic-contributor-overdue-key">{task.key}</span>
                        )}
                        <span className="dashboard-epic-contributor-overdue-summary">
                          {task.summary}
                        </span>
                        {task.dueDate ? (
                          <span className="dashboard-epic-contributor-overdue-due">
                            due {task.dueDate}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
        </>
      ) : null}
    </div>
  );
};

// ─── Collapsible section wrapper ─────────────────────────────────────────────────

const CollapsibleSection = ({ title, subtitle, storageKey, defaultOpen = true, badge, children }) => {
  const [isOpen, setIsOpen] = usePersistedState(`dashboard-collapse-${storageKey}`, defaultOpen);

  return (
    <div className="dashboard-collapsible">
      <button
        type="button"
        className="dashboard-collapsible-header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="dashboard-collapsible-title-wrap">
          <span className="dashboard-collapsible-title">{title}</span>
          {subtitle ? <span className="dashboard-collapsible-subtitle">{subtitle}</span> : null}
        </span>
        {badge != null ? (
          <span className="dashboard-collapsible-badge">{badge}</span>
        ) : null}
        <span className={`dashboard-collapsible-chevron${isOpen ? " open" : ""}`}>›</span>
      </button>
      {isOpen ? <div className="dashboard-collapsible-body">{children}</div> : null}
    </div>
  );
};

// ─── Simple markdown renderer (no external library) ───────────────────────────

const renderInline = (text, keyPrefix) =>
  text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={`${keyPrefix}-b-${i}`}>{part}</strong> : part
  );

const SimpleMarkdown = ({ text }) => {
  if (!text) {
    return null;
  }

  const elements = [];
  const lines = text.split("\n");
  let listItems = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${listKey}`} className="report-list">
          {listItems}
        </ul>
      );
      listItems = [];
      listKey += 1;
    }
  };

  lines.forEach((line, i) => {
    if (line.startsWith("### ")) {
      flushList();
      elements.push(<h4 key={i} className="report-h3">{renderInline(line.slice(4), `h4-${i}`)}</h4>);
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={i} className="report-h2">{renderInline(line.slice(3), `h3-${i}`)}</h3>);
    } else if (line.startsWith("# ")) {
      flushList();
      elements.push(<h2 key={i} className="report-h1">{renderInline(line.slice(2), `h2-${i}`)}</h2>);
    } else if (line.match(/^[-*] /)) {
      listItems.push(<li key={i}>{renderInline(line.slice(2), `li-${i}`)}</li>);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      elements.push(<p key={i} className="report-p">{renderInline(line, `p-${i}`)}</p>);
    }
  });

  flushList();
  return <div className="dashboard-report-markdown">{elements}</div>;
};

// ─── Report panel ─────────────────────────────────────────────────────────

const AUDIENCE_OPTIONS = [
  { value: "executive", label: "Executive Summary", description: "High-level overview for senior leadership — highlights, risks, and action items" },
  { value: "product_owner", label: "Project Manager Summary", description: "Deadline realism, stakeholder impact, delay risks, stand-up summaries, and closeout reports" },
  { value: "developer", label: "Developer Report", description: "Team workload, overdue items by person, WIP, and upcoming tasks" },
];

const ReportPanel = ({ hasSnapshot, overallStatusCounts, chartVariant, epics = [] }) => {
  const [audience, setAudience] = React.useState("executive");
  const [loading, setLoading] = React.useState(false);
  const [report, setReport] = React.useState(null);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [selectedEpicIds, setSelectedEpicIds] = React.useState([]);
  const [additionalContext, setAdditionalContext] = React.useState("");

  // Default: all epics. Allow subset selection only when 2+ epics exist.
  const epicIds = selectedEpicIds.length > 0
    ? selectedEpicIds
    : epics.map((e) => e.epicPresetId).filter(Boolean);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const result = await generateReport({
        audience,
        epicPresetIds: epicIds,
        additionalContext: additionalContext.trim(),
      });
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!report?.report) return;
    await navigator.clipboard.writeText(report.report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!report?.report) return;
    const blob = new Blob([report.report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(report.label || "report").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const selectedOption = AUDIENCE_OPTIONS.find((o) => o.value === audience);
  const hasChartData =
    overallStatusCounts && Object.values(overallStatusCounts).some((v) => Number(v) > 0);

  return (
    <div className="dashboard-report-panel">
      <div className="dashboard-report-controls">
        {epics.length > 1 ? (
          <div style={{ marginBottom: "0.75rem" }}>
            <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155", margin: "0 0 0.4rem" }}>
              Include in report
              <button
                type="button"
                onClick={() => setSelectedEpicIds([])}
                style={{ marginLeft: "0.5rem", fontSize: "0.72rem", fontWeight: 400, border: "1px solid #cbd5e1", borderRadius: "999px", padding: "0.1rem 0.45rem", background: "#f1f5f9", color: "#64748b", cursor: "pointer" }}
              >
                All
              </button>
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {epics.map((epic) => {
                const eid = epic.epicPresetId;
                const checked = selectedEpicIds.length === 0 || selectedEpicIds.includes(eid);
                return (
                  <label key={epic.id ?? eid} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.82rem", padding: "0.2rem 0.6rem", borderRadius: "999px", border: `1px solid ${checked ? "#0c93d9" : "#e2e8f0"}`, background: checked ? "#e8f5fd" : "#f8fafc", color: checked ? "#0c93d9" : "#475569", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      style={{ display: "none" }}
                      checked={checked}
                      onChange={() => {
                        setSelectedEpicIds((prev) => {
                          const all = epics.map((e) => e.epicPresetId).filter(Boolean);
                          const current = prev.length === 0 ? all : prev;
                          const next = current.includes(eid)
                            ? current.filter((id) => id !== eid)
                            : [...current, eid];
                          return next.length === all.length ? [] : next;
                        });
                      }}
                    />
                    {epic.label}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="dashboard-report-audience-grid">
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`dashboard-report-audience-btn${
                audience === opt.value ? " dashboard-report-audience-btn--active" : ""
              }`}
              onClick={() => setAudience(opt.value)}
            >
              <span className="dashboard-report-audience-label">{opt.label}</span>
              <span className="dashboard-report-audience-desc">{opt.description}</span>
            </button>
          ))}
        </div>

        <div className="dashboard-report-context-block">
          <label htmlFor="dashboard-report-context" className="dashboard-report-context-label">
            Additional context (optional)
          </label>
          <p className="dashboard-report-context-hint">
            Add priorities, known blockers, stakeholder concerns, or tone guidance for this report.
          </p>
          <textarea
            id="dashboard-report-context"
            className="dashboard-report-context-input"
            rows={3}
            value={additionalContext}
            onChange={(event) => setAdditionalContext(event.target.value)}
            placeholder="Example: Emphasize deadline risks for leadership and call out any dependencies on Platform team approvals."
          />
        </div>

        <div className="dashboard-report-generate-row">
          <Button
            primary
            onClick={handleGenerate}
            loading={loading}
            disabled={loading || !hasSnapshot}
          >
            Generate {selectedOption?.label || "Report"}
          </Button>
          {!hasSnapshot ? (
            <span className="dashboard-due-by-hint">
              Run a Dashboard refresh first so there is data to report on.
            </span>
          ) : null}
        </div>
      </div>

      {error ? <Message negative size="small">{error}</Message> : null}

      {report ? (
        <div className="dashboard-report-output">
          <div className="dashboard-report-output-header">
            <strong className="dashboard-report-output-title">{report.label}</strong>
            <div className="dashboard-report-output-actions">
              <Button basic size="mini" onClick={handleCopy}>
                {copied ? "✓ Copied" : "Copy"}
              </Button>
              <Button basic size="mini" onClick={handleDownload}>
                ⤓ Download .md
              </Button>
            </div>
          </div>

          {hasChartData ? (
            <div className="dashboard-report-chart-wrap">
              <p className="dashboard-report-chart-label">Overall status</p>
              <StatusPieChart
                statusCounts={overallStatusCounts}
                size={160}
                variant={chartVariant}
              />
            </div>
          ) : null}

          <SimpleMarkdown text={report.report} />
        </div>
      ) : null}
    </div>
  );
};

const OverallSummaryCard = ({ label, description, percent, numerator, denominator, warning }) => (
  <div className={`dashboard-stat-card${warning ? " dashboard-stat-card--warning" : ""}`}>
    <div className="dashboard-stat-label">{label}</div>
    <div className="dashboard-stat-value">{formatPercent(percent)}</div>
    <div className="dashboard-overall-progress" aria-hidden="true">
      <div
        className={`dashboard-overall-progress-fill${warning ? " dashboard-overall-progress-fill--warning" : ""}`}
        style={{ width: `${Math.min(100, Math.max(0, Number(percent) || 0))}%` }}
      />
    </div>
    <div className="dashboard-stat-description">{description}</div>
    {denominator > 0 ? (
      <div className="dashboard-stat-detail">
        {numerator} of {denominator}
      </div>
    ) : null}
  </div>
);

// ─── Period summary helpers ───────────────────────────────────────────────

const getWeekLabel = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00"); // noon avoids UTC-boundary issues
  const daysToMonday = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysToMonday);
  return `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
};

const getMonthLabel = (dateStr) =>
  new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

const buildPeriodSummary = (issues, dueByDate) => {
  if (!dueByDate || !issues.length) {
    return [];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(dueByDate + "T23:59:59");
  const diffDays = Math.round((cutoff - today) / (1000 * 60 * 60 * 24));
  const useMonths = diffDays > 31;

  const counts = {};
  const bucketOrder = [];

  for (const issue of issues) {
    let bucket;
    if (issue.isOverdue) {
      bucket = "Overdue";
    } else if (!issue.dueDate) {
      continue;
    } else {
      bucket = useMonths ? getMonthLabel(issue.dueDate) : getWeekLabel(issue.dueDate);
    }

    if (!counts[bucket]) {
      counts[bucket] = 0;
      bucketOrder.push(bucket);
    }
    counts[bucket] += 1;
  }

  return bucketOrder.map((label) => ({
    label,
    count: counts[label],
    isOverdue: label === "Overdue",
  }));
};

const groupIssuesByEpicAndAssignee = (issues) => {
  const epics = new Map();

  for (const issue of issues) {
    const epicKey = issue.epicKey || "";
    const assignee = issue.assignee || "Unassigned";

    if (!epics.has(epicKey)) {
      epics.set(epicKey, { epicKey, assignees: new Map(), total: 0 });
    }

    const epicGroup = epics.get(epicKey);
    epicGroup.total += 1;

    if (!epicGroup.assignees.has(assignee)) {
      epicGroup.assignees.set(assignee, []);
    }

    epicGroup.assignees.get(assignee).push(issue);
  }

  return epics;
};

// ─── Period summary component ───────────────────────────────────────────────

const PeriodSummary = ({ issues, dueByDate }) => {
  const periods = React.useMemo(
    () => buildPeriodSummary(issues, dueByDate),
    [issues, dueByDate]
  );

  if (!periods.length) {
    return null;
  }

  return (
    <div className="dashboard-period-summary">
      {periods.map(({ label, count, isOverdue }) => (
        <span
          key={label}
          className={`dashboard-period-chip${
            isOverdue ? " dashboard-period-chip--overdue" : ""
          }`}
        >
          <strong>{count}</strong> {label}
        </span>
      ))}
    </div>
  );
};

// ─── Hierarchical issue list ────────────────────────────────────────────────

const DueByHierarchicalList = ({ issues, epicNameByKey, jiraBaseUrl }) => {
  const epicGroups = React.useMemo(
    () => groupIssuesByEpicAndAssignee(issues),
    [issues]
  );

  return (
    <div className="dashboard-due-by-hierarchy">
      {[...epicGroups.entries()].map(([epicKey, { assignees, total }]) => {
        const epicName = epicNameByKey[epicKey] || epicKey || "Issues";
        const epicUrl =
          epicKey && jiraBaseUrl
            ? `${jiraBaseUrl}/browse/${encodeURIComponent(epicKey)}`
            : null;

        return (
          <div key={epicKey || "no-epic"} className="dashboard-due-by-epic-group">
            <div className="dashboard-due-by-epic-header">
              <span className="dashboard-due-by-epic-name">
                {epicUrl ? (
                  <a href={epicUrl} target="_blank" rel="noreferrer">
                    {epicName}
                  </a>
                ) : (
                  epicName
                )}
              </span>
              <span className="dashboard-due-by-epic-count">
                {total} task{total !== 1 ? "s" : ""}
              </span>
            </div>

            {[...assignees.entries()].map(([assignee, assigneeIssues]) => (
              <div key={assignee} className="dashboard-due-by-assignee-group">
                <div className="dashboard-due-by-assignee-header">
                  <span>{assignee}</span>
                  <span className="dashboard-due-by-assignee-count">
                    {assigneeIssues.length} task{assigneeIssues.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <ul className="dashboard-due-by-task-list">
                  {assigneeIssues.map((issue) => {
                    const url = getDueBrowseUrl(issue, jiraBaseUrl);
                    return (
                      <li
                        key={issue.key}
                        className={`dashboard-due-by-task-row${
                          issue.isOverdue ? " dashboard-due-by-task-row--overdue" : ""
                        }`}
                      >
                        <span className="dashboard-due-by-task-key">
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer noopener">
                              {issue.key}
                            </a>
                          ) : (
                            issue.key
                          )}
                        </span>
                        <span className="dashboard-due-by-task-summary">{issue.summary}</span>
                        <span className="dashboard-due-by-task-date">
                          {issue.dueDate || "—"}
                          {issue.isOverdue ? (
                            <span className="dashboard-due-by-overdue-badge">Overdue</span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

// ─── Dashboard page ─────────────────────────────────────────────────────────

const Dashboard = () => {
  const {
    presets,
    loading: epicPresetsLoading,
    error: epicPresetsError,
    selectedPresetIds,
    includePastDue,
    setIncludePastDue,
    selectAll,
    clearSelection,
    setSelectedPresetIds,
  } = useEpicFilters();

  const [snapshot, setSnapshot] = React.useState(null);
  const [metricsLoading, setMetricsLoading] = React.useState(true);
  const [refreshLoading, setRefreshLoading] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState("");
  const [jiraBaseUrl, setJiraBaseUrl] = React.useState("");
  const [watchedPeople, setWatchedPeople] = React.useState([]);
  const [assigneeNames, setAssigneeNames] = React.useState([]);
  const [selectedWatchedIds, setSelectedWatchedIds] = React.useState([]);
  const [assigneeInput, setAssigneeInput] = React.useState("");
  const [dueByDate, setDueByDate] = React.useState("");
  const [dueByField, setDueByField] = React.useState("most_recent_done_date");
  const [refreshFlash, flashRefresh] = useFlash();

  const [visibleSections, setVisibleSections] = usePersistedState(
    "dashboard-visible-sections",
    { overall: true, epicMetrics: true, dueBy: true, overdue: true, report: true }
  );

  const [chartVariant, setChartVariant] = usePersistedState("dashboard-chart-variant", "pie");
  const [inputCollapsed, setInputCollapsed] = usePersistedState("dashboard-input-collapsed", false);
  const [activeProjectTab, setActiveProjectTab] = usePersistedState("dashboard-active-project-tab", "all");

  const loadMetrics = React.useCallback(async () => {
    setMetricsLoading(true);
    try {
      const data = await fetchDashboardMetrics();
      setSnapshot(data);
      if (data) {
        setSelectedPresetIds(data.epicPresetIds || []);
        setIncludePastDue(Boolean(data.includePastDue));
        setDueByDate(data.dueByDate || "");
        setDueByField(data.dueByField || "most_recent_done_date");
        setAssigneeNames(data.assigneeNames || []);
        setSelectedWatchedIds(data.watchedAssigneeIds || []);
      }
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Failed to load dashboard metrics");
    } finally {
      setMetricsLoading(false);
    }
  }, [setSelectedPresetIds, setIncludePastDue]);

  React.useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  React.useEffect(() => {
    fetchJiraHealth()
      .then((health) => setJiraBaseUrl(String(health?.jiraBaseUrl || "").trim()))
      .catch(() => setJiraBaseUrl(""));

    fetchWatchedAssignees()
      .then((items) => setWatchedPeople(items))
      .catch(() => setWatchedPeople([]));
  }, []);

  const filtersStale = React.useMemo(() => {
    if (!snapshot) {
      return false;
    }

    return (
      !sameNumberSet(selectedPresetIds, snapshot.epicPresetIds || []) ||
      includePastDue !== Boolean(snapshot.includePastDue) ||
      (dueByDate || null) !== (snapshot.dueByDate || null) ||
      (dueByField || "most_recent_done_date") !== (snapshot.dueByField || "most_recent_done_date") ||
      !sameStringSet(assigneeNames, snapshot.assigneeNames || []) ||
      !sameNumberSet(selectedWatchedIds, snapshot.watchedAssigneeIds || [])
    );
  }, [snapshot, selectedPresetIds, includePastDue, dueByDate, dueByField, assigneeNames, selectedWatchedIds]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshError("");
    setRefreshLoading(true);
    try {
      const data = await refreshDashboardMetrics({
        epicPresetIds: selectedPresetIds,
        includePastDue,
        dueByDate: dueByDate || null,
        dueByField,
        assigneeNames,
        watchedAssigneeIds: selectedWatchedIds,
      });
      setSnapshot(data);
      flashRefresh("Dashboard updated.");
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Failed to refresh dashboard");
    } finally {
      setRefreshLoading(false);
    }
  }, [selectedPresetIds, includePastDue, assigneeNames, selectedWatchedIds, flashRefresh]);

  const handleAddAssignee = React.useCallback(() => {
    const name = assigneeInput.trim();
    if (!name) {
      return;
    }

    setAssigneeNames((prev) => {
      const exists = prev.some((item) => item.toLowerCase() === name.toLowerCase());
      return exists ? prev : [...prev, name];
    });
    setAssigneeInput("");
  }, [assigneeInput]);

  const handleRemoveAssignee = React.useCallback((name) => {
    setAssigneeNames((prev) => prev.filter((item) => item !== name));
  }, []);

  const handleToggleWatched = React.useCallback((id) => {
    setSelectedWatchedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const toggleSection = React.useCallback((key) => {
    setVisibleSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, [setVisibleSections]);

  const personWatches = React.useMemo(
    () => watchedPeople.filter((item) => item.watchType !== "jql"),
    [watchedPeople]
  );
  const jqlWatches = React.useMemo(
    () => watchedPeople.filter((item) => item.watchType === "jql"),
    [watchedPeople]
  );

  const displayEpics = snapshot?.epics || [];
  const pastDueEpics = displayEpics.filter((epic) => epic.isPastDue);
  const assigneeMetrics = snapshot?.assignees || [];
  const showOverall = displayEpics.length >= 1;
  const hasEpicScope = selectedPresetIds.length > 0 || includePastDue;
  const canSubmit = hasEpicScope && !refreshLoading;

  // Build epicKey → display name lookup from the snapshot so the hierarchical
  // list can show epic names without an extra network call.
  const epicNameByKey = React.useMemo(() => {
    const map = {};
    for (const epic of snapshot?.epics || []) {
      const key = String(epic.epicKey || "").trim();
      if (key) {
        map[key] = epic.epicName || epic.label || key;
      }
    }
    return map;
  }, [snapshot?.epics]);

  // Raw counts for the Overall Summary cards so we can show "Y of Z" alongside
  // the percentages — the percentages alone aren’t enough to understand scale.
  const overallTotals = React.useMemo(() => {
    const epics = snapshot?.epics || [];
    let totalIssues = 0;
    let resolvedIssues = 0;
    let openIssues = 0;
    let overdueOpenIssues = 0;
    let inProgressIssues = 0;
    let completeEpics = 0;
    const epicTypePresets = epics.filter((epic) => epic.epicKey && epic.epicKey !== "JQL");

    for (const epic of epics) {
      totalIssues += Number(epic.totalIssues || 0);
      openIssues += Number(epic.openIssues || 0);
      overdueOpenIssues += Number(epic.overdueOpenIssues || 0);
      resolvedIssues += getTerminalIssueCount(epic);
      const workload = getWorkloadStatusCounts(epic);
      inProgressIssues += workload.inProgress;
    }

    for (const epic of epicTypePresets) {
      if (Number(epic.epicPercent || 0) >= 100) {
        completeEpics += 1;
      }
    }

    return {
      totalIssues,
      resolvedIssues,
      openIssues,
      overdueOpenIssues,
      inProgressIssues,
      completeEpics,
      epicCount: epicTypePresets.length,
    };
  }, [snapshot?.epics]);

  return (
    <Container className="dashboard-page">
      <Header as="h1">Project Metrics</Header>
      <p className="dashboard-config-subtitle">
        Configure which projects to pull from Jira, which views to show, and which people
        to include in workload and deadline tracking.
      </p>
      {snapshot?.refreshedAt ? (
        <p className="dashboard-last-updated">
          Last updated: {formatTimestamp(snapshot.refreshedAt)}
        </p>
      ) : null}

      {/* ── Input panel with collapse toggle ── */}
      <div className="dashboard-input-collapsible">
        <button
          type="button"
          className="dashboard-input-collapsible-header"
          onClick={() => setInputCollapsed((c) => !c)}
        >
          <span className="dashboard-input-collapsible-title-wrap">
            <span className="dashboard-input-collapsible-title">Filters &amp; Settings</span>
            <span className="dashboard-input-collapsible-subtitle">
              Choose projects, people, due-date logic, and chart/view options before running metrics.
            </span>
          </span>
          <span
            className="dashboard-collapsible-chevron"
            style={{ transform: inputCollapsed ? "rotate(90deg)" : "rotate(-90deg)" }}
          >
            ›
          </span>
        </button>

        {!inputCollapsed ? (
      <Segment>
        <EpicFilterPanel
          presets={presets}
          loading={epicPresetsLoading}
          error={epicPresetsError || refreshError}
          selectedPresetIds={selectedPresetIds}
          includePastDue={includePastDue}
          onSelectionChange={setSelectedPresetIds}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onIncludePastDueChange={setIncludePastDue}
          showRunButton={false}
          showPastDue={false}
          title="1 — Select projects to analyze"
          description="Choose one or more saved Jira presets. Each preset is a Jira query that loads a set of tasks."
        />

        {/* ── Overdue tracking: who to measure — placed right after project selector so
             the relationship is clear: "for these projects, track overdue % for these people" ── */}
        <div className="dashboard-controls-divider" style={{ marginTop: "0.75rem" }} />
        <div className="dashboard-people-section">
          <p className="dashboard-watch-group-label">
            2 — Track progress metrics for
            {(selectedWatchedIds.length > 0 || assigneeNames.length > 0) ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedWatchedIds([]);
                  setAssigneeNames([]);
                  setAssigneeInput("");
                }}
                style={{ marginLeft: "0.6rem", fontSize: "0.72rem", fontWeight: 400, textTransform: "none", border: "1px solid #cbd5e1", borderRadius: "999px", padding: "0.1rem 0.5rem", background: "#f1f5f9", color: "#64748b", cursor: "pointer" }}
              >
                Clear all
              </button>
            ) : null}
          </p>
          <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0 0 0.5rem" }}>
            Add anyone whose workload and overdue metrics you want to see — yourself, a colleague, or a whole team.
            Use saved groups from Settings, or type a display name or email directly.
          </p>
          {personWatches.length > 0 || jqlWatches.length > 0 ? (
            <div className="dashboard-watched-chips">
              {personWatches.map((person) => (
                <Button
                  key={person.id}
                  size="mini"
                  primary={selectedWatchedIds.includes(person.id)}
                  basic={!selectedWatchedIds.includes(person.id)}
                  onClick={() => handleToggleWatched(person.id)}
                >
                  {person.displayName}
                </Button>
              ))}
              {jqlWatches.map((watch) => (
                <Button
                  key={watch.id}
                  size="mini"
                  primary={selectedWatchedIds.includes(watch.id)}
                  basic={!selectedWatchedIds.includes(watch.id)}
                  onClick={() => handleToggleWatched(watch.id)}
                  title={watch.jql}
                >
                  {watch.displayName}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="dashboard-assignee-input-row">
            <input
              type="text"
              value={assigneeInput}
              onChange={(event) => setAssigneeInput(event.target.value)}
              placeholder="Add by display name, email, or pick from list"
              list="dashboard-people-datalist"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddAssignee();
                }
              }}
            />
            <datalist id="dashboard-people-datalist">
              {personWatches.map((person) => (
                <option key={`w-${person.id}`} value={person.displayName} />
              ))}
            </datalist>
            <Button size="small" onClick={handleAddAssignee} disabled={!assigneeInput.trim()}>
              Add
            </Button>
          </div>
          {assigneeNames.length > 0 ? (
            <div className="dashboard-selected-names">
              {assigneeNames.map((name) => (
                <span key={name} className="dashboard-name-chip">
                  {name}
                  <button
                    type="button"
                    className="dashboard-name-chip-remove"
                    onClick={() => handleRemoveAssignee(name)}
                    aria-label={`Remove ${name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="dashboard-controls-divider" />

        <div className="dashboard-filter-extra">
          {/* Due by date — first so it’s near the project selector */}
          <div className="dashboard-due-by-row">
            <label htmlFor="dashboard-due-by-date" className="dashboard-due-by-label">
              Show tasks due by
            </label>
            <input
              id="dashboard-due-by-date"
              type="date"
              className="dashboard-due-by-input"
              value={dueByDate}
              onChange={(event) => setDueByDate(event.target.value)}
            />
            {dueByDate ? (
              <button
                type="button"
                className="dashboard-due-by-clear"
                onClick={() => setDueByDate("")}
                aria-label="Clear due by date"
              >
                × Clear
              </button>
            ) : null}
            <button
              type="button"
              className="dashboard-due-by-clear"
              onClick={() => setDueByDate(new Date().toISOString().slice(0, 10))}
              title="Show all tasks that have already missed their target date"
            >
              Show missed deadlines
            </button>
            <span className="dashboard-due-by-hint">
              Generates a task list for all selected projects grouped by project → person.
              Checks each epic's Initial Done Date and Most Recent Done Date — tasks inherit
              their parent epic's target date when they don't have one of their own.
            </span>
          </div>

          {dueByDate ? (
            <>
              <div className="dashboard-due-by-field-row">
                <span className="dashboard-due-by-field-label">Compare against</span>
                <label className="dashboard-due-by-field-option">
                  <input
                    type="radio"
                    name="dueByField"
                    value="most_recent_done_date"
                    checked={dueByField === "most_recent_done_date"}
                    onChange={() => setDueByField("most_recent_done_date")}
                  />
                  Most Recent Done Date
                </label>
                <label className="dashboard-due-by-field-option">
                  <input
                    type="radio"
                    name="dueByField"
                    value="initial_done_date"
                    checked={dueByField === "initial_done_date"}
                    onChange={() => setDueByField("initial_done_date")}
                  />
                  Initial Done Date
                </label>
              </div>

              <div className="dashboard-due-by-field-row">
                <span className="dashboard-due-by-field-label">Also include</span>
                <label className="dashboard-due-by-field-option">
                  <input
                    type="checkbox"
                    checked={includePastDue}
                    onChange={(e) => setIncludePastDue(e.target.checked)}
                  />
                  Past Due Projects
                </label>
                <span className="dashboard-due-by-hint" style={{ marginTop: 0 }}>
                  Loads all epics that have already missed their target date as additional project cards.
                </span>
              </div>
            </>
          ) : null}

          {/* Past Due toggle when no date is set */}
          {!dueByDate ? (
            <div className="dashboard-due-by-field-row">
              <span className="dashboard-due-by-field-label">Also include</span>
              <label className="dashboard-due-by-field-option">
                <input
                  type="checkbox"
                  checked={includePastDue}
                  onChange={(e) => setIncludePastDue(e.target.checked)}
                />
                Past Due Projects
              </label>
              <span className="dashboard-due-by-hint" style={{ marginTop: 0 }}>
                Loads all epics that have already missed their target date as additional project cards.
              </span>
            </div>
          ) : null}

          {/* Section visibility toggles */}
          <div className="dashboard-section-toggle-row">
            <span className="dashboard-due-by-label">Views</span>
            {[
              { key: "overall", label: "Overall Status" },
              { key: "epicMetrics", label: "Project Metrics" },
              { key: "dueBy", label: "Due by Date" },
              { key: "overdue", label: "Individual Metrics" },
              { key: "report", label: "Report" },
            ].map(({ key, label }) => (
              <label key={key} className="dashboard-section-toggle-label">
                <input
                  type="checkbox"
                  checked={Boolean(visibleSections[key])}
                  onChange={() => toggleSection(key)}
                />
                {label}
              </label>
            ))}
          </div>

          {/* Chart style toggle */}
          <div className="dashboard-section-toggle-row">
            <span className="dashboard-due-by-label">Chart style</span>
            <label className="dashboard-section-toggle-label">
              <input
                type="radio"
                name="chartVariant"
                value="pie"
                checked={chartVariant === "pie"}
                onChange={() => setChartVariant("pie")}
              />
              Pie
            </label>
            <label className="dashboard-section-toggle-label">
              <input
                type="radio"
                name="chartVariant"
                value="bar"
                checked={chartVariant === "bar"}
                onChange={() => setChartVariant("bar")}
              />
              Vertical bars
            </label>
          </div>
        </div>

        <div className="dashboard-submit-row">
          <Button primary onClick={handleRefresh} loading={refreshLoading} disabled={!canSubmit}>
            Submit
          </Button>
          {!hasEpicScope ? (
            <span className="dashboard-submit-hint">
              Select at least one project preset above first.
            </span>
          ) : null}
          {refreshFlash ? (
            <Message positive size="mini" style={{ marginTop: "0.5rem" }}>
              ✓ {refreshFlash}
            </Message>
          ) : null}
        </div>
      </Segment>
        ) : null}
      </div>

      {/* ── Report Panel: above project tabs, below input ── */}
      {visibleSections.report && snapshot ? (
        <CollapsibleSection
          title="Generate Report"
          subtitle="Create Executive, Project Manager, or Developer summaries from the current snapshot."
          storageKey="report"
          defaultOpen={false}
        >
          <ReportPanel
            hasSnapshot={Boolean(snapshot)}
            overallStatusCounts={collapseTerminalStatusCounts(snapshot?.statusCounts)}
            chartVariant={chartVariant}
            epics={displayEpics}
          />
        </CollapsibleSection>
      ) : null}

      {filtersStale ? (
        <Message info>Filters changed — click Submit to update stored metrics.</Message>
      ) : null}
      {metricsLoading && !snapshot ? <Message info>Loading stored metrics...</Message> : null}
      {!metricsLoading && !snapshot ? (
        <Message warning>
          No dashboard snapshot yet. Select filters above and click Submit to pull metrics from
          Jira.
        </Message>
      ) : null}

      {snapshot ? (
        <>
          {visibleSections.overall && showOverall ? (
            <CollapsibleSection
              title="Overall Status"
              subtitle="High-level health across selected projects: resolved, in-progress, complete, and overdue percentages."
              storageKey="overall"
              badge={`${formatPercent(snapshot.overallIssuePercent)} resolved`}
            >
              <div className="dashboard-overall-grid">
                <OverallSummaryCard
                  label="Tasks resolved"
                  description="Percentage of all tasks across selected projects that are closed, done, or resolved."
                  percent={snapshot.overallIssuePercent}
                  numerator={overallTotals.resolvedIssues}
                  denominator={overallTotals.totalIssues}
                />
                <OverallSummaryCard
                  label="Tasks in progress"
                  description="Percentage of all tasks currently being actively worked on."
                  percent={overallTotals.totalIssues > 0 ? (overallTotals.inProgressIssues / overallTotals.totalIssues) * 100 : 0}
                  numerator={overallTotals.inProgressIssues}
                  denominator={overallTotals.totalIssues}
                />
                {overallTotals.epicCount > 0 ? (
                  <OverallSummaryCard
                    label="Projects complete"
                    description="Percentage of individual Jira epics where every child task is resolved."
                    percent={snapshot.overallEpicPercent}
                    numerator={overallTotals.completeEpics}
                    denominator={overallTotals.epicCount}
                  />
                ) : null}
                <OverallSummaryCard
                  label="Open tasks overdue"
                  description="Percentage of currently open tasks that have passed their target completion date."
                  percent={snapshot.overallOverduePercent}
                  numerator={overallTotals.overdueOpenIssues}
                  denominator={overallTotals.openIssues}
                  warning={snapshot.overallOverduePercent > 0}
                />
              </div>
            </CollapsibleSection>
          ) : null}

          {visibleSections.epicMetrics && displayEpics.length > 0 ? (
            <CollapsibleSection
              title="Project Metrics"
              subtitle="Project-by-project breakdown with tabs, status distribution, deadlines, and contributor-level metrics."
              storageKey="epicMetrics"
              badge={`${displayEpics.length} project${displayEpics.length !== 1 ? "s" : ""}`}
            >
              {/* ── Project tab strip ── */}
              <div className="dashboard-project-tabs">
                <button
                  type="button"
                  className={`dashboard-project-tab${activeProjectTab === "all" ? " is-active" : ""}`}
                  onClick={() => setActiveProjectTab("all")}
                >
                  <span className="dashboard-project-tab-name">View All</span>
                  <span className="dashboard-project-tab-stat">{displayEpics.length} projects</span>
                </button>
                {snapshot.includePastDue && pastDueEpics.length > 0
                  ? pastDueEpics.map((epic) => (
                    <button
                      key={`pd-${epic.id}`}
                      type="button"
                      className={`dashboard-project-tab is-pastdue${activeProjectTab === `pd-${epic.id}` ? " is-active" : ""}`}
                      onClick={() => setActiveProjectTab(`pd-${epic.id}`)}
                    >
                      <span className="dashboard-project-tab-name">{epic.label}</span>
                      <span className="dashboard-project-tab-stat">Past Due</span>
                    </button>
                  ))
                  : null}
                {displayEpics.map((epic) => (
                  <button
                    key={epic.id}
                    type="button"
                    className={`dashboard-project-tab${activeProjectTab === String(epic.id) ? " is-active" : ""}`}
                    onClick={() => setActiveProjectTab(String(epic.id))}
                  >
                    <span className="dashboard-project-tab-name">{epic.label}</span>
                    <span className="dashboard-project-tab-stat">
                      {Math.round(epic.issuePercent ?? 0)}% resolved
                    </span>
                  </button>
                ))}
              </div>

              {/* ── Tab content ── */}
              {activeProjectTab === "all" ? (
                <>
                  {snapshot.includePastDue && pastDueEpics.length > 0 ? (
                    <>
                      <p className="dashboard-subsection-label">Past Due</p>
                      <div className="dashboard-epic-grid">
                        {pastDueEpics.map((epic) => (
                          <EpicMetricCard
                            key={`past-due-${epic.id}`}
                            epic={epic}
                            jiraBaseUrl={jiraBaseUrl}
                            dueByDate={dueByDate}
                            chartVariant={chartVariant}
                            includePastDue={snapshot.includePastDue}
                          />
                        ))}
                      </div>
                    </>
                  ) : null}
                  <EpicMetricsSummary epics={displayEpics} chartVariant={chartVariant} />
                  <div className="dashboard-epic-grid">
                    {displayEpics.map((epic) => (
                      <EpicMetricCard
                        key={epic.id}
                        epic={epic}
                        jiraBaseUrl={jiraBaseUrl}
                        dueByDate={dueByDate}
                        chartVariant={chartVariant}
                        includePastDue={snapshot.includePastDue}
                      />
                    ))}
                  </div>
                </>
              ) : activeProjectTab.startsWith("pd-") ? (
                // Past-due single project view
                (() => {
                  const epic = pastDueEpics.find((e) => `pd-${e.id}` === activeProjectTab);
                  if (!epic) return null;
                  return (
                    <>
                      <EpicMetricsSummary epics={[epic]} chartVariant={chartVariant} />
                      <EpicMetricCard
                        epic={epic}
                        jiraBaseUrl={jiraBaseUrl}
                        dueByDate={dueByDate}
                        chartVariant={chartVariant}
                        includePastDue={snapshot.includePastDue}
                      />
                    </>
                  );
                })()
              ) : (
                // Single project view
                (() => {
                  const epic = displayEpics.find((e) => String(e.id) === activeProjectTab);
                  if (!epic) return null;
                  return (
                    <>
                      <EpicMetricsSummary epics={[epic]} chartVariant={chartVariant} />
                      <EpicMetricCard
                        epic={epic}
                        jiraBaseUrl={jiraBaseUrl}
                        dueByDate={dueByDate}
                        chartVariant={chartVariant}
                        includePastDue={snapshot.includePastDue}
                      />
                    </>
                  );
                })()
              )}
            </CollapsibleSection>
          ) : null}

          {visibleSections.overdue && assigneeMetrics.length > 0 ? (
            <CollapsibleSection
              title="Individual  Contributor Metrics"
              subtitle="Per-person workload and overdue performance for your selected people and saved watches."
              storageKey="overdue"
              defaultOpen={true}
              badge={
                assigneeMetrics.length > 0
                  ? `${assigneeMetrics.length} tracked`
                  : undefined
              }
            >
              <div className="dashboard-assignee-grid">
                {assigneeMetrics.map((person) => (
                  <AssigneeMetricCard key={person.id} person={person} chartVariant={chartVariant} />
                ))}
              </div>
            </CollapsibleSection>
          ) : null}

          {visibleSections.dueBy && snapshot.dueByDate ? (
            <CollapsibleSection
              title={`Due by ${snapshot.dueByDate}`}
              subtitle="Task list grouped by project and assignee for items due on or before the selected date."
              storageKey="dueByTasks"
              defaultOpen={false}
              badge={
                Array.isArray(snapshot.dueByIssues) && snapshot.dueByIssues.length > 0
                  ? `${snapshot.dueByIssues.length} task${snapshot.dueByIssues.length !== 1 ? "s" : ""}`
                  : "0 tasks"
              }
            >
              {Array.isArray(snapshot.dueByIssues) && snapshot.dueByIssues.length > 0 ? (
                <>
                  <PeriodSummary
                    issues={snapshot.dueByIssues}
                    dueByDate={snapshot.dueByDate}
                  />
                  <DueByHierarchicalList
                    issues={snapshot.dueByIssues}
                    epicNameByKey={epicNameByKey}
                    jiraBaseUrl={jiraBaseUrl}
                  />
                  {snapshot.dueByIssues.length >= 200 ? (
                    <p style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.5rem" }}>
                      Results capped at 200. Narrow your date range to see all.
                    </p>
                  ) : null}
                </>
              ) : (
                <Message info size="small">
                  No open issues found with a due date between today and {snapshot.dueByDate}.
                </Message>
              )}
            </CollapsibleSection>
          ) : null}

        </>
      ) : null}
    </Container>
  );
};

export default Dashboard;
