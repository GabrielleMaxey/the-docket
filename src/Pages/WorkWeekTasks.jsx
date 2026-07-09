import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Container, Divider } from "semantic-ui-react";
import "./workWeekTaskElements.css";
import CollapsibleSection from "../Components/CollapsibleSection";
import JiraResultsTable from "./components/JiraResultsTable";
import TaskManagerHeaderPanel from "./components/TaskManagerHeaderPanel";
import JiraFilterImportModal from "./components/JiraFilterImportModal";
import CreateIssueModal from "./components/CreateIssueModal";
import JqlControlsPanel from "./components/JqlControlsPanel";
import WeeklyPlanPanel from "./components/WeeklyPlanPanel";
import MyMetricsSection from "./components/MyMetricsSection";
import { useEpicFilters } from "../context/EpicFiltersContext.jsx";
import { usePersistedState } from "./hooks/usePersistedState";
import { useJokeTicker } from "./hooks/useJokeTicker";
import { useCalendarData } from "./hooks/useCalendarData";
import { useWorkWeekHeaderPreferences } from "./hooks/useWorkWeekHeaderPreferences";
import { useUpcomingDueBanner } from "./hooks/useUpcomingDueBanner";
import { STATUS_OPTIONS, useTaskManagerJira } from "./hooks/useTaskManagerJira.js";
import { isDrillDownDismissed } from "../utils/jqlRunPersistence.js";
import { resolveCreateIssueDefaults } from "../../shared/createIssuePresetUtils.mjs";
import { isConfiguredJqlRun, normalizeJqlCount, WORK_WEEK_STORAGE_KEYS } from "../utils/workWeekStorage.js";

// ─── Design tokens ────────────────────────────────────────────────────────────

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

  const [reminders, setReminders] = usePersistedState(WORK_WEEK_STORAGE_KEYS.reminders, defaultReminderRows(), { sanitize: sanitizeReminders });
  const [importSlotIndex, setImportSlotIndex] = React.useState(null);
  const [createIssueOpen, setCreateIssueOpen] = React.useState(false);
  const [quickPickValueBySlot, setQuickPickValueBySlot] = React.useState({});
  const drillDownBannerRef = React.useRef(null);

  const navigate = useNavigate();
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
    showRestoredJqlBanner, jqlError, jqlMaxResults, pullLatestComment, assigneeRefreshNotice,
    jiraNotes, jiraRowPriorities, prioritySourceByKey, selectedForPush,
    lastPushedJiraNoteByKey, pushState, saveState,
    statusDrafts, assigneeDrafts, rowUpdateState,
    isClosedLikeStatus, clampPriority, getPriorityClass,
    getPriorityRowClass, formatDate, filtersLoading,
    setJqlCount, setJqlMaxResults, setPullLatestComment,
    handleJqlChange, handleJqlLabelChange,
    handleResetSavedQueries, handleRunJql, handleLoadRemainingJql, handleDrillDownToKey, handleDrillDownToAssignee, clearDrillDownRun, handlePushSelected,
    handleSaveMetadata, handleSelectAll, handleStatusDraftChange,
    handleStatusUpdate, handleAssigneeDraftChange, handleAssigneeUpdate,
    handleRowPriorityChange, handleNoteChange, handleSelectForPush, handlePushNote,
  } = useTaskManagerJira();

  const [activeRunIndex, setActiveRunIndex] = React.useState(0);

  const activeRun = React.useMemo(() => {
    if (!Array.isArray(jqlRuns) || jqlRuns.length === 0) return null;
    const idx = Number.isFinite(activeRunIndex) ? activeRunIndex : 0;
    return jqlRuns[Math.max(0, Math.min(jqlRuns.length - 1, idx))] || jqlRuns[0];
  }, [jqlRuns, activeRunIndex]);

  const drillDownKey = drillDownFilters.key.trim();
  const drillDownAssignee = drillDownFilters.assignee.trim();
  const drillDownKeyId = drillDownKey
    ? `issue:${drillDownKey.toLowerCase()}`
    : "";
  const drillDownAssigneeId = drillDownAssignee
    ? `assignee:${drillDownAssignee.toLowerCase()}`
    : "";

  const hasDrillDownFilter =
    drillDownKey.length > 0 || drillDownAssignee.length > 0;

  const jqlRunsRef = React.useRef(jqlRuns);
  React.useEffect(() => {
    jqlRunsRef.current = jqlRuns;
  }, [jqlRuns]);

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
  const drillDownDismissed =
    (drillDownKeyId && isDrillDownDismissed(drillDownKeyId)) ||
    (drillDownAssigneeId && isDrillDownDismissed(drillDownAssigneeId));
  const drillDownPending =
    hasDrillDownFilter && !drillDownDismissed && !hasDrillDownTab && !jqlError;

  React.useEffect(() => {
    if (!hasDrillDownFilter) {
      return;
    }

    window.requestAnimationFrame(() => {
      drillDownBannerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [hasDrillDownFilter, drillDownAssignee, drillDownKey]);

  React.useEffect(() => {
    if (!drillDownKey || filtersLoading || isDrillDownDismissed(drillDownKeyId)) {
      return;
    }
    void handleDrillDownToKey(drillDownKey).then((loaded) => {
      if (loaded) {
        setActiveRunIndex(0);
      }
    });
  }, [drillDownKey, drillDownKeyId, filtersLoading, handleDrillDownToKey]);

  React.useEffect(() => {
    if (!drillDownAssignee || filtersLoading || drillDownKey || isDrillDownDismissed(drillDownAssigneeId)) {
      return;
    }

    if (
      jqlRunsRef.current.some(
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
  }, [drillDownAssignee, drillDownAssigneeId, drillDownKey, filtersLoading, handleDrillDownToAssignee]);

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

  const handleJqlCountChange = React.useCallback((value) => {
    setJqlCount(normalizeJqlCount(value));
  }, [setJqlCount]);

  const handleClearDrillDownFilter = React.useCallback(() => {
    navigate("/work-week");
  }, [navigate]);

  const routeFilterMatchesRun = React.useCallback(
    (run) => {
      if (!run?.isDrillDown) {
        return false;
      }
      if (drillDownKey && run.drillDownType === "issue") {
        return (run.issues || []).some(
          (issue) => String(issue.key || "").trim().toUpperCase() === drillDownKey.toUpperCase()
        );
      }
      if (drillDownAssignee && run.drillDownType === "assignee") {
        return String(run.drillDownAssignee || "").trim() === drillDownAssignee;
      }
      return false;
    },
    [drillDownAssignee, drillDownKey]
  );

  const handleClearDrillDownRun = React.useCallback(
    (run) => {
      clearDrillDownRun(run?.drillDownId);
      if (routeFilterMatchesRun(run)) {
        handleClearDrillDownFilter();
      }
    },
    [clearDrillDownRun, handleClearDrillDownFilter, routeFilterMatchesRun]
  );

  const createIssueDefaults = React.useMemo(() => {
    if (activeRun?.jql || activeRun?.label) {
      return resolveCreateIssueDefaults({
        epicPresets,
        jql: activeRun.jql,
        label: activeRun.label,
      });
    }

    for (let index = 0; index < jqlInputs.length; index += 1) {
      const jql = String(jqlInputs[index] || "").trim();
      const label = String(jqlLabels[index] || "").trim();
      if (!jql && !label) {
        continue;
      }
      const defaults = resolveCreateIssueDefaults({ epicPresets, jql, label });
      if (defaults.epicSelectValue) {
        return defaults;
      }
    }

    return { presetId: "", epicKey: "", epicSelectValue: "" };
  }, [activeRun, epicPresets, jqlInputs, jqlLabels]);

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
          <JqlControlsPanel
            epicPresets={epicPresets}
            epicPresetsLoading={epicPresetsLoading}
            epicPresetsError={epicPresetsError}
            onReloadPresets={() => void reloadPresets()}
            onCreateIssue={() => setCreateIssueOpen(true)}
            jqlCount={jqlCount}
            jqlInputs={jqlInputs}
            jqlLabels={jqlLabels}
            onJqlCountChange={handleJqlCountChange}
            onJqlChange={handleJqlChange}
            onJqlLabelChange={handleJqlLabelChange}
            quickPickValueBySlot={quickPickValueBySlot}
            onQuickPickSelect={handleQuickPickSelect}
            onImportSlot={setImportSlotIndex}
            jqlMaxResults={jqlMaxResults}
            onJqlMaxResultsChange={setJqlMaxResults}
            pullLatestComment={pullLatestComment}
            onPullLatestCommentChange={setPullLatestComment}
            onRunJql={handleRunJql}
            onResetSavedQueries={handleResetSavedQueriesWithConfirm}
            jqlLoading={jqlLoading}
            filtersLoading={filtersLoading}
            jqlError={jqlError}
          />
        </CollapsibleSection>

        {jqlRuns.some((r) => r.issues?.length > 0) ? null : null}

        {showRestoredJqlBanner && jqlRuns.some(isConfiguredJqlRun) ? (
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
          <div className="ww-drill-down-banner" ref={drillDownBannerRef}>
            <div className="ww-drill-down-banner-content">
              <strong>Dashboard drill-down</strong>
              <p className="ww-restored-jql-banner-copy">
                {drillDownFilters.key ? `Filtering to ${drillDownFilters.key}` : null}
                {drillDownFilters.key && drillDownFilters.assignee ? " · " : null}
                {drillDownFilters.assignee ? `assignee ${drillDownFilters.assignee}` : null}
                {drillDownPending || jqlLoading ? " — loading from Jira…" : null}
                {!drillDownPending && !jqlLoading && jqlError ? ` — ${jqlError}` : null}
              </p>
              <button
                type="button"
                className="ww-drill-down-clear-link"
                onClick={handleClearDrillDownFilter}
              >
                Clear filter
              </button>
            </div>
          </div>
        ) : null}

        {assigneeRefreshNotice ? (
          <p className="ww-jira-status ww-inline-hint">{assigneeRefreshNotice}</p>
        ) : null}

        {/* My Metrics — directly below restored-results banner; scoped to active tab */}
        {jqlRuns.some((r) => isConfiguredJqlRun(r) && r.issues?.length > 0) && activeRun?.issues?.length > 0 ? (
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
          onClearDrillDownRun={handleClearDrillDownRun}
          onClearDrillDownFilter={hasDrillDownFilter ? handleClearDrillDownFilter : null}
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
        defaultEpicSelectValue={createIssueDefaults.epicSelectValue}
        onCreated={() => void handleRunJql()}
      />
    </>
  );
};

export default WorkWeekTasks;
