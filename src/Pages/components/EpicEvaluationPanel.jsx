import React from "react";
import { Button, Form, Message, Segment } from "semantic-ui-react";
import CollapsibleSection from "../../Components/CollapsibleSection";
import StatusPieChart from "../../Components/StatusPieChart";
import MetricBar from "../Dashboard/components/MetricBar";
import { fetchEpicWorkload, searchEpics } from "../../services/jiraClient";

// An exact issue key ("SYNC-41", "ODI-1234") should load directly rather
// than go through search-as-you-type.
const EXACT_ISSUE_KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/i;

// Persistent "Evaluate an Epic" panel for Chat: lets the user load a
// specific Epic's full task tree (workload/timeline/contributors/cross-team
// blockers) and keeps it visible while they ask follow-up questions in the
// conversation below. onEpicLoaded/onEpicCleared let the parent Chat page
// thread the loaded data into each outgoing chat message's epicContext.
const EpicEvaluationPanel = ({ presets = [], onEpicLoaded, onEpicCleared }) => {
  const [epicKeyInput, setEpicKeyInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [evaluation, setEvaluation] = React.useState(null);

  const [searchResults, setSearchResults] = React.useState([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const debounceRef = React.useRef(null);
  const blurTimeoutRef = React.useRef(null);

  const epicPresets = React.useMemo(
    () =>
      (presets || []).filter(
        (preset) => preset.presetType === "epic" && preset.epicKey && preset.epicKey !== "JQL"
      ),
    [presets]
  );

  const isExactKey = EXACT_ISSUE_KEY_RE.test(epicKeyInput.trim());

  React.useEffect(() => {
    const query = epicKeyInput.trim();
    if (query.length < 2 || isExactKey) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return undefined;
    }

    clearTimeout(debounceRef.current);
    setSearchLoading(true);
    setSearchError("");

    debounceRef.current = setTimeout(() => {
      searchEpics(query)
        .then((items) => {
          setSearchResults(items);
          setSearchError("");
        })
        .catch((searchErr) => {
          setSearchResults([]);
          setSearchError(searchErr instanceof Error ? searchErr.message : "Epic search failed");
        })
        .finally(() => setSearchLoading(false));
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [epicKeyInput, isExactKey]);

  React.useEffect(() => () => clearTimeout(blurTimeoutRef.current), []);

  const loadEpic = async (epicKey) => {
    const key = String(epicKey || "").trim().toUpperCase();
    if (!key) {
      return;
    }

    setShowSuggestions(false);
    setLoading(true);
    setError("");

    try {
      const data = await fetchEpicWorkload(key);
      setEvaluation(data);
      setEpicKeyInput(key);
      onEpicLoaded?.(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load epic");
      setEvaluation(null);
      onEpicCleared?.();
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setEvaluation(null);
    setEpicKeyInput("");
    setError("");
    onEpicCleared?.();
  };

  return (
    <Segment className="epic-eval-panel">
      <CollapsibleSection
        title="🎯 Evaluate an Epic"
        storageKey="chat-epic-evaluation"
        persistKeyPrefix="chat-"
        defaultOpen={true}
        badge={evaluation ? evaluation.epic.key : null}
      >
        <p className="ww-copy">
          Load an Epic to see its workload, timeline, and potential cross-team blockers here — this stays
          visible while you ask follow-up questions below.
        </p>

        {epicPresets.length > 0 ? (
          <Form.Group>
            {epicPresets.map((preset) => (
              <Button
                key={preset.id}
                size="small"
                basic
                loading={loading && epicKeyInput === preset.epicKey}
                onClick={() => loadEpic(preset.epicKey)}
              >
                {preset.label || preset.epicName || preset.epicKey}
              </Button>
            ))}
          </Form.Group>
        ) : null}

        <Form onSubmit={(event) => event.preventDefault()} className="epic-eval-input-form">
          <div className="epic-eval-search-wrap">
            <Form.Input
              placeholder="Search by epic name, or type an exact key like ODI-1234"
              value={epicKeyInput}
              loading={searchLoading}
              onChange={(_e, { value }) => {
                setEpicKeyInput(value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                blurTimeoutRef.current = setTimeout(() => setShowSuggestions(false), 150);
              }}
              action={
                <Button
                  primary
                  loading={loading}
                  disabled={loading || !epicKeyInput.trim()}
                  onClick={() => loadEpic(epicKeyInput)}
                >
                  Load
                </Button>
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void loadEpic(epicKeyInput);
                }
              }}
            />

            {showSuggestions && !isExactKey && (searchResults.length > 0 || searchError) ? (
              <div className="epic-eval-suggestions">
                {searchError ? (
                  <div className="epic-eval-suggestion-error">{searchError}</div>
                ) : (
                  searchResults.map((result) => (
                    <button
                      type="button"
                      key={result.key}
                      className="epic-eval-suggestion"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => loadEpic(result.key)}
                    >
                      <span className="epic-eval-suggestion-key">{result.key}</span>
                      <span className="epic-eval-suggestion-summary">{result.summary || "Untitled"}</span>
                      <span className="epic-eval-suggestion-status">{result.status}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </Form>

        {error ? (
          <Message negative size="small">
            {error}
          </Message>
        ) : null}

        {evaluation ? (
          <div className="epic-eval-results">
            <div className="epic-eval-header">
              <div className="epic-eval-header-main">
                <span className="epic-eval-key">{evaluation.epic.key}</span>
                <span className="epic-eval-title">{evaluation.epic.summary || "Untitled"}</span>
                <span className="epic-eval-status-pill">{evaluation.epic.status || "Unknown"}</span>
              </div>
              <Button size="mini" basic onClick={handleClear}>
                Clear
              </Button>
            </div>

            <div className="epic-eval-timeline">
              <span className="epic-eval-section-label">🗓️ Timeline</span>
              {evaluation.epic.projectEndDate ||
              evaluation.epic.mostRecentDoneDate ||
              evaluation.epic.initialDoneDate ? (
                <div className="epic-eval-timeline-chips">
                  {evaluation.epic.projectEndDate ? (
                    <span className="epic-eval-chip">
                      Project End Date <strong>{evaluation.epic.projectEndDate}</strong>
                    </span>
                  ) : null}
                  {evaluation.epic.mostRecentDoneDate ? (
                    <span className="epic-eval-chip">
                      Most Recent Done Date <strong>{evaluation.epic.mostRecentDoneDate}</strong>
                    </span>
                  ) : null}
                  {evaluation.epic.initialDoneDate ? (
                    <span className="epic-eval-chip">
                      Initial Done Date <strong>{evaluation.epic.initialDoneDate}</strong>
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="epic-eval-muted">No Project End Date / MRD / IDD set on this epic.</span>
              )}
            </div>

            <div className="epic-eval-workload">
              <span className="epic-eval-section-label">📊 Workload</span>
              <div className="epic-eval-workload-body">
                <div className="epic-eval-headline-chips">
                  <div className="epic-eval-headline-chip">
                    <span className="epic-eval-headline-value">{evaluation.workload.total}</span>
                    <span className="epic-eval-headline-label">Total tasks</span>
                  </div>
                  <div className="epic-eval-headline-chip epic-eval-headline-chip--open">
                    <span className="epic-eval-headline-value">{evaluation.workload.open}</span>
                    <span className="epic-eval-headline-label">Open</span>
                  </div>
                  <div
                    className={`epic-eval-headline-chip${
                      evaluation.workload.overdue > 0 ? " epic-eval-headline-chip--alarm" : ""
                    }`}
                  >
                    <span className="epic-eval-headline-value">{evaluation.workload.overdue}</span>
                    <span className="epic-eval-headline-label">Overdue</span>
                  </div>
                </div>
                {Object.keys(evaluation.workload.statusCounts || {}).length > 0 ? (
                  <StatusPieChart
                    statusCounts={evaluation.workload.statusCounts}
                    size={120}
                    className="epic-eval-pie"
                  />
                ) : null}
              </div>
            </div>

            {evaluation.contributors.length > 0 ? (
              <div className="epic-eval-contributors">
                <span className="epic-eval-section-label">👥 Contributors</span>
                {evaluation.contributors.map((c) => (
                  <MetricBar
                    key={c.name}
                    label={c.name}
                    value={c.totalIssues > 0 ? (c.resolvedIssues / c.totalIssues) * 100 : 0}
                    count={`${c.totalIssues} total · ${c.openIssues} open`}
                  />
                ))}
              </div>
            ) : null}

            <div className="epic-eval-blockers">
              <span className="epic-eval-section-label">🚧 Potential cross-team blockers</span>
              {evaluation.blockers.length > 0 ? (
                <>
                  <p className="epic-eval-muted">
                    Tasks with a Jira issue link to a different project — a reasonable proxy for
                    &ldquo;involves another team&rdquo;, not a certainty.
                  </p>
                  {evaluation.blockers.map((b) => (
                    <div key={b.key} className="epic-eval-blocker-card">
                      <div className="epic-eval-blocker-head">
                        <strong>{b.key}</strong>
                        <span className="epic-eval-blocker-meta">
                          {b.status} · {b.assignee}
                        </span>
                      </div>
                      <div className="epic-eval-blocker-links">
                        {b.crossTeamLinks.map((link) => (
                          <span key={link.linkedKey} className="epic-eval-blocker-link">
                            {link.linkType} <strong>{link.linkedKey}</strong> ({link.linkedProject})
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p className="epic-eval-muted epic-eval-all-clear">✓ No cross-team blocker candidates detected.</p>
              )}
            </div>
          </div>
        ) : null}
      </CollapsibleSection>
    </Segment>
  );
};

export default EpicEvaluationPanel;
