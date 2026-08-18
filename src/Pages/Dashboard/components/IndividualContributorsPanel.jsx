import { Message } from "semantic-ui-react";
import ContributorStatusBar from "./ContributorStatusBar";
import AssigneeMetricCard from "./AssigneeMetricCard";
import JqlContributorMetricCard from "./JqlContributorMetricCard";
import DashboardRefreshActions from "./DashboardRefreshActions";
import { rollupEpicContributorPeople, getDashboardRefreshLoadingHint } from "../utils/dashboardMetricsUtils";

const IndividualContributorsPanel = ({
  displayEpics,
  assigneeMetrics,
  jiraBaseUrl,
  chartVariant,
  dueByDate,
  handleRefreshContributors,
  handleCancelRefresh,
  contributorsRefreshLoading,
  canSubmitContributors,
  hasContributorScope,
}) => {
  const autoRows = rollupEpicContributorPeople(displayEpics).filter(
    (row) => Number(row.totalIssues || 0) > 0
  );

  return (
    <div className="dashboard-contributors-panel">
      <div className="dashboard-contributors-block">
        <p className="dashboard-contributors-block-title">From your selected projects</p>
        <p className="dashboard-contributors-block-hint">
          Auto-derived from the projects picked in Filters above — no separate roster to pick or
          refresh.
        </p>
        {autoRows.length > 0 ? (
          autoRows.map((row) => (
            <ContributorStatusBar
              key={row.name}
              person={row}
              jiraBaseUrl={jiraBaseUrl}
              dueByDate={dueByDate}
              showBar={false}
              showOverdueList={false}
              showUpcomingList={false}
            />
          ))
        ) : (
          <Message info size="small">
            Select a project in Filters and refresh to see contributors here.
          </Message>
        )}
      </div>

      <div className="dashboard-contributors-block dashboard-contributors-block--layered">
        <p className="dashboard-contributors-block-title">
          Layered in — people, custom queries, and My Direct Reports
        </p>
        <p className="dashboard-contributors-block-hint">
          Pick queries in Filters → Contributor Metrics for rosters that span multiple projects
          (or aren&rsquo;t covered by your project selection above), then refresh. May overlap
          with the projects list above — each source keeps its own numbers.
        </p>
        <DashboardRefreshActions
          onRefresh={handleRefreshContributors}
          onCancel={handleCancelRefresh}
          loading={contributorsRefreshLoading}
          canSubmit={canSubmitContributors}
          submitLabel="Refresh contributors"
          loadingHint={getDashboardRefreshLoadingHint("contributors")}
          hint={
            hasContributorScope
              ? "Updates full-workload metrics for selected people and custom JQL watches."
              : "Select people or custom queries in Filters to refresh contributor metrics."
          }
        />
        {assigneeMetrics.length > 0 ? (
          <div className="dashboard-assignee-grid">
            {assigneeMetrics.map((person) =>
              person.queryType === "jql" ? (
                <JqlContributorMetricCard
                  key={person.id}
                  person={person}
                  jiraBaseUrl={jiraBaseUrl}
                  chartVariant={chartVariant}
                  dueByDate={dueByDate}
                />
              ) : (
                <AssigneeMetricCard
                  key={person.id}
                  person={person}
                  jiraBaseUrl={jiraBaseUrl}
                  chartVariant={chartVariant}
                  dueByDate={dueByDate}
                />
              )
            )}
          </div>
        ) : (
          <Message info size="small">
            Nothing layered in yet. Select people, a custom query, or My Direct Reports under
            Filters → Contributor Metrics, then click <strong>Refresh contributors</strong>.
          </Message>
        )}
      </div>
    </div>
  );
};

export default IndividualContributorsPanel;
