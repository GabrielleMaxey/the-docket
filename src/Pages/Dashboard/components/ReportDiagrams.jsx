import StatusPieChart from "../../../Components/StatusPieChart";
import MetricBar from "./MetricBar";
import ContributorStatusBar, { CONTRIBUTOR_STATUS_LEGEND } from "./ContributorStatusBar";

const hasCountData = (counts) =>
  counts && Object.values(counts).some((value) => Number(value) > 0);

const ReportDiagrams = ({
  statusCounts,
  chartVariant = "pie",
  progressBars = [],
  personBars = [],
  personTitle = "By person",
  contributorRows = [],
  contributorRowsTitle = "Individual contributor metrics",
}) => {
  const showStatus = hasCountData(statusCounts);
  const showProgress = progressBars.some((row) => row && (row.value != null || row.count != null));
  const showPeople = personBars.length > 0;
  const visibleContributorRows = contributorRows.filter((row) => Number(row?.totalIssues || 0) > 0);
  const showContributors = visibleContributorRows.length > 0;
  if (!showStatus && !showProgress && !showPeople && !showContributors) {
    return null;
  }

  return (
    <div className="app-report-diagrams">
      {showStatus ? (
        <div className="app-report-diagram">
          <p className="app-report-chart-label">Issue status</p>
          <StatusPieChart statusCounts={statusCounts} size={140} variant={chartVariant} />
        </div>
      ) : null}
      {showProgress ? (
        <div className="app-report-diagram">
          <p className="app-report-chart-label">Delivery</p>
          {progressBars.map((row) => (
            <MetricBar
              key={row.label}
              label={row.label}
              value={row.value}
              count={row.count}
            />
          ))}
        </div>
      ) : null}
      {showPeople ? (
        <div className="app-report-diagram">
          <p className="app-report-chart-label">{personTitle}</p>
          {personBars.map((row) => (
            <MetricBar
              key={row.name}
              label={row.name}
              value={row.value}
              count={row.count}
            />
          ))}
        </div>
      ) : null}
      {showContributors ? (
        <div className="app-report-diagram">
          <div className="app-report-contributor-legend-row">
            <p className="app-report-chart-label" style={{ margin: 0 }}>
              {contributorRowsTitle}
            </p>
            <div className="app-report-contributor-legend">
              {CONTRIBUTOR_STATUS_LEGEND.map((item) => (
                <span key={item.label} className="app-report-contributor-legend-item">
                  <span
                    className="app-report-contributor-legend-swatch"
                    style={{ background: item.color }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          {visibleContributorRows.map((row) => (
            <ContributorStatusBar key={row.name} person={row} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default ReportDiagrams;
