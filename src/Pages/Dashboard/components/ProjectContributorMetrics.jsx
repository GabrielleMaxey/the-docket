import { Link } from "react-router-dom";
import StatusPieChart from "../../../Components/StatusPieChart";
import { getTerminalIssueCount } from "../../../../shared/dashboardMetrics.mjs";
import { buildEpicPieStatusCounts } from "../utils/dashboardMetricsUtils";
import { buildWorkWeekHref } from "../../../utils/workWeekNavigation";
import ContributorOverdueList from "./ContributorOverdueList";

const ProjectContributorMetrics = ({
  contributorMetrics,
  title,
  jiraBaseUrl,
  chartVariant,
  dueByDate,
  epicPresetId,
  showOverdueList = true,
  showUpcomingList = true,
}) => {
  const rows = Array.isArray(contributorMetrics)
    ? contributorMetrics.filter((row) => Number(row.totalIssues || 0) > 0)
    : [];

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="dashboard-epic-contributors">
      <p className="dashboard-epic-contributors-title">{title}</p>
      <div className="dashboard-epic-contributor-list">
        {rows.map((person) => (
          <div key={person.name} className="dashboard-epic-contributor-row">
            <div className="dashboard-epic-contributor-head">
              <Link
                to={buildWorkWeekHref({ assignee: person.name, epicPresetId })}
                className="dashboard-epic-contributor-name dashboard-work-week-link"
              >
                {person.name}
              </Link>
              <span className="dashboard-epic-contributor-stats">
                {person.openIssues} open · {person.resolvedIssues} resolved
                {person.overdueOpenIssues > 0 ? ` · ${person.overdueOpenIssues} overdue` : ""}
                {person.upcomingDueIssues?.length > 0
                  ? ` · ${person.upcomingDueIssues.length} upcoming`
                  : ""}
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
            {showOverdueList && person.overdueIssues?.length > 0 ? (
              <ContributorOverdueList
                tasks={person.overdueIssues}
                jiraBaseUrl={jiraBaseUrl}
                variant="overdue"
                layout="compact"
              />
            ) : null}
            {showUpcomingList && person.upcomingDueIssues?.length > 0 ? (
              <ContributorOverdueList
                tasks={person.upcomingDueIssues}
                jiraBaseUrl={jiraBaseUrl}
                variant="upcoming"
                layout="compact"
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectContributorMetrics;
