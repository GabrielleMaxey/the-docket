import React from "react";
import { Link } from "react-router-dom";
import StatusPieChart from "../../../Components/StatusPieChart";
import { collectEpicCompletionCounts, getTerminalIssueCount } from "../../../../shared/dashboardMetrics.mjs";
import {
  buildEpicPieStatusCounts,
  getWorkloadStatusCounts,
  pastDueBadgeLabel,
} from "../utils/dashboardMetricsUtils";
import { buildWorkWeekHref } from "../../../utils/workWeekNavigation";
import MetricBar from "./MetricBar";
import ProjectContributorMetrics from "./ProjectContributorMetrics";

const EpicMetricCard = ({ epic, jiraBaseUrl, dueByDate, chartVariant, includePastDue }) => {
  const isJqlPreset = epic.epicKey === "JQL";
  const epicBreakdown = Array.isArray(epic.epicBreakdown) ? epic.epicBreakdown : [];
  const hasEpicBreakdown = isJqlPreset && epicBreakdown.length > 0;
  const { epicsComplete, epicCount } = React.useMemo(
    () =>
      hasEpicBreakdown
        ? collectEpicCompletionCounts([epic])
        : { epicsComplete: epic.epicPercent >= 100 ? 1 : 0, epicCount: isJqlPreset ? 0 : 1 },
    [epic, hasEpicBreakdown, isJqlPreset]
  );
  const workloadStatuses = React.useMemo(() => getWorkloadStatusCounts(epic), [epic]);
  const contributorMetrics = Array.isArray(epic.contributorMetrics) ? epic.contributorMetrics : [];
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
          {!isJqlPreset ? (
            <MetricBar label="Project complete" value={epic.epicPercent} />
          ) : hasEpicBreakdown ? (
            <MetricBar
              label="Epics complete"
              value={epic.epicPercent}
              count={`${epicsComplete} of ${epicCount}`}
            />
          ) : null}
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

          <ProjectContributorMetrics
            contributorMetrics={contributorMetrics}
            title={`Individual contributors — ${epic.label}`}
            jiraBaseUrl={jiraBaseUrl}
            chartVariant={chartVariant}
            dueByDate={dueByDate}
            showOverdueList={includePastDue}
          />
        </>
      ) : null}
    </div>
  );
};

export default EpicMetricCard;
