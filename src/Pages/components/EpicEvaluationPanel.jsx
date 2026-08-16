import React from "react";
import { Button, Form, Message, Segment, Statistic } from "semantic-ui-react";
import CollapsibleSection from "../../Components/CollapsibleSection";
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

  // Only genuine epic-keyed presets are useful here - this org's presets
  // are currently all preset_type "jql" (epicKey "JQL"), so this list will
  // often be empty, and the picker below only renders when it isn't.
  const epicPresets = React.useMemo(
    () =>
      (presets || []).filter(
        (preset) => preset.presetType === "epic" && preset.epicKey && preset.epicKey !== "JQL"
      ),
    [presets]
  );

  const isExactKey = EXACT_ISSUE_KEY_RE.test(epicKeyInput.trim());

  // Search-as-you-type by epic name, same debounce pattern already used for
  // assignee search (AssigneeCell.jsx) - matched deliberately rather than
  // inventing a different one. Skipped once the input looks like an exact
  // issue key, since at that point the person almost certainly means to
  // load it directly, not search by name.
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
        title="Evaluate an Epic"
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
              <div>
                <strong>{evaluation.epic.key}</strong> — {evaluation.epic.summary || "Untitled"}{" "}
                <span className="epic-eval-status">({evaluation.epic.status || "Unknown"})</span>
              </div>
              <Button size="mini" basic onClick={handleClear}>
                Clear
              </Button>
            </div>

            <div className="epic-eval-timeline">
              {evaluation.epic.projectEndDate ||
              evaluation.epic.mostRecentDoneDate ||
              evaluation.epic.initialDoneDate ? (
                <>
                  {evaluation.epic.projectEndDate ? (
                    <span>Project End Date: {evaluation.epic.projectEndDate}</span>
                  ) : null}
                  {evaluation.epic.mostRecentDoneDate ? (
                    <span>Most Recent Done Date: {evaluation.epic.mostRecentDoneDate}</span>
                  ) : null}
                  {evaluation.epic.initialDoneDate ? (
                    <span>Initial Done Date: {evaluation.epic.initialDoneDate}</span>
                  ) : null}
                </>
              ) : (
                <span className="epic-eval-muted">No Project End Date / MRD / IDD set on this epic.</span>
              )}
            </div>

            <Statistic.Group size="mini" widths="four" className="epic-eval-stats">
              <Statistic>
                <Statistic.Value>{evaluation.workload.total}</Statistic.Value>
                <Statistic.Label>Total tasks</Statistic.Label>
              </Statistic>
              <Statistic>
                <Statistic.Value>{evaluation.workload.open}</Statistic.Value>
                <Statistic.Label>Open</Statistic.Label>
              </Statistic>
              <Statistic>
                <Statistic.Value>{evaluation.workload.closed}</Statistic.Value>
                <Statistic.Label>Closed</Statistic.Label>
              </Statistic>
              <Statistic>
                <Statistic.Value>{evaluation.workload.overdue}</Statistic.Value>
                <Statistic.Label>Overdue</Statistic.Label>
              </Statistic>
            </Statistic.Group>

            {evaluation.contributors.length > 0 ? (
              <div className="epic-eval-contributors">
                <h5>Contributors</h5>
                <ul>
                  {evaluation.contributors.map((c) => (
                    <li key={c.name}>
                      {c.name}: {c.totalIssues} total · {c.openIssues} open · {c.resolvedIssues} resolved
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="epic-eval-blockers">
              <h5>Potential cross-team blockers</h5>
              {evaluation.blockers.length > 0 ? (
                <>
                  <p className="epic-eval-muted">
                    Tasks with a Jira issue link to a different project — a reasonable proxy for
                    &ldquo;involves another team&rdquo;, not a certainty.
                  </p>
                  <ul>
                    {evaluation.blockers.map((b) => (
                      <li key={b.key}>
                        <strong>{b.key}</strong> ({b.status}, {b.assignee}):{" "}
                        {b.crossTeamLinks
                          .map((link) => `${link.linkType} ${link.linkedKey} (${link.linkedProject})`)
                          .join("; ")}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="epic-eval-muted">No cross-team blocker candidates detected.</p>
              )}
            </div>
          </div>
        ) : null}
      </CollapsibleSection>
    </Segment>
  );
};

export default EpicEvaluationPanel;
