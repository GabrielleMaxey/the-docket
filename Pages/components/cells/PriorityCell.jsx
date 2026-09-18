import React from "react";
import { MAX_ISSUE_PRIORITY } from "../../../../shared/issuePriority.mjs";

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
    sourceMeta?.source === "team-db"
      ? `Team priority${sourceMeta.author ? ` (${sourceMeta.author})` : ""}`
      : undefined;
  const sourceBadgeLabel = sourceMeta?.source === "team-db" ? "Team" : null;

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
            {Array.from({ length: MAX_ISSUE_PRIORITY + 1 }).map((_, i) => (
              <option key={"row-priority-" + issueKey + "-" + i} value={i}>
                {"P" + i}
              </option>
            ))}
          </select>
          {sourceBadgeLabel ? (
            <span className="ww-priority-source-badge" title={sourceTitle}>
              {sourceBadgeLabel}
            </span>
          ) : null}
        </div>
      )}
    </td>
  );
};

export default PriorityCell;
