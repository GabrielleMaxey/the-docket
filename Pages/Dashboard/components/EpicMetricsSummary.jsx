import React from "react";
import StatusPieChart from "../../../Components/StatusPieChart";
import { buildEpicPieStatusCounts, sumEpicMetrics } from "../utils/dashboardMetricsUtils";

const EpicMetricsSummary = ({ epics, chartVariant }) => {
  const totals = React.useMemo(() => sumEpicMetrics(epics), [epics]);

  return (
    <div className="dashboard-epic-metrics-summary">
      <div className="dashboard-epic-metrics-totals">
        <p className="dashboard-epic-metrics-total-line">
          <strong>Total issues:</strong> {totals.totalIssues}
        </p>
        <p className="dashboard-assignee-meta">
          {totals.resolvedIssues} resolved · {totals.openIssues} open · {totals.inProgress} in progress
          · {totals.readyForVerification} ready for verification
        </p>
      </div>
      <StatusPieChart statusCounts={buildEpicPieStatusCounts(totals)} size={150} variant={chartVariant} />
    </div>
  );
};

export default EpicMetricsSummary;
