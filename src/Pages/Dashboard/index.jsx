import React from "react";
import { Container, Header, Message } from "semantic-ui-react";
import { useEpicFilters } from "../../context/EpicFiltersContext.jsx";
import { usePersistedState } from "../hooks/usePersistedState";
import { formatPercent, formatTimestamp } from "../../utils/format";
import {
  collapseTerminalStatusCounts,
  DEFAULT_DASHBOARD_VISIBLE_SECTIONS,
  normalizeVisibleSections,
  splitDueByIssues,
  getDashboardRefreshLoadingHint,
} from "./utils/dashboardMetricsUtils";
import { useDashboardRefresh } from "./hooks/useDashboardRefresh";
import CollapsibleSection from "../../Components/CollapsibleSection";
import DashboardFiltersPanel from "./components/DashboardFiltersPanel";
import ReportPanel from "./components/ReportPanel";
import WeeklyDigestPanel from "./components/WeeklyDigestPanel";
import OverallSummaryCard from "./components/OverallSummaryCard";
import AssigneeMetricCard from "./components/AssigneeMetricCard";
import JqlContributorMetricCard from "./components/JqlContributorMetricCard";
import ProjectMetricsSection from "./components/ProjectMetricsSection";
import PeriodSummary from "./components/PeriodSummary";
import DueByHierarchicalList from "./components/DueByHierarchicalList";
import DashboardRefreshActions from "./components/DashboardRefreshActions";
import "../dashboard.css";

const Dashboard = () => {
  const {
    presets,
    loading: epicPresetsLoading,
    error: epicPresetsError,
    selectedPresetIds,
    includePastDue,
    setIncludePastDue,
    selectAll,
    clearSelection,
    setSelectedPresetIds,
  } = useEpicFilters();

  const {
    snapshot,
    metricsLoading,
    refreshLoading,
    projectsRefreshLoading,
    contributorsRefreshLoading,
    refreshError,
    jiraBaseUrl,
    assigneeNames,
    setAssigneeNames,
    selectedWatchedIds,
    setSelectedWatchedIds,
    assigneeInput,
    setAssigneeInput,
    dueByDate,
    setDueByDate,
    dueByField,
    setDueByField,
    pastDueLookbackYears,
    setPastDueLookbackYears,
    refreshFlash,
    projectFiltersStale,
    contributorFiltersStale,
    handleRefresh,
    handleRefreshProjects,
    handleRefreshContributors,
    handleCancelRefresh,
    handleAddAssignee,
    handleRemoveAssignee,
    handleToggleWatched,
    personWatches,
    jqlWatches,
    displayEpics,
    pastDueEpics,
    assigneeMetrics,
    showOverall,
    hasEpicScope,
    hasContributorScope,
    canSubmit,
    canSubmitProjects,
    canSubmitContributors,
    epicNameByKey,
    overallTotals,
  } = useDashboardRefresh({
    selectedPresetIds,
    includePastDue,
    setSelectedPresetIds,
    setIncludePastDue,
  });

  const [visibleSections, setVisibleSections] = usePersistedState(
    "dashboard-visible-sections",
    DEFAULT_DASHBOARD_VISIBLE_SECTIONS,
    { sanitize: normalizeVisibleSections }
  );

  const [chartVariant, setChartVariant] = usePersistedState("dashboard-chart-variant", "pie");
  const [activeProjectTab, setActiveProjectTab] = usePersistedState("dashboard-active-project-tab", "all");

  const toggleSection = React.useCallback(
    (key) => {
      setVisibleSections((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [setVisibleSections]
  );

  const dueByIssueSplit = React.useMemo(() => {
    const issues = Array.isArray(snapshot?.dueByIssues) ? snapshot.dueByIssues : [];
    return splitDueByIssues(issues);
  }, [snapshot?.dueByIssues]);

  return (
    <Container className="dashboard-page">
      <Header as="h1">Project Metrics</Header>
      <p className="dashboard-config-subtitle">
        Configure which projects to pull from Jira, which views to show, and which people
        to include in workload and deadline tracking.
      </p>
      {snapshot?.refreshedAt ? (
        <p className="dashboard-last-updated">
          Last updated: {formatTimestamp(snapshot.refreshedAt)}
        </p>
      ) : null}

      <CollapsibleSection
        title="Filters &amp; Settings"
        subtitle="Choose projects, due-date views, and people — then refresh status."
        storageKey="dashboard-input-open"
        defaultOpen={true}
        className="app-collapsible--input"
      >
        <DashboardFiltersPanel
            presets={presets}
            epicPresetsLoading={epicPresetsLoading}
            epicPresetsError={epicPresetsError}
            refreshError={refreshError}
            selectedPresetIds={selectedPresetIds}
            includePastDue={includePastDue}
            setSelectedPresetIds={setSelectedPresetIds}
            selectAll={selectAll}
            clearSelection={clearSelection}
            setIncludePastDue={setIncludePastDue}
            personWatches={personWatches}
            jqlWatches={jqlWatches}
            selectedWatchedIds={selectedWatchedIds}
            setSelectedWatchedIds={setSelectedWatchedIds}
            setAssigneeNames={setAssigneeNames}
            assigneeInput={assigneeInput}
            setAssigneeInput={setAssigneeInput}
            handleAddAssignee={handleAddAssignee}
            handleRemoveAssignee={handleRemoveAssignee}
            handleToggleWatched={handleToggleWatched}
            assigneeNames={assigneeNames}
            dueByDate={dueByDate}
            setDueByDate={setDueByDate}
            dueByField={dueByField}
            setDueByField={setDueByField}
            pastDueLookbackYears={pastDueLookbackYears}
            setPastDueLookbackYears={setPastDueLookbackYears}
            setVisibleSections={setVisibleSections}
            visibleSections={visibleSections}
            toggleSection={toggleSection}
            chartVariant={chartVariant}
            setChartVariant={setChartVariant}
            handleRefresh={handleRefresh}
            handleCancelRefresh={handleCancelRefresh}
            refreshLoading={refreshLoading}
            canSubmit={canSubmit}
            hasEpicScope={hasEpicScope}
            hasContributorScope={hasContributorScope}
          refreshFlash={refreshFlash}
        />
      </CollapsibleSection>

      {visibleSections.report && snapshot ? (
        <CollapsibleSection
          title="Generate Report"
          subtitle="Create Executive, Project Manager, or Developer summaries from the current snapshot."
          storageKey="report"
          persistKeyPrefix="dashboard-collapse-"
          defaultOpen={false}
          className="app-collapsible--spaced"
        >
          <ReportPanel
            hasSnapshot={Boolean(snapshot)}
            overallStatusCounts={collapseTerminalStatusCounts(snapshot?.statusCounts)}
            chartVariant={chartVariant}
            epics={displayEpics}
          />
          <WeeklyDigestPanel hasSnapshot={Boolean(snapshot)} />
        </CollapsibleSection>
      ) : null}

      {projectFiltersStale && hasEpicScope ? (
        <Message info>
          Project filters changed — click <strong>Refresh projects</strong> in Project Metrics or{" "}
          <strong>Refresh status</strong> above to update.
        </Message>
      ) : null}
      {contributorFiltersStale ? (
        <Message info>
          Contributor selection changed — click <strong>Refresh contributors</strong> in Individual
          Contributor Metrics or <strong>Refresh status</strong> above to update.
        </Message>
      ) : null}
      {refreshError ? (
        <Message negative>{refreshError}</Message>
      ) : null}
      {metricsLoading && !snapshot ? <Message info>Loading stored metrics...</Message> : null}
      {!metricsLoading && !snapshot ? (
        <Message warning>
          No dashboard snapshot yet. Select filters above and click Submit to pull metrics from
          Jira.
        </Message>
      ) : null}

      {snapshot ? (
        <>
          {visibleSections.overall && showOverall ? (
            <CollapsibleSection
              title="Overall Status"
              subtitle="High-level health across selected projects: resolved, in-progress, complete, and overdue percentages."
              storageKey="overall"
              persistKeyPrefix="dashboard-collapse-"
              className="app-collapsible--spaced"
              badge={`${formatPercent(snapshot.overallIssuePercent)} resolved`}
            >
              <div className="dashboard-overall-grid">
                <OverallSummaryCard
                  label="Tasks resolved"
                  description="Percentage of all tasks across selected projects that are closed, done, or resolved."
                  percent={snapshot.overallIssuePercent}
                  numerator={overallTotals.resolvedIssues}
                  denominator={overallTotals.totalIssues}
                />
                <OverallSummaryCard
                  label="Tasks in progress"
                  description="Percentage of all tasks currently being actively worked on."
                  percent={
                    overallTotals.totalIssues > 0
                      ? (overallTotals.inProgressIssues / overallTotals.totalIssues) * 100
                      : 0
                  }
                  numerator={overallTotals.inProgressIssues}
                  denominator={overallTotals.totalIssues}
                />
                {overallTotals.epicCount > 0 ? (
                  <OverallSummaryCard
                    label="Projects complete"
                    description="Percentage of epics with Initial Done Date or Most Recent Done Date set (MRD/IDD)."
                    percent={snapshot.overallEpicPercent}
                    numerator={overallTotals.completeEpics}
                    denominator={overallTotals.epicCount}
                  />
                ) : null}
                <OverallSummaryCard
                  label="Open tasks overdue"
                  description="Percentage of currently open tasks that have passed their target completion date."
                  percent={snapshot.overallOverduePercent}
                  numerator={overallTotals.overdueOpenIssues}
                  denominator={overallTotals.openIssues}
                  warning={snapshot.overallOverduePercent > 0}
                />
              </div>
            </CollapsibleSection>
          ) : null}

          {visibleSections.epicMetrics && displayEpics.length > 0 ? (
            <CollapsibleSection
              title="Project Metrics"
              subtitle="Project-by-project breakdown with tabs, status distribution, deadlines, and contributor-level metrics."
              storageKey="epicMetrics"
              persistKeyPrefix="dashboard-collapse-"
              className="app-collapsible--spaced"
              badge={`${displayEpics.length} project${displayEpics.length !== 1 ? "s" : ""}`}
            >
              <DashboardRefreshActions
                onRefresh={handleRefreshProjects}
                onCancel={handleCancelRefresh}
                loading={projectsRefreshLoading}
                canSubmit={canSubmitProjects}
                submitLabel="Refresh projects"
                loadingHint={getDashboardRefreshLoadingHint("projects")}
                hint={
                  hasEpicScope
                    ? "Updates project cards and per-project contributor metrics from Jira."
                    : "Select at least one project preset or enable Past Due Projects in Filters."
                }
              />
              <ProjectMetricsSection
                snapshot={snapshot}
                displayEpics={displayEpics}
                pastDueEpics={pastDueEpics}
                activeProjectTab={activeProjectTab}
                setActiveProjectTab={setActiveProjectTab}
                jiraBaseUrl={jiraBaseUrl}
                dueByDate={dueByDate}
                chartVariant={chartVariant}
              />
            </CollapsibleSection>
          ) : null}

          {visibleSections.dueByUpcoming && snapshot.dueByDate ? (
            <CollapsibleSection
              title={`Upcoming due through ${snapshot.dueByDate}`}
              subtitle="Open tasks with due dates from today through the selected cutoff."
              storageKey="dueByUpcoming"
              persistKeyPrefix="dashboard-collapse-"
              className="app-collapsible--spaced app-collapsible--due-upcoming"
              defaultOpen={false}
              badge={
                dueByIssueSplit.upcoming.length > 0
                  ? `${dueByIssueSplit.upcoming.length} task${dueByIssueSplit.upcoming.length !== 1 ? "s" : ""}`
                  : "0 tasks"
              }
            >
              {dueByIssueSplit.upcoming.length > 0 ? (
                <>
                  <PeriodSummary
                    issues={dueByIssueSplit.upcoming}
                    dueByDate={snapshot.dueByDate}
                    variant="upcoming"
                  />
                  <DueByHierarchicalList
                    issues={dueByIssueSplit.upcoming}
                    epicNameByKey={epicNameByKey}
                    jiraBaseUrl={jiraBaseUrl}
                    showTimingBadge={false}
                  />
                  {dueByIssueSplit.upcoming.length >= 200 ? (
                    <p style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.5rem" }}>
                      Results capped at 200. Narrow your date range to see all.
                    </p>
                  ) : null}
                </>
              ) : (
                <Message info size="small">
                  No upcoming tasks due through {snapshot.dueByDate}.
                  {!snapshot.includePastDue && dueByIssueSplit.pastDue.length > 0 ? (
                    <>
                      {" "}
                      Some tasks appear past-due from a previous snapshot — click{" "}
                      <strong>Refresh status</strong> to update.
                    </>
                  ) : null}
                  {snapshot.includePastDue && dueByIssueSplit.pastDue.length > 0 ? (
                    <>
                      {" "}
                      {dueByIssueSplit.pastDue.length} past-due task
                      {dueByIssueSplit.pastDue.length !== 1 ? "s are" : " is"} in the lookback —
                      visible in the <strong>Past Due in lookback</strong> section below.
                    </>
                  ) : null}
                </Message>
              )}
            </CollapsibleSection>
          ) : null}

          {visibleSections.dueByPastDue && snapshot.dueByDate ? (
            <CollapsibleSection
              title="Past due in lookback"
              subtitle={
                snapshot.includePastDue
                  ? `Missed deadlines within the past ${snapshot.pastDueLookbackYears || 1} year lookback.`
                  : "Enable Also include → Past Due Projects and refresh to populate this list."
              }
              storageKey="dueByPastDue"
              persistKeyPrefix="dashboard-collapse-"
              className="app-collapsible--spaced app-collapsible--due-past-due"
              defaultOpen={false}
              badge={
                dueByIssueSplit.pastDue.length > 0
                  ? `${dueByIssueSplit.pastDue.length} task${dueByIssueSplit.pastDue.length !== 1 ? "s" : ""}`
                  : "0 tasks"
              }
            >
              {dueByIssueSplit.pastDue.length > 0 ? (
                <>
                  <PeriodSummary
                    issues={dueByIssueSplit.pastDue}
                    dueByDate={snapshot.dueByDate}
                    variant="pastDue"
                  />
                  <DueByHierarchicalList
                    issues={dueByIssueSplit.pastDue}
                    epicNameByKey={epicNameByKey}
                    jiraBaseUrl={jiraBaseUrl}
                    showTimingBadge={false}
                  />
                </>
              ) : (
                <Message info size="small">
                  {snapshot.includePastDue
                    ? "No past due tasks in the current lookback window."
                    : "Past due rows are included only when Past Due Projects is enabled under Also include."}
                </Message>
              )}
            </CollapsibleSection>
          ) : null}

          {visibleSections.overdue &&
          (assigneeMetrics.length > 0 ||
            assigneeNames.length > 0 ||
            selectedWatchedIds.length > 0) ? (
            <CollapsibleSection
              title="Individual Contributor Metrics"
              subtitle="Per-person workload and overdue performance for your selected people and custom queries."
              storageKey="overdue"
              persistKeyPrefix="dashboard-collapse-"
              className="app-collapsible--spaced"
              defaultOpen={true}
              badge={
                assigneeMetrics.length > 0
                  ? `${assigneeMetrics.length} tracked`
                  : "Refresh to load"
              }
            >
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
                        dueByDate={snapshot.dueByDate}
                      />
                    ) : (
                      <AssigneeMetricCard
                        key={person.id}
                        person={person}
                        jiraBaseUrl={jiraBaseUrl}
                        chartVariant={chartVariant}
                        dueByDate={snapshot.dueByDate}
                      />
                    )
                  )}
                </div>
              ) : (
                <Message info size="small">
                  People are selected above — click <strong>Refresh contributors</strong> to load their
                  full workload metrics (person watches use all assigned Jira issues).
                </Message>
              )}
            </CollapsibleSection>
          ) : null}
        </>
      ) : null}
    </Container>
  );
};

export default Dashboard;
