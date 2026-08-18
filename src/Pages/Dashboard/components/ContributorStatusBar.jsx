import { Link } from "react-router-dom";
import { getStatusColor } from "../../../utils/statusScale";
import { formatPercent } from "../../../utils/format";
import { buildWorkWeekHref } from "../../../utils/workWeekNavigation";
import { TERMINAL_STATUS_LABEL } from "../utils/dashboardMetricsUtils";
import ContributorDueTasksSection from "./ContributorDueTasksSection";
import "../../../Components/report.css";

// Fixed left-to-right order so the same status always lands in the same place across
// every person's bar — that's what makes the bars comparable at a glance.
const SEGMENT_ORDER = [
  TERMINAL_STATUS_LABEL,
  "In Progress",
  "Ready for Verification",
  "Analyzing",
  "Ready for Work",
  "Backlog",
];

const orderSegments = (statusCounts) => {
  const entries = Object.entries(statusCounts || {})
    .map(([label, count]) => ({ label, count: Number(count) || 0 }))
    .filter((entry) => entry.count > 0);

  const known = SEGMENT_ORDER.map((label) => entries.find((entry) => entry.label === label)).filter(
    Boolean
  );
  const knownLabels = new Set(known.map((entry) => entry.label));
  const rest = entries
    .filter((entry) => !knownLabels.has(entry.label))
    .sort((a, b) => a.label.localeCompare(b.label));

  return [...known, ...rest];
};

// Shared legend for the whole section — every bar draws from this same order/coloring.
export const CONTRIBUTOR_STATUS_LEGEND = SEGMENT_ORDER.map((label, index) => ({
  label,
  color: getStatusColor(label, index),
}));

const ContributorStatusBar = ({ person, jiraBaseUrl, dueByDate }) => {
  const total = Number(person?.totalIssues || 0);
  if (total <= 0) {
    return null;
  }

  const resolved = Number(person.resolvedIssues || 0);
  const statusCounts = { ...(person.openStatusCounts || {}) };
  if (resolved > 0) {
    statusCounts[TERMINAL_STATUS_LABEL] = resolved;
  }
  const segments = orderSegments(statusCounts);
  const resolvedPercent = (resolved / total) * 100;
  const overdue = Number(person.overdueOpenIssues || 0);

  return (
    <div className="app-report-contributor-row">
      <div className="app-report-contributor-head">
        <Link
          to={buildWorkWeekHref({ assignee: person.name })}
          className="app-report-contributor-name"
          title={`Open ${person.name}'s tasks in Work Week`}
        >
          {person.name}
        </Link>
        <span className="app-report-contributor-stats">
          {person.openIssues} open · {resolved} resolved ({formatPercent(resolvedPercent)})
          {overdue > 0 ? ` · ${overdue} overdue` : ""}
        </span>
      </div>
      <div
        className="app-report-stacked-bar"
        role="img"
        aria-label={`${person.name}: ${segments
          .map((segment) => `${segment.label} ${segment.count}`)
          .join(", ")}`}
      >
        {segments.map((segment, index) => (
          <div
            key={segment.label}
            className="app-report-stacked-bar-segment"
            style={{
              width: `${(segment.count / total) * 100}%`,
              background: getStatusColor(segment.label, index),
            }}
            title={`${segment.label}: ${segment.count}`}
          />
        ))}
      </div>
      <ContributorDueTasksSection
        title="Past due"
        tasks={person.overdueIssues}
        jiraBaseUrl={jiraBaseUrl}
        variant="overdue"
        personKey={person.name}
      />
      <ContributorDueTasksSection
        title={dueByDate ? `Upcoming due through ${dueByDate}` : "Upcoming due dates"}
        tasks={person.upcomingDueIssues}
        jiraBaseUrl={jiraBaseUrl}
        variant="upcoming"
        personKey={person.name}
      />
    </div>
  );
};

export default ContributorStatusBar;
