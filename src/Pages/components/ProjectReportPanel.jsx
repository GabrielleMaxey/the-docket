import React from "react";
import { Button } from "semantic-ui-react";
import CollapsibleSection from "../../Components/CollapsibleSection";
import ReportOutput from "../../Components/ReportOutput";
import { useReportClipboard } from "../../hooks/useReportClipboard";
import { generateProjectReport } from "../../services/jiraClient";
import { saveChatSessionArtifact } from "../../utils/chatSessionContext";
import {
  runBackgroundJob,
  useAttachBackgroundJob,
  useBackgroundJobRunning,
  workWeekProjectReportJobId,
} from "../../hooks/useBackgroundJobs.js";
import {
  clearWorkWeekProjectReport,
  getWorkWeekRunKey,
  loadWorkWeekProjectReport,
  saveWorkWeekProjectReport,
} from "../../utils/pageReportPersistence";

const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

const ProjectReportPanel = ({ run, jiraRowPriorities }) => {
  const runKey = getWorkWeekRunKey(run);
  const jobId = workWeekProjectReportJobId(runKey);
  const persisted = loadWorkWeekProjectReport(runKey);

  const [reportPending, setReportPending] = React.useState(false);
  const bgReportRunning = useBackgroundJobRunning(jobId);
  const loading = reportPending || bgReportRunning;
  const [report, setReport] = React.useState(persisted?.report ?? null);
  const [error, setError] = React.useState("");
  const { copied, handleCopy, handleDownload } = useReportClipboard(report);

  React.useEffect(() => {
    const saved = loadWorkWeekProjectReport(runKey);
    setReport(saved?.report ?? null);
    setError("");
  }, [runKey]);

  const applyReport = React.useCallback((result) => {
    if (!result) return;
    setReport(result);
  }, []);

  useAttachBackgroundJob(jobId, {
    onSuccess: applyReport,
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Report generation failed");
    },
    onFinally: () => setReportPending(false),
  });

  const handleGenerate = () => {
    setReportPending(true);
    setError("");
    setReport(null);

    runBackgroundJob(jobId, {
      label: `Generating project report`,
      run: async () => {
        const issues = run.issues || [];
        const open = issues.filter(isIssueOpen);
        const summary = {
          total: issues.length,
          open: open.length,
          closed: issues.length - open.length,
          overdue: issues.filter((iss) => isIssueOpen(iss) && iss.isOverdue).length,
          topPriorities: issues
            .filter(isIssueOpen)
            .sort((a, b) => (jiraRowPriorities[a.key] || 99) - (jiraRowPriorities[b.key] || 99))
            .slice(0, 8)
            .map((iss) => ({
              key: iss.key,
              summary: iss.fields?.summary || iss.summary || "",
              status: iss.fields?.status?.name || iss.status || "",
              assignee: iss.fields?.assignee?.displayName || iss.assignee || "Unassigned",
              isOverdue: Boolean(iss.isOverdue),
            })),
        };
        const result = await generateProjectReport({
          label: run.label || `Run ${(run.index || 0) + 1}`,
          summary,
        });
        saveWorkWeekProjectReport(runKey, {
          report: result,
          runLabel: run.label || `Run ${(run.index || 0) + 1}`,
          jql: run.jql || "",
        });
        saveChatSessionArtifact({
          type: "work_week_project_report",
          label: result.label || run.label || `Run ${(run.index || 0) + 1}`,
          content: result.report,
          meta: { jql: run.jql || "" },
        });
        return result;
      },
    })
      .then(applyReport)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Report generation failed");
      })
      .finally(() => setReportPending(false));
  };

  const handleClearReport = () => {
    clearWorkWeekProjectReport(runKey);
    setReport(null);
    setError("");
  };

  return (
    <CollapsibleSection title="📄 Project Report">
      <div className="app-report-controls">
        <Button
          size="small"
          primary
          onClick={handleGenerate}
          loading={loading}
          disabled={loading || !run.issues?.length}
        >
          Generate Report
        </Button>
      </div>
      {error ? <p className="ww-jira-status ww-jira-error">{error}</p> : null}
      <ReportOutput
        report={report}
        copied={copied}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onClear={report ? handleClearReport : undefined}
      />
    </CollapsibleSection>
  );
};

export default ProjectReportPanel;
