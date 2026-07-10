import React from "react";
import { Link } from "react-router-dom";
import { formatPercent } from "../../../utils/format";
import { buildWorkWeekHref } from "../../../utils/workWeekNavigation";

const EpicBreakdownList = ({ breakdown, jiraBaseUrl }) => {
  const rows = Array.isArray(breakdown) ? breakdown : [];
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="dashboard-epic-breakdown">
      <p className="dashboard-epic-breakdown-title">Epics in scope</p>
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
    </div>
  );
};

export default EpicBreakdownList;
