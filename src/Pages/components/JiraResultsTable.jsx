import React from "react";

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
  );
};

const getPrioritySortRank = (clampPriority, priorityValue) => {
  const priority = clampPriority(priorityValue);
  return priority === 0 ? 11 : priority;
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

const noteMatchesLastJiraPush = (noteDraft, lastPushed) =>
  typeof lastPushed === "string" &&
  lastPushed.trim().length > 0 &&
  String(noteDraft || "").trim() === lastPushed.trim();

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
  handleSelectForPush,
  handlePushNote,
}) => {
  const [activeTab, setActiveTab] = React.useState(0);
  const [pageByRunIndex, setPageByRunIndex] = React.useState({});
  const [sortField, setSortField] = React.useState("default");
  const [sortDirection, setSortDirection] = React.useState("asc");

  React.useEffect(() => {
    setActiveTab((prev) => Math.min(Math.max(prev, 0), Math.max(0, jqlRuns.length - 1)));
  }, [jqlRuns.length]);

  if (jqlRuns.length === 0) {
    return null;
  }

  const safeTab = Math.min(activeTab, jqlRuns.length - 1);
  const run = jqlRuns[safeTab];
  const knownAssignees = getKnownAssignees(run.issues || []);
  const sortedIssues = sortIssues({
    issues: run.issues || [],
    isClosedLikeStatus,
    jiraRowPriorities,
    clampPriority,
    sortField,
    sortDirection,
  });

  const runIndex = run.index ?? safeTab;
  const totalPages = Math.max(1, Math.ceil(sortedIssues.length / PAGE_SIZE));
  const currentPage = Math.min(pageByRunIndex[runIndex] || 1, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pagedIssues = sortedIssues.slice(start, start + PAGE_SIZE);

  const handleTabChange = (idx) => {
    setActiveTab(idx);
  };

  const handlePageChange = (nextPage) => {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    setPageByRunIndex((prev) => ({ ...prev, [runIndex]: clamped }));
  };

  const handleSortFieldChange = (nextField) => {
    setSortField(nextField);
    setPageByRunIndex((prev) => ({ ...prev, [runIndex]: 1 }));
  };

  const handleSortDirectionChange = (nextDirection) => {
    setSortDirection(nextDirection);
    setPageByRunIndex((prev) => ({ ...prev, [runIndex]: 1 }));
  };

  const handleHeaderSort = (field) => {
    if (sortField === field) {
      const nextDirection = sortDirection === "asc" ? "desc" : "asc";
      setSortDirection(nextDirection);
    } else {
      setSortField(field);
      setSortDirection("asc");
    }

    setPageByRunIndex((prev) => ({ ...prev, [runIndex]: 1 }));
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
          {jqlRuns.map((item, idx) => (
            <button
              key={`jql-tab-${item.index ?? idx}`}
              type="button"
              role="tab"
              aria-selected={idx === safeTab}
              className={"ww-jql-tab-btn" + (idx === safeTab ? " is-active" : "")}
              onClick={() => handleTabChange(idx)}
            >
              {item.label || ("JQL " + (idx + 1))}
            </button>
          ))}
        </div>
      </div>

      <div className="ww-jql-result">
        <div className="ww-jql-result-header">
          <p className="ww-jql-title">{run.label}</p>
          <p className="ww-jql-query">{run.jql || "(empty)"}</p>
        </div>

        {run.error ? (
          <p className="ww-jira-status ww-jira-error">{run.error}</p>
        ) : (
          <div>
            <p className="ww-jira-status">
              Showing {run.issues.length} of {run.total} matched
            </p>

            <div className="ww-pagination-row">
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

              <button
                type="button"
                className="ww-page-btn"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                Prev
              </button>
              <span className="ww-page-meta">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="ww-page-btn"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Next
              </button>
            </div>

            <div className="ww-results-table-wrap">
              <div className="ww-push-selected-row">
                <button
                  type="button"
                  className="ww-push-selected-btn"
                  onClick={() => handlePushSelected(run.issues)}
                  disabled={
                    !run.issues.some(
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
                              run.issues.filter(
                                (issue) => !isClosedLikeStatus(issue.fields?.status?.name)
                              ).length > 0 &&
                              run.issues
                                .filter(
                                  (issue) => !isClosedLikeStatus(issue.fields?.status?.name)
                                )
                                .every((issue) => selectedForPush[issue.key])
                            }
                            onChange={(event) =>
                              handleSelectAll(run.issues, event.target.checked)
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
                    const isNoteAlreadyPushed = noteMatchesLastJiraPush(noteDraft, pushedNoteSnapshot);

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

                        <td>
                          <div className={"ww-edit-cell" + (isClosedOrResolved ? " ww-edit-disabled" : "")}>
                            <input
                              list={"assignee-options-" + run.index}
                              className="ww-edit-input"
                              value={assigneeDrafts[issueKey] || assignee}
                              onChange={(event) =>
                                handleAssigneeDraftChange(issueKey, event.target.value)
                              }
                              placeholder="Pick or type assignee"
                              disabled={isClosedOrResolved}
                            />
                            <button
                              type="button"
                              className="ww-inline-action-btn"
                              onClick={() => handleAssigneeUpdate(issueKey)}
                              disabled={rowUpdate.loading || isClosedOrResolved}
                            >
                              Update Assignee
                            </button>
                          </div>
                          <datalist id={"assignee-options-" + run.index}>
                            {knownAssignees.map((name) => (
                              <option key={"assignee-opt-" + run.index + "-" + name} value={name} />
                            ))}
                          </datalist>
                        </td>

                        <td>{updated}</td>

                        <td>
                          {isClosedOrResolved ? (
                            <span>-</span>
                          ) : (
                            <select
                              className={"ww-row-priority-select " + getPriorityClass(rowPriority)}
                              value={rowPriority}
                              onChange={(event) =>
                                handleRowPriorityChange(issueKey, event.target.value)
                              }
                            >
                              {Array.from({ length: 11 }).map((_, i) => (
                                <option key={"row-priority-" + issueKey + "-" + i} value={i}>
                                  {"P" + i}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>

                        <td>
                          {isClosedOrResolved ? (
                            <span>-</span>
                          ) : (
                            <textarea
                              className={isNoteAlreadyPushed ? "ww-note-textarea-pushed" : undefined}
                              value={noteDraft}
                              onChange={(event) =>
                                handleNoteChange(issueKey, event.target.value)
                              }
                              placeholder="Add notes here"
                              title={
                                isNoteAlreadyPushed
                                  ? "This note was pushed to Jira. Change the text to add a new note before pushing again."
                                  : undefined
                              }
                            />
                          )}
                        </td>

                        <td>
                          {isClosedOrResolved ? (
                            <span>-</span>
                          ) : (
                            <div>
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
          </div>
        )}
      </div>
    </div>
  );
};

export default JiraResultsTable;
