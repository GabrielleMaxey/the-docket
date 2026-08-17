import React from "react";
import { Container, Header, Message, Segment, Button } from "semantic-ui-react";
import { fetchCapacityPlanning } from "../services/jiraClient";
import { getStatusColor } from "../utils/statusScale";
import "./projectManagers.css";

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
const StatusBreakdown = ({ statusCounts }) => {
  const entries = Object.entries(statusCounts || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div className="pm-status-breakdown">
      {entries.map(([label, count], index) => (
        <span key={label} className="pm-status-breakdown-item">
          <span
            className="pm-status-breakdown-dot"
            style={{ background: getStatusColor(label, index) }}
            aria-hidden="true"
          />
          {label} <strong>{count}</strong>
        </span>
      ))}
    </div>
  );
};

const RiskFlags = ({ overdueCount, blockedCount, staleCount }) => {
  if (!overdueCount && !blockedCount && !staleCount) return null;
  return (
    <div className="pm-risk-flags">
      {overdueCount > 0 ? (
        <span className="pm-risk-flag pm-risk-flag--overdue">⚠️ {overdueCount} overdue</span>
      ) : null}
      {blockedCount > 0 ? (
        <span className="pm-risk-flag pm-risk-flag--blocked">🚧 {blockedCount} blocked</span>
      ) : null}
      {staleCount > 0 ? (
        <span className="pm-risk-flag pm-risk-flag--stale">💤 {staleCount} stale (14d+)</span>
      ) : null}
    </div>
  );
};

const CapacityCard = ({ item }) => {
  const { displayName, watchType, capacity, openCount, statusCounts, overdueCount, blockedCount, staleCount, error } = item;
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
          <RiskFlags overdueCount={overdueCount} blockedCount={blockedCount} staleCount={staleCount} />
          <StatusBreakdown statusCounts={statusCounts} />
        </>
      )}
    </div>
  );
};

const ProjectManagers = () => {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCapacityPlanning();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load capacity data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <Container className="project-managers-page">
      <Header as="h1">
        <span aria-hidden="true">📐</span> Project Managers
      </Header>
      <p className="ww-copy">
        Capacity planning: shows every Contributor Metrics entry's current open-issue count,
        status breakdown, and risk signals (overdue, blocked, stale) — compared against a
        capacity target where one is set in Settings → Contributor Metrics. A raw count alone
        doesn't say whether work is actually moving; the breakdown does. Entries without a
        capacity target still show up here with their live data, just without a comparison bar.
      </p>

      <Segment>
        <div className="pm-toolbar">
          <span>
            {loading
              ? "Loading…"
              : `${items.length} entr${items.length === 1 ? "y" : "ies"} · ${withTargetCount} with a capacity target${
                  overCount > 0 ? ` · ${overCount} over capacity` : ""
                }${staleTotalCount > 0 ? ` · ${staleTotalCount} stale issues total` : ""}`}
          </span>
          <Button size="small" basic onClick={load} loading={loading} disabled={loading}>
            Refresh
          </Button>
        </div>
      </Segment>

      {error ? (
        <Message negative>{error}</Message>
      ) : !loading && items.length === 0 ? (
        <Message info>
          No Contributor Metrics entries yet. Go to Settings → Contributor Metrics to add a
          person, reporter, preset, or custom query — it'll show up here automatically, with or
          without a capacity target.
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
