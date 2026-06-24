import React from "react";
import { Container, Divider, Icon, Message } from "semantic-ui-react";
import "semantic-ui-css/semantic.min.css";
import "./workWeekTaskElements.css";
import JiraResultsTable from "./components/JiraResultsTable";
import TaskManagerHeaderPanel from "./components/TaskManagerHeaderPanel";
import JiraFilterImportModal from "./components/JiraFilterImportModal";
import CreateIssueModal from "./components/CreateIssueModal";
import { useEpicFilters } from "./hooks/useEpicFilters";
import { usePersistedState } from "./hooks/usePersistedState";
import { useFlash } from "./hooks/useFlash";
import { useJokeTicker } from "./hooks/useJokeTicker";
import { useCalendarData } from "./hooks/useCalendarData";
import { STATUS_OPTIONS, useTaskManagerJira } from "./hooks/useTaskManagerJira.js";
import { generateProjectReport, generateWeekPlan } from "../services/jiraClient";

// ─── Design tokens ────────────────────────────────────────────────────────────

const REMINDERS_STORAGE_KEY = "workWeekTasksReminders";
const REMINDER_SLOT_COUNT = 4;
const TASK_MANAGER_KEY = "ww-task-manager-open";
const MY_METRICS_KEY = "ww-my-metrics-open";
const WEEKLY_PLAN_KEY = "ww-weekly-plan-open";

const FOCUS_OPTIONS = [
  { value: "balance", label: "Balance across projects" },
  { value: "overdue", label: "Clear overdue first" },
  { value: "single", label: "Focus on one project" },
  { value: "meetings", label: "Light week (lots of meetings)" },
];

const Button = ({
  children,
  className = "",
  size,
  primary,
  secondary,
  basic,
  loading,
  disabled,
  type = "button",
  ...rest
}) => {
  const classes = ["ui"];
  if (size) classes.push(size);
  if (primary) classes.push("primary");
  if (secondary) classes.push("secondary");
  if (basic) classes.push("basic");
  if (loading) classes.push("loading");
  if (disabled || loading) classes.push("disabled");
  if (className) classes.push(className);
  classes.push("button");

  return (
    <button
      type={type}
      className={classes.join(" ")}
      disabled={disabled || loading}
      aria-busy={loading ? "true" : undefined}
      {...rest}
    >
      {children}
    </button>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const defaultReminderRows = () =>
  Array.from({ length: REMINDER_SLOT_COUNT }, () => ({ text: "", done: false }));

const sanitizeReminders = (parsed) => {
  if (!Array.isArray(parsed)) return defaultReminderRows();
  const next = defaultReminderRows();
  for (let i = 0; i < REMINDER_SLOT_COUNT; i++) {
    const item = parsed[i];
    if (item && typeof item === "object") {
      next[i] = { text: typeof item.text === "string" ? item.text : "", done: Boolean(item.done) };
    }
  }
  return next;
};

const isIssueOpen = (issue) => {
  const status = String(issue?.fields?.status?.name || issue?.status || "").toLowerCase();
  return !/(closed|resolved|done)/.test(status);
};

// ─── Shared collapsible (matches Dashboard + Settings style) ──────────────────

const WWCollapsible = ({ title, badge, storageKey, defaultOpen = false, children }) => {
  const persistedState = usePersistedState(storageKey || "__ww_unused__", defaultOpen);
  const localState = React.useState(defaultOpen);
  const [isOpen, setIsOpen] = storageKey ? persistedState : localState;
  return (
    <div className="ww-collapsible">
      <button
        type="button"
        className="ww-collapsible-header"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
      >
        <span className="ww-collapsible-title">{title}</span>
        {badge != null ? <span className="ww-collapsible-badge">{badge}</span> : null}
        <span className={`ww-collapsible-chevron${isOpen ? " open" : ""}`}>›</span>
      </button>
      {isOpen ? <div className="ww-collapsible-body">{children}</div> : null}
    </div>
  );
};

// ─── SimpleMarkdown renderer ──────────────────────────────────────────────────

const renderInline = (text, key) =>
  text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={`${key}-b-${i}`}>{part}</strong> : part
  );

const SimpleMarkdownWW = ({ text }) => {
  if (!text) return null;
  const elements = [];
  let listItems = [];
  let listKey = 0;
  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${listKey}`} className="report-list">{listItems}</ul>);
      listItems = [];
      listKey++;
    }
  };
  text.split("\n").forEach((line, i) => {
    if (line.startsWith("### ")) { flushList(); elements.push(<h4 key={i} className="report-h3">{renderInline(line.slice(4), `h4-${i}`)}</h4>); }
    else if (line.startsWith("## ")) { flushList(); elements.push(<h3 key={i} className="report-h2">{renderInline(line.slice(3), `h3-${i}`)}</h3>); }
    else if (line.startsWith("# ")) { flushList(); elements.push(<h2 key={i} className="report-h1">{renderInline(line.slice(2), `h2-${i}`)}</h2>); }
    else if (line.match(/^[-*] /)) { listItems.push(<li key={i}>{renderInline(line.slice(2), `li-${i}`)}</li>); }
    else if (line.trim() === "") { flushList(); }
    else { flushList(); elements.push(<p key={i} className="report-p">{renderInline(line, `p-${i}`)}</p>); }
  });
  flushList();
  return <div className="dashboard-report-markdown">{elements}</div>;
};

// ─── Project Report Panel ─────────────────────────────────────────────────────

const ProjectReportPanel = ({ run, jiraRowPriorities }) => {
  const [loading, setLoading] = React.useState(false);
  const [report, setReport] = React.useState(null);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const handleGenerate = async () => {
    setLoading(true); setError(""); setReport(null);
    try {
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
      const result = await generateProjectReport({ label: run.label || `Run ${(run.index || 0) + 1}`, summary });
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!report?.report) return;
    await navigator.clipboard.writeText(report.report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!report?.report) return;
    const blob = new Blob([report.report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(report.label || "report").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <WWCollapsible title="📄 Project Report">
      <div className="ww-project-report-controls">
        <Button size="small" primary onClick={handleGenerate} loading={loading} disabled={loading || !run.issues?.length}>
          Generate Report
        </Button>
        {report ? (
          <>
            <Button size="small" basic onClick={handleCopy}>{copied ? "✓ Copied" : "Copy"}</Button>
            <Button size="small" basic onClick={handleDownload}>⤓ Download</Button>
          </>
        ) : null}
      </div>
      {error ? <p className="ww-jira-status ww-jira-error">{error}</p> : null}
      {report ? <SimpleMarkdownWW text={report.report} /> : null}
    </WWCollapsible>
  );
};

// ─── JQL Run Metrics ──────────────────────────────────────────────────────────

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
  const overduePct = open > 0 ? Math.round((overdue / open) * 100) : 0;
  const inProgressPct = open > 0 ? Math.round((inProgress / open) * 100) : 0;

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

// ─── My Metrics Section ───────────────────────────────────────────────────────
// Shows metrics only for the active JQL tab.

const MyMetricsSection = ({ run, jiraRowPriorities }) => {
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
    <WWCollapsible title="📊 My Metrics" badge={`${totalOpen} open`} storageKey={MY_METRICS_KEY} defaultOpen>
      <div key={`run-summary-${run.index}`} className="ww-run-summary">
        <div className="ww-run-summary-label">{run.label || `Run ${(run.index || 0) + 1}`}</div>
        <JqlRunMetrics run={run} jiraRowPriorities={jiraRowPriorities} />
        <ProjectReportPanel run={run} jiraRowPriorities={jiraRowPriorities} />
      </div>
    </WWCollapsible>
  );
};

// ─── Weekly Plan Panel ────────────────────────────────────────────────────────

const WeeklyPlanPanel = ({ jqlRuns, jiraRowPriorities }) => {
  const [plan, setPlan] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [step, setStep] = React.useState("questions");
  const [focusStyle, setFocusStyle] = React.useState("balance");
  const [capacityHours, setCapacityHours] = React.useState("40");
  const [fixedCommitments, setFixedCommitments] = React.useState("");
  const [additionalContext, setAdditionalContext] = React.useState("");

  const hasRuns = jqlRuns.some((r) => r.issues?.length > 0);

  const handleGenerate = async () => {
    setLoading(true); setError("");
    try {
      const projects = jqlRuns
        .filter((r) => r.issues?.length > 0)
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
      const combined = [fixedCommitments.trim(), additionalContext.trim()].filter(Boolean).join(" | ");
      const result = await generateWeekPlan({ projects, focusStyle, capacityHours: Number(capacityHours) || 40, additionalContext: combined });
      setPlan(result.plan);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!plan) return;
    await navigator.clipboard.writeText(plan);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setStep("questions"); setPlan(null); setError("");
    setFocusStyle("balance"); setCapacityHours("40");
    setFixedCommitments(""); setAdditionalContext("");
  };

  return (
    <WWCollapsible title="🗓️ Help me plan my week" storageKey={WEEKLY_PLAN_KEY}>
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
              <button type="button" className="ww-plan-edit-btn" onClick={handleReset}>✎ Edit</button>
            </div>
            <div className="ww-weekly-plan-controls">
              <Button primary size="small" onClick={handleGenerate} loading={loading} disabled={loading}>Generate week plan</Button>
              {plan ? <Button basic size="small" onClick={handleCopy}>{copied ? "✓ Copied" : "Copy"}</Button> : null}
              {plan ? <Button basic size="small" onClick={handleReset}>Start over</Button> : null}
            </div>
            {error ? <p className="ww-jira-status ww-jira-error">{error}</p> : null}
            {plan ? <SimpleMarkdownWW text={plan} /> : null}
          </>
        )}
      </div>
    </WWCollapsible>
  );
};

// ─── Main page component ──────────────────────────────────────────────────────

const WorkWeekTasks = () => {
  const { presets: epicPresets } = useEpicFilters();
  const { tickerJokes, jokeIndex } = useJokeTicker();
  const { todayDay, monthLabel, fullDateLabel, calendarCells } = useCalendarData();

  const [reminders, setReminders] = usePersistedState(REMINDERS_STORAGE_KEY, defaultReminderRows(), { sanitize: sanitizeReminders });
  const [importSlotIndex, setImportSlotIndex] = React.useState(null);
  const [createIssueOpen, setCreateIssueOpen] = React.useState(false);

  const {
    jqlCount, jqlInputs, jqlLabels, jqlLoading, jqlRuns,
    showRestoredJqlBanner, jqlError, jqlMaxResults,
    jiraNotes, jiraRowPriorities, selectedForPush,
    lastPushedJiraNoteByKey, pushState, saveState,
    statusDrafts, assigneeDrafts, rowUpdateState,
    isClosedLikeStatus, clampPriority, getPriorityClass,
    getPriorityRowClass, formatDate, filtersLoading,
    setJqlCount, setJqlMaxResults,
    handleJqlChange, handleJqlLabelChange,
    handleResetSavedQueries, handleRunJql, handlePushSelected,
    handleSaveMetadata, handleSelectAll, handleStatusDraftChange,
    handleStatusUpdate, handleAssigneeDraftChange, handleAssigneeUpdate,
    handleRowPriorityChange, handleNoteChange, handleSelectForPush, handlePushNote,
  } = useTaskManagerJira();

  const [jqlRunFlash, flashJqlRun] = useFlash();
  const [activeRunIndex, setActiveRunIndex] = React.useState(0);

  const activeRun = React.useMemo(() => {
    if (!Array.isArray(jqlRuns) || jqlRuns.length === 0) return null;
    const idx = Number.isFinite(activeRunIndex) ? activeRunIndex : 0;
    return jqlRuns[Math.max(0, Math.min(jqlRuns.length - 1, idx))] || jqlRuns[0];
  }, [jqlRuns, activeRunIndex]);

  const handleResetSavedQueriesWithConfirm = React.useCallback(() => {
    if (!window.confirm(
      "Reset saved queries?\n\nThis will remove: saved JQL text and labels, the cached results table, and 'last pushed note' markers.\n\nThis will NOT remove: notes or priorities in your local database, or header reminders.\n\nClick OK to reset, or Cancel to keep your settings."
    )) return;
    handleResetSavedQueries();
  }, [handleResetSavedQueries]);

  const handleRunJqlRef = React.useRef(handleRunJql);
  React.useEffect(() => { handleRunJqlRef.current = handleRunJql; }, [handleRunJql]);

  React.useEffect(() => {
    const onKeyDown = (e) => {
      if ((!e.ctrlKey && !e.metaKey) || e.key !== "Enter") return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "textarea" || e.target?.isContentEditable) return;
      e.preventDefault();
      if (!jqlLoading) void handleRunJqlRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jqlLoading]);

  const handleReminderTextChange = React.useCallback((index, value) => {
    setReminders((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const clearDone = String(value).trim() !== String(row.text).trim() || !String(value).trim();
      return { text: value, done: clearDone ? false : row.done };
    }));
  }, [setReminders]);

  const handleReminderDoneChange = React.useCallback((index, checked) => {
    setReminders((prev) => prev.map((row, i) => i === index ? { ...row, done: checked } : row));
  }, [setReminders]);

  const handleImportFilter = React.useCallback((index, jql, label) => {
    handleJqlChange(index, jql);
    if (label) handleJqlLabelChange(index, label);
    setImportSlotIndex(null);
  }, [handleJqlChange, handleJqlLabelChange]);

  const handleQuickPick = React.useCallback((index, preset) => {
    if (!preset) return;
    const jql = preset.presetType === "jql"
      ? String(preset.jql || "").trim()
      : (preset.epicKey ? `parent = ${preset.epicKey}` : "");
    if (jql) handleJqlChange(index, jql);
    if (preset.label) handleJqlLabelChange(index, preset.label);
  }, [handleJqlChange, handleJqlLabelChange]);

  return (
    <>
      <Container fluid className="work-week-page">
        <TaskManagerHeaderPanel
          tickerJokes={tickerJokes} jokeIndex={jokeIndex}
          fullDateLabel={fullDateLabel} monthLabel={monthLabel}
          calendarCells={calendarCells} todayDay={todayDay}
          reminders={reminders}
          onReminderTextChange={handleReminderTextChange}
          onReminderDoneChange={handleReminderDoneChange}
          weeklyPlanPanel={
            <WeeklyPlanPanel jqlRuns={jqlRuns} jiraRowPriorities={jiraRowPriorities} />
          }
        />

        <WWCollapsible title="🗂️ Task Manager" storageKey={TASK_MANAGER_KEY} defaultOpen>
          <div className="ww-task-manager-body">
            <div className="ww-create-issue-row">
              <Button primary onClick={() => setCreateIssueOpen(true)}>Create Issue</Button>
            </div>

            <div className="ww-jql-controls">
              <label htmlFor="jql-count">JQL count:</label>
              <select id="jql-count" value={jqlCount} onChange={(e) => setJqlCount(Number(e.target.value))}>
                {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {Array.from({ length: jqlCount }).map((_, index) => (
              <div key={`jql-input-${index}`} className="ww-jql-input-wrap">
                <div className="ww-jql-row-head">
                  <label htmlFor={`jql-label-${index}`}>Label {index + 1}</label>
                </div>
                {epicPresets.length > 0 ? (
                  <div className="ww-quick-pick-row">
                    <div className="ww-quick-pick-main">
                      <span className="ww-quick-pick-label">Quick pick:</span>
                      {epicPresets.map((preset) => (
                        <button
                          key={`qp-${index}-${preset.id}`}
                          type="button"
                          className="ww-quick-pick-pill"
                          title={preset.presetType === "jql" ? (preset.jql || preset.label) : preset.epicKey}
                          onClick={() => handleQuickPick(index, preset)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="ww-import-filter-btn ww-import-filter-btn-inline"
                      onClick={() => setImportSlotIndex(index)}>
                      Import from Jira
                    </button>
                  </div>
                ) : (
                  <div className="ww-quick-pick-row">
                    <button type="button" className="ww-import-filter-btn ww-import-filter-btn-inline"
                      onClick={() => setImportSlotIndex(index)}>
                      Import from Jira
                    </button>
                  </div>
                )}
                <div className="ww-jql-row-inline">
                  <input id={`jql-label-${index}`} type="text" value={jqlLabels[index]}
                    onChange={(e) => handleJqlLabelChange(index, e.target.value)}
                    placeholder={`Label for JQL ${index + 1}`} />
                </div>
                <input id={`jql-${index}`} type="text" value={jqlInputs[index]}
                  onChange={(e) => handleJqlChange(index, e.target.value)}
                  placeholder="project = ABC ORDER BY updated DESC" />
              </div>
            ))}

            <div className="ww-jql-maxresults">
              <label htmlFor="jql-max-results">Max results:</label>
              <input id="jql-max-results" type="number" min={1} max={1000} value={jqlMaxResults}
                onChange={(e) => setJqlMaxResults(Math.max(1, Number(e.target.value) || 200))} />
            </div>

            <div className="ww-jql-action-row">
              <Button secondary size="small" onClick={handleRunJql} loading={jqlLoading} disabled={filtersLoading}>
                Run JQL
              </Button>
              <Button size="small" className="ww-reset-btn" onClick={handleResetSavedQueriesWithConfirm} disabled={filtersLoading}>
                <Icon name="warning sign" />Reset Saved Queries
              </Button>
            </div>

            {jqlError ? <p className="ww-jira-status ww-jira-error">{jqlError}</p> : null}
            {jqlRunFlash ? <p className="ww-inline-success">{jqlRunFlash}</p> : null}
            <p className="ww-jql-shortcut-hint">
              Tip: Press <kbd className="ww-kbd">Ctrl</kbd>+<kbd className="ww-kbd">Enter</kbd> or{" "}
              <kbd className="ww-kbd">⌘</kbd>+<kbd className="ww-kbd">Enter</kbd> to run or refresh JQL results.
            </p>
          </div>
        </WWCollapsible>

        {jqlRuns.some((r) => r.issues?.length > 0) ? null : null}

        {showRestoredJqlBanner && jqlRuns.length > 0 ? (
          <div className="ww-restored-banner">
            <div className="ww-restored-banner-content">
              <strong>Showing saved results</strong>
              <p className="ww-restored-jql-banner-copy">
                This table was restored from your last run. Data may be out of date.
              </p>
              <Button type="button" primary size="small" onClick={handleRunJql} loading={jqlLoading} disabled={jqlLoading}>
                Refresh results
              </Button>
            </div>
          </div>
        ) : null}

        {/* My Metrics — directly below restored-results banner; scoped to active tab */}
        {jqlRuns.some((r) => r.issues?.length > 0) && activeRun?.issues?.length > 0 ? (
          <MyMetricsSection run={activeRun} jiraRowPriorities={jiraRowPriorities} />
        ) : null}

        <JiraResultsTable
          jqlRuns={jqlRuns} selectedForPush={selectedForPush}
          lastPushedJiraNoteByKey={lastPushedJiraNoteByKey}
          pushState={pushState} saveState={saveState}
          rowUpdateState={rowUpdateState} statusDrafts={statusDrafts}
          assigneeDrafts={assigneeDrafts} jiraRowPriorities={jiraRowPriorities}
          jiraNotes={jiraNotes} statusOptions={STATUS_OPTIONS}
          isClosedLikeStatus={isClosedLikeStatus} clampPriority={clampPriority}
          getPriorityClass={getPriorityClass} getPriorityRowClass={getPriorityRowClass}
          formatDate={formatDate} handlePushSelected={handlePushSelected}
          handleSaveMetadata={handleSaveMetadata} handleSelectAll={handleSelectAll}
          handleStatusDraftChange={handleStatusDraftChange} handleStatusUpdate={handleStatusUpdate}
          handleAssigneeDraftChange={handleAssigneeDraftChange} handleAssigneeUpdate={handleAssigneeUpdate}
          handleRowPriorityChange={handleRowPriorityChange} handleNoteChange={handleNoteChange}
          handleSelectForPush={handleSelectForPush} handlePushNote={handlePushNote}
          onActiveTabChange={setActiveRunIndex}
        />

      </Container>
      <Divider />

      {importSlotIndex !== null ? (
        <JiraFilterImportModal
          open={importSlotIndex !== null}
          onClose={() => setImportSlotIndex(null)}
          onImport={(jql, label) => handleImportFilter(importSlotIndex, jql, label)}
        />
      ) : null}

      <CreateIssueModal
        open={createIssueOpen}
        onClose={() => setCreateIssueOpen(false)}
        epicPresets={epicPresets}
        defaultEpicKey=""
        onCreated={() => void handleRunJql()}
      />
    </>
  );
};

export default WorkWeekTasks;
