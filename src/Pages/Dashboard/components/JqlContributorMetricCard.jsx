import { formatPercent } from "../../../utils/format";
import { Message } from "semantic-ui-react";
import AssigneeWorkloadChart from "./AssigneeWorkloadChart";
import ProjectContributorMetrics from "./ProjectContributorMetrics";
import ContributorDueTasksSection from "./ContributorDueTasksSection";

const JqlContributorMetricCard = ({ person, jiraBaseUrl, chartVariant = "pie", dueByDate }) => {
  const counts = person.workloadCounts || {};
  const total = Number(counts.totalIssues || 0);
  const resolved = Number(counts.totalResolved || 0);
  const open = Number(counts.totalAssigned || 0);
  const label = person.resolvedDisplayName || person.queryName;

  return (
    <div className="dashboard-assignee-card dashboard-assignee-card--jql">
      <h4>
        {label}
        <span className="dashboard-badge dashboard-badge-jql">JQL</span>
      </h4>
      {person.jql ? (
        <p className="dashboard-assignee-jql" title={person.jql}>
          {person.jql}
        </p>
      ) : null}
      {person.error ? (
        <Message negative size="small">
          {person.error}
        </Message>
      ) : null}
      {total > 0 ? (
        <p className="dashboard-assignee-meta">
          {total} total &middot; {open} open &middot; {resolved} resolved (
          {formatPercent((resolved / total) * 100)})
          {person.overdueOpenCount > 0
            ? ` · ${formatPercent(person.overduePercent)} overdue`
            : ""}
        </p>
      ) : (
        <p className="dashboard-assignee-meta">No issues in scope.</p>
      )}
      {total > 0 ? (
        <AssigneeWorkloadChart workloadCounts={counts} chartVariant={chartVariant} />
      ) : null}
      <ContributorDueTasksSection
        title={dueByDate ? `Upcoming due through ${dueByDate}` : "Upcoming due dates"}
        tasks={person.upcomingDueIssues}
        jiraBaseUrl={jiraBaseUrl}
        variant="upcoming"
        personKey={label}
      />
      <ProjectContributorMetrics
        contributorMetrics={person.contributorMetrics}
        title={`Individual contributors — ${label}`}
        jiraBaseUrl={jiraBaseUrl}
        chartVariant={chartVariant}
        dueByDate={dueByDate}
      />
    </div>
  );
};

export default JqlContributorMetricCard;
