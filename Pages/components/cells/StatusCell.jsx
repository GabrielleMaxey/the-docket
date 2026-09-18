import React from "react";

const StatusCell = ({
  issueKey,
  status,
  isClosedOrResolved,
  draftValue,
  statusOptions,
  loading,
  confirmation,
  onDraftChange,
  onUpdate,
}) => (
  <td>
    <div className={"ww-edit-cell" + (isClosedOrResolved ? " ww-edit-disabled" : "")}>
      <select
        className="ww-edit-select"
        value={draftValue || status}
        onChange={(event) => onDraftChange(issueKey, event.target.value)}
        disabled={isClosedOrResolved}
      >
        <option value={status}>{status}</option>
        {statusOptions
          .filter((opt) => opt !== status)
          .map((opt) => (
            <option key={"status-opt-" + issueKey + "-" + opt} value={opt}>
              {opt}
            </option>
          ))}
      </select>
      <button
        type="button"
        className="ww-inline-action-btn"
        onClick={() => onUpdate(issueKey, status)}
        disabled={loading || isClosedOrResolved}
      >
        Update Status
      </button>
    </div>
    {confirmation?.success ? <p className="ww-inline-success">✓ {confirmation.success}</p> : null}
    {confirmation?.error ? <p className="ww-inline-error">{confirmation.error}</p> : null}
  </td>
);

export default StatusCell;
