import React from "react";
import { buildPeriodSummary } from "../utils/dashboardMetricsUtils";

const PeriodSummary = ({ issues, dueByDate, variant = "all" }) => {
  const { pastDueCount, upcoming } = React.useMemo(
    () => buildPeriodSummary(issues, dueByDate),
    [issues, dueByDate]
  );

  const showPastDue = variant === "all" || variant === "pastDue";
  const showUpcoming = variant === "all" || variant === "upcoming";

  if (
    (showPastDue ? pastDueCount : 0) === 0 &&
    (showUpcoming ? upcoming.length : 0) === 0
  ) {
    return null;
  }

  return (
    <div className="dashboard-period-summary">
      {showPastDue && pastDueCount > 0 ? (
        <div className="dashboard-period-group">
          <span className="dashboard-period-group-label">Past due</span>
          <span className="dashboard-period-chip dashboard-period-chip--past-due">
            <strong>{pastDueCount}</strong> missed deadline
            {pastDueCount !== 1 ? "s" : ""}
          </span>
        </div>
      ) : null}
      {showUpcoming && upcoming.length > 0 ? (
        <div className="dashboard-period-group">
          <span className="dashboard-period-group-label">Upcoming</span>
          {upcoming.map(({ label, count }) => (
            <span key={label} className="dashboard-period-chip dashboard-period-chip--upcoming">
              <strong>{count}</strong> {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default PeriodSummary;
