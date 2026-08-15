import React from "react";
import { Button, Checkbox, Form } from "semantic-ui-react";
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

const REPORT_TYPE_OPTIONS = [
  {
    value: "status",
    label: "Status Report",
    description: "How this project is tracking — completion, what needs attention, next steps.",
  },
  {
    value: "one_on_one",
    label: "1:1 Prep",
    description: "Short talking points for your weekly or biweekly 1:1 with your manager.",
  },
  {
    value: "pwb",
    label: "PWB Review",
    description: "Self-assessment language for a quarterly, mid-year, or yearly PWB review.",
  },
];

const PWB_PERIOD_OPTIONS = [
  { value: "quarterly", label: "Quarterly" },
  { value: "mid_year", label: "Mid-Year" },
  { value: "yearly", label: "Yearly" },
];

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

  const [reportType, setReportType] = React.useState("status");
  const [pwbPeriod, setPwbPeriod] = React.useState("quarterly");
  const [userGoals, setUserGoals] = React.useState("");
  const [includeCompanyGoals, setIncludeCompanyGoals] = React.useState(false);
  const [companyGoals, setCompanyGoals] = React.useState("");

  const isCareerReport = reportType === "one_on_one" || reportType === "pwb";

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

    const jobLabel =
      reportType === "one_on_one"
        ? "Generating 1:1 prep"
        : reportType === "pwb"
          ? "Generating PWB review draft"
          : "Generating project report";

    runBackgroundJob(jobId, {
      label: jobLabel,
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
          reportType,
          pwbPeriod: reportType === "pwb" ? pwbPeriod : undefined,
          userGoals: isCareerReport ? userGoals.trim() : undefined,
          companyGoals: isCareerReport && includeCompanyGoals ? companyGoals.trim() : undefined,
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
      <p className="app-report-type-label">Report type</p>
      <div className="app-report-type-grid">
        {REPORT_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`app-report-type-btn${reportType === opt.value ? " app-report-type-btn--active" : ""}`}
            onClick={() => setReportType(opt.value)}
          >
            <span className="app-report-type-btn-label">{opt.label}</span>
            <span className="app-report-type-btn-desc">{opt.description}</span>
          </button>
        ))}
      </div>

      {reportType === "pwb" ? (
        <Form.Group inline className="app-report-pwb-period-group">
          {PWB_PERIOD_OPTIONS.map((opt) => (
            <Form.Radio
              key={opt.value}
              label={opt.label}
              checked={pwbPeriod === opt.value}
              onChange={() => setPwbPeriod(opt.value)}
            />
          ))}
        </Form.Group>
      ) : null}

      {isCareerReport ? (
        <Form className="app-report-goals-form">
          <Form.TextArea
            label="Your goals (optional)"
            placeholder="What are you trying to grow into or accomplish? This helps the report connect your work to what you actually care about."
            value={userGoals}
            onChange={(_e, { value }) => setUserGoals(value)}
          />
          <Checkbox
            label="Also compare against company/team goals"
            checked={includeCompanyGoals}
            onChange={(_e, { checked }) => setIncludeCompanyGoals(Boolean(checked))}
          />
          {includeCompanyGoals ? (
            <Form.TextArea
              label="Company / team goals"
              placeholder="Paste in your team's or company's current priorities/OKRs."
              value={companyGoals}
              onChange={(_e, { value }) => setCompanyGoals(value)}
              style={{ marginTop: "0.5rem" }}
            />
          ) : null}
        </Form>
      ) : null}

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
