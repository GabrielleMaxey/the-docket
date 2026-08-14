import { formatPercent } from "../../../utils/format";

// tone: "blue" | "orange" | "teal" — ignored when warning is true, since the
// warning state always renders in the reserved alarm colour.
const OverallSummaryCard = ({
  label,
  description,
  percent,
  numerator,
  denominator,
  warning,
  tone = "blue",
}) => (
  <div
    className={`dashboard-stat-card${
      warning ? " dashboard-stat-card--warning" : ` dashboard-stat-card--${tone}`
    }`}
  >
    <div className="dashboard-stat-label">{label}</div>
    <div className="dashboard-stat-value">{formatPercent(percent)}</div>
    <div className="dashboard-overall-progress" aria-hidden="true">
      <div
        className={`dashboard-overall-progress-fill${
          warning ? " dashboard-overall-progress-fill--warning" : ` dashboard-overall-progress-fill--${tone}`
        }`}
        style={{ width: `${Math.min(100, Math.max(0, Number(percent) || 0))}%` }}
      />
    </div>
    <div className="dashboard-stat-description">{description}</div>
    {denominator > 0 ? (
      <div className="dashboard-stat-detail">
        {numerator} of {denominator}
      </div>
    ) : null}
  </div>
);

export default OverallSummaryCard;
