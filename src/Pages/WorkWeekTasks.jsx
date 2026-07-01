import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Container, Divider, Icon, Message } from "semantic-ui-react";
import "semantic-ui-css/semantic.min.css";
import "./workWeekTaskElements.css";
import CollapsibleSection from "../Components/CollapsibleSection";
import JiraResultsTable from "./components/JiraResultsTable";
import TaskManagerHeaderPanel from "./components/TaskManagerHeaderPanel";
import JiraFilterImportModal from "./components/JiraFilterImportModal";
import CreateIssueModal from "./components/CreateIssueModal";
import WeeklyPlanPanel from "./components/WeeklyPlanPanel";
import MyMetricsSection from "./components/MyMetricsSection";
import { useEpicFilters } from "../context/EpicFiltersContext.jsx";
import { usePersistedState } from "./hooks/usePersistedState";
import { useFlash } from "./hooks/useFlash";
import { useJokeTicker } from "./hooks/useJokeTicker";
import { useCalendarData } from "./hooks/useCalendarData";
import { useWorkWeekHeaderPreferences } from "./hooks/useWorkWeekHeaderPreferences";
import { useUpcomingDueBanner } from "./hooks/useUpcomingDueBanner";
import { STATUS_OPTIONS, useTaskManagerJira } from "./hooks/useTaskManagerJira.js";
import { findRunIndexForAssignee } from "../utils/workWeekNavigation";

// ─── Design tokens ────────────────────────────────────────────────────────────

const REMINDERS_STORAGE_KEY = "workWeekTasksReminders";
const REMINDER_SLOT_COUNT = 4;
const TASK_MANAGER_KEY = "ww-task-manager-open";

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

// ─── Main page component ──────────────────────────────────────────────────────

const WorkWeekTasks = () => {
  const {
    presets: epicPresets,
    loading: epicPresetsLoading,
    error: epicPresetsError,
    reloadPresets,
  } = useEpicFilters();
  const [headerPrefs, setHeaderPrefs] = useWorkWeekHeaderPreferences();
  const showJokeTicker = headerPrefs.showJokeTicker;
  const showUpcomingDueBanner = headerPrefs.showUpcomingDueBanner;
  const { tickerJokes, jokeIndex } = useJokeTicker(showJokeTicker);
  const {
    loading: dueBannerLoading,
    error: dueBannerError,
    dueByDate,
    upcomingIssues,
    currentUserDisplayName,
  } = useUpcomingDueBanner(showUpcomingDueBanner);
  const { todayDay, monthLabel, fullDateLabel, calendarCells } = useCalendarData();

  const [reminders, setReminders] = usePersistedState(REMINDERS_STORAGE_KEY, defaultReminderRows(), { sanitize: sanitizeReminders });
  const [importSlotIndex, setImportSlotIndex] = React.useState(null);
  const [createIssueOpen, setCreateIssueOpen] = React.useState(false);
  const [quickPickValueBySlot, setQuickPickValueBySlot] = React.useState({});

  const [searchParams] = useSearchParams();
  const drillDownFilters = React.useMemo(
    () => ({
      key: searchParams.get("key") || "",
      assignee: searchParams.get("assignee") || "",
    }),
    [searchParams]
  );

  const {
    jqlCount, jqlInputs, jqlLabels, jqlLoading, jqlRuns,
    showRestoredJqlBanner, jqlError, jqlMaxResults, pullLatestComment,
    jiraNotes, jiraRowPriorities, prioritySourceByKey, selectedForPush,
    lastPushedJiraNoteByKey, pushState, saveState,
    statusDrafts, assigneeDrafts, rowUpdateState,
    isClosedLikeStatus, clampPriority, getPriorityClass,
    getPriorityRowClass, formatDate, filtersLoading,
    setJqlCount, setJqlMaxResults, setPullLatestComment,
    handleJqlChange, handleJqlLabelChange,
    handleResetSavedQueries, handleRunJql, handleLoadRemainingJql, handleDrillDownToKey, handleDrillDownToAssignee, clearDrillDownRuns, handlePushSelected,
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

  const drillDownKey = drillDownFilters.key.trim();
  const drillDownAssignee = drillDownFilters.assignee.trim();

  const hasDrillDownFilter =
    drillDownKey.length > 0 || drillDownAssignee.length > 0;

  const hasDrillDownTab = jqlRuns.some((run) => {
    if (!run.isDrillDown) {
      return false;
    }
    if (drillDownKey) {
      return (run.issues || []).some(
        (issue) => String(issue.key || "").trim().toUpperCase() === drillDownKey.toUpperCase()
      );
    }
    if (drillDownAssignee) {
      return String(run.drillDownAssignee || "").trim() === drillDownAssignee;
    }
    return true;
  });
  const drillDownPending =
    hasDrillDownFilter && !hasDrillDownTab && jqlLoading;

  const hadDrillDownFilterRef = React.useRef(false);

  React.useEffect(() => {
    if (hasDrillDownFilter) {
      hadDrillDownFilterRef.current = true;
      return;
    }
    if (!hadDrillDownFilterRef.current) {
      return;
    }
    hadDrillDownFilterRef.current = false;
    clearDrillDownRuns();
  }, [hasDrillDownFilter, clearDrillDownRuns]);

  React.useEffect(() => {
    if (!drillDownKey || filtersLoading) {
      return;
    }
    void handleDrillDownToKey(drillDownKey).then((loaded) => {
      if (loaded) {
        setActiveRunIndex(0);
      }
    });
  }, [drillDownKey, filtersLoading, handleDrillDownToKey]);

  React.useEffect(() => {
    if (!drillDownAssignee || filtersLoading || drillDownKey) {
      return;
    }

    if (findRunIndexForAssignee(jqlRuns, drillDownAssignee) >= 0) {
      return;
    }

    if (
      jqlRuns.some(
        (run) =>
          run.isDrillDown &&
          String(run.drillDownAssignee || "").trim() === drillDownAssignee
      )
    ) {
      return;
    }

    void handleDrillDownToAssignee(drillDownAssignee).then((loaded) => {
      if (loaded) {
        setActiveRunIndex(0);
      }
    });
  }, [
    drillDownAssignee,
    drillDownKey,
    filtersLoading,
    handleDrillDownToAssignee,
    jqlRuns,
  ]);

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

  const handleShowJokeTickerChange = React.useCallback((checked) => {
    setHeaderPrefs((prev) => ({ ...prev, showJokeTicker: checked }));
  }, [setHeaderPrefs]);

  const handleShowUpcomingDueBannerChange = React.useCallback((checked) => {
    setHeaderPrefs((prev) => ({ ...prev, showUpcomingDueBanner: checked }));
  }, [setHeaderPrefs]);

  const handleQuickPick = React.useCallback((index, preset) => {
    if (!preset) return;
    const jql = preset.presetType === "jql"
      ? String(preset.jql || "").trim()
      : (preset.epicKey ? `parent = ${preset.epicKey}` : "");
    if (jql) handleJqlChange(index, jql);
    if (preset.label) handleJqlLabelChange(index, preset.label);
  }, [handleJqlChange, handleJqlLabelChange]);

  const handleQuickPickSelect = React.useCallback((index, presetId) => {
    if (!presetId) return;
    const preset = epicPresets.find((p) => String(p.id) === String(presetId));
    if (!preset) return;
    handleQuickPick(index, preset);
    setQuickPickValueBySlot((prev) => ({ ...prev, [index]: "" }));
  }, [epicPresets, handleQuickPick]);

  return (
    <>
      <Container fluid className="work-week-page">
        <TaskManagerHeaderPanel
          showJokeTicker={showJokeTicker}
          showUpcomingDueBanner={showUpcomingDueBanner}
          onShowJokeTickerChange={handleShowJokeTickerChange}
          onShowUpcomingDueBannerChange={handleShowUpcomingDueBannerChange}
          tickerJokes={tickerJokes}
          jokeIndex={jokeIndex}
          dueBannerLoading={dueBannerLoading}
          dueBannerError={dueBannerError}
          dueByDate={dueByDate}
          upcomingIssues={upcomingIssues}
          currentUserDisplayName={currentUserDisplayName}
          fullDateLabel={fullDateLabel} monthLabel={monthLabel}
          calendarCells={calendarCells} todayDay={todayDay}
          reminders={reminders}
          onReminderTextChange={handleReminderTextChange}
          onReminderDoneChange={handleReminderDoneChange}
          weeklyPlanPanel={
            <WeeklyPlanPanel jqlRuns={jqlRuns} jiraRowPriorities={jiraRowPriorities} />
          }
        />

        <CollapsibleSection title="🗂️ Task Manager" storageKey={TASK_MANAGER_KEY} defaultOpen>
          <div className="ww-task-manager-body">
            {epicPresetsError ? (
              <Message warning size="small">
                Could not load Epic/JQL presets for Quick pick ({epicPresetsError}). Is the API
                running at <code>http://localhost:8787</code>? Try{" "}
                <code>npm run dev:api</code> or <code>npm run dev:all</code>, then{" "}
                <button type="button" className="ww-page-btn" onClick={() => void reloadPresets()}>
                  retry
                </button>
                .
              </Message>
            ) : null}
            {!epicPresetsLoading && !epicPresetsError && epicPresets.length === 0 ? (
              <Message info size="small">
                No presets in the database yet. Add them in Settings → Epic & JQL presets, or run{" "}
                <code>npm run seed:presets -- --all</code>.
              </Message>
            ) : null}
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
                      <label className="ww-quick-pick-label" htmlFor={`quick-pick-${index}`}>
                        Quick pick:
                      </label>
                      <select
                        id={`quick-pick-${index}`}
                        className="ww-quick-pick-select"
                        value={quickPickValueBySlot[index] ?? ""}
                        onChange={(e) => handleQuickPickSelect(index, e.target.value)}
                      >
                        <option value="">Choose preset…</option>
                        {epicPresets.map((preset) => (
                          <option
                            key={`qp-${index}-${preset.id}`}
                            value={preset.id}
                            title={
                              preset.presetType === "jql"
                                ? (preset.jql || preset.label)
                                : preset.epicKey
                            }
                          >
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="ww-import-filter-btn ww-import-filter-btn-inline"
                      onClick={() => setImportSlotIndex(index)}
                    >
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

            <div className="ww-jql-pull-comments">
              <span className="ww-jql-pull-comments-label">Notes on run</span>
              <label className="ww-jql-pull-comments-option">
                <input
                  type="radio"
                  name="jqlPullComments"
                  value="off"
                  checked={!pullLatestComment}
                  onChange={() => setPullLatestComment(false)}
                />
                Keep local notes
              </label>
              <label className="ww-jql-pull-comments-option">
                <input
                  type="radio"
                  name="jqlPullComments"
                  value="latest"
                  checked={pullLatestComment}
                  onChange={() => setPullLatestComment(true)}
                />
                Pull most recent Jira comment
              </label>
              <button
                type="button"
                className="ww-selector-clear"
                onClick={() => setPullLatestComment(false)}
              >
                Clear
              </button>
              <span className="ww-jql-pull-comments-hint">
                When enabled, Run JQL and Refresh overwrite note text with each issue&apos;s latest Jira comment.
              </span>
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
        </CollapsibleSection>

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

        {hasDrillDownFilter ? (
          <div className="ww-drill-down-banner">
            <div className="ww-drill-down-banner-content">
              <strong>Dashboard drill-down</strong>
              <p className="ww-restored-jql-banner-copy">
                {drillDownFilters.key ? `Filtering to ${drillDownFilters.key}` : null}
                {drillDownFilters.key && drillDownFilters.assignee ? " · " : null}
                {drillDownFilters.assignee ? `assignee ${drillDownFilters.assignee}` : null}
                {jqlLoading ? " — loading from Jira…" : null}
                {!jqlLoading && jqlError && drillDownKey ? ` — ${jqlError}` : null}
              </p>
              <Link to="/work-week" className="ww-drill-down-clear-link">
                Clear drill-down
              </Link>
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
          prioritySourceByKey={prioritySourceByKey}
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
          onLoadRemaining={handleLoadRemainingJql}
          jqlLoading={jqlLoading}
          drillDownFilters={drillDownFilters}
          drillDownPending={drillDownPending}
        />

      </Container>
      <Divider />

      {importSlotIndex !== null ? (
        <JiraFilterImportModal
          open={importSlotIndex !== null}
          onClose={() => setImportSlotIndex(null)}
          slotLabel={`JQL slot ${importSlotIndex + 1}`}
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
