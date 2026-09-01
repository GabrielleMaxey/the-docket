import React from "react";
import { Button, Checkbox, Form } from "semantic-ui-react";
import CollapsibleSection from "../../Components/CollapsibleSection";
import ReportOutput from "../../Components/ReportOutput";
import { useReportClipboard } from "../../hooks/useReportClipboard";
import {
  fetchAppSettings,
  fetchJiraSearchAll,
  fetchLatestJiraCommentsBulk,
  fetchRecentlyNotedIssueKeys,
  generateProjectReport,
  saveAppSettings,
} from "../../services/jiraClient";
import { saveChatSessionArtifact } from "../../utils/chatSessionContext";
import {
  buildParentMostRecentDoneDateMap,
  getEffectiveDueDateForIssue,
} from "../../utils/jiraIssueDoneDates.js";
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

// JQL has no months unit (`m` is minutes); `-3M` matched nothing.
const monthsAgoDateString = (months) => {
  const d = new Date();
  d.setMonth(d.getMonth() - Number(months || 0));
  return d.toISOString().slice(0, 10);
};

const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

const isIssueOverdueByEffectiveDueDate = (issue, dueDateContext) => {
  if (!isIssueOpen(issue)) {
    return false;
  }
  const effectiveDue = getEffectiveDueDateForIssue(issue, dueDateContext);
  if (!effectiveDue) {
    return false;
  }
  const today = new Date().toISOString().slice(0, 10);
  return effectiveDue < today;
};

const buildSummaryFromIssues = (issues, jiraRowPriorities, dueDateContext) => {
  const open = issues.filter(isIssueOpen);
  return {
    total: issues.length,
    open: open.length,
    closed: issues.length - open.length,
    overdue: open.filter((iss) => isIssueOverdueByEffectiveDueDate(iss, dueDateContext)).length,
    topPriorities: open
      .sort((a, b) => (jiraRowPriorities[a.key] || 99) - (jiraRowPriorities[b.key] || 99))
      .slice(0, 8)
      .map((iss) => ({
        key: iss.key,
        summary: iss.fields?.summary || iss.summary || "",
        status: iss.fields?.status?.name || iss.status || "",
        assignee: iss.fields?.assignee?.displayName || iss.assignee || "Unassigned",
        isOverdue: isIssueOverdueByEffectiveDueDate(iss, dueDateContext),
      })),
  };
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

const ALL_WORK_MONTHS_OPTIONS = [3, 6, 12];

const USER_GOALS_SETTINGS_KEY = "work_week_report_user_goals";
const COMPANY_GOALS_SETTINGS_KEY = "work_week_report_company_goals";

const ProjectReportPanel = ({ run, jiraRowPriorities, jqlRuns = [] }) => {
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
  const [goalsLoaded, setGoalsLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchAppSettings()
      .then((settings) => {
        if (cancelled) return;
        const savedUserGoals = String(settings?.[USER_GOALS_SETTINGS_KEY] || "");
        const savedCompanyGoals = String(settings?.[COMPANY_GOALS_SETTINGS_KEY] || "");
        if (savedUserGoals) setUserGoals(savedUserGoals);
        if (savedCompanyGoals) {
          setCompanyGoals(savedCompanyGoals);
          setIncludeCompanyGoals(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setGoalsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClearSavedUserGoals = () => {
    setUserGoals("");
    saveAppSettings({ [USER_GOALS_SETTINGS_KEY]: "" }).catch(() => {});
  };

  const handleClearSavedCompanyGoals = () => {
    setCompanyGoals("");
    saveAppSettings({ [COMPANY_GOALS_SETTINGS_KEY]: "" }).catch(() => {});
  };

  const [reportScope, setReportScope] = React.useState("current");
  const [allWorkMonths, setAllWorkMonths] = React.useState(3);

  const isCareerReport = reportType === "one_on_one" || reportType === "pwb";

  const otherRuns = React.useMemo(() => {
    return (jqlRuns || []).filter(
      (r) =>
        r.index !== run.index &&
        !r.isDrillDown &&
        !r.isPendingDrillDown &&
        String(r.jql || "").trim() &&
        String(r.label || "").trim()
    );
  }, [jqlRuns, run.index]);

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
        if (isCareerReport) {
          const toSave = {};
          if (userGoals.trim()) toSave[USER_GOALS_SETTINGS_KEY] = userGoals.trim();
          if (includeCompanyGoals && companyGoals.trim()) {
            toSave[COMPANY_GOALS_SETTINGS_KEY] = companyGoals.trim();
          }
          if (Object.keys(toSave).length > 0) {
            saveAppSettings(toSave).catch(() => {});
          }
        }

        let scopeLabel = run.label || `Run ${(run.index || 0) + 1}`;
        let scopeJql = run.jql || "";
        let summary;

        const { dueFieldId, mrdFieldId } = run;

        if (reportScope === "all_work") {
          scopeLabel = `All my assigned work — past ${allWorkMonths} months`;
          const cutoff = monthsAgoDateString(allWorkMonths);
          // Jira `updated` includes automated field bumps; use status/assignee changelog instead.
          scopeJql = `assignee = currentUser() AND (status changed after "${cutoff}" OR assignee changed after "${cutoff}") ORDER BY updated DESC`;

          // Notes/comments are not changelog fields; pull assigned issues and match locally.
          const [{ issues: changedIssues }, notedKeys, { issues: allAssignedIssues }] =
            await Promise.all([
              fetchJiraSearchAll({ jql: scopeJql, maxTotal: 500 }),
              fetchRecentlyNotedIssueKeys(cutoff).catch(() => []),
              fetchJiraSearchAll({ jql: "assignee = currentUser()", maxTotal: 500 }),
            ]);

          const issues = changedIssues || [];
          const knownKeys = new Set(issues.map((iss) => iss.key));
          const notedKeySet = new Set(notedKeys);

          for (const iss of allAssignedIssues || []) {
            if (!knownKeys.has(iss.key) && notedKeySet.has(iss.key)) {
              issues.push(iss);
              knownKeys.add(iss.key);
            }
          }

          const remainingCandidates = (allAssignedIssues || []).filter(
            (iss) => !knownKeys.has(iss.key)
          );
          if (remainingCandidates.length > 0) {
            const latestComments = await fetchLatestJiraCommentsBulk(
              remainingCandidates.map((iss) => iss.key)
            ).catch(() => ({}));
            for (const iss of remainingCandidates) {
              const created = String(latestComments?.[iss.key]?.created || "");
              if (created && created.slice(0, 10) >= cutoff) {
                issues.push(iss);
                knownKeys.add(iss.key);
              }
            }
          }

          const parentMostRecentDoneDateByKey = await buildParentMostRecentDoneDateMap(
            issues,
            mrdFieldId
          );
          summary = buildSummaryFromIssues(issues, jiraRowPriorities, {
            dueFieldId,
            mrdFieldId,
            parentMostRecentDoneDateByKey,
          });
        } else if (reportScope !== "current") {
          const otherRun = otherRuns.find((r) => r.index === reportScope);
          if (otherRun) {
            scopeLabel = otherRun.label || scopeLabel;
            scopeJql = otherRun.jql || "";
            if (otherRun.issues?.length) {
              const parentMostRecentDoneDateByKey =
                otherRun.parentMostRecentDoneDateByKey ||
                (await buildParentMostRecentDoneDateMap(otherRun.issues, mrdFieldId));
              summary = buildSummaryFromIssues(otherRun.issues, jiraRowPriorities, {
                dueFieldId,
                mrdFieldId,
                parentMostRecentDoneDateByKey,
              });
            } else {
              const { issues } = await fetchJiraSearchAll({ jql: scopeJql, maxTotal: 500 });
              const parentMostRecentDoneDateByKey = await buildParentMostRecentDoneDateMap(
                issues || [],
                mrdFieldId
              );
              summary = buildSummaryFromIssues(issues || [], jiraRowPriorities, {
                dueFieldId,
                mrdFieldId,
                parentMostRecentDoneDateByKey,
              });
            }
          }
        }

        if (!summary) {
          summary = buildSummaryFromIssues(run.issues || [], jiraRowPriorities, {
            dueFieldId,
            mrdFieldId,
            parentMostRecentDoneDateByKey: run.parentMostRecentDoneDateByKey,
          });
        }

        const result = await generateProjectReport({
          label: scopeLabel,
          jql: scopeJql,
          summary,
          reportType,
          pwbPeriod: reportType === "pwb" ? pwbPeriod : undefined,
          userGoals: isCareerReport ? userGoals.trim() : undefined,
          companyGoals: isCareerReport && includeCompanyGoals ? companyGoals.trim() : undefined,
        });
        saveWorkWeekProjectReport(runKey, {
          report: result,
          runLabel: scopeLabel,
          jql: scopeJql,
        });
        saveChatSessionArtifact({
          type: "work_week_project_report",
          label: result.label || scopeLabel,
          content: result.report,
          meta: { jql: scopeJql },
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
      <p className="app-report-type-label">Report scope</p>
      <div className="app-report-type-grid">
        <button
          type="button"
          className={`app-report-type-btn${reportScope === "current" ? " app-report-type-btn--active" : ""}`}
          onClick={() => setReportScope("current")}
        >
          <span className="app-report-type-btn-label">Current query results</span>
          <span className="app-report-type-btn-desc">
            {run.label || `Run ${(run.index || 0) + 1}`} — what's already loaded above.
          </span>
        </button>
        <button
          type="button"
          className={`app-report-type-btn${reportScope === "all_work" ? " app-report-type-btn--active" : ""}`}
          onClick={() => setReportScope("all_work")}
        >
          <span className="app-report-type-btn-label">All my assigned work</span>
          <span className="app-report-type-btn-desc">
            Open and closed — status changes, reassignments, or notes in the window.
          </span>
        </button>
        {otherRuns.map((r) => (
          <button
            key={r.index}
            type="button"
            className={`app-report-type-btn${reportScope === r.index ? " app-report-type-btn--active" : ""}`}
            onClick={() => setReportScope(r.index)}
          >
            <span className="app-report-type-btn-label">{r.label}</span>
            <span className="app-report-type-btn-desc">Another query slot on this page.</span>
          </button>
        ))}
      </div>

      {reportScope === "all_work" ? (
        <Form.Group inline className="app-report-pwb-period-group">
          {ALL_WORK_MONTHS_OPTIONS.map((months) => (
            <Form.Radio
              key={months}
              label={`Past ${months} months`}
              checked={allWorkMonths === months}
              onChange={() => setAllWorkMonths(months)}
            />
          ))}
        </Form.Group>
      ) : null}

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
          {userGoals ? (
            <Button
              type="button"
              size="mini"
              basic
              disabled={!goalsLoaded}
              onClick={handleClearSavedUserGoals}
              style={{ marginTop: "-0.5rem", marginBottom: "0.75rem" }}
            >
              Clear
            </Button>
          ) : null}
          <Checkbox
            label="Also compare against company/team goals"
            checked={includeCompanyGoals}
            onChange={(_e, { checked }) => setIncludeCompanyGoals(Boolean(checked))}
          />
          {includeCompanyGoals ? (
            <>
              <Form.TextArea
                label="Company / team goals"
                placeholder="Paste in your team's or company's current priorities/OKRs."
                value={companyGoals}
                onChange={(_e, { value }) => setCompanyGoals(value)}
                style={{ marginTop: "0.5rem" }}
              />
              {companyGoals ? (
                <Button
                  type="button"
                  size="mini"
                  basic
                  disabled={!goalsLoaded}
                  onClick={handleClearSavedCompanyGoals}
                  style={{ marginTop: "-0.5rem" }}
                >
                  Clear
                </Button>
              ) : null}
            </>
          ) : null}
          <p className="app-report-goals-hint">
            Goals you enter here are saved automatically so you don't have to retype them next time — use Clear to remove a saved value.
          </p>
        </Form>
      ) : null}

      <div className="app-report-controls">
        <Button size="small" primary onClick={handleGenerate} loading={loading} disabled={loading}>
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
