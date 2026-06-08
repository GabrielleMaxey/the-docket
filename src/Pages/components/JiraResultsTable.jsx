import React from "react";

const PAGE_SIZE = 30;

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

const sortIssues = ({ issues, isClosedLikeStatus, jiraRowPriorities, clampPriority }) => {
  return [...issues].sort((a, b) => {
    const aStatus = a.fields?.status?.name || "";
    const bStatus = b.fields?.status?.name || "";
    const aClosed = isClosedLikeStatus(aStatus);
    const bClosed = isClosedLikeStatus(bStatus);

    if (aClosed !== bClosed) {
      return aClosed ? 1 : -1;
    }

    if (aClosed && bClosed) {
      return String(a.key || "").localeCompare(String(b.key || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }

    const aPriority = clampPriority(jiraRowPriorities[String(a.key || "").trim()] ?? 0);
    const bPriority = clampPriority(jiraRowPriorities[String(b.key || "").trim()] ?? 0);
    const aRank = getPrioritySortRank(clampPriority, aPriority);
    const bRank = getPrioritySortRank(clampPriority, bPriority);

    if (aRank !== bRank) {
      return aRank - bRank;
    }

    return String(a.key || "").localeCompare(String(b.key || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
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
                    <th>Key</th>
                    <th>Jira Type</th>
                    <th>Summary</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Updated</th>
                    <th>Priority</th>
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
                              value={jiraNotes[issueKey] || ""}
                              onChange={(event) =>
                                handleNoteChange(issueKey, event.target.value)
                              }
                              placeholder="Add notes here"
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
                                disabled={!selectedForPush[issueKey] || push.loading}
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
