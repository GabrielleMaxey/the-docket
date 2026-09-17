import { Link } from "react-router-dom";
import { buildWorkWeekHref } from "../../../utils/workWeekNavigation";
import { formatIssueTypeLabel, getDueBrowseUrl } from "../utils/dashboardMetricsUtils";
import { isEpicIssueType } from "../../../../shared/dashboardMetrics.mjs";

const ContributorOverdueList = ({
  tasks,
  jiraBaseUrl,
  variant = "overdue",
  layout = "full",
  className = "",
}) => {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return null;
  }

  if (layout === "compact") {
    const isUpcoming = variant === "upcoming";

    return (
      <ul className={`dashboard-epic-contributor-overdue-list ${className}`.trim()}>
        {tasks.map((task) => (
          <li key={task.key} className="dashboard-epic-contributor-overdue-item">
            <Link
              to={buildWorkWeekHref({ key: task.key })}
              className={`dashboard-epic-contributor-overdue-key dashboard-work-week-link${
                isUpcoming ? " dashboard-epic-contributor-overdue-key--upcoming" : ""
              }`}
            >
              {task.key}
            </Link>
            {jiraBaseUrl && task.key ? (
              <a
                href={`${jiraBaseUrl}/browse/${encodeURIComponent(task.key)}`}
                target="_blank"
                rel="noreferrer"
                className="dashboard-jira-external-link"
                title="Open in Jira"
                aria-label={`Open ${task.key} in Jira`}
              >
                ↗
              </a>
            ) : null}
            <span
              className={`dashboard-due-by-type-badge dashboard-epic-contributor-type-badge${
                isEpicIssueType(task.issueType) ? " dashboard-due-by-type-badge--epic" : ""
              }`}
            >
              {formatIssueTypeLabel(task.issueType)}
            </span>
            <span className="dashboard-epic-contributor-overdue-summary">{task.summary}</span>
            {task.dueDate ? (
              <span
                className={`dashboard-epic-contributor-overdue-due${
                  isUpcoming ? " dashboard-epic-contributor-overdue-due--upcoming" : ""
                }`}
              >
                due {task.dueDate}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  const isUpcoming = variant === "upcoming";
  const rowClass = isUpcoming
    ? "dashboard-due-by-task-row--upcoming"
    : "dashboard-due-by-task-row--past-due";

  return (
    <ul className={`dashboard-due-by-task-list ${className}`.trim()}>
      {tasks.map((task) => {
        const url = getDueBrowseUrl(task, jiraBaseUrl);
        const typeLabel = formatIssueTypeLabel(task.issueType);
        const isEpic = isEpicIssueType(task.issueType);

        return (
          <li key={task.key} className={`dashboard-due-by-task-row ${rowClass}`}>
            <span className="dashboard-due-by-task-key">
              <Link to={buildWorkWeekHref({ key: task.key })}>{task.key}</Link>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="dashboard-jira-external-link"
                  title="Open in Jira"
                  aria-label={`Open ${task.key} in Jira`}
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
            <span className="dashboard-due-by-task-summary">{task.summary}</span>
            <span className="dashboard-due-by-task-date">
              {task.dueDate || "—"}
              {isUpcoming ? (
                <span className="dashboard-due-by-timing-badge dashboard-due-by-timing-badge--upcoming">
                  Upcoming
                </span>
              ) : (
                <span className="dashboard-due-by-timing-badge dashboard-due-by-timing-badge--past-due">
                  Past due
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export default ContributorOverdueList;
