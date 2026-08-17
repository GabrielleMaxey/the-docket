import React from "react";

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
