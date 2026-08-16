import React from "react";
import { Button, Form, Message, Segment, Statistic } from "semantic-ui-react";
import CollapsibleSection from "../../Components/CollapsibleSection";
import { fetchEpicWorkload } from "../../services/jiraClient";

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

  const loadEpic = async (epicKey) => {
    const key = String(epicKey || "").trim().toUpperCase();
    if (!key) {
      return;
    }

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
          <Form.Input
            placeholder="Or type any Epic key, e.g. ODI-1234"
            value={epicKeyInput}
            onChange={(_e, { value }) => setEpicKeyInput(value)}
            action={
              <Button primary loading={loading} disabled={loading} onClick={() => loadEpic(epicKeyInput)}>
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
