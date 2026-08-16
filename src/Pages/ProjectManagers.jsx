import React from "react";
import { Container, Header, Message, Segment, Button } from "semantic-ui-react";
import { fetchCapacityPlanning } from "../services/jiraClient";
import "./projectManagers.css";

// Capacity is a target open-issue count set in Settings -> Contributor
// Metrics. This page compares it against each entry's current live open
// count - entries with no capacity configured are never returned by the
// API at all (fetchCapacityWorkloads skips them server-side), so nothing
// here needs to handle a "not set" display case.
const capacityStatus = (openCount, capacity) => {
  if (capacity <= 0) {
    return openCount > 0 ? "over" : "ok";
  }
  const ratio = openCount / capacity;
  if (ratio > 1) return "over";
  if (ratio >= 0.85) return "near";
  return "ok";
};

const CapacityCard = ({ item }) => {
  const { displayName, watchType, capacity, openCount, error } = item;
  const status = error ? null : capacityStatus(openCount, capacity);
  const percent = capacity > 0 ? Math.min(100, Math.round((openCount / capacity) * 100)) : openCount > 0 ? 100 : 0;

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
          <div className="pm-capacity-numbers">
            <strong>{openCount}</strong> of <strong>{capacity}</strong> open issues
            {status === "over" ? <span className="pm-capacity-flag">Over capacity</span> : null}
            {status === "near" ? <span className="pm-capacity-flag pm-capacity-flag--near">Near capacity</span> : null}
          </div>
          <div className="pm-capacity-bar">
            <div className={`pm-capacity-bar-fill pm-capacity-bar-fill--${status}`} style={{ width: `${percent}%` }} />
          </div>
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
  const sortedItems = [...items].sort((a, b) => {
    const aRatio = a.capacity > 0 ? a.openCount / a.capacity : a.openCount > 0 ? Infinity : 0;
    const bRatio = b.capacity > 0 ? b.openCount / b.capacity : b.openCount > 0 ? Infinity : 0;
    return bRatio - aRatio;
  });

  return (
    <Container className="project-managers-page">
      <Header as="h1">
        <span aria-hidden="true">📐</span> Project Managers
      </Header>
      <p className="ww-copy">
        Capacity planning: compares each Contributor Metrics entry's current open-issue count
        against the capacity target set for it in Settings. Entries with no capacity target aren't
        shown here — set one in Settings → Contributor Metrics to add it to this view.
      </p>

      <Segment>
        <div className="pm-toolbar">
          <span>
            {loading
              ? "Loading…"
              : `${items.length} entr${items.length === 1 ? "y" : "ies"} with a capacity target${
                  overCount > 0 ? ` · ${overCount} over capacity` : ""
                }`}
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
          No Contributor Metrics entries have a capacity target set yet. Go to Settings →
          Contributor Metrics and set a capacity on a person or custom query entry to see it here.
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
