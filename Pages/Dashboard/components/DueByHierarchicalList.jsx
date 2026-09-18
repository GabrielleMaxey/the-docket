import React from "react";
import { Link } from "react-router-dom";
import { getDueBrowseUrl, groupIssuesByAssigneeAndEpic, formatIssueTypeLabel } from "../utils/dashboardMetricsUtils";
import { isEpicIssueType } from "../../../../shared/dashboardMetrics.mjs";
import { buildWorkWeekHref } from "../../../utils/workWeekNavigation";

const DueByHierarchicalList = ({
  issues,
  epicNameByKey,
  jiraBaseUrl,
  showTimingBadge = true,
}) => {
  const assigneeGroups = React.useMemo(() => {
    const groups = groupIssuesByAssigneeAndEpic(issues);
    return [...groups.entries()].sort(([left], [right]) => {
      if (left === "Unassigned") return 1;
      if (right === "Unassigned") return -1;
      return left.localeCompare(right, undefined, { sensitivity: "base" });
    });
  }, [issues]);

  return (
    <div className="dashboard-due-by-hierarchy">
      {assigneeGroups.map(([assignee, { epics, total }]) => (
        <div key={assignee} className="dashboard-due-by-epic-group">
          <div className="dashboard-due-by-epic-header">
            <span className="dashboard-due-by-epic-name">
              <Link to={buildWorkWeekHref({ assignee })} className="dashboard-work-week-link">
                {assignee}
              </Link>
            </span>
            <span className="dashboard-due-by-epic-count">
              {total} item{total !== 1 ? "s" : ""}
            </span>
          </div>

          {[...epics.entries()].map(([epicKey, epicIssues]) => {
            const epicName = epicNameByKey[epicKey] || epicKey || "Issues";
            const epicUrl =
              epicKey && jiraBaseUrl
                ? `${jiraBaseUrl}/browse/${encodeURIComponent(epicKey)}`
                : null;

            return (
              <div key={epicKey || "no-epic"} className="dashboard-due-by-assignee-group">
                <div className="dashboard-due-by-assignee-header">
                  <span>
                    {epicUrl ? (
                      <a href={epicUrl} target="_blank" rel="noreferrer">
                        {epicName}
                      </a>
                    ) : (
                      epicName
                    )}
                    {epicKey ? (
                      <Link
                        to={buildWorkWeekHref({ key: epicKey })}
                        className="dashboard-work-week-link"
                        title="Open in Work Week"
                      >
                        Work Week
                      </Link>
                    ) : null}
                  </span>
                  <span className="dashboard-due-by-assignee-count">
                    {epicIssues.length} item{epicIssues.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <ul className="dashboard-due-by-task-list">
                  {epicIssues.map((issue) => {
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
                          <Link to={buildWorkWeekHref({ key: issue.key })}>{issue.key}</Link>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="dashboard-jira-external-link"
                              title="Open in Jira"
                              aria-label={`Open ${issue.key} in Jira`}
                            >
                              ↗
                            </a>
                          ) : null}
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
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default DueByHierarchicalList;
