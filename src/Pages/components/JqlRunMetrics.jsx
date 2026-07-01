import React from "react";

const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

const JqlRunMetrics = ({ run }) => {
  const issues = run.issues || [];
  const total = issues.length;
  const open = issues.filter(isIssueOpen).length;
  const closed = total - open;
  const overdue = issues.filter((i) => isIssueOpen(i) && i.isOverdue).length;
  const inProgress = issues.filter((i) => {
    const s = String(i.fields?.status?.name || i.status || "").toLowerCase();
    return s.includes("in progress");
  }).length;
  const readyForVerification = issues.filter((i) => {
    const s = String(i.fields?.status?.name || i.status || "").toLowerCase();
    return s.includes("verif");
  }).length;

  const closedPct = total > 0 ? Math.round((closed / total) * 100) : 0;

  return (
    <div className="ww-run-metrics">
      <div className="ww-run-metrics-chips">
        <span className="ww-run-metric-chip">{total} total</span>
        <span className="ww-run-metric-chip">{open} open</span>
        <span className="ww-run-metric-chip ww-chip-resolved">{closed} resolved</span>
        {overdue > 0 ? <span className="ww-run-metric-chip ww-chip-overdue">{overdue} overdue</span> : null}
        {inProgress > 0 ? <span className="ww-run-metric-chip">{inProgress} in progress</span> : null}
        {readyForVerification > 0 ? <span className="ww-run-metric-chip ww-chip-verify">{readyForVerification} ready for verification</span> : null}
      </div>
      <div className="ww-run-progress-bars">
        <div className="ww-run-progress-row">
          <span className="ww-run-progress-label">Resolved</span>
          <div className="ww-run-progress-track">
            <div className="ww-run-progress-fill ww-progress-resolved" style={{ width: `${closedPct}%` }} />
          </div>
          <span className="ww-run-progress-pct">{closedPct}%</span>
        </div>
      </div>
    </div>
  );
};

export default JqlRunMetrics;
