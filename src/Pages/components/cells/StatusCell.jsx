import React from "react";

// One editable cell from JiraResultsTable's <tbody> — status dropdown +
// "Update Status" button. Extracted along with the other ww-edit-cell
// columns (Assignee/Priority/Notes/PushActions) to cut down the size of
// the giant inline row markup in JiraResultsTable.jsx.
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
