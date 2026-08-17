import React from "react";
import { Link } from "react-router-dom";
import { Container, Header, Message, Segment, Button } from "semantic-ui-react";
import { fetchCapacityPlanning, fetchWatchedAssignees, saveAdHocReport } from "../services/jiraClient";
import { getStatusColor } from "../utils/statusScale";
import { buildWorkWeekHref } from "../utils/workWeekNavigation";
import { usePersistedState } from "./hooks/usePersistedState";
import { useFlash } from "./hooks/useFlash";
import "./projectManagers.css";

// Same backslash-then-quote convention used for JQL string literals
// elsewhere in this app (epicFilterJql.mjs, directReportsJql.mjs).
const escapeJqlString = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// scopeJql (from the API) is the bare "who/what" for this entry, with no
// status filter and NOT wrapped in parens - it can be an unparenthesized
// OR chain (confirmed live: one real entry's scope is literally "a AND b
// AND c OR d"), so it must always be wrapped before appending another AND
// clause, or the appended clause only scopes the last OR-branch. Every
// drill-down link below goes through this so that rule is enforced in
// exactly one place.
const buildDrillDownJql = (scopeJql, extraClause) => {
  const scope = String(scopeJql || "").trim();
  if (!scope) return "";
  return `(${scope}) AND ${extraClause}`;
};

const drillDownHref = (scopeJql, extraClause, label) => {
  const jql = buildDrillDownJql(scopeJql, extraClause);
  return jql ? buildWorkWeekHref({ jql, label }) : null;
};

// Capacity is an optional target open-issue count set in Settings ->
// Contributor Metrics. Returns null (not "ok"/"over") when no target is
// configured - callers must treat that as its own case, not coerce it to
// 0. A naive `capacity <= 0` check would silently treat null as 0 (JS
// coerces null to 0 in numeric comparisons), which would flag any entry
// with open issues and no capacity target as "over capacity" - wrong, and
// exactly what this app showed before this was caught and fixed.
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

// Top few status labels by count, most-populated first - a raw open count
// alone doesn't say whether that work is actually moving. "35 open" reads
// very differently once it's "28 Backlog, 7 In Progress".
//
// This and ContributorBreakdown below are two independent slices of the
// SAME open-issue set - one by status, one by assignee - not a sequence
// where one continues where the other leaves off. A single issue is
// counted in exactly one bucket here AND exactly one bucket there, at the
// same time (e.g. an issue can be both "Backlog" here and "Unassigned"
// below). Without a label distinguishing them, this could easily be
// misread as items 6+ following on from the status list above it -
// hence the explicit "By status" / "…by assignee" labels on each.
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

// Blocked detection server-side uses a permissive regex (/blocked|on
// hold/i) so it catches status-name variants without needing to know
// every one in advance. The drill-down link can't reuse that regex - JQL
// doesn't support fuzzy matching against the status field - so it targets
// the two literal status names this org actually uses for it (matching
// the existing "Blocked or On Hold" preset's own convention). If a
// project uses a differently-named blocked-like status, the badge count
// would still be right but this specific link might undercount slightly -
// an acceptable, disclosed gap given JQL's limits, not a silent one.
const RiskFlags = ({ scopeJql, displayName, overdueCount, blockedCount, staleCount }) => {
  if (!overdueCount && !blockedCount && !staleCount) return null;
  const overdueHref = drillDownHref(scopeJql, "statusCategory != Done AND due < now()", `${displayName} — Overdue`);
  const blockedHref = drillDownHref(
    scopeJql,
    'statusCategory != Done AND status in ("Blocked", "On Hold")',
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

// Each person's share of THIS entry's own query - not their total
// workload. A jql-type entry scoped to one project/initiative only ever
// sees the slice of a person's work that falls inside it; the same
// person could carry a much larger load entirely outside this scope.
// Explicitly labeled "Share of this query" rather than anything implying
// it's someone's whole plate - a flat "workload" label here would be
// actively misleading for anyone also working outside this entry's scope.
// Only rendered for entries with more than one distinct contributor -
// a Person/Reporter-type entry (or a jql entry that happens to resolve
// to one person) has nothing to break down.
const CONTRIBUTOR_BREAKDOWN_LIMIT = 6;

const ContributorBreakdown = ({ scopeJql, displayName, contributorCounts, contributorTotalCounts }) => {
  const [expanded, setExpanded] = React.useState(false);
  const entries = Object.entries(contributorCounts || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length <= 1) return null;
  // Total-workload lookups now cover every distinct contributor, not just
  // the top 6 (see fetchContributorTotalWorkloads in capacityPlanning.mjs
  // for why the earlier top-6 cutoff was removed) - so once expanded,
  // rows beyond the initial 6 should have a total too, same as the rest.
  // A handful of names can still legitimately end up without one if
  // Jira's own name-based JQL matching can't resolve them (a pre-existing
  // limitation of assignee="display name" lookups used throughout this
  // feature, not something specific to this list) - hasTotal below uses
  // a strict typeof check so those rows just show "N here" with nothing
  // false or fabricated next to it, rather than a misleading "0 total".
  const shown = expanded ? entries : entries.slice(0, CONTRIBUTOR_BREAKDOWN_LIMIT);
  const remaining = entries.length - Math.min(entries.length, CONTRIBUTOR_BREAKDOWN_LIMIT);

  return (
    <div className="pm-contributor-breakdown">
      <div className="pm-contributor-breakdown-label">Share of this query, by assignee</div>
      {shown.map(([name, count]) => {
        // "Unassigned" isn't a literal assignee name in Jira - it must be
        // queried as assignee is EMPTY, not assignee = "Unassigned" (a
        // literal string match against a field with no value there would
        // just fail to match anything at all). statusCategory != Done is
        // required too, or this link would show that person's closed
        // issues in scope as well - which would silently disagree with
        // the open-only count displayed right next to it (confirmed live:
        // a real person here has 8 open issues but 10 total, so the two
        // clauses genuinely diverge, not just in theory).
        const assigneeClause = name === "Unassigned" ? "assignee is EMPTY" : `assignee = "${escapeJqlString(name)}"`;
        const clause = `${assigneeClause} AND statusCategory != Done`;
        const href = drillDownHref(scopeJql, clause, `${displayName} — ${name}`);
        // Total workload (unscoped - no project/query restriction at all)
        // is what actually answers "do they have room for new work?" - a
        // low in-scope number can hide someone who's already buried
        // elsewhere (confirmed live: one real person here shows 8 in this
        // query but 43 open everywhere), and just as importantly, the
        // reverse: a low total means real availability regardless of how
        // small their in-scope share looks. Fetched for every distinct
        // contributor, not just the ones shown before expanding - a PM
        // comparing availability needs this across everyone, not only
        // whoever happens to have the most in-scope work already.
        // (A middle "in project" tier was tried between these two and
        // removed per user feedback - three numbers this close together
        // read as noise, not signal; two clear numbers work better.)
        const total = contributorTotalCounts?.[name];
        const hasTotal = name !== "Unassigned" && typeof total === "number";
        const totalHref = hasTotal
          ? buildWorkWeekHref({ jql: `assignee = "${escapeJqlString(name)}" AND statusCategory != Done`, label: `${name} — All open work` })
          : null;
        return (
          <div key={name} className="pm-contributor-row">
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
                // Not 0 - that would claim they have no open work at all,
                // which is false (their "here" count alone disproves it).
                // Not their in-scope count either - that's already shown
                // right next to this and would just look like the same
                // number repeated under a different, misleading label.
                // This is Jira's own assignee="display name" JQL lookup
                // failing to resolve for this specific person (confirmed
                // live, and confirmed by the user as an expected quirk
                // for at least one real name) - saying so plainly beats
                // guessing at a number that might be wrong. "N/A total"
                // (not just "N/A") keeps the same "<value> total" shape
                // every other row uses, so the label rhythm down the
                // column stays consistent even where the value itself
                // can't be shown.
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

const CapacityCard = ({ item }) => {
  const {
    displayName,
    watchType,
    capacity,
    openCount,
    scopeJql,
    statusCounts,
    contributorCounts,
    contributorTotalCounts,
    overdueCount,
    blockedCount,
    staleCount,
    error,
  } = item;
  const status = error ? null : capacityStatus(openCount, capacity);
  const hasCapacity = capacity !== null && capacity !== undefined;
  const percent = hasCapacity && capacity > 0 ? Math.min(100, Math.round((openCount / capacity) * 100)) : 0;

  return (
    <div className={`pm-capacity-card${status ? ` pm-capacity-card--${status}` : ""}`}>
      <div className="pm-capacity-card-head">
        <span className="pm-capacity-name">{displayName}</span>
        {watchType === "jql" ? <span className="pm-capacity-badge">Custom query</span> : null}
      </div>
      {error ? (
        <Message negative size="mini" style={{ margin: "0.4rem 0 0" }}>
          {error}
        </Message>
      ) : (
        <>
          {hasCapacity ? (
            <>
              <div className="pm-capacity-numbers">
                <strong>{openCount}</strong> of <strong>{capacity}</strong> open issues
                {status === "over" ? <span className="pm-capacity-flag">Over capacity</span> : null}
                {status === "near" ? <span className="pm-capacity-flag pm-capacity-flag--near">Near capacity</span> : null}
              </div>
              <div className="pm-capacity-bar">
                <div className={`pm-capacity-bar-fill pm-capacity-bar-fill--${status}`} style={{ width: `${percent}%` }} />
              </div>
            </>
          ) : (
            <div className="pm-capacity-numbers pm-capacity-numbers--no-target">
              <strong>{openCount}</strong> open issues
              <span className="pm-capacity-no-target-note">No capacity target set</span>
            </div>
          )}
          <RiskFlags
            scopeJql={scopeJql}
            displayName={displayName}
            overdueCount={overdueCount}
            blockedCount={blockedCount}
            staleCount={staleCount}
          />
          <StatusBreakdown scopeJql={scopeJql} displayName={displayName} statusCounts={statusCounts} />
          <ContributorBreakdown
            scopeJql={scopeJql}
            displayName={displayName}
            contributorCounts={contributorCounts}
            contributorTotalCounts={contributorTotalCounts}
          />
        </>
      )}
    </div>
  );
};

// One legend covering every color/icon/label convention used on these
// cards, rather than expecting a PM to infer what a color or an
// abbreviation means from context. Collapsed by default (not persisted -
// this is a "check when needed" reference, not a preference worth
// remembering across visits, same treatment as the contributor
// breakdown's own expand toggle) so it doesn't compete for space with
// the actual data on repeat visits.
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
          </div>
          <div className="pm-key-section">
            <div className="pm-key-section-label">Risk flags</div>
            <div className="pm-key-row">⚠️ Overdue — past its due date</div>
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

// The key legend as Markdown - kept as its own function (rather than
// trying to serialize the KeyLegend JSX) so wording stays independently
// readable as plain text, but the CONTENT is deliberately kept in sync
// with KeyLegend's own text by hand - the two describe the same three
// sections (capacity bar, risk flags, share-of-query conventions).
const buildKeyMarkdown = () =>
  [
    "## Key",
    "",
    "**Capacity bar**",
    "- Within capacity",
    "- Near capacity (85%+ of target)",
    "- Over capacity",
    "",
    "**Risk flags**",
    "- ⚠️ Overdue — past its due date",
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

// One markdown document covering every card currently on screen, in the
// same sorted order the page itself shows them (over-capacity first) -
// a saved/downloaded snapshot should read the same way the live page did
// at the moment it was captured, not re-sorted differently.
const buildCapacityReportMarkdown = (sortedItems) => {
  const lines = [`# Project Managers — Capacity Planning`, "", `_Generated ${new Date().toLocaleString()}_`, ""];

  for (const item of sortedItems) {
    const { displayName, watchType, capacity, openCount, statusCounts, contributorCounts, contributorTotalCounts } =
      item;
    const status = item.error ? null : capacityStatus(openCount, capacity);
    const hasCapacity = capacity !== null && capacity !== undefined;

    lines.push(`## ${displayName}${watchType === "jql" ? " (custom query)" : ""}`);
    if (item.error) {
      lines.push("", `_Error: ${item.error}_`, "");
      continue;
    }
    lines.push(
      "",
      hasCapacity
        ? `${openCount} of ${capacity} open issues${status === "over" ? " — **OVER CAPACITY**" : status === "near" ? " — **Near capacity**" : ""}`
        : `${openCount} open issues (no capacity target set)`
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

const ProjectManagers = () => {
  const [allEntries, setAllEntries] = React.useState([]);
  const [entriesLoaded, setEntriesLoaded] = React.useState(false);
  // null (not yet in localStorage) means "not initialized yet" - once
  // allEntries loads, this defaults to every entry selected so existing
  // users don't lose visibility of anything they already had. From then
  // on it's always a real array, including an explicitly empty one if
  // the PM deselects everything - that must show nothing, not silently
  // fall back to "show everything" (fetchCapacityPlanning enforces the
  // same distinction server-side).
  const [selectedIds, setSelectedIds] = usePersistedState("pm-selected-entry-ids", null, {
    sanitize: (parsed) => (Array.isArray(parsed) ? parsed.filter((id) => Number.isFinite(id)) : null),
  });
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [flash, doFlash] = useFlash();

  const loadEntries = React.useCallback(async () => {
    try {
      const data = await fetchWatchedAssignees();
      const selectable = (data || []).filter((entry) => entry.watchType !== "direct_reports");
      setAllEntries(selectable);
    } catch {
      setAllEntries([]);
    } finally {
      setEntriesLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // Only runs once, the first time allEntries is available AND no
  // selection has ever been persisted - initializes to "everything on",
  // then this effect never fires again since selectedIds is no longer null.
  React.useEffect(() => {
    if (entriesLoaded && selectedIds === null) {
      setSelectedIds(allEntries.map((entry) => entry.id));
    }
  }, [entriesLoaded, selectedIds, allEntries, setSelectedIds]);

  const load = React.useCallback(async () => {
    if (selectedIds === null) {
      // Still waiting on the entries list / initial selection - avoid a
      // flash of "no entries selected" before that resolves.
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
  }, [selectedIds]);

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

  // Over-capacity first, then near, then ok, then no-target entries last
  // (nothing to rank them by) - within each group, higher open count first.
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

  const handleSaveToReports = async () => {
    if (sortedItems.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const content = buildCapacityReportMarkdown(sortedItems);
      await saveAdHocReport({
        content,
        label: `Capacity Planning — ${new Date().toLocaleDateString()}`,
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
    <Container className="project-managers-page">
      <Header as="h1">
        <span aria-hidden="true">📐</span> Project Managers
      </Header>
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
              Download
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

      {error ? (
        <Message negative>{error}</Message>
      ) : !loading && currentSelection.length === 0 && entriesLoaded ? (
        <Message info>
          {allEntries.length === 0
            ? "No Contributor Metrics entries yet. Go to Settings → Contributor Metrics to add a person, reporter, preset, or custom query — it'll show up here automatically, with or without a capacity target."
            : "Nothing selected above. Pick one or more entries to see their capacity data."}
        </Message>
      ) : (
        <div className="pm-capacity-grid">
          {sortedItems.map((item) => (
            <CapacityCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </Container>
  );
};

export default ProjectManagers;
