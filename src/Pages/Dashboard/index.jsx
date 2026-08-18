import React from "react";
import { Container, Header, Message } from "semantic-ui-react";
import { useEpicFilters } from "../../context/EpicFiltersContext.jsx";
import { usePersistedState } from "../hooks/usePersistedState";
import { formatPercent, formatTimestamp } from "../../utils/format";
import {
  collapseTerminalStatusCounts,
  computeOverallTotals,
  DEFAULT_DASHBOARD_VISIBLE_SECTIONS,
  normalizeVisibleSections,
  splitDueByIssues,
  filterDueByIssuesForProject,
  getDashboardRefreshLoadingHint,
  DASHBOARD_AUTO_REFRESH_OPTIONS,
  DASHBOARD_AUTO_REFRESH_MANUAL,
  normalizeDashboardAutoRefreshInterval,
  getDashboardAutoRefreshHint,
} from "./utils/dashboardMetricsUtils";
import { formatPastDueLookbackPhrase } from "../../../shared/dashboardMetrics.mjs";
import { useDashboardRefresh } from "./hooks/useDashboardRefresh";
import CollapsibleSection from "../../Components/CollapsibleSection";
import DashboardFiltersPanel from "./components/DashboardFiltersPanel";
import DashboardTabs from "./components/DashboardTabs";
import ReportPanel from "./components/ReportPanel";
import WeeklyDigestPanel from "./components/WeeklyDigestPanel";
import OverallSummaryCard from "./components/OverallSummaryCard";
import IndividualContributorsPanel from "./components/IndividualContributorsPanel";
import ProjectMetricsSection from "./components/ProjectMetricsSection";
import PeriodSummary from "./components/PeriodSummary";
import DueByHierarchicalList from "./components/DueByHierarchicalList";
import DashboardRefreshActions from "./components/DashboardRefreshActions";
import "../dashboard.css";

const DASHBOARD_TABS = [
  { key: "project", label: "Project metrics" },
  { key: "people", label: "Individual contributors" },
  { key: "reports", label: "Reports" },
];

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

  const [autoRefreshInterval, setAutoRefreshInterval] = usePersistedState(
    "dashboard-auto-refresh-interval",
    DASHBOARD_AUTO_REFRESH_MANUAL,
    { sanitize: normalizeDashboardAutoRefreshInterval }
  );

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
    directReportWatches,
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
    autoRefreshInterval,
  });

  const [visibleSections, setVisibleSections] = usePersistedState(
    "dashboard-visible-sections",
    DEFAULT_DASHBOARD_VISIBLE_SECTIONS,
    { sanitize: normalizeVisibleSections }
  );

  const [chartVariant, setChartVariant] = usePersistedState("dashboard-chart-variant", "pie");
  const [activeProjectTab, setActiveProjectTab] = usePersistedState("dashboard-active-project-tab", "all");
  const [activeDashboardTab, setActiveDashboardTab] = usePersistedState("dashboard-active-tab", "project");

  const selectedProjectEpic = React.useMemo(() => {
    if (!activeProjectTab || activeProjectTab === "all") {
      return null;
    }
    if (activeProjectTab.startsWith("pd-")) {
      return pastDueEpics.find((epic) => `pd-${epic.id}` === activeProjectTab) || null;
    }
    return displayEpics.find((epic) => String(epic.id) === activeProjectTab) || null;
  }, [activeProjectTab, displayEpics, pastDueEpics]);
  const isSingleProjectView = Boolean(selectedProjectEpic);

  // Same card grid either way — scoped to the one selected project's own totals
  // instead of the full selection when a single project tab is active.
  const overallDisplayTotals = React.useMemo(
    () => (isSingleProjectView ? computeOverallTotals([selectedProjectEpic]) : overallTotals),
    [isSingleProjectView, selectedProjectEpic, overallTotals]
  );

  const toggleSection = React.useCallback(
    (key) => {
      setVisibleSections((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [setVisibleSections]
  );

  const dueByIssueSplit = React.useMemo(() => {
    const allIssues = Array.isArray(snapshot?.dueByIssues) ? snapshot.dueByIssues : [];
    const issues = isSingleProjectView
      ? filterDueByIssuesForProject(allIssues, selectedProjectEpic)
      : allIssues;
    return splitDueByIssues(issues);
  }, [snapshot?.dueByIssues, isSingleProjectView, selectedProjectEpic]);

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
            directReportWatches={directReportWatches}
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
          autoRefreshInterval={autoRefreshInterval}
          setAutoRefreshInterval={setAutoRefreshInterval}
        />
      </CollapsibleSection>

      {projectFiltersStale && hasEpicScope ? (
        <Message info>
          Project filters changed — click <strong>Refresh projects</strong> in Project Metrics or{" "}
          <strong>Refresh status</strong> above to update.
        </Message>
      ) : null}
      {contributorFiltersStale ? (
        <Message info>
          Contributor selection changed — click <strong>Refresh contributors</strong> in
          Individual Contributors or <strong>Refresh status</strong> above to update.
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
          <DashboardTabs
            tabs={DASHBOARD_TABS}
            activeTab={activeDashboardTab}
            onChange={setActiveDashboardTab}
          />

          {activeDashboardTab === "project" ? (
            <div className="dashboard-tab-panel">
              {visibleSections.overall && showOverall ? (
                <CollapsibleSection
                  title="Overall Status"
                  subtitle={
                    isSingleProjectView
                      ? `High-level health for ${selectedProjectEpic.label}: resolved, in-progress, complete, and overdue percentages.`
                      : "High-level health across selected projects: resolved, in-progress, complete, and overdue percentages."
                  }
                  storageKey="overall"
                  persistKeyPrefix="dashboard-collapse-"
                  className="app-collapsible--spaced"
                  badge={`${formatPercent(overallDisplayTotals.issuePercent)} resolved`}
                >
                  <div className="dashboard-overall-grid">
                    <OverallSummaryCard
                      label="Tasks resolved"
                      description={
                        isSingleProjectView
                          ? "Percentage of tasks in this project that are closed, done, or resolved."
                          : "Percentage of all tasks across selected projects that are closed, done, or resolved."
                      }
                      percent={overallDisplayTotals.issuePercent}
                      numerator={overallDisplayTotals.resolvedIssues}
                      denominator={overallDisplayTotals.totalIssues}
                      tone="blue"
                    />
                    <OverallSummaryCard
                      label="Tasks in progress"
                      description="Percentage of all tasks currently being actively worked on."
                      percent={
                        overallDisplayTotals.totalIssues > 0
                          ? (overallDisplayTotals.inProgressIssues / overallDisplayTotals.totalIssues) * 100
                          : 0
                      }
                      numerator={overallDisplayTotals.inProgressIssues}
                      denominator={overallDisplayTotals.totalIssues}
                      tone="orange"
                    />
                    <OverallSummaryCard
                      label="Tasks in backlog"
                      description={
                        isSingleProjectView
                          ? "Percentage of tasks in this project that are in backlog."
                          : "Percentage of all tasks across selected projects that are in backlog."
                      }
                      percent={
                        overallDisplayTotals.totalIssues > 0
                          ? (overallDisplayTotals.backlogIssues / overallDisplayTotals.totalIssues) * 100
                          : 0
                      }
                      numerator={overallDisplayTotals.backlogIssues}
                      denominator={overallDisplayTotals.totalIssues}
                      tone="gray"
                    />
                    {overallDisplayTotals.epicCount > 0 ? (
                      <OverallSummaryCard
                        label="Projects complete"
                        description="Percentage of epics with Initial Done Date or Most Recent Done Date set (MRD/IDD)."
                        percent={overallDisplayTotals.epicPercent}
                        numerator={overallDisplayTotals.completeEpics}
                        denominator={overallDisplayTotals.epicCount}
                        tone="teal"
                      />
                    ) : null}
                    <OverallSummaryCard
                      label="Open tasks overdue"
                      description="Percentage of currently open tasks that have passed their target completion date."
                      percent={overallDisplayTotals.overduePercent}
                      numerator={overallDisplayTotals.overdueOpenIssues}
                      denominator={overallDisplayTotals.openIssues}
                      warning={overallDisplayTotals.overduePercent > 0}
                    />
                  </div>
                  {overallDisplayTotals.totalIssues > 0 ? (
                    <div className="dashboard-summary-chips">
                      <div className="dashboard-summary-chip">
                        <span className="dashboard-summary-chip-value">{overallDisplayTotals.totalIssues}</span>
                        <span className="dashboard-summary-chip-label">issues</span>
                      </div>
                      <div className="dashboard-summary-chip dashboard-summary-chip--overdue">
                        <span className="dashboard-summary-chip-value">{overallDisplayTotals.overdueOpenIssues}</span>
                        <span className="dashboard-summary-chip-label">overdue</span>
                      </div>
                      <div className="dashboard-summary-chip dashboard-summary-chip--resolved">
                        <span className="dashboard-summary-chip-value">{overallDisplayTotals.resolvedIssues}</span>
                        <span className="dashboard-summary-chip-label">resolved</span>
                      </div>
                      <div className="dashboard-summary-chip dashboard-summary-chip--backlog">
                        <span className="dashboard-summary-chip-value">{overallDisplayTotals.backlogIssues}</span>
                        <span className="dashboard-summary-chip-label">backlog</span>
                      </div>
                    </div>
                  ) : null}
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
                        : "Select at least one saved project preset in Filters."
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
                      ? `Missed deadlines within the past ${formatPastDueLookbackPhrase(snapshot.pastDueLookbackYears)} lookback.`
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
            </div>
          ) : null}

          {activeDashboardTab === "people" ? (
            <div className="dashboard-tab-panel">
              {visibleSections.overdue ? (
                <IndividualContributorsPanel
                  displayEpics={displayEpics}
                  assigneeMetrics={assigneeMetrics}
                  jiraBaseUrl={jiraBaseUrl}
                  chartVariant={chartVariant}
                  dueByDate={snapshot.dueByDate}
                  handleRefreshContributors={handleRefreshContributors}
                  handleCancelRefresh={handleCancelRefresh}
                  contributorsRefreshLoading={contributorsRefreshLoading}
                  canSubmitContributors={canSubmitContributors}
                  hasContributorScope={hasContributorScope}
                />
              ) : (
                <Message info size="small">
                  Contributor Metrics is turned off — enable it under Filters → Views to see this
                  tab.
                </Message>
              )}
            </div>
          ) : null}

          {activeDashboardTab === "reports" ? (
            <div className="dashboard-tab-panel">
              {visibleSections.report ? (
                <>
                  <ReportPanel
                    hasSnapshot={Boolean(snapshot)}
                    overallStatusCounts={collapseTerminalStatusCounts(snapshot?.statusCounts)}
                    chartVariant={chartVariant}
                    epics={displayEpics}
                    assignees={assigneeMetrics}
                    directReportWatches={directReportWatches}
                    jiraBaseUrl={jiraBaseUrl}
                    dueByDate={snapshot?.dueByDate}
                  />
                  <WeeklyDigestPanel hasSnapshot={Boolean(snapshot)} />
                </>
              ) : (
                <Message info size="small">
                  Report is turned off — enable it under Filters → Views to see this tab.
                </Message>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </Container>
  );
};

export default Dashboard;
