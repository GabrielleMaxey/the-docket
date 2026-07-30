import React from "react";
import PriorityCell from "./cells/PriorityCell";
import AssigneeCell from "./cells/AssigneeCell.jsx";
import NoteImagesStrip from "./NoteImagesStrip.jsx";
import { findRunIndexForDrillDown, getRunStateKey } from "../../utils/workWeekNavigation.js";
import {
  getEffectiveDueDateForIssue,
  getMostRecentDoneDateForIssue,
} from "../../utils/jiraIssueDoneDates.js";
import { isConfiguredJqlRun } from "../../utils/workWeekStorage.js";
import { buildNotePushFingerprint } from "../../utils/notePushFingerprint.js";

const PAGE_SIZE = 30;
const SORT_FIELDS = [
  { value: "default", label: "Default" },
  { value: "assignee", label: "Assignee" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "key", label: "Key" },
];

const getKnownAssignees = (issues) => {
  return Array.from(
    new Set(
      issues
        .map((issue) => issue.fields?.assignee?.displayName)
        .filter((name) => typeof name === "string" && name.trim().length > 0)
    )
  ).sort();
};

const getKnownStatuses = (issues) => {
  return Array.from(
    new Set(
      issues
        .map((issue) => issue.fields?.status?.name)
        .filter((s) => typeof s === "string" && s.trim().length > 0)
    )
  ).sort();
};

const filterIssues = (issues, { keyQuery, statusFilter, assigneeFilter }) => {
  let result = issues;

  const keyTerm = String(keyQuery || "").trim().toLowerCase();
  if (keyTerm) {
    const looksLikeFullKey = /^[a-z][a-z0-9]*-\d+$/i.test(keyTerm);
    result = result.filter((issue) => {
      const issueKey = String(issue.key || "").toLowerCase();
      return looksLikeFullKey ? issueKey === keyTerm : issueKey.includes(keyTerm);
    });
  }

  if (statusFilter) {
    result = result.filter(
      (issue) => String(issue.fields?.status?.name || "") === statusFilter
    );
  }

  if (assigneeFilter) {
    const target = assigneeFilter === "__unassigned__" ? "" : assigneeFilter;
    result = result.filter((issue) => {
      const name = String(issue.fields?.assignee?.displayName || "");
      return target === "" ? !name : name === target;
    });
  }

  return result;
};

const getPrioritySortRank = (clampPriority, priorityValue) => {
  const priority = clampPriority(priorityValue);
  return priority === 0 ? 21 : priority;
};

const compareIssueKeys = (a, b) => {
  return String(a.key || "").localeCompare(String(b.key || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const compareTextValues = (left, right) => {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    sensitivity: "base",
  });
};

const getIssueStatus = (issue) => String(issue.fields?.status?.name || "");

const getIssueAssignee = (issue) => {
  return String(issue.fields?.assignee?.displayName || "Unassigned");
};

const filterIssuesByKeySubstring = (issues, rawQuery) => {
  const term = String(rawQuery || "").trim().toLowerCase();
  if (term.length === 0) {
    return issues;
  }

  return issues.filter((issue) =>
    String(issue.key || "").toLowerCase().includes(term)
  );
};

const sortIssues = ({
  issues,
  isClosedLikeStatus,
  jiraRowPriorities,
  clampPriority,
  sortField,
  sortDirection,
}) => {
  return [...issues].sort((a, b) => {
    const aStatus = getIssueStatus(a);
    const bStatus = getIssueStatus(b);
    const aClosed = isClosedLikeStatus(aStatus);
    const bClosed = isClosedLikeStatus(bStatus);

    if (aClosed !== bClosed) {
      return aClosed ? 1 : -1;
    }

    if (sortField === "default") {
      if (aClosed && bClosed) {
        return compareIssueKeys(a, b);
      }

      const aPriority = clampPriority(jiraRowPriorities[String(a.key || "").trim()] ?? 0);
      const bPriority = clampPriority(jiraRowPriorities[String(b.key || "").trim()] ?? 0);
      const aRank = getPrioritySortRank(clampPriority, aPriority);
      const bRank = getPrioritySortRank(clampPriority, bPriority);

      if (aRank !== bRank) {
        return aRank - bRank;
      }

      return compareIssueKeys(a, b);
    }

    let result = 0;

    if (sortField === "key") {
      result = compareIssueKeys(a, b);
    } else if (sortField === "status") {
      result = compareTextValues(aStatus, bStatus);
    } else if (sortField === "assignee") {
      result = compareTextValues(getIssueAssignee(a), getIssueAssignee(b));
    } else if (sortField === "priority") {
      const aPriority = clampPriority(jiraRowPriorities[String(a.key || "").trim()] ?? 0);
      const bPriority = clampPriority(jiraRowPriorities[String(b.key || "").trim()] ?? 0);
      const aRank = getPrioritySortRank(clampPriority, aPriority);
      const bRank = getPrioritySortRank(clampPriority, bPriority);
      result = aRank - bRank;
    }

    if (result === 0) {
      result = compareIssueKeys(a, b);
    }

    if (sortDirection === "desc") {
      return result * -1;
    }

    return result;
  });
};

const getIssueBrowseUrl = (issue) => {
  const issueKey = String(issue?.key || "").trim();
  if (!issueKey) {
    return "";
  }

  const selfUrl = issue?.self;
  if (typeof selfUrl === "string" && selfUrl.trim().length > 0) {
    try {
      const parsed = new URL(selfUrl);
      return `${parsed.protocol}//${parsed.host}/browse/${encodeURIComponent(issueKey)}`;
    } catch {
      return "";
    }
  }

  return "";
};

const noteMatchesLastJiraPush = (fingerprint, lastPushed) =>
  typeof lastPushed === "string" && lastPushed.length > 0 && fingerprint === lastPushed;

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
  jqlRuns,
  selectedForPush,
  pushState,
  saveState,
  rowUpdateState,
  statusDrafts,
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
  prioritySourceByKey,
  jqlSharedProgramIds,
  onLoadRemaining,
  onClearDrillDownRun,
  onClearDrillDownFilter,
  jqlLoading,
  drillDownFilters,
  drillDownPending,
}) => {
  const [activeTab, setActiveTab] = React.useState(0);
  const [pageByRunIndex, setPageByRunIndex] = React.useState({});
  const [keyFilterByRunIndex, setKeyFilterByRunIndex] = React.useState({});
  const [statusFilterByRunIndex, setStatusFilterByRunIndex] = React.useState({});
  const [assigneeFilterByRunIndex, setAssigneeFilterByRunIndex] = React.useState({});
  const [sortField, setSortField] = React.useState("default");
  const [sortDirection, setSortDirection] = React.useState("asc");

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
    const configuredRuns = (jqlRuns || []).filter(isConfiguredJqlRun);
    return pendingDrillDownRun ? [pendingDrillDownRun, ...configuredRuns] : configuredRuns;
  }, [jqlRuns, pendingDrillDownRun]);

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
    const hasFilters = Boolean(key || assignee);

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

    const targetTab = findRunIndexForDrillDown(visibleRuns, { key, assignee });
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
      setAssigneeFilterByRunIndex((prevFilters) => ({ ...prevFilters, [stateKey]: assignee }));
    }
    setPageByRunIndex((prevPages) => ({ ...prevPages, [stateKey]: 1 }));
  }, [drillDownFilters, getJqlRunsIndex, onActiveTabChange, visibleRuns]);

  if (visibleRuns.length === 0) {
    return null;
  }

  const safeTab = Math.min(activeTab, visibleRuns.length - 1);
  const run = visibleRuns[safeTab];
  const runStateKey = getRunStateKey(run, safeTab);
  const runSlotIndex = run.index ?? safeTab;
  const allLoadedIssues = run.issues || [];
  const keyFilterDraft = keyFilterByRunIndex[runStateKey] ?? "";
  const statusFilter = statusFilterByRunIndex[runStateKey] ?? "";
  const assigneeFilter = assigneeFilterByRunIndex[runStateKey] ?? "";
  const issuesMatchingKey = filterIssues(allLoadedIssues, { keyQuery: keyFilterDraft, statusFilter, assigneeFilter });
  const knownAssignees = getKnownAssignees(allLoadedIssues);
  const knownStatuses = getKnownStatuses(allLoadedIssues);
  const sortedIssues = sortIssues({
    issues: issuesMatchingKey,
    isClosedLikeStatus,
    jiraRowPriorities,
    clampPriority,
    sortField,
    sortDirection,
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

  const handleClearFilters = () => {
    setKeyFilterByRunIndex((prev) => ({ ...prev, [runStateKey]: "" }));
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

      <div className="ww-jql-tab-bar">
        <div className="ww-jql-tabs" role="tablist" aria-label="JQL result tabs">
          {visibleRuns.map((item, idx) => (
            <div
              key={`jql-tab-${getRunStateKey(item, idx)}`}
              className={
                "ww-jql-tab-item" +
                (idx === safeTab ? " is-active" : "") +
                (item.isDrillDown ? " is-drill-down" : "")
              }
            >
              <button
                type="button"
                role="tab"
                aria-selected={idx === safeTab}
                className={
                  "ww-jql-tab-btn" +
                  (idx === safeTab ? " is-active" : "") +
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
        </div>
      </div>

      <div className="ww-jql-result">
        <div className="ww-jql-result-header">
          <p className="ww-jql-title">{run.label}</p>
          <p className="ww-jql-query">{run.jql || "(empty)"}</p>
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

              {(keyFilterDraft || statusFilter || assigneeFilter) ? (
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
                <button
                  type="button"
                  className="ww-push-selected-btn"
                  onClick={() => handlePushSelected(issuesMatchingKey)}
                  disabled={
                    !issuesMatchingKey.some(
                      (issue) =>
                        selectedForPush[issue.key] &&
                        !isClosedLikeStatus(issue.fields?.status?.name)
                    )
                  }
                >
                  Push Selected
                </button>
              </div>

              <table className="ww-results-table">
                <thead>
                  <tr>
                    <th aria-sort={getHeaderAriaSort("key")}>
                      <button
                        type="button"
                        className={"ww-sort-header-btn" + (sortField === "key" ? " is-active" : "")}
                        onClick={() => handleHeaderSort("key")}
                      >
                        Key{getSortIndicator("key")}
                      </button>
                    </th>
                    <th>Jira Type</th>
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
                    <th aria-sort={getHeaderAriaSort("assignee")}>
                      <button
                        type="button"
                        className={"ww-sort-header-btn" + (sortField === "assignee" ? " is-active" : "")}
                        onClick={() => handleHeaderSort("assignee")}
                      >
                        Assignee{getSortIndicator("assignee")}
                      </button>
                    </th>
                    <th>Updated</th>
                    <th title="Jira due date, or inherited Most Recent Done Date when due date is unset">
                      Due
                    </th>
                    <th title="Most Recent Done Date">MRD</th>
                    <th>Parent</th>
                    <th aria-sort={getHeaderAriaSort("priority")}>
                      <button
                        type="button"
                        className={"ww-sort-header-btn" + (sortField === "priority" ? " is-active" : "")}
                        onClick={() => handleHeaderSort("priority")}
                      >
                        Priority{getSortIndicator("priority")}
                      </button>
                    </th>
                    <th>Notes</th>
                    <th>
                      <div className="ww-th-push">
                        Push to Jira
                        <label className="ww-select-all-label">
                          <input
                            type="checkbox"
                            checked={
                              issuesMatchingKey.filter(
                                (issue) => !isClosedLikeStatus(issue.fields?.status?.name)
                              ).length > 0 &&
                              issuesMatchingKey
                                .filter(
                                  (issue) => !isClosedLikeStatus(issue.fields?.status?.name)
                                )
                                .every((issue) => selectedForPush[issue.key])
                            }
                            onChange={(event) =>
                              handleSelectAll(issuesMatchingKey, event.target.checked)
                            }
                          />
                          All
                        </label>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedIssues.map((issue) => {
                    const issueKey = issue.key;
                    const issueBrowseUrl = getIssueBrowseUrl(issue);
                    const status = issue.fields?.status?.name || "-";
                    const assignee = issue.fields?.assignee?.displayName || "Unassigned";
                    const updated = formatDate(issue.fields?.updated);
                    const rowPriority = clampPriority(jiraRowPriorities[issueKey] ?? 0);
                    const push = pushState[issueKey] || { loading: false, error: "", success: "" };
                    const save = saveState[issueKey] || { loading: false, error: "", success: "" };
                    const rowUpdate = rowUpdateState[issueKey] || { loading: false, error: "", success: "" };
                    const isClosedOrResolved = isClosedLikeStatus(status);
                    const noteDraft = jiraNotes[issueKey] || "";
                    const pushedNoteSnapshot = lastPushedJiraNoteByKey[issueKey];
                    const noteFingerprint = buildNotePushFingerprint({
                      note: noteDraft,
                      images: noteImagesByKey[issueKey],
                    });
                    const isNoteAlreadyPushed = noteMatchesLastJiraPush(noteFingerprint, pushedNoteSnapshot);

                    return (
                      <tr
                        key={issue.id}
                        className={isClosedOrResolved ? "ww-row-closed" : getPriorityRowClass(rowPriority)}
                      >
                        <td className="ww-cell-key">
                          {issueBrowseUrl ? (
                            <a href={issueBrowseUrl} target="_blank" rel="noreferrer noopener">
                              {issueKey}
                            </a>
                          ) : (
                            issueKey
                          )}
                        </td>
                        <td>{issue.fields?.issuetype?.name || "-"}</td>
                        <td>{issue.fields?.summary || "No summary"}</td>

                        <td>
                          <div className={"ww-edit-cell" + (isClosedOrResolved ? " ww-edit-disabled" : "")}>
                            <select
                              className="ww-edit-select"
                              value={statusDrafts[issueKey] || status}
                              onChange={(event) =>
                                handleStatusDraftChange(issueKey, event.target.value)
                              }
                              disabled={isClosedOrResolved}
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
                              disabled={rowUpdate.loading || isClosedOrResolved}
                            >
                              Update Status
                            </button>
                          </div>
                        </td>

                        <AssigneeCell
                          issueKey={issueKey}
                          assignee={assignee}
                          isClosedOrResolved={isClosedOrResolved}
                          draftValue={assigneeDrafts[issueKey]}
                          knownAssignees={knownAssignees}
                          loading={rowUpdate.loading}
                          confirmation={rowUpdate}
                          onDraftChange={handleAssigneeDraftChange}
                          onUpdate={handleAssigneeUpdate}
                        />

                        <td>{updated}</td>

                        <td>
                          {getEffectiveDueDateForIssue(issue, {
                            dueFieldId: run.dueFieldId,
                            mrdFieldId: run.mrdFieldId,
                            parentMostRecentDoneDateByKey: run.parentMostRecentDoneDateByKey,
                          }) || <span style={{ color: "#94a3b8" }}>—</span>}
                        </td>

                        <td>
                          {getMostRecentDoneDateForIssue(
                            issue,
                            run.mrdFieldId,
                            run.parentMostRecentDoneDateByKey
                          ) || <span style={{ color: "#94a3b8" }}>—</span>}
                        </td>

                        <td>
                          {issue.fields?.parent?.key
                            ? (() => {
                                const parentUrl = getIssueBrowseUrl({ key: issue.fields.parent.key, self: issue.self });
                                return parentUrl ? (
                                  <a href={parentUrl} target="_blank" rel="noreferrer noopener" style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                                    {issue.fields.parent.key}
                                  </a>
                                ) : (
                                  <span style={{ fontSize: "0.82rem" }}>{issue.fields.parent.key}</span>
                                );
                              })()
                            : <span style={{ color: "#94a3b8" }}>—</span>}
                        </td>

                        <PriorityCell
                          issueKey={issueKey}
                          isClosedOrResolved={isClosedOrResolved}
                          rowPriority={rowPriority}
                          priorityClassName={getPriorityClass(rowPriority)}
                          prioritySource={prioritySourceByKey}
                          onChange={(key, value) =>
                            handleRowPriorityChange(key, value, {
                              sharedProgramId: String(
                                run.sharedProgramId ||
                                  jqlSharedProgramIds?.[runSlotIndex] ||
                                  ""
                              ).trim(),
                            })
                          }
                        />

                        <td>
                          {isClosedOrResolved ? (
                            <span>-</span>
                          ) : (
                            <NoteImagesStrip
                              images={noteImagesByKey[issueKey]}
                              disabled={push.loading || isClosedOrResolved}
                              error={noteImageErrorsByKey[issueKey]}
                              onAddFiles={(files) => handleNoteImagesAdd(issueKey, files)}
                              onRemove={(localId) => handleNoteImageRemove(issueKey, localId)}
                              keepOnMachine={keepNoteImagesByKey[issueKey]}
                              keepPending={Boolean(noteImageKeepPendingByKey[issueKey])}
                              onKeepChange={(checked) => handleKeepNoteImagesToggle(issueKey, checked)}
                            >
                              <textarea
                                className={`ww-note-textarea${
                                  isNoteAlreadyPushed ? " ww-note-textarea-pushed" : ""
                                }`}
                                value={noteDraft}
                                onChange={(event) =>
                                  handleNoteChange(issueKey, event.target.value)
                                }
                                placeholder="Add notes here"
                                title={
                                  isNoteAlreadyPushed
                                    ? "This note was pushed to Jira. Change the text or images before pushing again."
                                    : undefined
                                }
                              />
                            </NoteImagesStrip>
                          )}
                        </td>

                        <td>
                          {isClosedOrResolved ? (
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
                                {save.loading ? "Saving..." : "Save to DB"}
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
                    );
                  })}
                </tbody>
              </table>
            </div>

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
      </div>
    </div>
  );
};

export default JiraResultsTable;
