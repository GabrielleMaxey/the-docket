import { formatPercent } from "../../../utils/format";
import { getMappedStatusColor } from "../../../utils/statusScale";

const getMetricBarColor = (label) => getMappedStatusColor(label);

const MetricBar = ({ label, value, count }) => {
  const barColor = getMetricBarColor(label);
  return (
    <div className="dashboard-metric-row">
      <div className="dashboard-metric-label">
        <span>{label}</span>
        <span>
          {count != null ? <span className="dashboard-metric-count">{count} · </span> : null}
          <strong>{formatPercent(value)}</strong>
        </span>
      </div>
      <div className="dashboard-progress" aria-hidden="true">
        <div
          className="dashboard-progress-fill"
          style={{
            width: `${Math.min(100, Math.max(0, Number(value) || 0))}%`,
            ...(barColor ? { background: barColor } : {}),
          }}
        />
      </div>
    </div>
  );
};

export default MetricBar;
