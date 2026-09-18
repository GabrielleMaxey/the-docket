import React from "react";
import CollapsibleSection from "../../Components/CollapsibleSection";
import JqlRunMetrics from "./JqlRunMetrics";
import ProjectReportPanel from "./ProjectReportPanel";

const MY_METRICS_KEY = "ww-my-metrics-open";

const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

const MyMetricsSection = ({ run, jiraRowPriorities, jqlRuns }) => {
  const totalOpen = React.useMemo(() => {
    let sum = 0;
    for (const issue of run?.issues || []) {
      if (isIssueOpen(issue)) sum++;
    }
    return sum;
  }, [run]);

  if (!run?.issues?.length) {
    return null;
  }

  return (
    <CollapsibleSection title="📊 My Metrics" badge={`${totalOpen} open`} storageKey={MY_METRICS_KEY} defaultOpen>
      <div key={`run-summary-${run.index}`} className="ww-run-summary">
        <div className="ww-run-summary-label">{run.label || `Run ${(run.index || 0) + 1}`}</div>
        <JqlRunMetrics run={run} jiraRowPriorities={jiraRowPriorities} />
        <ProjectReportPanel run={run} jiraRowPriorities={jiraRowPriorities} jqlRuns={jqlRuns} />
      </div>
    </CollapsibleSection>
  );
};

export default MyMetricsSection;
