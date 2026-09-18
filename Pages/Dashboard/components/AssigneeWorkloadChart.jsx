import StatusPieChart from "../../../Components/StatusPieChart";
import { workloadCountsToPieData } from "../utils/dashboardMetricsUtils";

const AssigneeWorkloadChart = ({ workloadCounts, chartVariant = "pie", size = 160 }) => {
  const statusCounts = workloadCountsToPieData(workloadCounts);
  const hasData = Object.values(statusCounts).some((count) => Number(count) > 0);
  if (!hasData) {
    return null;
  }

  return (
    <div className="dashboard-epic-status-breakdown dashboard-assignee-status-breakdown">
      <StatusPieChart
        statusCounts={statusCounts}
        size={size}
        className="dashboard-pie-chart--compact"
        variant={chartVariant}
      />
    </div>
  );
};

export default AssigneeWorkloadChart;
