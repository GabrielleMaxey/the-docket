import { Link } from "react-router-dom";
import { Message } from "semantic-ui-react";
import { formatPercent } from "../../../utils/format";
import { buildWorkWeekHref } from "../../../utils/workWeekNavigation";
import AssigneeWorkloadChart from "./AssigneeWorkloadChart";
import ContributorDueTasksSection from "./ContributorDueTasksSection";
import EpicBreakdownList from "./EpicBreakdownList";

const getAssigneeStatusMessage = (person) => {
  if (person.totalOpenCount === 0) {
    return "No open issues assigned.";
  }
  if (person.overdueOpenCount === 0) {
    return "No overdue tasks found.";
  }
  return `${formatPercent(person.overduePercent)} overdue`;
};

const AssigneeMetricCard = ({ person, jiraBaseUrl, chartVariant = "pie", dueByDate }) => {
  const counts = person.workloadCounts || {};
  const total = Number(counts.totalIssues || 0);
  const resolved = Number(counts.totalResolved || 0);
  const open = Number(counts.totalAssigned || 0);
  const assigneeName = person.resolvedDisplayName || person.queryName;
  const overdueTasks =
    person.overdueIssues?.length > 0
      ? person.overdueIssues
      : (person.overdueIssueKeys || []).map((key) => ({ key, summary: "", dueDate: null, issueType: "" }));
  const upcomingTasks = person.upcomingDueIssues || [];
  const epicBreakdown = Array.isArray(person.epicBreakdown) ? person.epicBreakdown : [];

  return (
    <div className="dashboard-assignee-card">
      <h4>
        <Link
          to={buildWorkWeekHref({ assignee: assigneeName })}
          className="dashboard-work-week-link"
        >
          {assigneeName}
        </Link>
      </h4>
      {person.error ? (
        <Message negative size="small">
          {person.error}
        </Message>
      ) : null}
      {total > 0 ? (
        <p className="dashboard-assignee-meta">
          {total} total &middot; {open} open &middot; {resolved} resolved (
          {formatPercent((resolved / total) * 100)})
          {person.overdueOpenCount > 0 ? ` · ${person.overdueOpenCount} overdue` : ""}
          {upcomingTasks.length > 0 ? ` · ${upcomingTasks.length} upcoming` : ""}
        </p>
      ) : (
        <p className="dashboard-assignee-meta">{getAssigneeStatusMessage(person)}</p>
      )}
      {total > 0 ? (
        <AssigneeWorkloadChart workloadCounts={counts} chartVariant={chartVariant} />
      ) : null}
      <ContributorDueTasksSection
        title="Overdue tasks"
        tasks={overdueTasks}
        jiraBaseUrl={jiraBaseUrl}
        variant="overdue"
        personKey={assigneeName}
      />
      <ContributorDueTasksSection
        title={dueByDate ? `Upcoming due through ${dueByDate}` : "Upcoming due dates"}
        tasks={upcomingTasks}
        jiraBaseUrl={jiraBaseUrl}
        variant="upcoming"
        personKey={assigneeName}
      />
      <EpicBreakdownList breakdown={epicBreakdown} jiraBaseUrl={jiraBaseUrl} />
    </div>
  );
};

export default AssigneeMetricCard;
