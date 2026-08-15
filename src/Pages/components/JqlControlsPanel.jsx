import React from "react";
import { Button, Icon, Message } from "semantic-ui-react";
import { MAX_JQL_SLOTS } from "../../utils/workWeekStorage.js";

const JQL_COUNT_OPTIONS = Array.from({ length: MAX_JQL_SLOTS }, (_, index) => index + 1);

const JqlControlsPanel = ({
  epicPresets,
  epicPresetsLoading,
  epicPresetsError,
  onReloadPresets,
  onCreateIssue,
  jqlCount,
  jqlInputs,
  jqlLabels,
  jqlSharedProgramIds,
  sharedPrograms,
  onJqlCountChange,
  onJqlChange,
  onJqlLabelChange,
  onJqlSharedProgramChange,
  quickPickValueBySlot,
  onQuickPickSelect,
  onImportSlot,
  jqlMaxResults,
  onJqlMaxResultsChange,
  pullLatestComment,
  onPullLatestCommentChange,
  onRunJql,
  onResetSavedQueries,
  jqlLoading,
  filtersLoading,
  jqlError,
}) => (
  <div className="ww-task-manager-body">
    {epicPresetsError ? (
      <Message warning size="small">
        Could not load Epic/JQL presets for Quick pick ({epicPresetsError}). Is the API
        running at <code>http://localhost:8787</code>? Try <code>npm run dev:api</code> or{" "}
        <code>npm run dev:all</code>, then{" "}
        <button type="button" className="ww-page-btn" onClick={onReloadPresets}>
          retry
        </button>
        .
      </Message>
    ) : null}
    {!epicPresetsLoading && !epicPresetsError && epicPresets.length === 0 ? (
      <Message info size="small">
        No presets in the database yet. Add them in Settings → Epic & JQL presets, or run{" "}
        <code>npm run seed:presets -- --all</code>.
      </Message>
    ) : null}

    <div className="ww-create-issue-row">
      <Button primary onClick={onCreateIssue}>Create Issue</Button>
    </div>

    <div className="ww-jql-controls">
      <label htmlFor="jql-count">JQL count:</label>
      <select
        id="jql-count"
        value={jqlCount}
        onChange={(event) => onJqlCountChange(Number(event.target.value))}
      >
        {JQL_COUNT_OPTIONS.map((count) => (
          <option key={count} value={count}>{count}</option>
        ))}
      </select>
    </div>

    {Array.from({ length: jqlCount }).map((_, index) => (
      <div key={`jql-input-${index}`} className="ww-jql-input-wrap">
        <div className="ww-jql-row-head">
          <label htmlFor={`jql-label-${index}`}>Label {index + 1}</label>
        </div>
        <div className="ww-quick-pick-row">
          <div className="ww-quick-pick-cluster">
            {epicPresets.length > 0 ? (
              <div className="ww-quick-pick-main">
                <label className="ww-quick-pick-label" htmlFor={`quick-pick-${index}`}>
                  Quick pick:
                </label>
                <select
                  id={`quick-pick-${index}`}
                  className="ww-quick-pick-select"
                  value={quickPickValueBySlot[index] ?? ""}
                  onChange={(event) => onQuickPickSelect(index, event.target.value)}
                >
                  <option value="">Choose preset…</option>
                  {epicPresets.map((preset) => (
                    <option
                      key={`qp-${index}-${preset.id}`}
                      value={preset.id}
                      title={
                        preset.presetType === "jql"
                          ? (preset.jql || preset.label)
                          : preset.epicKey
                      }
                    >
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {epicPresets.length > 0 && Array.isArray(sharedPrograms) && sharedPrograms.length > 0 ? (
              <span className="ww-quick-pick-or">OR</span>
            ) : null}
            {Array.isArray(sharedPrograms) && sharedPrograms.length > 0 ? (
              <div className="ww-quick-pick-main">
                <label className="ww-quick-pick-label" htmlFor={`jql-shared-program-${index}`}>
                  Shared project:
                </label>
                <select
                  id={`jql-shared-program-${index}`}
                  className="ww-quick-pick-select"
                  value={jqlSharedProgramIds?.[index] || ""}
                  onChange={(event) => onJqlSharedProgramChange?.(index, event.target.value)}
                >
                  <option value="">None (personal)</option>
                  {sharedPrograms.map((program) => (
                    <option key={`sp-${index}-${program.slug}`} value={program.slug}>
                      {program.displayName || program.slug}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="ww-import-filter-btn ww-import-filter-btn-inline"
            onClick={() => onImportSlot(index)}
          >
            Import from Jira
          </button>
        </div>
        <div className="ww-jql-row-inline">
          <input
            id={`jql-label-${index}`}
            type="text"
            value={jqlLabels[index] || ""}
            onChange={(event) => onJqlLabelChange(index, event.target.value)}
            placeholder={`Label for JQL ${index + 1}`}
          />
        </div>
        <input
          id={`jql-${index}`}
          type="text"
          value={jqlInputs[index] || ""}
          onChange={(event) => onJqlChange(index, event.target.value)}
          placeholder="project = ABC ORDER BY updated DESC"
        />
      </div>
    ))}

    <div className="ww-jql-maxresults">
      <label htmlFor="jql-max-results">Max results:</label>
      <input
        id="jql-max-results"
        type="number"
        min={1}
        max={1000}
        value={jqlMaxResults}
        onChange={(event) => onJqlMaxResultsChange(Math.max(1, Number(event.target.value) || 200))}
      />
    </div>

    <div className="ww-jql-pull-comments">
      <span className="ww-jql-pull-comments-label">Notes on run</span>
      <label className="ww-jql-pull-comments-option">
        <input
          type="radio"
          name="jqlPullComments"
          value="off"
          checked={!pullLatestComment}
          onChange={() => onPullLatestCommentChange(false)}
        />
        Keep local notes
      </label>
      <label className="ww-jql-pull-comments-option">
        <input
          type="radio"
          name="jqlPullComments"
          value="latest"
          checked={pullLatestComment}
          onChange={() => onPullLatestCommentChange(true)}
        />
        Pull most recent Jira comment
      </label>
      <button
        type="button"
        className="ww-selector-clear"
        onClick={() => onPullLatestCommentChange(false)}
      >
        Clear
      </button>
      <span className="ww-jql-pull-comments-hint">
        When enabled, Run JQL and Refresh overwrite note text with each issue&apos;s latest Jira comment.
      </span>
    </div>

    <div className="ww-jql-action-row">
      <Button secondary size="small" onClick={onRunJql} loading={jqlLoading} disabled={filtersLoading}>
        Run JQL
      </Button>
      <Button size="small" className="ww-reset-btn" onClick={onResetSavedQueries} disabled={filtersLoading}>
        <Icon name="warning sign" />Reset Saved Queries
      </Button>
    </div>

    {jqlError ? <p className="ww-jira-status ww-jira-error">{jqlError}</p> : null}
    <p className="ww-jql-shortcut-hint">
      Tip: Press <kbd className="ww-kbd">Ctrl</kbd>+<kbd className="ww-kbd">Enter</kbd> or{" "}
      <kbd className="ww-kbd">⌘</kbd>+<kbd className="ww-kbd">Enter</kbd> to run or refresh JQL results.
    </p>
  </div>
);

export default JqlControlsPanel;
