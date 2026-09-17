import React from "react";
import { Button, Message } from "semantic-ui-react";
import ReportOutput from "../../../Components/ReportOutput";
import { useReportClipboard } from "../../../hooks/useReportClipboard";
import { fetchWeeklyDigest } from "../../../services/jiraClient";
import {
  BACKGROUND_JOB_IDS,
  runBackgroundJob,
  useAttachBackgroundJob,
  useBackgroundJobRunning,
} from "../../../hooks/useBackgroundJobs.js";

const WeeklyDigestPanel = ({ hasSnapshot }) => {
  const [digestPending, setDigestPending] = React.useState(false);
  const bgDigestRunning = useBackgroundJobRunning(BACKGROUND_JOB_IDS.DASHBOARD_WEEKLY_DIGEST);
  const loading = digestPending || bgDigestRunning;
  const [error, setError] = React.useState("");
  const [digestReport, setDigestReport] = React.useState(null);
  const { copied, handleCopy, handleDownload } = useReportClipboard(digestReport, "weekly_digest");

  const applyDigest = React.useCallback((digest) => {
    const text = String(digest || "").trim();
    if (!text) {
      return;
    }
    setDigestReport({
      report: text,
      label: "Weekly digest",
    });
  }, []);

  useAttachBackgroundJob(BACKGROUND_JOB_IDS.DASHBOARD_WEEKLY_DIGEST, {
    onSuccess: (digest) => applyDigest(digest),
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to generate weekly digest");
    },
    onFinally: () => setDigestPending(false),
  });

  const handleGenerate = () => {
    setDigestPending(true);
    setError("");
    runBackgroundJob(BACKGROUND_JOB_IDS.DASHBOARD_WEEKLY_DIGEST, {
      label: "Generating weekly digest",
      run: async () => {
        const data = await fetchWeeklyDigest();
        return String(data?.digest || "").trim();
      },
    })
      .then(applyDigest)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to generate weekly digest");
      })
      .finally(() => setDigestPending(false));
  };

  const handleClear = () => {
    setDigestReport(null);
    setError("");
  };

  return (
    <div className="dashboard-weekly-digest-panel">
      <h4 className="dashboard-weekly-digest-title">Weekly digest</h4>
      <p className="dashboard-due-by-hint">
        Snapshot-based stand-up brief: overdue and upcoming highlights, contributor load, and project
        health — no LLM required. Refresh Dashboard first.
      </p>
      <div className="dashboard-report-generate-row">
        <Button primary onClick={handleGenerate} loading={loading} disabled={loading || !hasSnapshot}>
          Generate weekly digest
        </Button>
        {!hasSnapshot ? (
          <span className="dashboard-due-by-hint">
            Run a Dashboard refresh first so there is data to summarize.
          </span>
        ) : null}
      </div>
      {error ? <Message negative size="small">{error}</Message> : null}
      <ReportOutput
        report={digestReport}
        copied={copied}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onClear={digestReport ? handleClear : undefined}
      />
    </div>
  );
};

export default WeeklyDigestPanel;
