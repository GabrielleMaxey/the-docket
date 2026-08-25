import React from "react";

const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

const WORKLOAD_SEGMENTS = [
  { key: "inProgress", label: "In Progress",   test: (s) => s.includes("in progress"),   cls: "ww-wl-inprogress" },
  { key: "verify",     label: "Verification",  test: (s) => s.includes("verif"),          cls: "ww-wl-verify"     },
  { key: "readyWork",  label: "Ready for Work",test: (s) => s.includes("ready for work"), cls: "ww-wl-ready"      },
  { key: "backlog",    label: "Backlog",        test: (s) => s.includes("backlog"),        cls: "ww-wl-backlog"    },
  { key: "other",      label: "Other open",    test: () => true,                          cls: "ww-wl-other"      },
];

const WIP_DEFAULT = 5;
const CAPACITY_DEFAULT = 15;

const statusCls = (pct) => (pct > 100 ? "over" : pct > 80 ? "warn" : "ok");

const CapacityRow = ({ label, current, limit, onLimitChange, limitTitle }) => {
  const pct = limit > 0 ? Math.round((current / limit) * 100) : 0;
  const cls = statusCls(pct);
  return (
    <div className="ww-cap-row">
      <span className="ww-cap-row-label">
        {label}
        <strong className={`ww-cap-count ww-cap-count--${cls}`}>{current}</strong>
        <span className="ww-cap-sep">/</span>
        <input
          type="number"
          className="ww-cap-input"
          value={limit}
          min={1}
          onChange={onLimitChange}
          title={limitTitle}
        />
      </span>
      <div className="ww-cap-track">
        <div className={`ww-cap-fill ww-cap-fill--${cls}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`ww-cap-pct ww-cap-pct--${cls}`}>{pct}%{cls === "over" ? " ▲" : ""}</span>
    </div>
  );
};

const JqlRunMetrics = ({ run }) => {
  const [maxCapacity, setMaxCapacity] = React.useState(() => {
    const v = parseInt(localStorage.getItem("ic-max-capacity"), 10);
    return v > 0 ? v : CAPACITY_DEFAULT;
  });
  const [wipLimit, setWipLimit] = React.useState(() => {
    const v = parseInt(localStorage.getItem("ic-wip-limit"), 10);
    return v > 0 ? v : WIP_DEFAULT;
  });

  const handleCapacityChange = (e) => {
    const n = Math.max(1, parseInt(e.target.value, 10) || 1);
    setMaxCapacity(n);
    localStorage.setItem("ic-max-capacity", String(n));
  };
  const handleWipChange = (e) => {
    const n = Math.max(1, parseInt(e.target.value, 10) || 1);
    setWipLimit(n);
    localStorage.setItem("ic-wip-limit", String(n));
  };

  const issues = run.issues || [];
  const total = issues.length;
  const openIssues = issues.filter(isIssueOpen);
  const open = openIssues.length;
  const closed = total - open;
  const overdue = openIssues.filter((i) => i.isOverdue).length;

  const counts = Object.fromEntries(WORKLOAD_SEGMENTS.map((s) => [s.key, 0]));
  for (const issue of openIssues) {
    const s = String(issue.fields?.status?.name || issue.status || "").toLowerCase();
    const seg = WORKLOAD_SEGMENTS.find((seg) => seg.test(s));
    if (seg) counts[seg.key]++;
  }

  const closedPct = total > 0 ? Math.round((closed / total) * 100) : 0;

  return (
    <div className="ww-run-metrics">
      <div className="ww-run-metrics-chips">
        <span className="ww-run-metric-chip">{total} total</span>
        <span className="ww-run-metric-chip">{open} open</span>
        <span className="ww-run-metric-chip ww-chip-resolved">{closed} resolved ({closedPct}%)</span>
        {overdue > 0 ? <span className="ww-run-metric-chip ww-chip-overdue">{overdue} overdue</span> : null}
      </div>

      {open > 0 ? (
        <div className="ww-capacity-wrap">
          <div className="ww-capacity-header">My Capacity</div>

          <CapacityRow
            label="Total open"
            current={open}
            limit={maxCapacity}
            onLimitChange={handleCapacityChange}
            limitTitle="Your comfortable total open-task limit"
          />
          <CapacityRow
            label="In Progress"
            current={counts.inProgress}
            limit={wipLimit}
            onLimitChange={handleWipChange}
            limitTitle="WIP limit — recommended: 4–5 In Progress tasks"
          />

          <div className="ww-capacity-benchmark">
            Recommended WIP limit: <strong>4–5</strong> In Progress tasks
          </div>

          <div className="ww-workload-bar-label">Open breakdown</div>
          <div className="ww-workload-bar">
            {WORKLOAD_SEGMENTS.map(({ key, label, cls }) => {
              const count = counts[key];
              if (!count) return null;
              const pct = Math.round((count / open) * 100);
              return (
                <div
                  key={key}
                  className={`ww-workload-seg ${cls}`}
                  style={{ width: `${pct}%` }}
                  title={`${label}: ${count} (${pct}%)`}
                >
                  {pct >= 12 ? count : null}
                </div>
              );
            })}
          </div>
          <div className="ww-workload-legend">
            {WORKLOAD_SEGMENTS.map(({ key, label, cls }) => {
              const count = counts[key];
              if (!count) return null;
              return (
                <span key={key} className="ww-workload-legend-item">
                  <span className={`ww-workload-legend-dot ${cls}`} />
                  {count} {label}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default JqlRunMetrics;
