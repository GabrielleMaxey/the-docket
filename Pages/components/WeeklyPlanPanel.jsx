import React from "react";
import { Button } from "semantic-ui-react";
import CollapsibleSection from "../../Components/CollapsibleSection";
import ReportOutput from "../../Components/ReportOutput";
import { useReportClipboard } from "../../hooks/useReportClipboard";
import {
  fetchCoworkWeeklyPlanByFilename,
  fetchCoworkWeeklyPlans,
  generateWeekPlan,
} from "../../services/jiraClient";
import { saveChatSessionArtifact } from "../../utils/chatSessionContext";
import {
  BACKGROUND_JOB_IDS,
  runBackgroundJob,
  useAttachBackgroundJob,
  useBackgroundJobRunning,
} from "../../hooks/useBackgroundJobs.js";
import {
  clearWeekPlanReportOnly,
  clearWeekPlanState,
  loadWeekPlanState,
  saveWeekPlanState,
} from "../../utils/pageReportPersistence";
import { isConfiguredJqlRun } from "../../utils/workWeekStorage.js";

const WEEKLY_PLAN_KEY = "ww-weekly-plan-open";

const FOCUS_OPTIONS = [
  { value: "balance", label: "Balance across projects" },
  { value: "overdue", label: "Clear overdue first" },
  { value: "single", label: "Focus on one project" },
  { value: "meetings", label: "Light week (lots of meetings)" },
];

const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

const buildWeekPlanContext = ({ fixedCommitments, additionalContext, coworkFilename, coworkContent }) => {
  const notes = [fixedCommitments.trim(), additionalContext.trim()].filter(Boolean).join(" | ");
  const parts = [];
  if (notes) {
    parts.push(notes);
  }
  if (coworkFilename && coworkContent) {
    parts.push(
      `Prior CoWork weekly plan (${coworkFilename}) — refine and update based on current Jira tasks; do not ignore live task data:\n${coworkContent}`
    );
  }
  return parts.join("\n\n");
};

const WeeklyPlanPanel = ({ jqlRuns, jiraRowPriorities }) => {
  const persistedPlan = loadWeekPlanState();

  const [planPending, setPlanPending] = React.useState(false);
  const bgPlanRunning = useBackgroundJobRunning(BACKGROUND_JOB_IDS.WORK_WEEK_WEEK_PLAN);
  const loading = planPending || bgPlanRunning;
  const [plan, setPlan] = React.useState(persistedPlan?.plan ?? null);
  const [error, setError] = React.useState("");
  const planReport = plan ? { report: plan, label: "Week plan" } : null;
  const { copied, handleCopy, handleDownload } = useReportClipboard(planReport);
  const [step, setStep] = React.useState(persistedPlan?.step || "questions");
  const [focusStyle, setFocusStyle] = React.useState(persistedPlan?.focusStyle || "balance");
  const [capacityHours, setCapacityHours] = React.useState(
    String(persistedPlan?.capacityHours ?? "40")
  );
  const [fixedCommitments, setFixedCommitments] = React.useState(
    String(persistedPlan?.fixedCommitments || "")
  );
  const [additionalContext, setAdditionalContext] = React.useState(
    String(persistedPlan?.additionalContext || "")
  );
  const [coworkFiles, setCoworkFiles] = React.useState([]);
  const [selectedCoworkFilename, setSelectedCoworkFilename] = React.useState(
    String(persistedPlan?.selectedCoworkFilename || "")
  );

  const hasRuns = jqlRuns.some((r) => isConfiguredJqlRun(r) && r.issues?.length > 0);

  React.useEffect(() => {
    if (!hasRuns) {
      return undefined;
    }

    let cancelled = false;
    void fetchCoworkWeeklyPlans()
      .then((items) => {
        if (!cancelled) {
          setCoworkFiles(Array.isArray(items) ? items : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCoworkFiles([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasRuns]);

  const applyPlan = React.useCallback((result) => {
    if (!result?.plan) return;
    setPlan(result.plan);
    setStep("done");
  }, []);

  useAttachBackgroundJob(BACKGROUND_JOB_IDS.WORK_WEEK_WEEK_PLAN, {
    onSuccess: applyPlan,
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Plan generation failed");
    },
    onFinally: () => setPlanPending(false),
  });

  const handleGenerate = () => {
    setPlanPending(true);
    setError("");

    const projects = jqlRuns
      .filter((r) => isConfiguredJqlRun(r) && r.issues?.length > 0)
      .map((r) => ({
        label: r.label || `Run ${(r.index || 0) + 1}`,
        total: r.issues.length,
        open: r.issues.filter(isIssueOpen).length,
        overdue: r.issues.filter((i) => isIssueOpen(i) && i.isOverdue).length,
        tasks: r.issues
          .filter(isIssueOpen)
          .sort((a, b) => (jiraRowPriorities[a.key] || 99) - (jiraRowPriorities[b.key] || 99))
          .slice(0, 10)
          .map((i) => ({
            key: i.key,
            summary: i.fields?.summary || i.summary || "",
            status: i.fields?.status?.name || i.status || "",
            assignee: i.fields?.assignee?.displayName || i.assignee || "Unassigned",
            isOverdue: Boolean(i.isOverdue),
          })),
      }));

    const coworkFilename = selectedCoworkFilename.trim();

    runBackgroundJob(BACKGROUND_JOB_IDS.WORK_WEEK_WEEK_PLAN, {
      label: "Generating week plan",
      run: async () => {
        let coworkContent = "";
        if (coworkFilename) {
          const fileItem = await fetchCoworkWeeklyPlanByFilename(coworkFilename);
          coworkContent = String(fileItem?.content || "").trim();
          if (!coworkContent) {
            throw new Error(`Could not read CoWork plan “${coworkFilename}”`);
          }
        }

        const combined = buildWeekPlanContext({
          fixedCommitments,
          additionalContext,
          coworkFilename,
          coworkContent,
        });

        const result = await generateWeekPlan({
          projects,
          focusStyle,
          capacityHours: Number(capacityHours) || 40,
          additionalContext: combined,
        });
        saveWeekPlanState({
          plan: result.plan,
          step: "done",
          focusStyle,
          capacityHours,
          fixedCommitments,
          additionalContext,
          selectedCoworkFilename: coworkFilename,
        });
        saveChatSessionArtifact({
          type: "week_plan",
          label: "Week plan",
          content: result.plan,
          meta: {
            focusStyle,
            capacityHours: Number(capacityHours) || 40,
            ...(coworkFilename ? { coworkFilename } : {}),
          },
        });
        return result;
      },
    })
      .then(applyPlan)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Plan generation failed");
      })
      .finally(() => setPlanPending(false));
  };

  const handleClearReport = () => {
    setPlan(null);
    setError("");
    clearWeekPlanReportOnly();
  };

  const handleReset = () => {
    setStep("questions");
    setPlan(null);
    setError("");
    setFocusStyle("balance");
    setCapacityHours("40");
    setFixedCommitments("");
    setAdditionalContext("");
    setSelectedCoworkFilename("");
    clearWeekPlanState();
  };

  return (
    <CollapsibleSection title="🗓️ Help me plan my week" storageKey={WEEKLY_PLAN_KEY}>
      <div className="ww-weekly-plan-body">
        {!hasRuns ? (
          <p className="ww-plan-intro">Run JQL queries first to load your tasks, then generate a week plan.</p>
        ) : step === "questions" ? (
          <div className="ww-plan-questions">
            <p className="ww-plan-intro">Answer a few quick questions so the plan fits your week:</p>
            <div className="ww-plan-question-block">
              <label className="ww-plan-question-label">1. How would you like to approach this week?</label>
              <div className="ww-plan-focus-options">
                {FOCUS_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button"
                    className={`ww-plan-focus-btn${focusStyle === opt.value ? " ww-plan-focus-btn--active" : ""}`}
                    onClick={() => setFocusStyle(opt.value)}>{opt.label}</button>
                ))}
              </div>
            </div>
            <div className="ww-plan-question-block">
              <label className="ww-plan-question-label" htmlFor="ww-capacity-hours">2. How many hours available for project work?</label>
              <div className="ww-plan-capacity-row">
                <input id="ww-capacity-hours" type="number" min={1} max={60} value={capacityHours}
                  onChange={(e) => setCapacityHours(e.target.value)} className="ww-plan-capacity-input" />
                <span className="ww-plan-question-label" style={{ fontWeight: 400 }}>hours</span>
              </div>
            </div>
            <div className="ww-plan-question-block">
              <label className="ww-plan-question-label">3. Fixed commitments or blockers this week?
                <span className="ww-plan-optional"> (optional)</span>
              </label>
              <input type="text" className="ww-plan-text-input"
                placeholder="e.g. Deployment Thursday, 1:1s Tuesday"
                value={fixedCommitments} onChange={(e) => setFixedCommitments(e.target.value)} />
            </div>
            <div className="ww-plan-question-block">
              <label className="ww-plan-question-label" htmlFor="ww-extra-context">4. Any other priorities or context?
                <span className="ww-plan-optional"> (optional)</span>
              </label>
              <textarea id="ww-extra-context" className="ww-plan-context-input" rows={2}
                placeholder="e.g. Prep for Friday stakeholder review..."
                value={additionalContext} onChange={(e) => setAdditionalContext(e.target.value)} />
            </div>
            <div className="ww-plan-question-block">
              <label className="ww-plan-question-label" htmlFor="ww-cowork-plan">
                5. Include a prior CoWork weekly plan?
                <span className="ww-plan-optional"> (optional)</span>
              </label>
              <select
                id="ww-cowork-plan"
                className="ww-plan-text-input"
                value={selectedCoworkFilename}
                onChange={(e) => setSelectedCoworkFilename(e.target.value)}
              >
                <option value="">None</option>
                {coworkFiles.map((file) => (
                  <option key={file.id || file.filename} value={file.filename}>
                    {file.label || file.filename}
                  </option>
                ))}
              </select>
              {coworkFiles.length === 0 ? (
                <p className="ww-plan-optional" style={{ margin: "0.35rem 0 0" }}>
                  No weekly-plan-*.md files in the data folder yet.
                </p>
              ) : null}
            </div>
            <div>
              <Button primary size="small" onClick={() => setStep("ready")}>Continue →</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="ww-plan-summary-chips">
              <span className="ww-run-metric-chip">{FOCUS_OPTIONS.find((o) => o.value === focusStyle)?.label || focusStyle}</span>
              <span className="ww-run-metric-chip">{capacityHours}h available</span>
              {(fixedCommitments || additionalContext) ? <span className="ww-run-metric-chip">+ notes</span> : null}
              {selectedCoworkFilename ? (
                <span className="ww-run-metric-chip">+ {selectedCoworkFilename}</span>
              ) : null}
              <button type="button" className="ww-plan-edit-btn" onClick={handleReset}>✎ Edit</button>
            </div>
            <div className="ww-weekly-plan-controls">
              <Button primary size="small" onClick={handleGenerate} loading={loading} disabled={loading}>
                Generate week plan
              </Button>
              {plan ? <Button basic size="small" onClick={handleReset}>Start over</Button> : null}
            </div>
            {error ? <p className="ww-jira-status ww-jira-error">{error}</p> : null}
            <ReportOutput
              report={planReport}
              copied={copied}
              onCopy={handleCopy}
              onDownload={handleDownload}
              onClear={plan ? handleClearReport : undefined}
            />
          </>
        )}
      </div>
    </CollapsibleSection>
  );
};

export default WeeklyPlanPanel;
