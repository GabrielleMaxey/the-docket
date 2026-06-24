import React from "react";

// Assignee input (with a per-run datalist of known assignees) + "Update
// Assignee" button. See StatusCell.jsx for why this was extracted.
const AssigneeCell = ({
  issueKey,
  assignee,
  isClosedOrResolved,
  draftValue,
  datalistId,
  knownAssignees,
  loading,
  confirmation,
  onDraftChange,
  onUpdate,
}) => (
  <td>
    <div className={"ww-edit-cell" + (isClosedOrResolved ? " ww-edit-disabled" : "")}>
      <input
        list={datalistId}
        className="ww-edit-input"
        value={draftValue || assignee}
        onChange={(event) => onDraftChange(issueKey, event.target.value)}
        placeholder="Pick or type assignee"
        disabled={isClosedOrResolved}
      />
      <button
        type="button"
        className="ww-inline-action-btn"
        onClick={() => onUpdate(issueKey)}
        disabled={loading || isClosedOrResolved}
      >
        Update Assignee
      </button>
    </div>
    <datalist id={datalistId}>
      {knownAssignees.map((name) => (
        <option key={datalistId + "-" + name} value={name} />
      ))}
    </datalist>
    {confirmation?.success ? <p className="ww-inline-success">✓ {confirmation.success}</p> : null}
    {confirmation?.error ? <p className="ww-inline-error">{confirmation.error}</p> : null}
  </td>
);

export default AssigneeCell;
