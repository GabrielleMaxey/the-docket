import React from "react";

// Priority (P0-P10) dropdown. See StatusCell.jsx for why this was extracted.
const PriorityCell = ({ issueKey, isClosedOrResolved, rowPriority, priorityClassName, onChange }) => (
  <td>
    {isClosedOrResolved ? (
      <span>-</span>
    ) : (
      <select
        className={"ww-row-priority-select " + priorityClassName}
        value={rowPriority}
        onChange={(event) => onChange(issueKey, event.target.value)}
      >
        {Array.from({ length: 11 }).map((_, i) => (
          <option key={"row-priority-" + issueKey + "-" + i} value={i}>
            {"P" + i}
          </option>
        ))}
      </select>
    )}
  </td>
);

export default PriorityCell;
