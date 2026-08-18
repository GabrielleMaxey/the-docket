import { Button, Message } from "semantic-ui-react";
import ReportOutput from "../../../Components/ReportOutput";
import { AUDIENCE_OPTIONS, useReportGeneration } from "../hooks/useReportGeneration";
import ReportDiagrams from "./ReportDiagrams";
import {
  buildPersonProgressBars,
  rollupEpicContributorPeople,
  sumEpicMetrics,
  sumWorkloadCounts,
  workloadCountsToPieData,
} from "../utils/dashboardMetricsUtils";
import { isJqlCurrentUser, looksLikeAccountId } from "../../../../shared/directReportsJql.mjs";

const isDirectReportAssignee = (person) =>
  person?.queryType === "direct_reports" ||
  (person?.queryType === "person" && Boolean(String(person?.jql || "").trim()));

const ReportPanel = ({
  hasSnapshot,
  overallStatusCounts,
  chartVariant,
  epics = [],
  assignees = [],
  directReportWatches = [],
}) => {
  const {
    audience,
    setAudience,
    loading,
    report,
    reportStatusCounts,
    reportChartVariant,
    error,
    copied,
    selectedEpicIds,
    allProjectsSelected,
    additionalContext,
    setAdditionalContext,
    selectedOption,
    scopedStatusCounts,
    handleGenerate,
    handleClearReport,
    handleCopy,
    handleDownload,
    toggleEpicSelection,
    selectAllEpics,
  } = useReportGeneration({ epics, overallStatusCounts, chartVariant, assignees });

  const isAdhocTeam = audience === "direct_reports";
  const teamPeople = assignees.filter(
    (person) =>
      isDirectReportAssignee(person) &&
      !isJqlCurrentUser(person.resolvedDisplayName || person.queryName) &&
      !looksLikeAccountId(person.resolvedDisplayName || person.queryName)
  );
  const hasTeamPeople = teamPeople.length > 0;
  const teamWorkload = sumWorkloadCounts(teamPeople);
  const teamStatusCounts = isAdhocTeam ? workloadCountsToPieData(teamWorkload) : null;
  const chartCounts = reportStatusCounts || (isAdhocTeam ? teamStatusCounts : scopedStatusCounts);
  const scopedEpics =
    selectedEpicIds.length > 0
      ? epics.filter((epic) => selectedEpicIds.includes(epic.epicPresetId))
      : epics;
  const projectRollup = sumEpicMetrics(scopedEpics);
  const progressBars = isAdhocTeam
    ? []
    : [
        scopedEpics.length > 0
          ? {
              label: "Projects complete",
              value:
                scopedEpics.reduce((sum, epic) => sum + Number(epic.epicPercent || 0), 0) /
                scopedEpics.length,
            }
          : null,
        {
          label: "Open tasks past due",
          value:
            scopedEpics.length > 0
              ? scopedEpics.reduce((sum, epic) => sum + Number(epic.overduePercent || 0), 0) /
                scopedEpics.length
              : projectRollup.openIssues > 0
                ? (projectRollup.overdueOpenIssues / projectRollup.openIssues) * 100
                : 0,
        },
      ].filter(Boolean);
  const isDeveloper = audience === "developer";
  const personRows = buildPersonProgressBars(isAdhocTeam ? teamPeople : []);
  const personBars = personRows.map((row) => ({
    name: row.name,
    value: row.resolution,
    count: `${row.resolved}/${row.total}`,
  }));
  const personTitle = "Resolution by person";
  // Developer report gets a per-contributor breakdown across every status (not just
  // overdue), derived straight from the projects already selected above — same
  // contributorMetrics the epic cards already compute, no separate roster to pick.
  const contributorRows = isDeveloper ? rollupEpicContributorPeople(scopedEpics) : [];
  const canGenerate = hasSnapshot && (!isAdhocTeam || (directReportWatches.length > 0 && hasTeamPeople));

  return (
    <div className="app-report-panel dashboard-report-panel">
      <div className="dashboard-report-controls">
        {epics.length > 1 && !isAdhocTeam ? (
          <div>
            <p className="dashboard-report-context-label">Projects in this report</p>
            <p className="dashboard-report-context-hint">
              Same list as Project Metrics. Click one JQL to report on it alone, or click more to
              include several.
            </p>
            <div className="dashboard-project-tabs">
              <button
                type="button"
                className={`dashboard-project-tab${allProjectsSelected ? " is-active" : ""}`}
                onClick={selectAllEpics}
              >
                <span className="dashboard-project-tab-name">View All</span>
                <span className="dashboard-project-tab-stat">
                  {epics.length} project{epics.length === 1 ? "" : "s"}
                </span>
              </button>
              {epics.map((epic) => {
                const eid = epic.epicPresetId;
                const active = allProjectsSelected || selectedEpicIds.includes(eid);
                return (
                  <button
                    key={epic.id ?? eid}
                    type="button"
                    className={`dashboard-project-tab${active && !allProjectsSelected ? " is-active" : ""}`}
                    onClick={() => toggleEpicSelection(eid)}
                  >
                    <span className="dashboard-project-tab-name">{epic.label}</span>
                    <span className="dashboard-project-tab-stat">
                      {Math.round(epic.issuePercent ?? 0)}% resolved
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="dashboard-report-audience-grid">
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`dashboard-report-audience-btn${
                audience === opt.value ? " dashboard-report-audience-btn--active" : ""
              }`}
              onClick={() => setAudience(opt.value)}
            >
              <span className="dashboard-report-audience-label">{opt.label}</span>
              <span className="dashboard-report-audience-desc">{opt.description}</span>
            </button>
          ))}
        </div>

        <div className="dashboard-report-context-block">
          <label htmlFor="dashboard-report-context" className="dashboard-report-context-label">
            Additional context (optional)
          </label>
          <p className="dashboard-report-context-hint">
            Add priorities, known blockers, stakeholder concerns, or tone guidance for this report.
          </p>
          <textarea
            id="dashboard-report-context"
            className="dashboard-report-context-input"
            rows={3}
            value={additionalContext}
            onChange={(event) => setAdditionalContext(event.target.value)}
            placeholder="Example: Emphasize deadline risks for leadership and call out any dependencies on Platform team approvals."
          />
        </div>

        <div className="dashboard-report-generate-row">
          <Button
            primary
            onClick={handleGenerate}
            loading={loading}
            disabled={loading || !canGenerate}
          >
            Generate {selectedOption?.label || "Report"}
          </Button>
          {!hasSnapshot ? (
            <span className="dashboard-due-by-hint">
              Run a Dashboard refresh first so there is data to report on.
            </span>
          ) : null}
          {hasSnapshot && isAdhocTeam && directReportWatches.length === 0 ? (
            <span className="dashboard-due-by-hint">
              Save a query in Settings → My Direct Reports first.
            </span>
          ) : null}
          {hasSnapshot && isAdhocTeam && directReportWatches.length > 0 && !hasTeamPeople ? (
            <span className="dashboard-due-by-hint">
              Select My Direct Reports under Contributor Metrics, then click Refresh contributors.
            </span>
          ) : null}
        </div>
      </div>

      {error ? <Message negative size="small">{error}</Message> : null}

      <ReportOutput
        report={report}
        copied={copied}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onClear={report ? handleClearReport : undefined}
        chartSlot={
          <ReportDiagrams
            statusCounts={chartCounts}
            chartVariant={reportChartVariant || chartVariant}
            progressBars={progressBars}
            personBars={personBars}
            personTitle={personTitle}
            contributorRows={contributorRows}
          />
        }
      />
    </div>
  );
};

export default ReportPanel;
