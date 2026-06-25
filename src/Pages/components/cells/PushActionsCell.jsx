import React from "react";

// Push-to-Jira checkbox + "Push note" / "Save to DB" buttons, plus inline
// status messages for those two async actions. Status/assignee update
// confirmations are shown locally in StatusCell/AssigneeCell instead —
// showing them here too would duplicate the same message across the row.
const PushActionsCell = ({
  issueKey,
  isClosedOrResolved,
  isSelected,
  isNoteAlreadyPushed,
  push,
  save,
  onToggleSelect,
  onPushNote,
  onSaveMetadata,
}) => (
  <td>
    {isClosedOrResolved ? (
      <span>-</span>
    ) : (
      <div className="ww-push-actions">
        <label className="ww-row-select-label">
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={(event) => onToggleSelect(issueKey, event.target.checked)}
          />
        </label>
        <button
          type="button"
          className="ww-push-btn"
          onClick={() => onPushNote(issueKey)}
          disabled={!isSelected || push.loading || isNoteAlreadyPushed}
        >
          {push.loading ? "Pushing..." : "Push note"}
        </button>
        <button
          type="button"
          className="ww-save-btn"
          onClick={() => onSaveMetadata(issueKey)}
          disabled={save.loading}
        >
          {save.loading ? "Saving..." : "Save to DB"}
        </button>
      </div>
    )}
    {push.error && <p className="ww-inline-error">{push.error}</p>}
    {push.success && <p className="ww-inline-success">✓ {push.success}</p>}
    {save.error && <p className="ww-inline-error">{save.error}</p>}
    {save.success && <p className="ww-inline-success">✓ {save.success}</p>}
  </td>
);

export default PushActionsCell;
