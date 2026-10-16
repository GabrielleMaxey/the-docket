import React from "react";
import CollapsibleSection from "../../Components/CollapsibleSection";
import JqlRunMetrics from "./JqlRunMetrics";
import ProjectReportPanel from "./ProjectReportPanel";

const MY_METRICS_KEY = "ww-my-metrics-open";

const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

const MyMetricsSection = ({ run, jiraRowPriorities, jqlRuns, scope, combinedMetrics }) => {
  const totalOpen = React.useMemo(() => {
    if (combinedMetrics) return combinedMetrics.open;
    let sum = 0;
    for (const issue of run?.issues || []) {
      if (isIssueOpen(issue)) sum++;
    }
    return sum;
  }, [run, combinedMetrics]);

  if (!run?.issues?.length && scope !== "combined-work") {
    return null;
  }

  return (
    <CollapsibleSection title="📊 My Metrics" badge={`${totalOpen} open`} storageKey={scope === "combined-work" ? "docket:combined-work:my-metrics-open" : MY_METRICS_KEY} defaultOpen>
      <div key={`run-summary-${run.index}`} className="ww-run-summary">
        <div className="ww-run-summary-label">{run.label || `Run ${(run.index || 0) + 1}`}</div>
        <JqlRunMetrics run={run} jiraRowPriorities={jiraRowPriorities} scope={scope} combinedMetrics={combinedMetrics} />
        {scope !== "combined-work" && <ProjectReportPanel run={run} jiraRowPriorities={jiraRowPriorities} jqlRuns={jqlRuns} />}
      </div>
    </CollapsibleSection>
  );
};

export default MyMetricsSection;
