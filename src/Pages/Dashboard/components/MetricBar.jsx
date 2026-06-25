import { formatPercent } from "../../../utils/format";

const STATUS_BAR_COLOR_MAP = {
  "resolved / closed / done": "#22c55e",
  "resolved/closed/done": "#22c55e",
  "in progress": "#0ea5e9",
  backlog: "#94a3b8",
  "ready for verification": "#8b5cf6",
  "ready for work": "#f59e0b",
  analyzing: "#ec4899",
  "past due (of open)": "#ef4444",
  "past due": "#ef4444",
  "open tasks overdue": "#ef4444",
  other: "#64748b",
};

const getMetricBarColor = (label) => {
  const key = String(label || "").toLowerCase().trim();
  return STATUS_BAR_COLOR_MAP[key] || null;
};

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
