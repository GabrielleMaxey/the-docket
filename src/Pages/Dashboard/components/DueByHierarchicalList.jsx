import React from "react";
import { getDueBrowseUrl, groupIssuesByEpicAndAssignee, formatIssueTypeLabel } from "../utils/dashboardMetricsUtils";
import { isEpicIssueType } from "../../../../shared/dashboardMetrics.mjs";

const DueByHierarchicalList = ({
  issues,
  epicNameByKey,
  jiraBaseUrl,
  showTimingBadge = true,
}) => {
  const epicGroups = React.useMemo(
    () => groupIssuesByEpicAndAssignee(issues),
    [issues]
  );

  return (
    <div className="dashboard-due-by-hierarchy">
      {[...epicGroups.entries()].map(([epicKey, { assignees, total }]) => {
        const epicName = epicNameByKey[epicKey] || epicKey || "Issues";
        const epicUrl =
          epicKey && jiraBaseUrl
            ? `${jiraBaseUrl}/browse/${encodeURIComponent(epicKey)}`
            : null;

        return (
          <div key={epicKey || "no-epic"} className="dashboard-due-by-epic-group">
            <div className="dashboard-due-by-epic-header">
              <span className="dashboard-due-by-epic-name">
                {epicUrl ? (
                  <a href={epicUrl} target="_blank" rel="noreferrer">
                    {epicName}
                  </a>
                ) : (
                  epicName
                )}
              </span>
              <span className="dashboard-due-by-epic-count">
                {total} item{total !== 1 ? "s" : ""}
              </span>
            </div>

            {[...assignees.entries()].map(([assignee, assigneeIssues]) => (
              <div key={assignee} className="dashboard-due-by-assignee-group">
                <div className="dashboard-due-by-assignee-header">
                  <span>{assignee}</span>
                  <span className="dashboard-due-by-assignee-count">
                    {assigneeIssues.length} item{assigneeIssues.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <ul className="dashboard-due-by-task-list">
                  {assigneeIssues.map((issue) => {
                    const url = getDueBrowseUrl(issue, jiraBaseUrl);
                    const typeLabel = formatIssueTypeLabel(issue.issueType);
                    const isEpic = isEpicIssueType(issue.issueType);
                    return (
                      <li
                        key={issue.key}
                        className={`dashboard-due-by-task-row${
                          issue.isOverdue
                            ? " dashboard-due-by-task-row--past-due"
                            : " dashboard-due-by-task-row--upcoming"
                        }`}
                      >
                        <span className="dashboard-due-by-task-key">
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer noopener">
                              {issue.key}
                            </a>
                          ) : (
                            issue.key
                          )}
                        </span>
                        <span
                          className={`dashboard-due-by-type-badge${
                            isEpic ? " dashboard-due-by-type-badge--epic" : ""
                          }`}
                        >
                          {typeLabel}
                        </span>
                        <span className="dashboard-due-by-task-summary">{issue.summary}</span>
                        <span className="dashboard-due-by-task-date">
                          {issue.dueDate || "—"}
                          {showTimingBadge ? (
                            issue.isOverdue ? (
                              <span className="dashboard-due-by-timing-badge dashboard-due-by-timing-badge--past-due">
                                Past due
                              </span>
                            ) : issue.dueDate ? (
                              <span className="dashboard-due-by-timing-badge dashboard-due-by-timing-badge--upcoming">
                                Upcoming
                              </span>
                            ) : null
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default DueByHierarchicalList;
