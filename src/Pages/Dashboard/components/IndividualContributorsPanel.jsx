import React from "react";
import { Message } from "semantic-ui-react";
import CollapsibleSection from "../../../Components/CollapsibleSection";
import ContributorStatusBar from "./ContributorStatusBar";
import AssigneeMetricCard from "./AssigneeMetricCard";
import JqlContributorMetricCard from "./JqlContributorMetricCard";
import DashboardRefreshActions from "./DashboardRefreshActions";
import { rollupEpicContributorPeople, getDashboardRefreshLoadingHint } from "../utils/dashboardMetricsUtils";
import { useJiraAccountIdResolver } from "../../hooks/useJiraAccountIdResolver.js";

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
  const watchedTexts = React.useMemo(
    () => assigneeMetrics.map((person) => person.jql),
    [assigneeMetrics]
  );
  const { humanizeJql } = useJiraAccountIdResolver(watchedTexts);

  return (
    <div className="dashboard-contributors-panel">
      <CollapsibleSection
        title="Within your selected projects"
        subtitle="Auto-derived from the projects picked in Filters above — each person's work on just these projects, not their full Jira workload. No separate roster to pick or refresh; for the full picture, add them under Layered in below."
        storageKey="individualContributorsWithinProjects"
        persistKeyPrefix="dashboard-collapse-"
        defaultOpen={true}
        badge={autoRows.length > 0 ? `${autoRows.length} people` : null}
      >
        {autoRows.length > 0 ? (
          autoRows.map((row) => (
            <ContributorStatusBar
              key={row.name}
              person={row}
              jiraBaseUrl={jiraBaseUrl}
              dueByDate={dueByDate}
              showBar={false}
              showResolvedBar
              showOverdueList={false}
              showUpcomingList={false}
            />
          ))
        ) : (
          <Message info size="small">
            Select a project in Filters and refresh to see contributors here.
          </Message>
        )}
      </CollapsibleSection>

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
                  humanizeJql={humanizeJql}
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
