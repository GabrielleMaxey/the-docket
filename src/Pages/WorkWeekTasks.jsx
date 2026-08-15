import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Container, Divider } from "semantic-ui-react";
import "./workWeekTaskElements.css";
import "./priorityScale.css";
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
import { fetchSharedPrograms } from "../services/jiraClient.js";
import { isDrillDownDismissed } from "../utils/jqlRunPersistence.js";
import { resolveCreateIssueDefaults } from "../../shared/createIssuePresetUtils.mjs";
import {
  buildSharedProgramJql,
  isConfiguredJqlRun,
  isConfiguredJqlSlot,
  normalizeJqlCount,
  shouldReplaceSlotQueryForSharedProgram,
  WORK_WEEK_STORAGE_KEYS,
} from "../utils/workWeekStorage.js";

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

const patchSlotValue = (values, index, value) => {
  const next = Array.isArray(values) ? [...values] : [];
  next[index] = value;
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
      epicPresetId: searchParams.get("epicPresetId") || "",
      jql: searchParams.get("jql") || "",
      label: searchParams.get("label") || "",
    }),
    [searchParams]
  );

  const {
    jqlCount, jqlInputs, jqlLabels, jqlSharedProgramIds, jqlLoading, jqlRuns,
    showRestoredJqlBanner, jqlError, jqlMaxResults, pullLatestComment, assigneeRefreshNotice,
    jiraNotes, jiraRowPriorities, prioritySourceByKey, selectedForPush,
    lastPushedJiraNoteByKey, pushState, saveState,
    statusDrafts, assigneeDrafts, rowUpdateState, noteImagesByKey, noteImageErrorsByKey,
    keepNoteImagesByKey, noteImageKeepPendingByKey,
    isClosedLikeStatus, clampPriority, getPriorityClass,
    getPriorityRowClass, formatDate, filtersLoading,
    setJqlCount, setJqlMaxResults, setPullLatestComment,
    handleJqlChange, handleJqlLabelChange, handleJqlSharedProgramChange,
    handleResetSavedQueries, handleRunJql, handleLoadRemainingJql, handleDrillDownToKey, handleDrillDownToAssignee, handleDrillDownToJql, clearDrillDownRun, handlePushSelected,
    handleSaveMetadata, handleSelectAll, handleStatusDraftChange,
    handleStatusUpdate, handleAssigneeDraftChange, handleAssigneeUpdate,
    handleRowPriorityChange, handleNoteChange, handleNoteImagesAdd, handleNoteImageRemove,
    handleKeepNoteImagesToggle,
    handleSelectForPush, handlePushNote,
  } = useTaskManagerJira();

  const [sharedPrograms, setSharedPrograms] = React.useState([]);

  React.useEffect(() => {
    let cancelled = false;
    fetchSharedPrograms()
      .then((items) => {
        if (!cancelled) {
          setSharedPrograms(Array.isArray(items) ? items : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSharedPrograms([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [activeRunIndex, setActiveRunIndex] = React.useState(0);

  const activeRun = React.useMemo(() => {
    if (!Array.isArray(jqlRuns) || jqlRuns.length === 0) return null;
    const idx = Number.isFinite(activeRunIndex) ? activeRunIndex : 0;
    return jqlRuns[Math.max(0, Math.min(jqlRuns.length - 1, idx))] || jqlRuns[0];
  }, [jqlRuns, activeRunIndex]);

  const drillDownKey = drillDownFilters.key.trim();
  const drillDownAssignee = drillDownFilters.assignee.trim();
  const drillDownEpicPresetId = drillDownFilters.epicPresetId.trim();
  const drillDownJql = drillDownFilters.jql.trim();
  const drillDownJqlLabel = drillDownFilters.label.trim() || "Work Week";
  const drillDownKeyId = drillDownKey
    ? `issue:${drillDownKey.toLowerCase()}`
    : "";
  const drillDownAssigneeId = drillDownAssignee
    ? `assignee:${drillDownAssignee.toLowerCase()}${drillDownEpicPresetId ? `:${drillDownEpicPresetId}` : ""}`
    : "";
  const drillDownJqlId = drillDownJql
    ? `jql:${`${drillDownJqlLabel}:${drillDownJql}`.slice(0, 160).toLowerCase()}`
    : "";

  // Both fields must match so "Unassigned" clicked from two different
  // project cards doesn't collide into the same tab.
  const matchesDrillDownAssignee = React.useCallback(
    (run) =>
      String(run.drillDownAssignee || "").trim() === drillDownAssignee &&
      String(run.drillDownEpicPresetId || "").trim() === drillDownEpicPresetId,
    [drillDownAssignee, drillDownEpicPresetId]
  );

  const hasDrillDownFilter =
    drillDownKey.length > 0 || drillDownAssignee.length > 0 || drillDownJql.length > 0;

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
      return matchesDrillDownAssignee(run);
    }
    if (drillDownJql) {
      return run.drillDownType === "jql" && String(run.jql || "").trim() === drillDownJql;
    }
    return true;
  });
  const drillDownDismissed =
    (drillDownKeyId && isDrillDownDismissed(drillDownKeyId)) ||
    (drillDownAssigneeId && isDrillDownDismissed(drillDownAssigneeId)) ||
    (drillDownJqlId && isDrillDownDismissed(drillDownJqlId));
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
  }, [hasDrillDownFilter, drillDownAssignee, drillDownJql, drillDownKey]);

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
        (run) => run.isDrillDown && matchesDrillDownAssignee(run)
      )
    ) {
      return;
    }

    void handleDrillDownToAssignee(drillDownAssignee, { epicPresetId: drillDownEpicPresetId }).then((loaded) => {
      if (loaded) {
        setActiveRunIndex(0);
      }
    });
  }, [
    drillDownAssignee,
    drillDownAssigneeId,
    drillDownEpicPresetId,
    drillDownKey,
    filtersLoading,
    handleDrillDownToAssignee,
    matchesDrillDownAssignee,
  ]);

  React.useEffect(() => {
    if (!drillDownJql || filtersLoading || drillDownKey || drillDownAssignee || isDrillDownDismissed(drillDownJqlId)) {
      return;
    }

    if (
      jqlRunsRef.current.some(
        (run) => run.isDrillDown && run.drillDownType === "jql" && String(run.jql || "").trim() === drillDownJql
      )
    ) {
      return;
    }

    void handleDrillDownToJql(drillDownJql, drillDownJqlLabel).then((loaded) => {
      if (loaded) {
        setActiveRunIndex(0);
      }
    });
  }, [
    drillDownAssignee,
    drillDownJql,
    drillDownJqlId,
    drillDownJqlLabel,
    drillDownKey,
    filtersLoading,
    handleDrillDownToJql,
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

  const handleSharedProgramChange = React.useCallback(
    (index, value) => {
      const nextSlug = String(value || "").trim();
      const previousSlug = String(jqlSharedProgramIds[index] || "").trim();
      const previousProgram = sharedPrograms.find((program) => program.slug === previousSlug);
      const nextProgram = sharedPrograms.find((program) => program.slug === nextSlug);

      let nextInputs = jqlInputs;
      let nextLabels = jqlLabels;
      const nextProgramIds = patchSlotValue(jqlSharedProgramIds, index, nextSlug);

      handleJqlSharedProgramChange(index, nextSlug);
      if (nextProgram) {
        const generatedJql = buildSharedProgramJql(nextProgram.epicRoots);
        const previousGeneratedJql = buildSharedProgramJql(previousProgram?.epicRoots);
        const { replaceJql, replaceLabel } = shouldReplaceSlotQueryForSharedProgram({
          jql: jqlInputs[index],
          label: jqlLabels[index],
          index,
          previousGeneratedJql,
          previousLabel: previousProgram?.displayName || previousProgram?.slug || "",
        });

        if (replaceJql && generatedJql) {
          nextInputs = patchSlotValue(jqlInputs, index, generatedJql);
          handleJqlChange(index, generatedJql);
        }
        if (replaceLabel) {
          const nextLabel = nextProgram.displayName || nextProgram.slug;
          nextLabels = patchSlotValue(jqlLabels, index, nextLabel);
          handleJqlLabelChange(index, nextLabel);
        }
      }

      if (isConfiguredJqlSlot(nextInputs, nextLabels, index)) {
        handleRunJql({
          jqlInputs: nextInputs,
          jqlLabels: nextLabels,
          jqlSharedProgramIds: nextProgramIds,
        });
      }
    },
    [
      handleJqlChange,
      handleJqlLabelChange,
      handleJqlSharedProgramChange,
      handleRunJql,
      jqlInputs,
      jqlLabels,
      jqlSharedProgramIds,
      sharedPrograms,
    ]
  );

  const handleQuickPick = React.useCallback((index, preset) => {
    if (!preset) return { jqlInputs, jqlLabels };
    const jql = preset.presetType === "jql"
      ? String(preset.jql || "").trim()
      : (preset.epicKey ? `parent = ${preset.epicKey}` : "");
    let nextInputs = jqlInputs;
    let nextLabels = jqlLabels;
    if (jql) {
      nextInputs = patchSlotValue(jqlInputs, index, jql);
      handleJqlChange(index, jql);
    }
    if (preset.label) {
      nextLabels = patchSlotValue(jqlLabels, index, preset.label);
      handleJqlLabelChange(index, preset.label);
    }
    return { jqlInputs: nextInputs, jqlLabels: nextLabels };
  }, [handleJqlChange, handleJqlLabelChange, jqlInputs, jqlLabels]);

  const handleQuickPickSelect = React.useCallback((index, presetId) => {
    if (!presetId) return;
    const preset = epicPresets.find((p) => String(p.id) === String(presetId));
    if (!preset) return;
    const next = handleQuickPick(index, preset);
    setQuickPickValueBySlot((prev) => ({ ...prev, [index]: "" }));
    if (isConfiguredJqlSlot(next.jqlInputs, next.jqlLabels, index)) {
      handleRunJql(next);
    }
  }, [epicPresets, handleQuickPick, handleRunJql]);

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
        return matchesDrillDownAssignee(run);
      }
      if (drillDownJql && run.drillDownType === "jql") {
        return String(run.jql || "").trim() === drillDownJql;
      }
      return false;
    },
    [drillDownAssignee, drillDownJql, drillDownKey, matchesDrillDownAssignee]
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
            jqlSharedProgramIds={jqlSharedProgramIds}
            sharedPrograms={sharedPrograms}
            onJqlCountChange={handleJqlCountChange}
            onJqlChange={handleJqlChange}
            onJqlLabelChange={handleJqlLabelChange}
            onJqlSharedProgramChange={handleSharedProgramChange}
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
                {drillDownFilters.assignee && drillDownEpicPresetId ? " in this project" : null}
                {drillDownJql ? `${drillDownJqlLabel} tasks` : null}
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
          noteImagesByKey={noteImagesByKey} noteImageErrorsByKey={noteImageErrorsByKey}
          keepNoteImagesByKey={keepNoteImagesByKey} noteImageKeepPendingByKey={noteImageKeepPendingByKey}
          isClosedLikeStatus={isClosedLikeStatus} clampPriority={clampPriority}
          getPriorityClass={getPriorityClass} getPriorityRowClass={getPriorityRowClass}
          formatDate={formatDate} handlePushSelected={handlePushSelected}
          handleSaveMetadata={handleSaveMetadata} handleSelectAll={handleSelectAll}
          handleStatusDraftChange={handleStatusDraftChange} handleStatusUpdate={handleStatusUpdate}
          handleAssigneeDraftChange={handleAssigneeDraftChange} handleAssigneeUpdate={handleAssigneeUpdate}
          handleRowPriorityChange={handleRowPriorityChange} handleNoteChange={handleNoteChange}
          handleNoteImagesAdd={handleNoteImagesAdd} handleNoteImageRemove={handleNoteImageRemove}
          handleKeepNoteImagesToggle={handleKeepNoteImagesToggle}
          handleSelectForPush={handleSelectForPush} handlePushNote={handlePushNote}
          onActiveTabChange={setActiveRunIndex}
          jqlSharedProgramIds={jqlSharedProgramIds}
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
