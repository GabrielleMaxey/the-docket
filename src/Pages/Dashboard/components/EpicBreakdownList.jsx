import React from "react";
import { Link } from "react-router-dom";
import { formatPercent } from "../../../utils/format";
import { buildWorkWeekHref } from "../../../utils/workWeekNavigation";

const isOpenEpicRow = (row) => Number(row?.epicPercent || 0) < 100;

const EpicBreakdownList = ({ breakdown, jiraBaseUrl }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const rows = (Array.isArray(breakdown) ? breakdown : []).filter(isOpenEpicRow);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="dashboard-epic-breakdown">
      <button
        type="button"
        className="dashboard-epic-breakdown-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        title="Incomplete epics where this person has assigned issues"
      >
        <span className="dashboard-epic-breakdown-title">Open epics with assigned tasks</span>
        <span className="dashboard-epic-breakdown-count-badge">{rows.length}</span>
        <span className={`dashboard-epic-breakdown-chevron${isOpen ? " is-open" : ""}`}>›</span>
      </button>
      {isOpen ? (
        <div className="dashboard-epic-breakdown-list">
          {rows.map((row) => {
            const epicKey = String(row.epicKey || "").trim();
            const epicUrl =
              epicKey && jiraBaseUrl
                ? `${jiraBaseUrl}/browse/${encodeURIComponent(epicKey)}`
                : null;

            return (
              <div key={epicKey || row.epicName} className="dashboard-epic-breakdown-row">
                <div className="dashboard-epic-breakdown-head">
                  <span className="dashboard-epic-breakdown-name">
                    {epicUrl ? (
                      <a href={epicUrl} target="_blank" rel="noreferrer">
                        {row.epicName || epicKey}
                      </a>
                    ) : (
                      row.epicName || epicKey
                    )}
                    {epicKey ? (
                      <Link
                        to={buildWorkWeekHref({ key: epicKey })}
                        className="dashboard-work-week-link"
                        title="Open epic in Work Week"
                      >
                        Work Week
                      </Link>
                    ) : null}
                  </span>
                  <span className="dashboard-epic-breakdown-key">{epicKey}</span>
                </div>
                <div className="dashboard-epic-breakdown-metrics">
                  <span>
                    Tasks resolved <strong>{formatPercent(row.issuePercent)}</strong>
                    <span className="dashboard-epic-breakdown-count">
                      {" "}
                      ({row.completedIssues ?? 0}/{row.totalIssues ?? 0})
                    </span>
                  </span>
                  <span>
                    Epic done <strong>{formatPercent(row.epicPercent)}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default EpicBreakdownList;
