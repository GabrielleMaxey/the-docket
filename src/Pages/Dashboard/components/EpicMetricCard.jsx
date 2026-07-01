import React from "react";
import { Link } from "react-router-dom";
import { formatPercent } from "../../../utils/format";
import StatusPieChart from "../../../Components/StatusPieChart";
import { getTerminalIssueCount } from "../../../../shared/dashboardMetrics.mjs";
import {
  buildEpicPieStatusCounts,
  getWorkloadStatusCounts,
  pastDueBadgeLabel,
  formatIssueTypeLabel,
} from "../utils/dashboardMetricsUtils";
import { isEpicIssueType } from "../../../../shared/dashboardMetrics.mjs";
import { buildWorkWeekHref } from "../../../utils/workWeekNavigation";
import MetricBar from "./MetricBar";

const EpicMetricCard = ({ epic, jiraBaseUrl, dueByDate, chartVariant, includePastDue }) => {
  const isJqlPreset = epic.epicKey === "JQL";
  const workloadStatuses = React.useMemo(() => getWorkloadStatusCounts(epic), [epic]);
  const contributorMetrics = Array.isArray(epic.contributorMetrics)
    ? epic.contributorMetrics.filter((row) => Number(row.totalIssues || 0) > 0)
    : [];
  const jiraUrl =
    !isJqlPreset && jiraBaseUrl
      ? `${jiraBaseUrl}/browse/${encodeURIComponent(epic.epicKey)}`
      : null;
  const [isCardOpen, setIsCardOpen] = React.useState(true);

  return (
    <div className="dashboard-epic-card">
      <div className="dashboard-epic-card-head">
        <h3 className="dashboard-epic-card-title">
          {jiraUrl ? (
            <a href={jiraUrl} target="_blank" rel="noreferrer">
              {epic.label}
            </a>
          ) : (
            epic.label
          )}
          {!isJqlPreset && epic.epicKey ? (
            <Link
              to={buildWorkWeekHref({ key: epic.epicKey })}
              className="dashboard-work-week-link"
              title="Open epic in Work Week"
            >
              Work Week
            </Link>
          ) : null}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {epic.isPastDue ? (
            <span className="dashboard-badge">{pastDueBadgeLabel(epic.pastDueReason)}</span>
          ) : null}
          {isJqlPreset ? <span className="dashboard-badge dashboard-badge-jql">JQL</span> : null}
          <button
            type="button"
            onClick={() => setIsCardOpen((o) => !o)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94a3b8",
              fontSize: "1.1rem",
              lineHeight: 1,
              padding: "0.1rem 0.25rem",
              transform: isCardOpen ? "rotate(-90deg)" : "rotate(90deg)",
              transition: "transform 0.18s",
            }}
            aria-label={isCardOpen ? "Collapse" : "Expand"}
          >
            ›
          </button>
        </div>
      </div>

      {isCardOpen ? (
        <>
          {getTerminalIssueCount(epic) > 0 || Object.keys(epic.statusCounts || {}).length > 0 ? (
            <div className="dashboard-epic-status-breakdown">
              <StatusPieChart
                statusCounts={buildEpicPieStatusCounts(epic)}
                size={160}
                className="dashboard-pie-chart--compact"
                variant={chartVariant}
              />
            </div>
          ) : null}

          <MetricBar label="Tasks resolved" value={epic.issuePercent} />
          {workloadStatuses.inProgress > 0 ? (
            <MetricBar
              label="In Progress"
              value={epic.totalIssues > 0 ? (workloadStatuses.inProgress / epic.totalIssues) * 100 : 0}
            />
          ) : null}
          {!isJqlPreset ? <MetricBar label="Project complete" value={epic.epicPercent} /> : null}
          <MetricBar label="Open tasks past due" value={epic.overduePercent} />

          {epic.totalIssues === 0 ? (
            <p className="dashboard-assignee-meta">No issues found.</p>
          ) : (
            <p className="dashboard-assignee-meta">
              {getTerminalIssueCount(epic)} resolved · {epic.overdueOpenIssues} past due open / {epic.openIssues}{" "}
              open · {workloadStatuses.inProgress} in progress · {workloadStatuses.readyForVerification} ready
              for verification
              {dueByDate && epic.dueByOpenIssues > 0 ? (
                <strong className="dashboard-due-by-count">
                  {" "}&middot; {epic.dueByOpenIssues} upcoming due by {dueByDate}
                </strong>
              ) : null}
            </p>
          )}

          <div className="dashboard-dates">
            {!isJqlPreset && epic.initialDoneDate ? <p>Initial Done Date: {epic.initialDoneDate}</p> : null}
            {!isJqlPreset && epic.mostRecentDoneDate ? (
              <p>Most Recent Done Date: {epic.mostRecentDoneDate}</p>
            ) : null}
            {!isJqlPreset && epic.projectEndDate ? <p>Project End Date: {epic.projectEndDate}</p> : null}
          </div>

          {contributorMetrics.length > 0 ? (
            <div className="dashboard-epic-contributors">
              <p className="dashboard-epic-contributors-title">Individual contributors — {epic.label}</p>
              <div className="dashboard-epic-contributor-list">
                {contributorMetrics.map((person) => (
                  <div key={person.name} className="dashboard-epic-contributor-row">
                    <div className="dashboard-epic-contributor-head">
                      <Link
                        to={buildWorkWeekHref({ assignee: person.name })}
                        className="dashboard-epic-contributor-name dashboard-work-week-link"
                      >
                        {person.name}
                      </Link>
                      <span className="dashboard-epic-contributor-stats">
                        {person.openIssues} open · {person.resolvedIssues} resolved
                        {person.overdueOpenIssues > 0 ? ` · ${person.overdueOpenIssues} overdue` : ""}
                      </span>
                    </div>
                    {getTerminalIssueCount(person) > 0 ||
                    Object.keys(person.openStatusCounts || {}).length > 0 ? (
                      <div className="dashboard-epic-contributor-chart">
                        <StatusPieChart
                          statusCounts={buildEpicPieStatusCounts(person)}
                          size={110}
                          className="dashboard-pie-chart--compact"
                          variant={chartVariant}
                        />
                      </div>
                    ) : null}
                    {person.openIssues > 0 ? (
                      <div className="dashboard-epic-contributor-overdue-wrap">
                        <div className="dashboard-progress" aria-hidden="true">
                          <div
                            className="dashboard-progress-fill"
                            style={{
                              width: `${Math.min(100, Math.max(0, Number(person.overduePercent) || 0))}%`,
                            }}
                          />
                        </div>
                        <span className="dashboard-epic-contributor-overdue-label">
                          {formatPercent(person.overduePercent)} overdue of open
                        </span>
                      </div>
                    ) : null}
                    {includePastDue &&
                    Array.isArray(person.overdueIssues) &&
                    person.overdueIssues.length > 0 ? (
                      <ul className="dashboard-epic-contributor-overdue-list">
                        {person.overdueIssues.map((task) => (
                          <li key={task.key} className="dashboard-epic-contributor-overdue-item">
                            <Link
                              to={buildWorkWeekHref({ key: task.key })}
                              className="dashboard-epic-contributor-overdue-key dashboard-work-week-link"
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
                                isEpicIssueType(task.issueType)
                                  ? " dashboard-due-by-type-badge--epic"
                                  : ""
                              }`}
                            >
                              {formatIssueTypeLabel(task.issueType)}
                            </span>
                            <span className="dashboard-epic-contributor-overdue-summary">
                              {task.summary}
                            </span>
                            {task.dueDate ? (
                              <span className="dashboard-epic-contributor-overdue-due">
                                due {task.dueDate}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default EpicMetricCard;
