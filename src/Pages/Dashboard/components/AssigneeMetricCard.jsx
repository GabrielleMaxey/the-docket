import { Link } from "react-router-dom";
import { formatPercent } from "../../../utils/format";
import { buildWorkWeekHref } from "../../../utils/workWeekNavigation";
import MetricBar from "./MetricBar";

const getAssigneeStatusMessage = (person) => {
  if (person.totalOpenCount === 0) {
    if (person.queryType === "jql") {
      return "No open issues in scope.";
    }
    return "No open issues assigned.";
  }
  if (person.overdueOpenCount === 0) {
    return "No overdue tasks found.";
  }
  return `${formatPercent(person.overduePercent)} overdue`;
};

const AssigneeMetricCard = ({ person }) => {
  const counts = person.workloadCounts || {};
  const total = Number(counts.totalIssues || 0);
  const pct = (n) => total > 0 ? (Number(n || 0) / total) * 100 : 0;
  const resolved = Number(counts.totalResolved || 0);
  const open = Number(counts.totalAssigned || 0);
  const assigneeName = person.resolvedDisplayName || person.queryName;

  return (
    <div className="dashboard-assignee-card">
      <h4>
        <Link
          to={buildWorkWeekHref({ assignee: assigneeName })}
          className="dashboard-work-week-link"
        >
          {assigneeName}
        </Link>
        {person.queryType === "jql" ? (
          <span className="dashboard-badge dashboard-badge-jql">JQL</span>
        ) : null}
      </h4>
      {total > 0 ? (
        <p className="dashboard-assignee-meta">
          {total} total &middot; {open} open &middot; {resolved} resolved
        </p>
      ) : (
        <p className="dashboard-assignee-meta">{getAssigneeStatusMessage(person)}</p>
      )}
      {total > 0 ? (
        <div className="dashboard-assignee-metrics">
          <MetricBar label="Resolved / Closed / Done" value={pct(resolved)} count={resolved} />
          {Number(counts.inProgress) > 0 ? (
            <MetricBar label="In Progress" value={pct(counts.inProgress)} count={counts.inProgress} />
          ) : null}
          {Number(counts.readyForVerification) > 0 ? (
            <MetricBar
              label="Ready for Verification"
              value={pct(counts.readyForVerification)}
              count={counts.readyForVerification}
            />
          ) : null}
          {Number(counts.readyForWork) > 0 ? (
            <MetricBar label="Ready For Work" value={pct(counts.readyForWork)} count={counts.readyForWork} />
          ) : null}
          {Number(counts.analyzing) > 0 ? (
            <MetricBar label="Analyzing" value={pct(counts.analyzing)} count={counts.analyzing} />
          ) : null}
          {Number(counts.backlog) > 0 ? (
            <MetricBar label="Backlog" value={pct(counts.backlog)} count={counts.backlog} />
          ) : null}
          {Number(counts.other) > 0 ? (
            <MetricBar label="Other" value={pct(counts.other)} count={counts.other} />
          ) : null}
          {Number(counts.pastDue) > 0 ? (
            <MetricBar
              label="Past Due (of open)"
              value={open > 0 ? (Number(counts.pastDue) / open) * 100 : 0}
              count={counts.pastDue}
            />
          ) : null}
        </div>
      ) : null}
      {person.overdueIssueKeys?.length > 0 ? (
        <p className="dashboard-overdue-keys">
          {person.overdueIssueKeys.map((issueKey, idx) => (
            <span key={issueKey}>
              {idx > 0 ? ", " : null}
              <Link to={buildWorkWeekHref({ key: issueKey })} className="dashboard-work-week-link">
                {issueKey}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
};

export default AssigneeMetricCard;
