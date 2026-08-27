import React from "react";
import { Link } from "react-router-dom";
import { Container, Header, Message, Segment, Button } from "semantic-ui-react";
import { fetchCapacityPlanning, fetchWatchedAssignees, saveAdHocReport, fetchPmAsks, createPmAsk, updatePmAsk, deletePmAsk } from "../services/jiraClient";
import GanttChart from "./components/GanttChart";
import { getStatusColor } from "../utils/statusScale";
import { buildWorkWeekHref } from "../utils/workWeekNavigation";
import { usePersistedState } from "./hooks/usePersistedState";
import { useFlash } from "./hooks/useFlash";
import { reconcileSelectedEntryIds, sameIdList, watchTypeLabel } from "./pmEntrySelection";
import { escapeJqlString } from "../../shared/directReportsJql.mjs";
import { formatDate, formatTimestamp } from "../utils/format.js";
import "./projectManagers.css";

// Wrap before AND — unparenthesized OR in scopeJql would only apply the extra clause to the last branch.
const buildDrillDownJql = (scopeJql, extraClause) => {
  const scope = String(scopeJql || "").trim();
  if (!scope) return "";
  return `(${scope}) AND ${extraClause}`;
};

const drillDownHref = (scopeJql, extraClause, label) => {
  const jql = buildDrillDownJql(scopeJql, extraClause);
  return jql ? buildWorkWeekHref({ jql, label }) : null;
};

const formatOpenCount = (openCount, incomplete) => `${openCount}${incomplete ? "+" : ""}`;

// null capacity is "no target", not 0 — JS would coerce null <= 0 to true.
const capacityStatus = (openCount, capacity) => {
  if (capacity === null || capacity === undefined) return null;
  if (capacity <= 0) {
    return openCount > 0 ? "over" : "ok";
  }
  const ratio = openCount / capacity;
  if (ratio > 1) return "over";
  if (ratio >= 0.85) return "near";
  return "ok";
};

const DEFAULT_WIP_LIMITS = [
  { status: "In Progress", abbr: "In Prog", limit: 6 },
  { status: "Ready for Verification", abbr: "RtV", limit: 3 },
  { status: "Backlog", abbr: "Backlog", limit: 15 },
  { status: "Analyzing", abbr: "Anlyz", limit: 2 },
  { status: "Ready for Work", abbr: "RtW", limit: 2 },
];

const wipSegmentStatus = (count, teamLimit) => {
  if (teamLimit <= 0) return count > 0 ? "ok" : "empty";
  if (count > teamLimit) return "over";
  if (count / teamLimit >= 0.85) return "near";
  return count > 0 ? "ok" : "empty";
};

const WipBar = ({ statusCounts, wipLimits, numICs = 1, mini = false }) => {
  const limits = wipLimits || DEFAULT_WIP_LIMITS;
  const totalLimit = limits.reduce((s, { limit }) => s + limit, 0);
  if (totalLimit === 0) return null;
  const counts = statusCounts || {};
  const segments = limits.map(({ status, abbr, limit }) => {
    const count = counts[status] ?? 0;
    const teamLimit = limit * numICs;
    const fillPct = teamLimit > 0 ? Math.min(100, Math.round((count / teamLimit) * 100)) : 0;
    const segStatus = wipSegmentStatus(count, teamLimit);
    const segWidth = (limit / totalLimit) * 100;
    return { status, abbr: abbr || status, count, teamLimit, fillPct, segStatus, segWidth };
  });
  return (
    <div className={`pm-wip-bar-wrap${mini ? " pm-wip-bar-wrap--mini" : ""}`}>
      <div className={`pm-wip-bar${mini ? " pm-wip-bar--mini" : ""}`}>
        {segments.map(({ status, count, teamLimit, fillPct, segStatus, segWidth }) => (
          <div
            key={status}
            className="pm-wip-segment"
            style={{ width: `${segWidth}%` }}
            title={`${status}: ${count} / ${teamLimit}`}
          >
            <div className={`pm-wip-segment-fill pm-wip-segment-fill--${segStatus}`} style={{ width: `${fillPct}%` }} />
          </div>
        ))}
      </div>
      <div className="pm-wip-bar-labels">
        {segments.map(({ status, abbr, count, teamLimit, segWidth, segStatus }) => (
          <div key={status} className="pm-wip-segment-label" style={{ width: `${segWidth}%` }}>
            <span className={`pm-wip-segment-label-text pm-wip-segment-label-text--${count > 0 ? segStatus : "empty"}`}>
              {abbr} {count}/{teamLimit}{segStatus === "over" ? " !" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const wipCardStatus = (statusCounts, wipLimits, numICs) => {
  const limits = wipLimits || DEFAULT_WIP_LIMITS;
  const counts = statusCounts || {};
  let hasNear = false;
  for (const { status, limit } of limits) {
    const seg = wipSegmentStatus(counts[status] ?? 0, limit * numICs);
    if (seg === "over") return "over";
    if (seg === "near") hasNear = true;
  }
  return hasNear ? "near" : null;
};

const WipLimitsEditor = ({ wipLimits, onSave }) => {
  const [open, setOpen] = React.useState(false);
  const [drafts, setDrafts] = React.useState(null);
  const current = drafts || wipLimits || DEFAULT_WIP_LIMITS;

  const handleChange = (status, value) => {
    setDrafts(current.map((e) => (e.status === status ? { ...e, limit: Math.max(0, Number(value) || 0) } : e)));
  };

  const handleSave = () => {
    onSave(current);
    setDrafts(null);
    setOpen(false);
  };

  const handleReset = () => {
    setDrafts(DEFAULT_WIP_LIMITS.map((d) => ({ ...d })));
  };

  return (
    <div className="pm-wip-editor">
      <button type="button" className="pm-wip-editor-toggle" onClick={() => setOpen((v) => !v)}>
        WIP limits {open ? "▲" : "▼"}
      </button>
      {open ? (
        <div className="pm-wip-editor-body">
          {current.map(({ status, limit }) => (
            <label key={status} className="pm-wip-editor-row">
              <span className="pm-wip-editor-label">{status}</span>
              <input
                type="number"
                min="0"
                className="pm-wip-editor-input"
                value={limit}
                onChange={(e) => handleChange(status, e.target.value)}
              />
            </label>
          ))}
          <div className="pm-wip-editor-actions">
            <button type="button" className="pm-wip-editor-btn pm-wip-editor-btn--save" onClick={handleSave}>
              Save
            </button>
            <button type="button" className="pm-wip-editor-btn" onClick={handleReset}>
              Reset to defaults
            </button>
            <button type="button" className="pm-wip-editor-btn" onClick={() => { setDrafts(null); setOpen(false); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const StatusBreakdown = ({ scopeJql, displayName, statusCounts }) => {
  const entries = Object.entries(statusCounts || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div className="pm-status-breakdown-wrap">
      <div className="pm-status-breakdown-label">By status</div>
      <div className="pm-status-breakdown">
      {entries.map(([label, count], index) => {
        const href = drillDownHref(scopeJql, `status = "${escapeJqlString(label)}"`, `${displayName} — ${label}`);
        const inner = (
          <>
            <span
              className="pm-status-breakdown-dot"
              style={{ background: getStatusColor(label, index) }}
              aria-hidden="true"
            />
            {label} <strong>{count}</strong>
          </>
        );
        return href ? (
          <Link key={label} to={href} className="pm-status-breakdown-item pm-status-breakdown-item--link">
            {inner}
          </Link>
        ) : (
          <span key={label} className="pm-status-breakdown-item">
            {inner}
          </span>
        );
      })}
      </div>
    </div>
  );
};

const RiskFlags = ({ scopeJql, displayName, overdueCount, blockedCount, staleCount, overdueClause, blockedClause }) => {
  if (!overdueCount && !blockedCount && !staleCount) return null;
  const overdueHref = drillDownHref(
    scopeJql,
    overdueClause || "statusCategory != Done AND duedate < startOfDay()",
    `${displayName} — Overdue`
  );
  const blockedHref = drillDownHref(
    scopeJql,
    blockedClause || 'statusCategory != Done AND status in ("Blocked", "On Hold")',
    `${displayName} — Blocked`
  );
  const staleHref = drillDownHref(
    scopeJql,
    'statusCategory != Done AND updated <= "-14d"',
    `${displayName} — Stale (14d+)`
  );
  return (
    <div className="pm-risk-flags">
      {overdueCount > 0 ? (
        <Link to={overdueHref || "#"} className="pm-risk-flag pm-risk-flag--overdue">
          ⚠️ {overdueCount} overdue
        </Link>
      ) : null}
      {blockedCount > 0 ? (
        <Link to={blockedHref || "#"} className="pm-risk-flag pm-risk-flag--blocked">
          🚧 {blockedCount} blocked
        </Link>
      ) : null}
      {staleCount > 0 ? (
        <Link to={staleHref || "#"} className="pm-risk-flag pm-risk-flag--stale">
          💤 {staleCount} stale (14d+)
        </Link>
      ) : null}
    </div>
  );
};

const CONTRIBUTOR_BREAKDOWN_LIMIT = 6;

const ContributorBreakdown = ({ scopeJql, displayName, contributorCounts, contributorTotalCounts, contributorStatusCounts, wipLimits }) => {
  const [expanded, setExpanded] = React.useState(false);
  const entries = Object.entries(contributorCounts || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length <= 1) return null;
  const shown = expanded ? entries : entries.slice(0, CONTRIBUTOR_BREAKDOWN_LIMIT);
  const remaining = entries.length - Math.min(entries.length, CONTRIBUTOR_BREAKDOWN_LIMIT);

  return (
    <div className="pm-contributor-breakdown">
      <div className="pm-contributor-breakdown-label">By assignee</div>
      {shown.map(([name, count]) => {
        const assigneeClause = name === "Unassigned" ? "assignee is EMPTY" : `assignee = "${escapeJqlString(name)}"`;
        const clause = `${assigneeClause} AND statusCategory != Done`;
        const href = drillDownHref(scopeJql, clause, `${displayName} — ${name}`);
        const total = contributorTotalCounts?.[name];
        const hasTotal = name !== "Unassigned" && typeof total === "number";
        const totalHref = hasTotal
          ? buildWorkWeekHref({ jql: `assignee = "${escapeJqlString(name)}" AND statusCategory != Done`, label: `${name} — All open work` })
          : null;
        const icStatusCounts = name !== "Unassigned" ? contributorStatusCounts?.[name] : null;
        return (
          <div key={name} className="pm-contributor-row">
            <div className="pm-contributor-row-top">
              {href ? (
                <Link to={href} className="pm-contributor-row-name pm-contributor-row-name--link">
                  {name}
                </Link>
              ) : (
                <span className="pm-contributor-row-name">{name}</span>
              )}
              <span className="pm-contributor-row-counts">
                {href ? (
                  <Link to={href} className="pm-contributor-row-here" title="Open issues within this query">
                    {count} here
                  </Link>
                ) : (
                  <span title="Open issues within this query">{count} here</span>
                )}
                {name === "Unassigned" ? null : hasTotal ? (
                  <>
                    {" · "}
                    <Link to={totalHref} className="pm-contributor-row-total" title="Total open issues everywhere">
                      {total} total
                    </Link>
                  </>
                ) : (
                  <>
                    {" · "}
                    <span
                      className="pm-contributor-row-total pm-contributor-row-total--unknown"
                      title="Couldn't resolve this person's total workload"
                    >
                      N/A total
                    </span>
                  </>
                )}
              </span>
            </div>
            {icStatusCounts ? (
              <WipBar statusCounts={icStatusCounts} wipLimits={wipLimits} numICs={1} mini />
            ) : null}
          </div>
        );
      })}
      {remaining > 0 ? (
        <button type="button" className="pm-contributor-more pm-contributor-more--toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : `+${remaining} more`}
        </button>
      ) : null}
    </div>
  );
};

const CapacityCard = ({ item, wipLimits }) => {
  const {
    displayName,
    watchType,
    openCount,
    openCountIncomplete,
    scopeJql,
    statusCounts,
    contributorCounts,
    contributorTotalCounts,
    contributorStatusCounts,
    overdueCount,
    blockedCount,
    staleCount,
    error,
  } = item;
  const unassignedCount = contributorCounts?.["Unassigned"] ?? 0;
  const assignedCount = Math.max(0, openCount - unassignedCount);
  const numICs = Math.max(1, Object.keys(contributorCounts || {}).filter((n) => n !== "Unassigned").length);
  const cardStatus = error ? null : wipCardStatus(statusCounts, wipLimits, numICs);
  const assignedLabel = formatOpenCount(assignedCount, openCountIncomplete);

  return (
    <div className={`pm-capacity-card${cardStatus ? ` pm-capacity-card--${cardStatus}` : ""}`}>
      <div className="pm-capacity-card-head">
        <span className="pm-capacity-name">{displayName}</span>
        {watchType === "jql" ? <span className="pm-capacity-badge">{watchTypeLabel(watchType, item.jql)}</span> : null}
      </div>
      {error ? (
        <Message negative size="mini" style={{ margin: "0.4rem 0 0" }}>
          {error}
        </Message>
      ) : (
        <>
          <div className="pm-capacity-numbers">
            <strong>{assignedLabel}</strong> assigned
            {unassignedCount > 0 ? (
              <span className="pm-capacity-flag pm-capacity-flag--unassigned" title="Open issues in this query with no assignee">
                {unassignedCount} unassigned
              </span>
            ) : null}
            {openCountIncomplete ? (
              <span
                className="pm-capacity-flag pm-capacity-flag--near"
                title="Stopped at the fetch limit; actual counts may be higher"
              >
                Count incomplete
              </span>
            ) : null}
          </div>
          <WipBar statusCounts={statusCounts} wipLimits={wipLimits} numICs={numICs} />
          <RiskFlags
            scopeJql={scopeJql}
            displayName={displayName}
            overdueCount={overdueCount}
            blockedCount={blockedCount}
            staleCount={staleCount}
            overdueClause={item.overdueClause}
            blockedClause={item.blockedClause}
          />
          <StatusBreakdown scopeJql={scopeJql} displayName={displayName} statusCounts={statusCounts} />
          <ContributorBreakdown
            scopeJql={scopeJql}
            displayName={displayName}
            contributorCounts={contributorCounts}
            contributorTotalCounts={contributorTotalCounts}
            contributorStatusCounts={contributorStatusCounts}
            wipLimits={wipLimits}
          />
        </>
      )}
    </div>
  );
};

const KeyLegend = () => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="pm-key">
      <button type="button" className="pm-key-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide key" : "Show key"}
      </button>
      {open ? (
        <div className="pm-key-body">
          <div className="pm-key-section">
            <div className="pm-key-section-label">Capacity bar</div>
            <div className="pm-key-row">
              <span className="pm-key-swatch pm-key-swatch--ok" aria-hidden="true" />
              Within capacity
            </div>
            <div className="pm-key-row">
              <span className="pm-key-swatch pm-key-swatch--near" aria-hidden="true" />
              Near capacity (85%+ of target)
            </div>
            <div className="pm-key-row">
              <span className="pm-key-swatch pm-key-swatch--over" aria-hidden="true" />
              Over capacity
            </div>
            <div className="pm-key-row">
              <strong>N+</strong> — at least N open issues; more exist beyond the fetch limit
            </div>
          </div>
          <div className="pm-key-section">
            <div className="pm-key-section-label">Risk flags</div>
            <div className="pm-key-row">⚠️ Overdue — past Due date or Done Date</div>
            <div className="pm-key-row">🚧 Blocked — status is Blocked or On Hold</div>
            <div className="pm-key-row">💤 Stale — not updated in 14+ days</div>
          </div>
          <div className="pm-key-section">
            <div className="pm-key-section-label">Share of this query, by assignee</div>
            <div className="pm-key-row">
              <strong>Two separate lists</strong> — "By status" and "…by assignee" are two
              different breakdowns of the same issues, not one continuing list. A single issue
              counts in one status bucket and one assignee bucket at the same time.
            </div>
            <div className="pm-key-row">
              <strong>N here</strong> — that person's open issues within this specific query
            </div>
            <div className="pm-key-row">
              <strong>N total</strong> — all of that person's open issues everywhere, across every
              project
            </div>
            <div className="pm-key-row">
              <strong>N/A total</strong> — Jira couldn't resolve a total for that name; it's a data
              gap, not a real zero
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const buildKeyMarkdown = () =>
  [
    "## Key",
    "",
    "**Capacity bar**",
    "- Within capacity",
    "- Near capacity (85%+ of target)",
    "- Over capacity",
    "- **N+** — at least N open issues; more exist beyond the fetch limit",
    "",
    "**Risk flags**",
    "- ⚠️ Overdue — past Due date or Done Date",
    "- 🚧 Blocked — status is Blocked or On Hold",
    "- 💤 Stale — not updated in 14+ days",
    "",
    "**Share of this query, by assignee**",
    '- Two separate lists — "By status" and "…by assignee" are two different breakdowns of the ' +
      "same issues, not one continuing list. A single issue counts in one status bucket and one " +
      "assignee bucket at the same time.",
    "- **N here** — that person's open issues within this specific query",
    "- **N total** — all of that person's open issues everywhere, across every project",
    "- **N/A total** — Jira couldn't resolve a total for that name; it's a data gap, not a real zero",
  ].join("\n");

const buildCapacityReportMarkdown = (sortedItems) => {
  const lines = [`# Project Managers — Capacity Planning`, "", `_Generated ${formatTimestamp(new Date())}_`, ""];

  for (const item of sortedItems) {
    const { displayName, watchType, capacity, openCount, openCountIncomplete, statusCounts, contributorCounts, contributorTotalCounts } =
      item;
    const status = item.error ? null : capacityStatus(openCount, capacity);
    const hasCapacity = capacity !== null && capacity !== undefined;
    const countLabel = formatOpenCount(openCount, openCountIncomplete);

    const typeNote = watchType === "jql" ? ` (${watchTypeLabel(watchType, item.jql).toLowerCase()})` : "";
    lines.push(`## ${displayName}${typeNote}`);
    if (item.error) {
      lines.push("", `_Error: ${item.error}_`, "");
      continue;
    }
    lines.push(
      "",
      hasCapacity
        ? `${countLabel} of ${capacity} open issues${status === "over" ? " — **OVER CAPACITY**" : status === "near" ? " — **Near capacity**" : ""}${openCountIncomplete ? " — _count incomplete_" : ""}`
        : `${countLabel} open issues (no capacity target set)${openCountIncomplete ? " — _count incomplete_" : ""}`
    );

    const riskParts = [];
    if (item.overdueCount) riskParts.push(`⚠️ ${item.overdueCount} overdue`);
    if (item.blockedCount) riskParts.push(`🚧 ${item.blockedCount} blocked`);
    if (item.staleCount) riskParts.push(`💤 ${item.staleCount} stale (14d+)`);
    if (riskParts.length > 0) lines.push("", riskParts.join(" · "));

    const statusEntries = Object.entries(statusCounts || {}).sort((a, b) => b[1] - a[1]);
    if (statusEntries.length > 0) {
      lines.push("", "**By status**");
      for (const [label, count] of statusEntries) lines.push(`- ${label}: ${count}`);
    }

    const contributorEntries = Object.entries(contributorCounts || {}).sort((a, b) => b[1] - a[1]);
    if (contributorEntries.length > 1) {
      lines.push("", "**Share of this query, by assignee**");
      for (const [name, count] of contributorEntries) {
        const total = contributorTotalCounts?.[name];
        const totalPart =
          name === "Unassigned" ? "" : typeof total === "number" ? ` · ${total} total` : " · N/A total";
        lines.push(`- ${name}: ${count} here${totalPart}`);
      }
    }

    lines.push("");
  }

  lines.push(buildKeyMarkdown());
  return lines.join("\n");
};

const escapeCsvField = (value) => {
  const str = String(value === null || value === undefined ? "" : value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const csvRow = (fields) => fields.map(escapeCsvField).join(",");

const CSV_HEADER = [
  "Entry",
  "Type",
  "Open Count",
  "Capacity",
  "Capacity Status",
  "Overdue",
  "Blocked",
  "Stale (14d+)",
  "Assignee",
  "Here",
  "Total",
];

const buildCapacityReportCsv = (sortedItems) => {
  const rows = [csvRow(CSV_HEADER)];

  for (const item of sortedItems) {
    const { displayName, watchType, capacity, openCount, openCountIncomplete, contributorCounts, contributorTotalCounts } = item;
    if (item.error) {
      rows.push(csvRow([displayName, watchType, "", "", "", "", "", "", "", "", `Error: ${item.error}`]));
      continue;
    }
    const status = capacityStatus(openCount, capacity);
    const hasCapacity = capacity !== null && capacity !== undefined;
    const entryFields = [
      displayName,
      watchTypeLabel(watchType, item.jql),
      formatOpenCount(openCount, openCountIncomplete),
      hasCapacity ? capacity : "",
      hasCapacity ? `${status}${openCountIncomplete ? " (incomplete)" : ""}` : openCountIncomplete ? "No target (incomplete)" : "No target",
      item.overdueCount || 0,
      item.blockedCount || 0,
      item.staleCount || 0,
    ];

    const contributorEntries = Object.entries(contributorCounts || {}).sort((a, b) => b[1] - a[1]);
    if (contributorEntries.length === 0) {
      rows.push(csvRow([...entryFields, "", "", ""]));
      continue;
    }
    for (const [name, count] of contributorEntries) {
      const total = contributorTotalCounts?.[name];
      const totalField = name === "Unassigned" ? "" : typeof total === "number" ? total : "N/A";
      rows.push(csvRow([...entryFields, name, count, totalField]));
    }
  }

  rows.push("");
  rows.push(csvRow(["Key", ""]));
  rows.push(csvRow(["Capacity bar", "Within capacity"]));
  rows.push(csvRow(["Capacity bar", "Near capacity (85%+ of target)"]));
  rows.push(csvRow(["Capacity bar", "Over capacity"]));
  rows.push(csvRow(["Risk flag", "Overdue - past Due date or Done Date"]));
  rows.push(csvRow(["Risk flag", "Blocked - status is Blocked or On Hold"]));
  rows.push(csvRow(["Risk flag", "Stale - not updated in 14+ days"]));
  rows.push(
    csvRow([
      "Column",
      'Here = open issues within that entry\'s specific query. Total = all open issues everywhere for that person. "By status" and "by assignee" are two independent breakdowns of the same issues, not sequential.',
    ])
  );
  rows.push(csvRow(["Column", "N/A total = Jira could not resolve a total for that name; a data gap, not a real zero."]));

  return rows.join("\r\n");
};

const AsksPanel = () => {
  const [asks, setAsks] = React.useState([]);
  const [error, setError] = React.useState("");
  const [draft, setDraft] = React.useState({ title: "", whoAsked: "", note: "" });
  const [editingId, setEditingId] = React.useState(null);
  const [editDraft, setEditDraft] = React.useState({});

  React.useEffect(() => {
    fetchPmAsks().then(setAsks).catch((e) => setError(String(e?.message || "Failed to load asks")));
  }, []);

  const handleCreate = async () => {
    try {
      const created = await createPmAsk(draft);
      setAsks((prev) => [...prev, created]);
      setDraft({ title: "", whoAsked: "", note: "" });
    } catch (e) {
      setError(String(e?.message || "Failed to create ask"));
    }
  };

  const handleEdit = (ask) => {
    setEditingId(ask.id);
    setEditDraft({ title: ask.title, whoAsked: ask.whoAsked, note: ask.note });
  };

  const handleSaveEdit = async (id) => {
    try {
      const updated = await updatePmAsk({ id, ...editDraft });
      setAsks((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setEditingId(null);
    } catch (e) {
      setError(String(e?.message || "Failed to update ask"));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this ask?")) return;
    try {
      await deletePmAsk(id);
      setAsks((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(String(e?.message || "Failed to delete ask"));
    }
  };

  const handleDownloadCsv = () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = [["Title", "Who asked", "Note"]];
    for (const a of asks) {
      rows.push([a.title, a.whoAsked, a.note].map((v) => `"${String(v || "").replace(/"/g, '""')}"`));
    }
    const csv = "﻿" + rows.map((r) => r.join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asks_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pm-asks-panel">
      <p className="ww-copy">
        Personal parking lot for project asks — not issues yet. This machine only. Notes are not pushed to Jira.
      </p>
      {error ? <p className="ww-inline-error">{error}</p> : null}

      <div className="pm-asks-new-row">
        <input
          className="pm-asks-input"
          placeholder="Title"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        <input
          className="pm-asks-input"
          placeholder="Who asked"
          value={draft.whoAsked}
          onChange={(e) => setDraft((d) => ({ ...d, whoAsked: e.target.value }))}
        />
        <input
          className="pm-asks-input pm-asks-input--note"
          placeholder="Note"
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
        />
        <button type="button" className="ww-page-btn" onClick={handleCreate}>
          Add
        </button>
        {asks.length > 0 ? (
          <button type="button" className="ww-page-btn" onClick={handleDownloadCsv}>
            Download CSV
          </button>
        ) : null}
      </div>

      {asks.length === 0 ? (
        <p className="pm-asks-empty">No asks yet — add one above.</p>
      ) : (
        <table className="pm-asks-table">
          <thead>
            <tr><th>Title</th><th>Who asked</th><th>Note</th><th></th></tr>
          </thead>
          <tbody>
            {asks.map((ask) =>
              editingId === ask.id ? (
                <tr key={ask.id}>
                  <td><input className="pm-asks-input" value={editDraft.title || ""} onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))} /></td>
                  <td><input className="pm-asks-input" value={editDraft.whoAsked || ""} onChange={(e) => setEditDraft((d) => ({ ...d, whoAsked: e.target.value }))} /></td>
                  <td><input className="pm-asks-input" value={editDraft.note || ""} onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))} /></td>
                  <td>
                    <button type="button" className="ww-page-btn" onClick={() => handleSaveEdit(ask.id)}>Save</button>
                    <button type="button" className="ww-page-btn" onClick={() => setEditingId(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={ask.id}>
                  <td>{ask.title || "—"}</td>
                  <td>{ask.whoAsked || "—"}</td>
                  <td>{ask.note || "—"}</td>
                  <td>
                    <button type="button" className="ww-page-btn" onClick={() => handleEdit(ask)}>Edit</button>
                    <button type="button" className="ww-page-btn" onClick={() => handleDelete(ask.id)}>Delete</button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

const ProjectManagers = () => {
  const [tab, setTab] = React.useState("capacity");
  const [allEntries, setAllEntries] = React.useState([]);
  const [entriesLoaded, setEntriesLoaded] = React.useState(false);
  const [entriesReady, setEntriesReady] = React.useState(false);
  // null selectedIds = never initialized (select all). [] = deliberately none.
  const sanitizeIdList = (parsed) => (Array.isArray(parsed) ? parsed.filter((id) => Number.isFinite(id)) : null);
  const [selectedIds, setSelectedIds] = usePersistedState("pm-selected-entry-ids", null, {
    sanitize: sanitizeIdList,
  });
  const [knownIds, setKnownIds] = usePersistedState("pm-known-entry-ids", null, {
    sanitize: sanitizeIdList,
  });
  const [wipLimits, setWipLimits] = usePersistedState("pm-wip-limits", DEFAULT_WIP_LIMITS, {
    sanitize: (parsed) =>
      Array.isArray(parsed) && parsed.every((e) => typeof e.status === "string" && typeof e.limit === "number")
        ? parsed
        : DEFAULT_WIP_LIMITS,
  });
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [entriesError, setEntriesError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [flash, doFlash] = useFlash();

  const loadEntries = React.useCallback(async () => {
    try {
      const data = await fetchWatchedAssignees();
      const selectable = (data || []).filter((entry) => entry.watchType !== "direct_reports");
      setAllEntries(selectable);
      setEntriesReady(true);
      setEntriesError("");
    } catch (err) {
      setEntriesError(err instanceof Error ? err.message : "Failed to load Contributor Metrics entries");
    } finally {
      setEntriesLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  React.useEffect(() => {
    if (!entriesLoaded || !entriesReady) return;
    const next = reconcileSelectedEntryIds({
      currentIds: allEntries.map((entry) => entry.id),
      selectedIds,
      knownIds,
    });
    if (!sameIdList(selectedIds, next.selectedIds)) {
      setSelectedIds(next.selectedIds);
    }
    if (!sameIdList(knownIds, next.knownIds)) {
      setKnownIds(next.knownIds);
    }
  }, [entriesLoaded, entriesReady, allEntries, selectedIds, knownIds, setSelectedIds, setKnownIds]);

  const load = React.useCallback(async () => {
    if (selectedIds === null) {
      if (entriesLoaded && !entriesReady) {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchCapacityPlanning(selectedIds);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load capacity data");
    } finally {
      setLoading(false);
    }
  }, [selectedIds, entriesLoaded, entriesReady]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toggleEntry = (id) => {
    setSelectedIds((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      return current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id];
    });
  };

  const selectAllEntries = () => setSelectedIds(allEntries.map((entry) => entry.id));
  const clearAllEntries = () => setSelectedIds([]);

  const overCount = items.filter((item) => !item.error && capacityStatus(item.openCount, item.capacity) === "over").length;
  const withTargetCount = items.filter((item) => item.capacity !== null && item.capacity !== undefined).length;
  const staleTotalCount = items.reduce((sum, item) => sum + (item.staleCount || 0), 0);

  const statusRank = { over: 0, near: 1, ok: 2 };
  const sortedItems = [...items].sort((a, b) => {
    const aStatus = capacityStatus(a.openCount, a.capacity);
    const bStatus = capacityStatus(b.openCount, b.capacity);
    const aRank = aStatus === null ? 3 : statusRank[aStatus];
    const bRank = bStatus === null ? 3 : statusRank[bStatus];
    if (aRank !== bRank) return aRank - bRank;
    return b.openCount - a.openCount;
  });

  const currentSelection = Array.isArray(selectedIds) ? selectedIds : [];

  const handleDownload = () => {
    if (sortedItems.length === 0) return;
    const content = buildCapacityReportMarkdown(sortedItems);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `capacity_planning_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    if (sortedItems.length === 0) return;
    const content = buildCapacityReportCsv(sortedItems);
    const blob = new Blob([`\ufeff${content}`], { type: "text/csv;charset=utf-8" }); // UTF-8 BOM so Excel keeps unicode names
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `capacity_planning_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleSaveToReports = async () => {
    if (sortedItems.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const content = buildCapacityReportMarkdown(sortedItems);
      await saveAdHocReport({
        content,
        label: `Capacity Planning — ${formatDate(new Date())}`,
        savedFrom: "project_managers",
      });
      doFlash("Saved to Reports.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save report");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container className={`project-managers-page${tab === "gantt" ? " project-managers-page--gantt" : ""}`}>
      <Header as="h1">
        <span aria-hidden="true">📐</span> Project Managers
      </Header>

      <div className="pm-tab-bar">
        <button
          type="button"
          className={`pm-tab${tab === "capacity" ? " pm-tab--active" : ""}`}
          onClick={() => setTab("capacity")}
        >
          Capacity
        </button>
        <button
          type="button"
          className={`pm-tab${tab === "gantt" ? " pm-tab--active" : ""}`}
          onClick={() => setTab("gantt")}
        >
          Gantt
        </button>
        <button
          type="button"
          className={`pm-tab${tab === "asks" ? " pm-tab--active" : ""}`}
          onClick={() => setTab("asks")}
        >
          Asks
        </button>
      </div>

      {tab === "gantt" ? (
        <GanttChart />
      ) : tab === "asks" ? (
        <AsksPanel />
      ) : (
      <>
      <p className="ww-copy">
        Capacity planning: shows every selected Contributor Metrics entry's current open-issue
        count, status breakdown, and risk signals (overdue, blocked, stale) — compared against a
        capacity target where one is set in Settings → Contributor Metrics. A raw count alone
        doesn't say whether work is actually moving; the breakdown does. Entries without a
        capacity target still show up here with their live data, just without a comparison bar.
      </p>

      <KeyLegend />

      {allEntries.length > 0 ? (
        <Segment className="pm-selector">
          <div className="pm-selector-head">
            <span className="pm-selector-title">
              Show ({currentSelection.length} of {allEntries.length})
            </span>
            <span className="pm-selector-actions">
              <button type="button" className="pm-selector-action" onClick={selectAllEntries}>
                Select all
              </button>
              <button type="button" className="pm-selector-action" onClick={clearAllEntries}>
                Clear
              </button>
            </span>
          </div>
          <div className="pm-selector-chips">
            {allEntries.map((entry) => {
              const active = currentSelection.includes(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`pm-selector-chip${active ? " pm-selector-chip--active" : ""}`}
                  onClick={() => toggleEntry(entry.id)}
                  aria-pressed={active}
                >
                  {entry.displayName}
                </button>
              );
            })}
          </div>
        </Segment>
      ) : null}

      <Segment>
        <div className="pm-toolbar">
          <span>
            {loading
              ? "Loading…"
              : `${items.length} entr${items.length === 1 ? "y" : "ies"} shown · ${withTargetCount} with a capacity target${
                  overCount > 0 ? ` · ${overCount} over capacity` : ""
                }${staleTotalCount > 0 ? ` · ${staleTotalCount} stale issues total` : ""}`}
          </span>
          <div className="pm-toolbar-actions">
            <WipLimitsEditor wipLimits={wipLimits} onSave={setWipLimits} />
            <Button
              size="small"
              basic
              onClick={handleSaveToReports}
              loading={saving}
              disabled={saving || loading || sortedItems.length === 0}
            >
              Save to Reports
            </Button>
            <Button size="small" basic onClick={handleDownload} disabled={loading || sortedItems.length === 0}>
              Download (.md)
            </Button>
            <Button size="small" basic onClick={handleDownloadCsv} disabled={loading || sortedItems.length === 0}>
              Download (.csv)
            </Button>
            <Button size="small" basic onClick={load} loading={loading} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
        {flash ? (
          <Message positive size="mini" style={{ marginTop: "0.75rem" }}>
            ✓ {flash}
          </Message>
        ) : null}
      </Segment>

      {entriesError ? <Message negative>{entriesError}</Message> : null}
      {error ? <Message negative>{error}</Message> : null}
      {!loading && currentSelection.length === 0 && entriesLoaded && !entriesError ? (
        <Message info>
          {allEntries.length === 0
            ? "No Contributor Metrics entries yet. Go to Settings → Contributor Metrics to add a person, reporter, preset, or custom query — it'll show up here automatically, with or without a capacity target."
            : "Nothing selected above. Pick one or more entries to see their capacity data."}
        </Message>
      ) : entriesError && items.length === 0 ? null : (
        <div className="pm-capacity-grid">
          {sortedItems.map((item) => (
            <CapacityCard key={item.id} item={item} wipLimits={wipLimits} />
          ))}
        </div>
      )}
      </>
      )}
    </Container>
  );
};

export default ProjectManagers;
