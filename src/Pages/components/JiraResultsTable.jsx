import { FOLLOW_UP_OPTIONS } from "../../../shared/issueMetadataFields.mjs";
import React from "react";
import { Button, Modal } from "semantic-ui-react";
import CombinedOpenWork from "../CombinedOpenWork.jsx";
import PriorityCell from "./cells/PriorityCell";
import AssigneeCell from "./cells/AssigneeCell.jsx";
import NoteImagesStrip from "./NoteImagesStrip.jsx";
import NoteFormattedField from "../../Components/NoteFormattedField.jsx";
import AttachFilesModal from "./AttachFilesModal.jsx";
import { findRunIndexForDrillDown, getRunStateKey } from "../../utils/workWeekNavigation.js";
import { getMostRecentDoneDateForIssue } from "../../utils/jiraIssueDoneDates.js";
import {
  getFieldValue,
  formatDateOnly,
  matchesIssueTypeFamily,
} from "../../../shared/dashboardMetrics.mjs";
import { isConfiguredJqlRun } from "../../utils/workWeekStorage.js";
import { buildNotePushFingerprint } from "../../utils/notePushFingerprint.js";
import {
  filterIssues,
  getIssueBrowseUrl,
  getKnownAssignees,
  getKnownStatuses,
  noteMatchesLastJiraPush,
  parseIssueLinks,
  sortIssues,
} from "./jiraResultsTableUtils.js";

const IssueLinkLine = ({ linkType, linkedKey, browseUrl }) => (
  <span className="ww-issue-link-line">
    {linkType ? `${linkType} ` : ""}
    {browseUrl ? (
      <a href={browseUrl} target="_blank" rel="noreferrer noopener">
        {linkedKey}
      </a>
    ) : (
      linkedKey
    )}
  </span>
);

const PAGE_SIZE = 30;
const SORT_FIELDS = [
  { value: "default", label: "Default" },
  { value: "assignee", label: "Assignee" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "key", label: "Key" },
];

const ResultsPagerBar = ({
  placement,
  currentPage,
  totalPages,
  totalRows,
  rowStartDisplay,
  rowEndDisplay,
  onFirst,
  onPrev,
  onNext,
  onLast,
}) => {
  const rowRangeLabel =
    totalRows === 0
      ? "No rows on this page"
      : `Rows ${rowStartDisplay}–${rowEndDisplay} of ${totalRows}`;

  const suffix = placement === "bottom" ? "bottom of table" : "top of table";

  return (
    <div
      className={"ww-pager-bar" + (placement === "bottom" ? " is-bottom" : "")}
      role="navigation"
      aria-label={`Results pagination (${suffix})`}
    >
      <button
        type="button"
        className="ww-page-btn"
        onClick={onFirst}
        disabled={currentPage <= 1 || totalPages <= 1}
        aria-label="First page"
      >
        First
      </button>
      <button
        type="button"
        className="ww-page-btn"
        onClick={onPrev}
        disabled={currentPage <= 1}
        aria-label="Previous page"
      >
        Prev
      </button>
      <span className="ww-page-meta">
        Page {currentPage} of {totalPages}
      </span>
      <span className="ww-page-row-range">{rowRangeLabel}</span>
      <button
        type="button"
        className="ww-page-btn"
        onClick={onNext}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
      >
        Next
      </button>
      <button
        type="button"
        className="ww-page-btn"
        onClick={onLast}
        disabled={currentPage >= totalPages || totalPages <= 1}
        aria-label="Last page"
      >
        Last
      </button>
    </div>
  );
};

const JiraResultsTable = ({
  jqlRuns = [],
  combinedRun,
  getIssueStateKey = (issue) => issue.key,
  expandedPlanningKeys,
  teamPlanningMetaByKey,
  teamStartDateByKey,
  teamCompleteDateByKey,
  selectedForPush,
  pushState,
  saveState,
  rowUpdateState,
  statusDrafts,
  iddDrafts,
  dueDateDrafts,
  mrdDrafts,
  startDateByKey,
  completeDateByKey,
  planningMetaByKey,
  expandedPlanningKey,
  collapsedRowKeys,
  assigneeDrafts,
  jiraRowPriorities,
  jiraNotes,
  noteImagesByKey,
  noteImageErrorsByKey,
  keepNoteImagesByKey,
  noteImageKeepPendingByKey,
  lastPushedJiraNoteByKey,
  statusOptions,
  isClosedLikeStatus,
  clampPriority,
  getPriorityClass,
  getPriorityRowClass,
  formatDate,
  handlePushSelected,
  handleSaveMetadata,
  handleSelectAll,
  handleStatusDraftChange,
  handleStatusUpdate,
  handleIddDraftChange,
  handleIddUpdate,
  handleDueDateDraftChange,
  handleDueDateUpdate,
  handleMrdDraftChange,
  handleMrdUpdate,
  handleStartDateChange,
  handleCompleteDateChange,
  handleClearDateTracking,
  handleTogglePlanningRow,
  handleToggleRowExpand,
  handleExpandAllRows,
  handleCollapseAllRows,
  handleSavePlanningAll,
  handlePlanningFieldChange,
  handlePinnedGanttChange,
  handleAssigneeDraftChange,
  handleAssigneeUpdate,
  handleRowPriorityChange,
  handleNoteChange,
  handleNoteImagesAdd,
  handleNoteImageRemove,
  handleKeepNoteImagesToggle,
  handleSelectForPush,
  handlePushNote,
  onActiveTabChange,
  combinedOpenWorkActive,
  onCombinedOpenWorkChange,
  initialActiveRunIndex,
  prioritySourceByKey,
  jqlSharedProgramIds,
  teamEnabled = false,
  hydrationReady = true,
  onLoadRemaining,
  onClearDrillDownRun,
  onClearDrillDownFilter,
  jqlLoading,
  drillDownFilters,
  drillDownPending,
}) => {
  // Restore the previously-active tab (by jqlRuns index) on mount — falls back to 0
  // when the index is unset, out of range, or that run is no longer configured.
  const [activeTab, setActiveTab] = React.useState(() => {
    if (!Number.isFinite(initialActiveRunIndex) || initialActiveRunIndex < 0) {
      return 0;
    }
    const targetRun = (jqlRuns || [])[initialActiveRunIndex];
    if (!targetRun) {
      return 0;
    }
    const idx = (jqlRuns || []).filter(isConfiguredJqlRun).indexOf(targetRun);
    return idx >= 0 ? idx : 0;
  });
  const [pageByRunIndex, setPageByRunIndex] = React.useState({});
  const [attachTarget, setAttachTarget] = React.useState(null);
  const [keyFilterByRunIndex, setKeyFilterByRunIndex] = React.useState({});
  const [keywordFilterByRunIndex, setKeywordFilterByRunIndex] = React.useState({});
  const [statusFilterByRunIndex, setStatusFilterByRunIndex] = React.useState({});
  const [assigneeFilterByRunIndex, setAssigneeFilterByRunIndex] = React.useState({});
  const [subtaskBugOnlyByRunIndex, setSubtaskBugOnlyByRunIndex] = React.useState({});
  const [includeStoriesByRunIndex, setIncludeStoriesByRunIndex] = React.useState({});
  const [sortField, setSortField] = React.useState("default");
  const [sortDirection, setSortDirection] = React.useState("asc");
  const [expandedNoteKey, setExpandedNoteKey] = React.useState(null);
  const [planningDestinationByKey, setPlanningDestinationByKey] = React.useState({});
  const [planSaveStatus, setPlanSaveStatus] = React.useState({});
  const planSaveTimers = React.useRef({});

  const triggerPlanSave = React.useCallback((issueKey, sharedProgramId, forceTeam = false) => {
    setPlanSaveStatus((prev) => ({ ...prev, [issueKey]: "saving" }));
    clearTimeout(planSaveTimers.current[issueKey]);
    handleSavePlanningAll(issueKey, { sharedProgramId, forceTeam })
      .then(() => {
        setPlanSaveStatus((prev) => ({ ...prev, [issueKey]: "saved" }));
        planSaveTimers.current[issueKey] = setTimeout(() => {
          setPlanSaveStatus((prev) => ({ ...prev, [issueKey]: "idle" }));
        }, 3000);
      })
      .catch(() => {
        setPlanSaveStatus((prev) => ({ ...prev, [issueKey]: "error" }));
        planSaveTimers.current[issueKey] = setTimeout(() => {
          setPlanSaveStatus((prev) => ({ ...prev, [issueKey]: "idle" }));
        }, 5000);
      });
  }, [handleSavePlanningAll]);

  const pendingDrillDownRun = React.useMemo(() => {
    if (!drillDownPending) {
      return null;
    }

    return {
      index: "pending-drill-down",
      drillDownId: "pending-drill-down",
      label: "Loading drill-down...",
      jql: "",
      issues: [],
      total: 0,
      loaded: 0,
      loadComplete: true,
      isDrillDown: true,
      isPendingDrillDown: true,
    };
  }, [drillDownPending]);

  const visibleRuns = React.useMemo(() => {
    const configuredRuns = combinedRun ? [combinedRun] : (jqlRuns || []).filter(isConfiguredJqlRun);
    return pendingDrillDownRun ? [pendingDrillDownRun, ...configuredRuns] : configuredRuns;
  }, [jqlRuns, pendingDrillDownRun, combinedRun]);


  const getJqlRunsIndex = React.useCallback(
    (item) => {
      if (!item || item.isPendingDrillDown) {
        return null;
      }

      const directIdx = jqlRuns.indexOf(item);
      if (directIdx >= 0) {
        return directIdx;
      }

      if (item.isDrillDown) {
        return jqlRuns.findIndex((run) => run.drillDownId && run.drillDownId === item.drillDownId);
      }

      return jqlRuns.findIndex(
        (run) =>
          !run.isDrillDown &&
          (run.index ?? -1) === (item.index ?? -1) &&
          String(run.jql || "").trim() === String(item.jql || "").trim()
      );
    },
    [jqlRuns]
  );

  React.useEffect(() => {
    setActiveTab((prev) => Math.min(Math.max(prev, 0), Math.max(0, visibleRuns.length - 1)));
  }, [visibleRuns.length]);

  const hadDrillDownFiltersRef = React.useRef(false);

  React.useEffect(() => {
    const key = String(drillDownFilters?.key || "").trim();
    const assignee = String(drillDownFilters?.assignee || "").trim();
    const jql = String(drillDownFilters?.jql || "").trim();
    const epicPresetId = String(drillDownFilters?.epicPresetId || "").trim();
    const hasFilters = Boolean(key || assignee || jql);

    if (!hasFilters) {
      if (!hadDrillDownFiltersRef.current) {
        return;
      }
      hadDrillDownFiltersRef.current = false;
      setKeyFilterByRunIndex({});
      setAssigneeFilterByRunIndex({});
      setPageByRunIndex({});
      return;
    }

    if (visibleRuns.length === 0) {
      return;
    }

    hadDrillDownFiltersRef.current = true;

    const targetTab = findRunIndexForDrillDown(visibleRuns, { key, assignee, jql, epicPresetId });
    const safeTargetTab = targetTab >= 0 ? targetTab : 0;
    const targetRun = visibleRuns[safeTargetTab];
    const stateKey = getRunStateKey(targetRun, safeTargetTab);

    setActiveTab(safeTargetTab);
    if (onActiveTabChange && !targetRun?.isPendingDrillDown) {
      const runsIdx = getJqlRunsIndex(targetRun);
      if (runsIdx !== null && runsIdx >= 0) {
        onActiveTabChange(runsIdx);
      }
    }

    if (key) {
      setKeyFilterByRunIndex((prevFilters) => ({ ...prevFilters, [stateKey]: key }));
    }
    if (assignee) {
      const isUnassignedDrillDown =
        assignee.toLowerCase() === "unassigned" || assignee.toLowerCase() === "__unassigned__";
      const filterValue = isUnassignedDrillDown ? "__unassigned__" : assignee;
      setAssigneeFilterByRunIndex((prevFilters) => ({ ...prevFilters, [stateKey]: filterValue }));
    }
    setPageByRunIndex((prevPages) => ({ ...prevPages, [stateKey]: 1 }));
  }, [drillDownFilters, getJqlRunsIndex, onActiveTabChange, visibleRuns]);

  const showCombinedOpenWork = !combinedRun && (combinedOpenWorkActive || visibleRuns.length === 0);
  const [combinedVisited, setCombinedVisited] = React.useState(showCombinedOpenWork);
  React.useEffect(() => { if (showCombinedOpenWork) setCombinedVisited(true); }, [showCombinedOpenWork]);
  const safeTab = Math.min(activeTab, visibleRuns.length - 1);
  const run = visibleRuns[safeTab] || {};
  const runStateKey = getRunStateKey(run, safeTab);
  const runSlotIndex = run.index ?? safeTab;
  const allLoadedIssues = run.issues || [];
  const keyFilterDraft = keyFilterByRunIndex[runStateKey] ?? "";
  const keywordFilter = keywordFilterByRunIndex[runStateKey] ?? "";
  const statusFilter = statusFilterByRunIndex[runStateKey] ?? "";
  const assigneeFilter = assigneeFilterByRunIndex[runStateKey] ?? "";
  const subtaskBugOnly = subtaskBugOnlyByRunIndex[runStateKey] ?? false;
  const includeStories = includeStoriesByRunIndex[runStateKey] ?? false;
  const issuesMatchingKey = filterIssues(allLoadedIssues, {
    keyQuery: keyFilterDraft,
    keywordQuery: keywordFilter,
    statusFilter,
    assigneeFilter,
    subtaskBugOnly,
    includeStories,
  });
  const knownAssignees = getKnownAssignees(allLoadedIssues);
  const knownStatuses = getKnownStatuses(allLoadedIssues);
  const sortedIssues = sortIssues({
    issues: issuesMatchingKey,
    isClosedLikeStatus,
    jiraRowPriorities,
    clampPriority,
    sortField,
    sortDirection,
    getIssueStateKey,
    useStatusCategory: Boolean(combinedRun),
  });
  const totalRows = sortedIssues.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(pageByRunIndex[runStateKey] || 1, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pagedIssues = sortedIssues.slice(start, start + PAGE_SIZE);
  const rowStartDisplay = totalRows === 0 ? 0 : start + 1;
  const rowEndDisplay = totalRows === 0 ? 0 : Math.min(start + PAGE_SIZE, totalRows);
  const jiraTotal = Number(run.total || 0);
  const loadedCount = Number(run.loaded ?? allLoadedIssues.length);
  const hasMoreToLoad = !run.isDrillDown && !run.loadComplete && jiraTotal > loadedCount;

  const handleTabChange = (idx, item) => {
    onCombinedOpenWorkChange?.(false);
    setActiveTab(idx);
    if (onActiveTabChange && !item?.isPendingDrillDown) {
      const runsIdx = getJqlRunsIndex(item);
      if (runsIdx !== null && runsIdx >= 0) {
        onActiveTabChange(runsIdx);
      }
    }
  };

  const handlePageChange = (nextPage) => {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    setPageByRunIndex((prev) => ({ ...prev, [runStateKey]: clamped }));
  };

  const handleSortFieldChange = (nextField) => {
    setSortField(nextField);
    setPageByRunIndex((prev) => ({ ...prev, [runStateKey]: 1 }));
  };

  const handleSortDirectionChange = (nextDirection) => {
    setSortDirection(nextDirection);
    setPageByRunIndex((prev) => ({ ...prev, [runStateKey]: 1 }));
  };

  const handleKeyFilterChange = (event) => {
    const value = event.target.value;
    setKeyFilterByRunIndex((prev) => ({ ...prev, [runStateKey]: value }));
    setPageByRunIndex((prev) => ({ ...prev, [runStateKey]: 1 }));
  };

  const handleKeywordFilterChange = (event) => {
    const value = event.target.value;
    setKeywordFilterByRunIndex((prev) => ({ ...prev, [runStateKey]: value }));
    setPageByRunIndex((prev) => ({ ...prev, [runStateKey]: 1 }));
  };

  const handleStatusFilterChange = (event) => {
    const value = event.target.value;
    setStatusFilterByRunIndex((prev) => ({ ...prev, [runStateKey]: value }));
    setPageByRunIndex((prev) => ({ ...prev, [runStateKey]: 1 }));
  };

  const handleAssigneeFilterChange = (event) => {
    const value = event.target.value;
    setAssigneeFilterByRunIndex((prev) => ({ ...prev, [runStateKey]: value }));
    setPageByRunIndex((prev) => ({ ...prev, [runStateKey]: 1 }));
  };

  const handleSubtaskBugOnlyChange = (event) => {
    const checked = event.target.checked;
    setSubtaskBugOnlyByRunIndex((prev) => ({ ...prev, [runStateKey]: checked }));
    if (!checked) {
      setIncludeStoriesByRunIndex((prev) => ({ ...prev, [runStateKey]: false }));
    }
    setPageByRunIndex((prev) => ({ ...prev, [runStateKey]: 1 }));
  };

  const handleIncludeStoriesChange = (event) => {
    const checked = event.target.checked;
    setIncludeStoriesByRunIndex((prev) => ({ ...prev, [runStateKey]: checked }));
    setPageByRunIndex((prev) => ({ ...prev, [runStateKey]: 1 }));
  };

  const handleClearFilters = () => {
    setKeyFilterByRunIndex((prev) => ({ ...prev, [runStateKey]: "" }));
    setKeywordFilterByRunIndex((prev) => ({ ...prev, [runStateKey]: "" }));
    setStatusFilterByRunIndex((prev) => ({ ...prev, [runStateKey]: "" }));
    setAssigneeFilterByRunIndex((prev) => ({ ...prev, [runStateKey]: "" }));
    setPageByRunIndex((prev) => ({ ...prev, [runStateKey]: 1 }));
  };

  const handleHeaderSort = (field) => {
    if (sortField === field) {
      const nextDirection = sortDirection === "asc" ? "desc" : "asc";
      setSortDirection(nextDirection);
    } else {
      setSortField(field);
      setSortDirection("asc");
    }

    setPageByRunIndex((prev) => ({ ...prev, [runStateKey]: 1 }));
  };

  const getHeaderAriaSort = (field) => {
    if (sortField !== field) {
      return "none";
    }

    return sortDirection === "desc" ? "descending" : "ascending";
  };

  const getSortIndicator = (field) => {
    if (sortField !== field) {
      return "";
    }

    return sortDirection === "desc" ? " v" : " ^";
  };

  return (
    <div className="ww-results-section">

      {!combinedRun && <div className="ww-jql-tab-bar">
        <div className="ww-jql-tabs" role="tablist" aria-label="JQL result tabs">
          {visibleRuns.map((item, idx) => (
            <div
              key={`jql-tab-${getRunStateKey(item, idx)}`}
              className={
                "ww-jql-tab-item" +
                (!showCombinedOpenWork && idx === safeTab ? " is-active" : "") +
                (item.isDrillDown ? " is-drill-down" : "")
              }
            >
              <button
                type="button"
                role="tab"
                aria-selected={!showCombinedOpenWork && idx === safeTab}
                className={
                  "ww-jql-tab-btn" +
                  (!showCombinedOpenWork && idx === safeTab ? " is-active" : "") +
                  (item.isDrillDown ? " is-drill-down" : "")
                }
                onClick={() => handleTabChange(idx, item)}
              >
                {item.label || ("JQL " + (idx + 1))}
              </button>
              {item.isDrillDown && !item.isPendingDrillDown ? (
                <button
                  type="button"
                  className="ww-jql-tab-clear-btn"
                  onClick={() => onClearDrillDownRun?.(item)}
                  aria-label={`Clear ${item.label || "drill-down tab"}`}
                  title="Clear drill-down tab"
                >
                  x
                </button>
              ) : null}
            </div>
          ))}
          <div className={"ww-jql-tab-item" + (showCombinedOpenWork ? " is-active" : "")}>
            <button
              type="button"
              role="tab"
              aria-selected={showCombinedOpenWork}
              className={"ww-jql-tab-btn" + (showCombinedOpenWork ? " is-active" : "")}
              onClick={() => onCombinedOpenWorkChange?.(true)}
            >
              Combined Open Work
            </button>
          </div>
        </div>
      </div>}

      {!combinedRun && (showCombinedOpenWork || combinedVisited) && <div hidden={!showCombinedOpenWork} data-combined-work-view><CombinedOpenWork /></div>}
      {!showCombinedOpenWork && <div className="ww-jql-result">
        <div className="ww-jql-result-header">
          <p className="ww-jql-title">{run.label}</p>
        </div>

        {run.isPendingDrillDown ? (
          <p className="ww-jira-status">Loading drill-down from Jira...</p>
        ) : run.error ? (
          <p className="ww-jira-status ww-jira-error">{run.error}</p>
        ) : (
          <div>
            <p className="ww-jira-status">
              {keyFilterDraft.trim().length > 0 ? (
                <>
                  Showing {issuesMatchingKey.length} of {loadedCount} loaded (filters) · {jiraTotal}{" "}
                  matched by JQL
                </>
              ) : (
                <>
                  Loaded {loadedCount} of {jiraTotal} matched
                </>
              )}
              {hasMoreToLoad ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="ww-inline-action-btn ww-load-remaining-btn"
                    onClick={() => onLoadRemaining?.(runSlotIndex)}
                    disabled={jqlLoading}
                  >
                    {jqlLoading
                      ? "Loading…"
                      : `Load remaining (${Math.max(0, jiraTotal - loadedCount)} more)`}
                  </button>
                </>
              ) : null}
            </p>

            <div className="ww-key-filter-row">
              <label className="ww-key-filter-label" htmlFor={`ww-keyword-filter-${runStateKey}`}>
                Search
              </label>
              <input
                id={`ww-keyword-filter-${runStateKey}`}
                className="ww-key-filter-input"
                type="search"
                placeholder="keyword or phrase in summary"
                value={keywordFilter}
                onChange={handleKeywordFilterChange}
                aria-label="Search table rows by keyword or phrase in issue summary"
                autoComplete="off"
                spellCheck={false}
              />

              <label className="ww-key-filter-label" htmlFor={`ww-key-filter-${runStateKey}`}>
                Filter by key
              </label>
              <input
                id={`ww-key-filter-${runStateKey}`}
                className="ww-key-filter-input"
                type="search"
                placeholder="e.g. ODI-123456 or 123456"
                value={keyFilterDraft}
                onChange={handleKeyFilterChange}
                aria-label="Filter table rows by issue key"
                autoComplete="off"
                spellCheck={false}
              />

              <label className="ww-key-filter-label" htmlFor={`ww-status-filter-${runStateKey}`}>
                Status
              </label>
              <select
                id={`ww-status-filter-${runStateKey}`}
                className="ww-key-filter-input"
                value={statusFilter}
                onChange={handleStatusFilterChange}
                aria-label="Filter by status"
                style={{ minWidth: "9rem" }}
              >
                <option value="">All statuses</option>
                {knownStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <label className="ww-key-filter-label" htmlFor={`ww-assignee-filter-${runStateKey}`}>
                Assignee
              </label>
              <select
                id={`ww-assignee-filter-${runStateKey}`}
                className="ww-key-filter-input"
                value={assigneeFilter}
                onChange={handleAssigneeFilterChange}
                aria-label="Filter by assignee"
                style={{ minWidth: "9rem" }}
              >
                <option value="">All assignees</option>
                <option value="__unassigned__">Unassigned</option>
                {knownAssignees.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>

              <label className="ww-type-filter-toggle" htmlFor={`ww-subtask-bug-filter-${runStateKey}`}>
                <input
                  id={`ww-subtask-bug-filter-${runStateKey}`}
                  type="checkbox"
                  checked={subtaskBugOnly}
                  onChange={handleSubtaskBugOnlyChange}
                />
                Sub-tasks &amp; Bugs only
              </label>
              {subtaskBugOnly ? (
                <label className="ww-type-filter-toggle" htmlFor={`ww-include-stories-filter-${runStateKey}`}>
                  <input
                    id={`ww-include-stories-filter-${runStateKey}`}
                    type="checkbox"
                    checked={includeStories}
                    onChange={handleIncludeStoriesChange}
                  />
                  + Stories
                </label>
              ) : null}

              {(keyFilterDraft || keywordFilter || statusFilter || assigneeFilter) ? (
                <button
                  type="button"
                  className="ww-page-btn"
                  onClick={handleClearFilters}
                  aria-label="Clear all filters"
                >
                  Clear filters
                </button>
              ) : null}
              {onClearDrillDownFilter ? (
                <button
                  type="button"
                  className="ww-page-btn"
                  onClick={onClearDrillDownFilter}
                  aria-label="Clear dashboard drill-down filter"
                >
                  Clear drill-down filter
                </button>
              ) : null}
            </div>

            <div className="ww-pagination-row ww-pagination-row--sort-only">
              <div className="ww-sort-controls" aria-label="Table sorting controls">
                <label className="ww-sort-control" htmlFor="ww-sort-field">
                  Sort by
                </label>
                <select
                  id="ww-sort-field"
                  value={sortField}
                  onChange={(event) => handleSortFieldChange(event.target.value)}
                >
                  {SORT_FIELDS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label className="ww-sort-control" htmlFor="ww-sort-direction">
                  Order
                </label>
                <select
                  id="ww-sort-direction"
                  value={sortDirection}
                  onChange={(event) => handleSortDirectionChange(event.target.value)}
                  disabled={sortField === "default"}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>

            <ResultsPagerBar
              placement="top"
              currentPage={currentPage}
              totalPages={totalPages}
              totalRows={totalRows}
              rowStartDisplay={rowStartDisplay}
              rowEndDisplay={rowEndDisplay}
              onFirst={() => handlePageChange(1)}
              onPrev={() => handlePageChange(currentPage - 1)}
              onNext={() => handlePageChange(currentPage + 1)}
              onLast={() => handlePageChange(totalPages)}
            />

            <div className="ww-results-table-wrap">
              <div className="ww-push-selected-row">
                <div className="ww-row-expand-all-group">
                  <button
                    type="button"
                    className="ww-row-expand-all-btn"
                    onClick={() => handleExpandAllRows(sortedIssues.map(getIssueStateKey))}
                    disabled={sortedIssues.length === 0}
                  >
                    Expand all
                  </button>
                  <button
                    type="button"
                    className="ww-row-expand-all-btn"
                    onClick={() => handleCollapseAllRows(sortedIssues.map(getIssueStateKey))}
                    disabled={sortedIssues.length === 0}
                  >
                    Collapse all
                  </button>
                </div>
                <label className="ww-select-all-label">
                  <input
                    type="checkbox"
                    checked={
                      issuesMatchingKey.filter(
                        (issue) => combinedRun ? issue.fields?.status?.statusCategory?.key !== "done" : !isClosedLikeStatus(issue.fields?.status?.name)
                      ).length > 0 &&
                      issuesMatchingKey
                        .filter(
                          (issue) => combinedRun ? issue.fields?.status?.statusCategory?.key !== "done" : !isClosedLikeStatus(issue.fields?.status?.name)
                        )
                        .every((issue) => selectedForPush[getIssueStateKey(issue)])
                    }
                    onChange={(event) =>
                      handleSelectAll(issuesMatchingKey, event.target.checked)
                    }
                  />
                  Select all
                </label>
                <button
                  type="button"
                  className="ww-push-selected-btn"
                  onClick={() => handlePushSelected(issuesMatchingKey)}
                  disabled={
                    !issuesMatchingKey.some(
                      (issue) =>
                        selectedForPush[getIssueStateKey(issue)] &&
                        (combinedRun ? issue.fields?.status?.statusCategory?.key !== "done" : !isClosedLikeStatus(issue.fields?.status?.name))
                    )
                  }
                >
                  Push Selected
                </button>
              </div>

              <table className="ww-results-table">
                <thead>
                  <tr>
                    <th className="ww-th-expand" aria-hidden="true" />
                    {combinedRun && <th>Jira site</th>}
                    <th aria-sort={getHeaderAriaSort("key")}>
                      <button
                        type="button"
                        className={"ww-sort-header-btn" + (sortField === "key" ? " is-active" : "")}
                        onClick={() => handleHeaderSort("key")}
                      >
                        Key{getSortIndicator("key")}
                      </button>
                    </th>
                    <th>Summary</th>
                    <th aria-sort={getHeaderAriaSort("status")}>
                      <button
                        type="button"
                        className={"ww-sort-header-btn" + (sortField === "status" ? " is-active" : "")}
                        onClick={() => handleHeaderSort("status")}
                      >
                        Status{getSortIndicator("status")}
                      </button>
                    </th>
                    <th aria-sort={getHeaderAriaSort("priority")}>
                      <button
                        type="button"
                        className={"ww-sort-header-btn" + (sortField === "priority" ? " is-active" : "")}
                        onClick={() => handleHeaderSort("priority")}
                      >
                        Priority{getSortIndicator("priority")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedIssues.map((issue) => {
                    const issueKey = getIssueStateKey(issue);
                    const sourceRun = issue.sourceRun || run;
                    const forceTeam = planningDestinationByKey[issueKey] === "team";
                    const planningDatesStart = forceTeam ? teamStartDateByKey : startDateByKey;
                    const planningDatesComplete = forceTeam ? teamCompleteDateByKey : completeDateByKey;
                    const issueBrowseUrl = getIssueBrowseUrl(issue);
                    const status = issue.fields?.status?.name || "-";
                    const assignee = issue.fields?.assignee?.displayName || "Unassigned";
                    const updated = formatDate(issue.fields?.updated);
                    const rowPriority = clampPriority(jiraRowPriorities[issueKey] ?? 0);
                    const push = pushState[issueKey] || { loading: false, error: "", success: "" };
                    const save = saveState[issueKey] || { loading: false, error: "", success: "" };
                    const rowUpdate = rowUpdateState[issueKey] || { loading: false, error: "", success: "" };
                    const isClosedOrResolved = combinedRun ? issue.fields?.status?.statusCategory?.key === "done" : isClosedLikeStatus(status);
                    const disableEditing = combinedRun ? issue.hydrationReady === false || (forceTeam && !issue.teamAvailable) : !hydrationReady || isClosedOrResolved;
                    const noteDraft =
                      jiraNotes[issueKey] ||
                      jiraNotes[String(issueKey || "").toUpperCase()] ||
                      "";
                    const pushedNoteSnapshot = lastPushedJiraNoteByKey[issueKey];
                    const noteFingerprint = buildNotePushFingerprint({
                      note: noteDraft,
                      images: noteImagesByKey[issueKey],
                    });
                    const isNoteAlreadyPushed = noteMatchesLastJiraPush(noteFingerprint, pushedNoteSnapshot);

                    const isExpandedRow = !collapsedRowKeys?.has?.(issueKey);
                    const isExpandedPlanning = expandedPlanningKeys ? expandedPlanningKeys.has(issueKey) : expandedPlanningKey === issueKey;
                    const planningMeta = (forceTeam ? teamPlanningMetaByKey : planningMetaByKey)?.[issueKey] || {};
                    const summary = issue.fields?.summary || "No summary";
                    const sharedProgramId = teamEnabled ? String(
                      run.sharedProgramId || jqlSharedProgramIds?.[runSlotIndex] || ""
                    ).trim() : "";
                    const followUp = (sharedProgramId || forceTeam) ? planningMeta.teamFollowUp : planningMeta.followUp;
                    const hasAnyTracking = planningDatesStart?.[issueKey] || planningDatesComplete?.[issueKey] ||
                      planningMeta.plannedStart || planningMeta.plannedFinish || planningMeta.pmOverride ||
                      planningMeta.requestor;
                    const issueLinks = parseIssueLinks(issue);

                    return (
                      <React.Fragment key={getIssueStateKey(issue)}>
                      {!isExpandedRow ? (
                      <tr
                        className={`${isClosedOrResolved ? "ww-row-closed" : getPriorityRowClass(rowPriority)}${planningMeta.hasOpenDecision ? " ww-row-open-decision" : ""}${hasAnyTracking ? " ww-row-has-tracking" : ""}`}
                      >
                        <td className="ww-cell-expand">
                          <button
                            type="button"
                            className="ww-row-expand-btn"
                            onClick={() => handleToggleRowExpand(issueKey)}
                            title="Expand row"
                            aria-label={`Expand details for ${issue.key}`}
                            aria-expanded={false}
                          >
                            ▸
                          </button>
                        </td>
                        {combinedRun && <td className="ww-cell-source">{issue.sourceContext.displayName}<br />{issue.sourceContext.siteHost}{issue.combinedEligible === false && <p>Saved — no longer assigned open work. Remaining drafts are kept.</p>}</td>}
                        <td className="ww-cell-key">
                          {followUp ? <span className="ww-planning-label">{FOLLOW_UP_OPTIONS.find((option) => option.value === followUp)?.label} </span> : null}
                          {issueBrowseUrl ? (
                            <a href={issueBrowseUrl} target="_blank" rel="noreferrer noopener">
                              {issue.key}
                            </a>
                          ) : (
                            issue.key
                          )}
                        </td>
                        <td>
                          <span className="ww-summary-clamp" title={summary}>
                            {summary}
                          </span>
                          {issueLinks.length > 0 ? (
                            <div className="ww-issue-links ww-issue-links--compact">
                              <IssueLinkLine
                                linkType={issueLinks[0].linkType}
                                linkedKey={issueLinks[0].linkedKey}
                                browseUrl={getIssueBrowseUrl({
                                  key: issueLinks[0].linkedKey,
                                  self: issue.self,
                                })}
                              />
                              {issueLinks.length > 1 ? (
                                <span className="ww-issue-links-more">
                                  {` +${issueLinks.length - 1} more`}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </td>

                        <td className="ww-cell-status">
                          <div className={"ww-edit-cell" + (isClosedOrResolved ? " ww-edit-disabled" : "")}>
                            <select
                              className="ww-edit-select"
                              value={statusDrafts[issueKey] || status}
                              onChange={(event) =>
                                handleStatusDraftChange(issueKey, event.target.value)
                              }
                              disabled={disableEditing}
                            >
                              <option value={status}>{status}</option>
                              {statusOptions
                                .filter((opt) => opt !== status)
                                .map((opt) => (
                                  <option key={"status-opt-" + issueKey + "-" + opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              className="ww-inline-action-btn"
                              onClick={() => handleStatusUpdate(issueKey, status)}
                              disabled={rowUpdate.loading || disableEditing}
                            >
                              Update Status
                            </button>
                          </div>
                        </td>

                        <PriorityCell
                          issueKey={issueKey}
                          isClosedOrResolved={disableEditing}
                          rowPriority={rowPriority}
                          priorityClassName={getPriorityClass(rowPriority)}
                          prioritySource={prioritySourceByKey}
                          onChange={(key, value) =>
                            handleRowPriorityChange(key, value, { sharedProgramId })
                          }
                        />
                      </tr>
                      ) : (
                        <tr
                          className={`ww-row-detail-row ${isClosedOrResolved ? "ww-row-closed" : getPriorityRowClass(rowPriority)}${planningMeta.hasOpenDecision ? " ww-row-open-decision" : ""}`}
                        >
                          <td colSpan={combinedRun ? 6 : 5} className="ww-row-detail-cell">
                            <div className="ww-row-detail-panel">
                              <table className="ww-results-table ww-results-table--expanded-detail">
                                <tbody>
                                  <tr
                                    className={`${isClosedOrResolved ? "ww-row-closed" : getPriorityRowClass(rowPriority)}${hasAnyTracking ? " ww-row-has-tracking" : ""}`}
                                  >
                                    {combinedRun && <td className="ww-cell-source">{issue.sourceContext.displayName}<br />{issue.sourceContext.siteHost}{issue.combinedEligible === false && <p>Saved — no longer assigned open work. Remaining drafts are kept.</p>}</td>}
                                    <td className="ww-cell-key">
                                      {followUp ? <span className="ww-planning-label">{FOLLOW_UP_OPTIONS.find((option) => option.value === followUp)?.label} </span> : null}
                                      <button
                                        type="button"
                                        className="ww-row-expand-btn ww-row-expand-btn--open"
                                        onClick={() => handleToggleRowExpand(issueKey)}
                                        title="Collapse row"
                                        aria-label={`Collapse details for ${issue.key}`}
                                        aria-expanded={true}
                                      >
                                        ▾
                                      </button>
                                      <button
                                        type="button"
                                        className={`ww-planning-expand-btn${isExpandedPlanning ? " ww-planning-expand-btn--open" : ""}`}
                                        onClick={() => handleTogglePlanningRow(issueKey)}
                                        title={isExpandedPlanning ? "Collapse planning" : "Expand planning"}
                                        aria-label={`${isExpandedPlanning ? "Collapse" : "Expand"} planning for ${issue.key}`}
                                      >
                                        {isExpandedPlanning ? "Plan ▾" : "Plan ▸"}
                                      </button>
                                      {issueBrowseUrl ? (
                                        <a href={issueBrowseUrl} target="_blank" rel="noreferrer noopener">
                                          {issue.key}
                                        </a>
                                      ) : (
                                        issue.key
                                      )}
                                    </td>
                                    <td>
                                      {issue.fields?.parent?.key
                                        ? (() => {
                                            const parentUrl = getIssueBrowseUrl({
                                              key: issue.fields.parent.key,
                                              self: issue.self,
                                            });
                                            return parentUrl ? (
                                              <a
                                                href={parentUrl}
                                                target="_blank"
                                                rel="noreferrer noopener"
                                                style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}
                                              >
                                                {issue.fields.parent.key}
                                              </a>
                                            ) : (
                                              <span style={{ fontSize: "0.82rem" }}>
                                                {issue.fields.parent.key}
                                              </span>
                                            );
                                          })()
                                        : (
                                          <span style={{ color: "#94a3b8" }}>—</span>
                                        )}
                                    </td>
                                    <td>{issue.fields?.issuetype?.name || "-"}</td>
                                    <td>{summary}</td>
                                    <td className="ww-cell-status-assignee">
                                      <div className={"ww-edit-cell" + (isClosedOrResolved ? " ww-edit-disabled" : "")}>
                                        <select
                                          className="ww-edit-select"
                                          value={statusDrafts[issueKey] || status}
                                          onChange={(event) =>
                                            handleStatusDraftChange(issueKey, event.target.value)
                                          }
                                          disabled={disableEditing}
                                        >
                                          <option value={status}>{status}</option>
                                          {statusOptions
                                            .filter((opt) => opt !== status)
                                            .map((opt) => (
                                              <option key={"status-opt-" + issueKey + "-" + opt} value={opt}>
                                                {opt}
                                              </option>
                                            ))}
                                        </select>
                                        <button
                                          type="button"
                                          className="ww-inline-action-btn"
                                          onClick={() => handleStatusUpdate(issueKey, status)}
                                          disabled={rowUpdate.loading || disableEditing}
                                        >
                                          Update Status
                                        </button>
                                      </div>
                                      <AssigneeCell
                                        siteContext={issue.sourceContext}
                                        displayIssueKey={issue.key}
                                        issueKey={issueKey}
                                        assignee={assignee}
                                        isClosedOrResolved={disableEditing}
                                        draftValue={assigneeDrafts[issueKey]}
                                        knownAssignees={knownAssignees}
                                        loading={rowUpdate.loading}
                                        confirmation={rowUpdate}
                                        onDraftChange={handleAssigneeDraftChange}
                                        onUpdate={handleAssigneeUpdate}
                                      />
                                    </td>
                                    <td>{updated}</td>
                                    <td className="ww-cell-dates">
                                      {(() => {
                                        const ownIdd = formatDateOnly(getFieldValue(issue, sourceRun.iddFieldId)) || "";
                                        const inheritedIdd = getMostRecentDoneDateForIssue(
                                          issue,
                                          sourceRun.iddFieldId,
                                          sourceRun.parentIddByKey
                                        );
                                        const ownMrd = formatDateOnly(getFieldValue(issue, sourceRun.mrdFieldId)) || "";
                                        const inheritedMrd = getMostRecentDoneDateForIssue(
                                          issue,
                                          sourceRun.mrdFieldId,
                                          sourceRun.parentMostRecentDoneDateByKey
                                        );
                                        const ownDue =
                                          formatDateOnly(getFieldValue(issue, sourceRun.dueFieldId || "duedate")) || "";
                                        const issueTypeName = String(issue.fields?.issuetype?.name || "Issue").trim();
                                        const isEpic = matchesIssueTypeFamily(issueTypeName, "epic");

                                        return (
                                          <div className={"ww-edit-cell" + (isClosedOrResolved ? " ww-edit-disabled" : "")}>
                                            {isEpic ? (
                                              <>
                                                <div className="ww-date-row">
                                                  <label className="ww-date-label" title="Initial Done Date (Epic only)">IDD</label>
                                                  <input
                                                    type="date"
                                                    className="ww-edit-input"
                                                    value={iddDrafts[issueKey] ?? (ownIdd || inheritedIdd || "")}
                                                    disabled={disableEditing}
                                                    onChange={(event) => handleIddDraftChange(issueKey, event.target.value)}
                                                  />
                                                  <button
                                                    type="button"
                                                    className="ww-inline-action-btn"
                                                    onClick={() => handleIddUpdate(issueKey, ownIdd || inheritedIdd || "", sourceRun.iddFieldId)}
                                                    disabled={rowUpdate.loading || disableEditing}
                                                  >
                                                    Update
                                                  </button>
                                                </div>
                                                {!ownIdd && inheritedIdd ? (
                                                  <p className="ww-date-hint">from parent: {inheritedIdd}</p>
                                                ) : null}
                                                <div className="ww-date-row">
                                                  <label className="ww-date-label" title="Most Recent Done Date (Epic only)">MRD</label>
                                                  <input
                                                    type="date"
                                                    className="ww-edit-input"
                                                    value={mrdDrafts[issueKey] ?? ownMrd}
                                                    disabled={disableEditing}
                                                    onChange={(event) => handleMrdDraftChange(issueKey, event.target.value)}
                                                  />
                                                  <button
                                                    type="button"
                                                    className="ww-inline-action-btn"
                                                    onClick={() => handleMrdUpdate(issueKey, ownMrd, sourceRun.mrdFieldId)}
                                                    disabled={rowUpdate.loading || disableEditing}
                                                  >
                                                    Update
                                                  </button>
                                                </div>
                                                {!ownMrd && inheritedMrd ? (
                                                  <p className="ww-date-hint">from parent: {inheritedMrd}</p>
                                                ) : null}
                                              </>
                                            ) : null}
                                            <div className="ww-date-row">
                                              <label className="ww-date-label" title={`${issueTypeName} due date from Jira`}>{issueTypeName} Due</label>
                                              <input
                                                type="date"
                                                className="ww-edit-input"
                                                value={dueDateDrafts[issueKey] ?? ownDue}
                                                disabled={disableEditing}
                                                onChange={(event) => handleDueDateDraftChange(issueKey, event.target.value)}
                                              />
                                              <button
                                                type="button"
                                                className="ww-inline-action-btn"
                                                onClick={() => handleDueDateUpdate(issueKey, ownDue)}
                                                disabled={rowUpdate.loading || disableEditing}
                                              >
                                                Update
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </td>
                                    <PriorityCell
                                      issueKey={issueKey}
                                      isClosedOrResolved={disableEditing}
                                      rowPriority={rowPriority}
                                      priorityClassName={getPriorityClass(rowPriority)}
                                      prioritySource={prioritySourceByKey}
                                      onChange={(key, value) =>
                                        handleRowPriorityChange(key, value, { sharedProgramId })
                                      }
                                    />
                                    <td>
                                      {disableEditing ? (
                                        <span>-</span>
                                      ) : (
                                        <div className="ww-note-cell-wrap">
                                          <button
                                            type="button"
                                            className="ww-note-expand-btn"
                                            onClick={() => setExpandedNoteKey(issueKey)}
                                            title="Pop out notes to a larger editor"
                                            aria-label={`Expand notes for ${issue.key}`}
                                          >
                                            ⤢
                                          </button>
                                          <NoteImagesStrip
                                            images={noteImagesByKey[issueKey]}
                                            disabled={push.loading || disableEditing}
                                            error={noteImageErrorsByKey[issueKey]}
                                            onAddFiles={(files) => handleNoteImagesAdd(issueKey, files)}
                                            onRemove={(localId) => handleNoteImageRemove(issueKey, localId)}
                                            keepOnMachine={keepNoteImagesByKey[issueKey]}
                                            keepPending={Boolean(noteImageKeepPendingByKey[issueKey])}
                                            onKeepChange={(checked) => handleKeepNoteImagesToggle(issueKey, checked)}
                                          >
                                            <NoteFormattedField
                                              className={`ww-note-textarea${
                                                isNoteAlreadyPushed ? " ww-note-textarea-pushed" : ""
                                              }`}
                                              value={noteDraft}
                                              onChange={(next) => handleNoteChange(issueKey, next)}
                                              placeholder="Add notes here"
                                              title={
                                                isNoteAlreadyPushed
                                                  ? "This note was pushed to Jira. Change the text or images before pushing again."
                                                  : undefined
                                              }
                                            />
                                          </NoteImagesStrip>
                                        </div>
                                      )}
                                    </td>
                                    <td>
                                      {disableEditing ? (
                                        <span>-</span>
                                      ) : (
                                        <div className="ww-push-actions">
                                          <label className="ww-row-select-label">
                                            <input
                                              type="checkbox"
                                              checked={!!selectedForPush[issueKey]}
                                              onChange={(event) =>
                                                handleSelectForPush(issueKey, event.target.checked)
                                              }
                                            />
                                          </label>
                                          <button
                                            type="button"
                                            className="ww-push-btn"
                                            onClick={() => handlePushNote(issueKey)}
                                            disabled={
                                              !selectedForPush[issueKey] ||
                                              push.loading ||
                                              isNoteAlreadyPushed
                                            }
                                          >
                                            {push.loading ? "Pushing..." : "Push note"}
                                          </button>
                                          <button
                                            type="button"
                                            className="ww-save-btn"
                                            onClick={() => handleSaveMetadata(issueKey)}
                                            disabled={save.loading}
                                          >
                                            {save.loading ? "Saving..." : "Save to local DB"}
                                          </button>
                                          <button
                                            type="button"
                                            className="ww-save-btn"
                                            title="Attach screenshots, recordings, or files to this issue in Jira"
                                            onClick={() =>
                                              setAttachTarget({
                                                key: issue.key,
                                                siteContext: issue.sourceContext,
                                                summary,
                                                browseUrl: issueBrowseUrl || "",
                                              })
                                            }
                                          >
                                            Attach files
                                          </button>
                                        </div>
                                      )}
                                      {push.error && <p className="ww-inline-error">{push.error}</p>}
                                      {push.success && <p className="ww-inline-success">{push.success}</p>}
                                      {save.error && <p className="ww-inline-error">{save.error}</p>}
                                      {save.success && <p className="ww-inline-success">{save.success}</p>}
                                      {rowUpdate.error && <p className="ww-inline-error">{rowUpdate.error}</p>}
                                      {rowUpdate.success && <p className="ww-inline-success">{rowUpdate.success}</p>}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                              {issueLinks.length > 0 ? (
                                <div className="ww-issue-links ww-issue-links--expanded">
                                  {issueLinks.map((link) => (
                                    <div
                                      key={`${link.linkType}-${link.linkedKey}`}
                                      className="ww-issue-links-item"
                                    >
                                      <IssueLinkLine
                                        linkType={link.linkType}
                                        linkedKey={link.linkedKey}
                                        browseUrl={getIssueBrowseUrl({
                                          key: link.linkedKey,
                                          self: issue.self,
                                        })}
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )}
                      {isExpandedRow && isExpandedPlanning ? (
                          <tr className="ww-planning-panel-row">
                            <td colSpan={combinedRun ? 6 : 5} className="ww-planning-panel-cell">
                              <div className="ww-planning-panel">
                                <div className="ww-planning-panel-fields">
                                  <div className="ww-planning-field">
                                    <span className="ww-planning-label">Now / Next</span>
                                    {combinedRun && <label>Planning destination
                                    <select disabled={issue.hydrationReady === false} aria-label={`Planning destination for ${issue.key} on ${issue.sourceContext.displayName}`} value={forceTeam ? "team" : "local"}
                                      onChange={(event) => setPlanningDestinationByKey((prev) => ({ ...prev, [issueKey]: event.target.value }))}>
                                      <option value="local">Local</option><option value="team" disabled={!issue.teamAvailable}>Team database</option>
                                    </select>
                                  </label>}
                                  {FOLLOW_UP_OPTIONS.map((option) => (
                                      <label key={option.value}>
                                        <input
                                          type="checkbox"
                                          aria-label={`${option.label} for ${issue.key}`}
                                          checked={followUp === option.value}
                                          disabled={disableEditing}
                                          onChange={(e) => handlePlanningFieldChange(issueKey, "followUp", e.target.checked ? option.value : null, { sharedProgramId, forceTeam })}
                                        />
                                        {option.label}
                                      </label>
                                    ))}
                                  </div>
                                  <label className="ww-planning-field">
                                    <span className="ww-planning-label">Open decision</span>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(planningMeta.hasOpenDecision)}
                                      disabled={disableEditing}
                                      onChange={(e) =>
                                        handlePlanningFieldChange(issueKey, "hasOpenDecision", e.target.checked, { sharedProgramId, forceTeam })
                                      }
                                    />
                                  </label>
                                  {planningMeta.hasOpenDecision ? (
                                    <label className="ww-planning-field ww-planning-field--decision-note">
                                      <span className="ww-planning-label">Decision note</span>
                                      <textarea
                                        className="ww-edit-input ww-planning-decision-note"
                                        rows={3}
                                        value={planningMeta.openDecisionNote || ""}
                                        disabled={disableEditing}
                                        placeholder="Describe the open decision…"
                                        onChange={(e) =>
                                          handlePlanningFieldChange(issueKey, "openDecisionNote", e.target.value, { sharedProgramId, forceTeam })
                                        }
                                      />
                                    </label>
                                  ) : null}

                                  <label className="ww-planning-field">
                                    <span className="ww-planning-label" title="PM's planned start — shown as dashed bar on Gantt">Planned start</span>
                                    <input
                                      type="date"
                                      className="ww-edit-input"
                                      value={planningMeta.plannedStart || ""}
                                      disabled={disableEditing}
                                      onChange={(e) =>
                                        handlePlanningFieldChange(issueKey, "plannedStart", e.target.value, { sharedProgramId, forceTeam })
                                      }
                                    />
                                  </label>

                                  <label className="ww-planning-field">
                                    <span className="ww-planning-label" title="Actual start date — used for Gantt">Start</span>
                                    <input
                                      type="date"
                                      className="ww-edit-input"
                                      value={planningDatesStart?.[issueKey] || ""}
                                      disabled={disableEditing}
                                      onChange={(e) => handleStartDateChange(issueKey, e.target.value, { sharedProgramId, forceTeam })}
                                    />
                                  </label>

                                  <label className="ww-planning-field">
                                    <span className="ww-planning-label" title="PM's planned finish — shown as dashed bar on Gantt">Planned finish</span>
                                    <input
                                      type="date"
                                      className="ww-edit-input"
                                      value={planningMeta.plannedFinish || ""}
                                      disabled={disableEditing}
                                      onChange={(e) =>
                                        handlePlanningFieldChange(issueKey, "plannedFinish", e.target.value, { sharedProgramId, forceTeam })
                                      }
                                    />
                                  </label>

                                  <label className="ww-planning-field">
                                    <span className="ww-planning-label" title="Actual complete date — used for Gantt">Complete</span>
                                    <input
                                      type="date"
                                      className="ww-edit-input"
                                      value={planningDatesComplete?.[issueKey] || ""}
                                      disabled={disableEditing}
                                      onChange={(e) => handleCompleteDateChange(issueKey, e.target.value, { sharedProgramId, forceTeam })}
                                    />
                                  </label>

                                  <label className="ww-planning-field">
                                    <span className="ww-planning-label" title="Who originally requested this work — free text, not from Jira">Requestor</span>
                                    <input
                                      type="text"
                                      className="ww-edit-input"
                                      value={planningMeta.requestor || ""}
                                      disabled={disableEditing}
                                      placeholder="Name, team, or role…"
                                      onChange={(e) =>
                                        handlePlanningFieldChange(issueKey, "requestor", e.target.value, { sharedProgramId, forceTeam })
                                      }
                                    />
                                  </label>

                                  <div className="ww-planning-field">
                                    <span className="ww-planning-label" title="Date the issue was created in Jira">Created</span>
                                    <span className="ww-edit-input ww-planning-readonly">
                                      {formatDate(issue.fields?.created) || "—"}
                                    </span>
                                  </div>

                                  <label className="ww-planning-field">
                                    <span className="ww-planning-label" title="Include this issue in the Pinned Issues view on the Gantt chart">{combinedRun ? "Pin to Gantt (local)" : "Pin to Gantt"}</span>
                                    <input
                                      type="checkbox"
                                      disabled={Boolean(combinedRun) && disableEditing}
                                      checked={Boolean(planningMetaByKey[issueKey]?.pinnedGantt)}
                                      onChange={(e) => handlePinnedGanttChange && handlePinnedGanttChange(issueKey, e.target.checked)}
                                    />
                                  </label>

                                  {(planningDatesStart?.[issueKey] || planningDatesComplete?.[issueKey]) ? (
                                    <button
                                      type="button"
                                      className="ww-date-clear-btn"
                                      disabled={disableEditing}
                                      onClick={() => {
                                        if (window.confirm(`Clear start/complete date tracking for ${issue.key}?`)) {
                                          handleClearDateTracking(issueKey, { sharedProgramId, forceTeam });
                                        }
                                      }}
                                    >
                                      Clear tracking
                                    </button>
                                  ) : null}
                                </div>

                                <div className="ww-planning-save-row">
                                  <button
                                    type="button"
                                    className="ww-planning-save-btn"
                                    disabled={(Boolean(combinedRun) && disableEditing) || planSaveStatus[issueKey] === "saving"}
                                    onClick={() => triggerPlanSave(issueKey, sharedProgramId, forceTeam)}
                                  >
                                    {planSaveStatus[issueKey] === "saving" ? "Saving…" : "Save to database"}
                                  </button>
                                  {planSaveStatus[issueKey] === "saved" && (
                                    <span className="ww-planning-save-indicator ww-planning-save-indicator--ok">
                                      ✓ Saved
                                    </span>
                                  )}
                                  {planSaveStatus[issueKey] === "error" && (
                                    <span className="ww-planning-save-indicator ww-planning-save-indicator--err">
                                      Save failed — check connection
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                      ) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {expandedNoteKey
              ? (() => {
                  const noteIssue = allLoadedIssues.find((issue) => getIssueStateKey(issue) === expandedNoteKey);
                  if (!noteIssue) {
                    return null;
                  }
                  const modalNoteDraft =
                    jiraNotes[expandedNoteKey] ||
                    jiraNotes[String(expandedNoteKey || "").toUpperCase()] ||
                    "";
                  const modalClosedOrResolved = isClosedLikeStatus(
                    noteIssue.fields?.status?.name || "-"
                  );

                  return (
                    <Modal
                      open
                      onClose={() => setExpandedNoteKey(null)}
                      size="large"
                      closeIcon
                    >
                      <Modal.Header>
                        {noteIssue.key}
                        <span className="ww-note-modal-summary">
                          {noteIssue.fields?.summary || ""}
                        </span>
                      </Modal.Header>
                      <Modal.Content>
                        <p className="ww-note-modal-hint">
                          Pulled Jira comments keep structure (headings, lists, bold, italics).
                          Markdown also renders when pushed to Jira: **bold**, *italic*, `code`,
                          [links](url), - lists, 1. numbered lists, # headings. Click the preview to edit.
                        </p>
                        <NoteFormattedField
                          className="ww-note-modal-textarea"
                          modal
                          value={modalNoteDraft}
                          onChange={(next) => handleNoteChange(expandedNoteKey, next)}
                          placeholder="Add notes here"
                          disabled={modalClosedOrResolved && !combinedRun}
                        />
                      </Modal.Content>
                      <Modal.Actions>
                        <Button primary content="Done" onClick={() => setExpandedNoteKey(null)} />
                      </Modal.Actions>
                    </Modal>
                  );
                })()
              : null}

            <ResultsPagerBar
              placement="bottom"
              currentPage={currentPage}
              totalPages={totalPages}
              totalRows={totalRows}
              rowStartDisplay={rowStartDisplay}
              rowEndDisplay={rowEndDisplay}
              onFirst={() => handlePageChange(1)}
              onPrev={() => handlePageChange(currentPage - 1)}
              onNext={() => handlePageChange(currentPage + 1)}
              onLast={() => handlePageChange(totalPages)}
            />
          </div>
        )}
      </div>}
      <AttachFilesModal
        open={Boolean(attachTarget)}
        key={attachTarget ? combinedRun ? JSON.stringify([attachTarget.siteContext?.instanceId, attachTarget.key]) : attachTarget.key : "attachments"}
        siteContext={attachTarget?.siteContext}
        issueKey={attachTarget?.key || ""}
        issueSummary={attachTarget?.summary || ""}
        browseUrl={attachTarget?.browseUrl || ""}
        onClose={() => setAttachTarget(null)}
      />
    </div>
  );
};

export default JiraResultsTable;
