import StatusPieChart from "../../../Components/StatusPieChart";
import MetricBar from "./MetricBar";

const hasCountData = (counts) =>
  counts && Object.values(counts).some((value) => Number(value) > 0);

const ReportDiagrams = ({
  statusCounts,
  chartVariant = "pie",
  progressBars = [],
  personBars = [],
  personTitle = "By person",
}) => {
  const showStatus = hasCountData(statusCounts);
  const showProgress = progressBars.some((row) => row && (row.value != null || row.count != null));
  const showPeople = personBars.length > 0;
  if (!showStatus && !showProgress && !showPeople) {
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
    </div>
  );
};

export default ReportDiagrams;
