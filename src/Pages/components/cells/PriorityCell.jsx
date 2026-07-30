import React from "react";

const PriorityCell = ({
  issueKey,
  isClosedOrResolved,
  rowPriority,
  priorityClassName,
  prioritySource,
  onChange,
}) => {
  const sourceMeta = prioritySource?.[issueKey];
  const sourceTitle =
    sourceMeta?.source === "jira-comment"
      ? `Priority from latest Jira comment${sourceMeta.author ? ` by ${sourceMeta.author}` : ""}`
      : undefined;

  return (
    <td>
      {isClosedOrResolved ? (
        <span>-</span>
      ) : (
        <div className="ww-priority-cell-wrap">
          <select
            className={"ww-row-priority-select " + priorityClassName}
            value={rowPriority}
            onChange={(event) => onChange(issueKey, event.target.value)}
            title={sourceTitle}
          >
            {Array.from({ length: 21 }).map((_, i) => (
              <option key={"row-priority-" + issueKey + "-" + i} value={i}>
                {"P" + i}
              </option>
            ))}
          </select>
          {sourceMeta?.source === "jira-comment" ? (
            <span className="ww-priority-source-badge" title={sourceTitle}>
              Jira
            </span>
          ) : null}
        </div>
      )}
    </td>
  );
};

export default PriorityCell;
