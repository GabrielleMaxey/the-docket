import React from "react";
import { formatPercent } from "../utils/format";

// Generic SVG chart for a { label: count } status breakdown.
// Supports two variants via the `variant` prop:
//   "pie"  (default) — existing SVG pie with legend
//   "bar"            — vertical SVG bar chart with legend

const PIE_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#64748b",
  "#ec4899",
  "#14b8a6",
];

// Consistent color per status name so the same status is always the same
// color across every chart on the page, regardless of sort order.
const STATUS_COLOR_MAP = {
  "resolved/closed/done": "#22c55e",
  "in progress": "#0ea5e9",
  "backlog": "#94a3b8",
  "ready for verification": "#8b5cf6",
  "ready for work": "#f59e0b",
  "analyzing": "#ec4899",
  "past due": "#ef4444",
  "other": "#64748b",
  "done": "#22c55e",
  "closed": "#22c55e",
  "resolved": "#22c55e",
};

const getStatusColor = (label, fallbackIndex) => {
  const key = String(label || "").toLowerCase().trim();
  return STATUS_COLOR_MAP[key] ?? PIE_COLORS[fallbackIndex % PIE_COLORS.length];
};

const polarToCartesian = (center, radius, angle) => ({
  x: center + radius * Math.cos(angle),
  y: center + radius * Math.sin(angle),
});

const describePieSlice = (center, radius, startAngle, endAngle) => {
  const start = polarToCartesian(center, radius, startAngle);
  const end = polarToCartesian(center, radius, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${center} ${center}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
};

export const buildPieData = (statusCounts) => {
  const entries = Object.entries(statusCounts || {})
    .map(([label, count]) => ({ label, count: Number(count) || 0 }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);

  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) {
    return { entries: [], total: 0, slices: [] };
  }

  let cursor = -Math.PI / 2;
  const slices = entries.map((entry, index) => {
    const fraction = entry.count / total;
    const startAngle = cursor;
    const endAngle = cursor + fraction * Math.PI * 2;
    cursor = endAngle;

    return {
      ...entry,
      color: PIE_COLORS[index % PIE_COLORS.length],
      startAngle,
      endAngle,
    };
  });

  return { entries, total, slices };
};

// ─── Vertical bar chart ───────────────────────────────────────────────────────

const CHART_H = 90;   // height of the bar area in SVG units
const LABEL_H = 24;   // height below bars for truncated labels
const BAR_W = 34;     // width of each bar
const BAR_GAP = 10;   // gap between bars

const truncate = (str, max) =>
  str.length > max ? str.slice(0, max - 1) + "\u2026" : str;

const StatusBarChart = ({ statusCounts, className = "" }) => {
  const { entries: baseEntries, total } = buildPieData(statusCounts);
  // Re-apply semantic colors for bars so each status is always the same
  // color regardless of sort order. Pie charts use the original index-based
  // rainbow colors (reverted above); bars use the semantic map.
  const entries = baseEntries.map((entry, i) => ({
    ...entry,
    color: getStatusColor(entry.label, i),
  }));

  if (total === 0) {
    return (
      <div className={`dashboard-pie-chart dashboard-pie-chart--empty ${className}`.trim()}>
        <p>No status data to chart.</p>
      </div>
    );
  }

  const n = entries.length;
  const maxCount = Math.max(...entries.map((e) => e.count));
  const svgW = n * BAR_W + (n - 1) * BAR_GAP;
  const svgH = CHART_H + LABEL_H;

  return (
    <div className={`dashboard-bar-chart ${className}`.trim()}>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ width: "100%", maxWidth: svgW, height: "auto", display: "block" }}
        role="img"
        aria-label={`Status bar chart, ${total} issues total`}
        overflow="hidden"
      >
        {entries.map(({ label, count, color }, i) => {
          const barH = maxCount > 0 ? Math.max(2, Math.round((count / maxCount) * CHART_H)) : 0;
          const x = i * (BAR_W + BAR_GAP);
          const y = CHART_H - barH;
          const pct = ((count / total) * 100).toFixed(1);

          return (
            <g key={label}>
              <rect x={x} y={y} width={BAR_W} height={barH} fill={color} rx={3}>
                <title>{`${label}: ${count} (${pct}%)`}</title>
              </rect>

              {/* Count label inside bar if tall enough, otherwise above */}
              {barH >= 18 ? (
                <text
                  x={x + BAR_W / 2}
                  y={y + 12}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#fff"
                  fontWeight="700"
                >
                  {count}
                </text>
              ) : (
                <text
                  x={x + BAR_W / 2}
                  y={y - 3}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#475569"
                >
                  {count}
                </text>
              )}

              {/* Truncated label below bar */}
              <text
                x={x + BAR_W / 2}
                y={CHART_H + 15}
                textAnchor="middle"
                fontSize="8"
                fill="#64748b"
              >
                {truncate(label, 10)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Full legend below the bars so labels aren't lost */}
      <ul className="dashboard-pie-legend">
        {entries.map(({ label, count, color }) => (
          <li key={label}>
            <span className="dashboard-pie-swatch" style={{ backgroundColor: color }} />
            <span className="dashboard-pie-legend-label">{label}</span>
            <span className="dashboard-pie-legend-value">
              {count} ({formatPercent((count / total) * 100)})
            </span>
          </li>
        ))}
        <li className="dashboard-pie-legend-total">
          <span className="dashboard-pie-swatch dashboard-pie-swatch--empty" aria-hidden="true" />
          <span className="dashboard-pie-legend-label">Total</span>
          <span className="dashboard-pie-legend-value">{total} (100%)</span>
        </li>
      </ul>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const StatusPieChart = ({ statusCounts, size = 160, className = "", variant = "pie" }) => {
  if (variant === "bar") {
    return (
      <StatusBarChart statusCounts={statusCounts} className={className} />
    );
  }

  const { total, slices } = buildPieData(statusCounts);
  const center = size / 2;
  const radius = size / 2 - 2;

  if (total === 0) {
    return (
      <div className={`dashboard-pie-chart dashboard-pie-chart--empty ${className}`.trim()}>
        <p>No status data to chart.</p>
      </div>
    );
  }

  return (
    <div className={`dashboard-pie-chart ${className}`.trim()}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Status breakdown pie chart, ${total} issues total`}
      >
        {slices.length === 1 ? (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill={slices[0].color}
            title={`${slices[0].label}: ${slices[0].count} (${formatPercent(100)})`}
          />
        ) : (
          slices.map((slice) => (
            <path
              key={slice.label}
              d={describePieSlice(center, radius, slice.startAngle, slice.endAngle)}
              fill={slice.color}
              title={`${slice.label}: ${slice.count} (${formatPercent((slice.count / total) * 100)})`}
            />
          ))
        )}
      </svg>
      <ul className="dashboard-pie-legend">
        {slices.map((slice) => (
          <li key={slice.label}>
            <span className="dashboard-pie-swatch" style={{ backgroundColor: slice.color }} />
            <span className="dashboard-pie-legend-label">{slice.label}</span>
            <span className="dashboard-pie-legend-value">
              {slice.count} ({formatPercent((slice.count / total) * 100)})
            </span>
          </li>
        ))}
        <li className="dashboard-pie-legend-total">
          <span className="dashboard-pie-swatch dashboard-pie-swatch--empty" aria-hidden="true" />
          <span className="dashboard-pie-legend-label">Total</span>
          <span className="dashboard-pie-legend-value">{total} (100%)</span>
        </li>
      </ul>
    </div>
  );
};

export default StatusPieChart;
