import React from "react";
import {
  fetchIssueMetadataBulk,
  fetchJiraHealth,
  fetchJiraMyself,
  fetchJiraSearch,
  pushJiraIssueNote,
  saveIssueMetadata,
  updateJiraIssueAssignee,
  updateJiraIssueStatus,
} from "../../services/jiraClient";

const STORAGE_KEY = "workWeekTimerJiraPreferences";
const NOTES_STORAGE_KEY = "workWeekTimerJiraNotes";
const ROW_PRIORITY_STORAGE_KEY = "workWeekTimerJiraRowPriorities";
const DEFAULT_JQL_COUNT = 1;
const DEFAULT_JQLS = ["assignee = currentUser() ORDER BY updated DESC", "", ""];
const DEFAULT_LABELS = ["My Work", "In Progress", "Blocked"];

export const STATUS_OPTIONS = [
  "Backlog",
  "In Progress",
  "Resolved",
  "Closed",
  "Ready for Work",
  "Analyzing",
  "Ready for Verification",
  "Verifying",
  "Ready to Deploy",
];

const loadStoredPreferences = () => {
  if (typeof window === "undefined") {
    return {
      jqlCount: DEFAULT_JQL_COUNT,
      jqlInputs: DEFAULT_JQLS,
      jqlLabels: DEFAULT_LABELS,
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        jqlCount: DEFAULT_JQL_COUNT,
        jqlInputs: DEFAULT_JQLS,
        jqlLabels: DEFAULT_LABELS,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      jqlCount: Math.min(3, Math.max(1, Number(parsed?.jqlCount || DEFAULT_JQL_COUNT))),
      jqlInputs: Array.isArray(parsed?.jqlInputs)
        ? [parsed.jqlInputs[0] || "", parsed.jqlInputs[1] || "", parsed.jqlInputs[2] || ""]
        : DEFAULT_JQLS,
      jqlLabels: Array.isArray(parsed?.jqlLabels)
        ? [parsed.jqlLabels[0] || "", parsed.jqlLabels[1] || "", parsed.jqlLabels[2] || ""]
        : DEFAULT_LABELS,
    };
  } catch {
    return {
      jqlCount: DEFAULT_JQL_COUNT,
      jqlInputs: DEFAULT_JQLS,
      jqlLabels: DEFAULT_LABELS,
    };
  }
};

const loadStoredNotes = () => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
};

const loadStoredRowPriorities = () => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(ROW_PRIORITY_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
};

const clampPriority = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return 0;
  }

  return Math.min(10, Math.max(0, num));
};

const isClosedLikeStatus = (status) => /^(closed|resolved|done)$/i.test(String(status || ""));

const getPriorityClass = (value) => {
  const clamped = clampPriority(value);
  if (clamped < 1 || clamped > 10) {
    return "ww-priority-neutral";
  }

  return `ww-priority-${clamped}`;
};

const getPriorityRowClass = (value) => {
  const clamped = clampPriority(value);
  if (clamped < 1 || clamped > 10) {
    return "ww-row-priority-neutral";
  }

  return `ww-row-priority-${clamped}`;
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
};

export const useTaskManagerJira = () => {
  const stored = loadStoredPreferences();
  const storedNotes = loadStoredNotes();
  const storedRowPriorities = loadStoredRowPriorities();

  const [jiraState, setJiraState] = React.useState({
    loading: false,
    success: null,
    message: "Not connected yet.",
  });
  const [jiraApiMeta, setJiraApiMeta] = React.useState("");
  const [jqlCount, setJqlCount] = React.useState(stored.jqlCount);
  const [jqlInputs, setJqlInputs] = React.useState(stored.jqlInputs);
  const [jqlLabels, setJqlLabels] = React.useState(stored.jqlLabels);
  const [jqlLoading, setJqlLoading] = React.useState(false);
  const [jqlRuns, setJqlRuns] = React.useState([]);
  const [jqlError, setJqlError] = React.useState("");
  const [jqlMaxResults, setJqlMaxResults] = React.useState(200);
  const [jiraNotes, setJiraNotes] = React.useState(storedNotes);
  const [jiraRowPriorities, setJiraRowPriorities] = React.useState(storedRowPriorities);
  const [selectedForPush, setSelectedForPush] = React.useState({});
  const [pushState, setPushState] = React.useState({});
  const [saveState, setSaveState] = React.useState({});
  const [statusDrafts, setStatusDrafts] = React.useState({});
  const [assigneeDrafts, setAssigneeDrafts] = React.useState({});
  const [rowUpdateState, setRowUpdateState] = React.useState({});

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        jqlCount,
        jqlInputs,
        jqlLabels,
      })
    );
  }, [jqlCount, jqlInputs, jqlLabels]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(jiraNotes));
  }, [jiraNotes]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(ROW_PRIORITY_STORAGE_KEY, JSON.stringify(jiraRowPriorities));
  }, [jiraRowPriorities]);

  const handleJiraTest = async () => {
    setJiraState({ loading: true, success: null, message: "Checking Jira connection..." });
    setJiraApiMeta("");

    try {
      const health = await fetchJiraHealth();
      const profile = await fetchJiraMyself();
      const displayName = profile?.displayName || profile?.emailAddress || "Connected";
      const endpoint = health?.searchEndpoint || "(unknown endpoint)";
      const version = health?.version || "(unknown version)";
      setJiraState({
        loading: false,
        success: true,
        message: `Connected as ${displayName}`,
      });
      setJiraApiMeta(`Proxy ${version} using ${endpoint}`);
    } catch (error) {
      setJiraState({
        loading: false,
        success: false,
        message: error instanceof Error ? error.message : "Failed to connect to Jira",
      });
    }
  };

  const handleJqlChange = (index, value) => {
    setJqlInputs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleJqlLabelChange = (index, value) => {
    setJqlLabels((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleResetSavedQueries = () => {
    setJqlCount(DEFAULT_JQL_COUNT);
    setJqlInputs(DEFAULT_JQLS);
    setJqlLabels(DEFAULT_LABELS);
    setJqlRuns([]);
    setJqlError("");

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handleSelectForPush = (issueKey, checked) => {
    setSelectedForPush((prev) => ({ ...prev, [issueKey]: checked }));
  };

  const handleSelectAll = (issues, checked) => {
    const openIssues = issues.filter(
      (issue) => !isClosedLikeStatus(issue.fields?.status?.name || "")
    );

    setSelectedForPush((prev) => {
      const next = { ...prev };
      openIssues.forEach((issue) => {
        next[issue.key] = checked;
      });
      return next;
    });
  };

  const handlePushNote = async (issueKey) => {
    const note = String(jiraNotes[issueKey] || "").trim();
    if (!note) {
      setPushState((prev) => ({
        ...prev,
        [issueKey]: { loading: false, error: "Enter a note before pushing.", success: "" },
      }));
      return;
    }

    setPushState((prev) => ({
      ...prev,
      [issueKey]: { loading: true, error: "", success: "" },
    }));

    try {
      await pushJiraIssueNote({ issueKey, note });
      setPushState((prev) => ({
        ...prev,
        [issueKey]: { loading: false, error: "", success: "Pushed to Jira." },
      }));
    } catch (error) {
      setPushState((prev) => ({
        ...prev,
        [issueKey]: {
          loading: false,
          error: error instanceof Error ? error.message : "Failed to push note",
          success: "",
        },
      }));
    }
  };

  const handlePushSelected = async (issues) => {
    const toPush = issues.filter(
      (issue) =>
        selectedForPush[issue.key] && !isClosedLikeStatus(issue.fields?.status?.name || "")
    );
    await Promise.all(toPush.map((issue) => handlePushNote(issue.key)));
  };

  const handleSaveMetadata = async (issueKey) => {
    const note = String(jiraNotes[issueKey] || "");
    const priority = clampPriority(jiraRowPriorities[issueKey] ?? 0);

    setSaveState((prev) => ({
      ...prev,
      [issueKey]: { loading: true, error: "", success: "" },
    }));

    try {
      await saveIssueMetadata({ issueKey, note, priority });
      setSaveState((prev) => ({
        ...prev,
        [issueKey]: { loading: false, error: "", success: "Saved to DB." },
      }));
    } catch (error) {
      setSaveState((prev) => ({
        ...prev,
        [issueKey]: {
          loading: false,
          error: error instanceof Error ? error.message : "Failed to save to DB",
          success: "",
        },
      }));
    }
  };

  const handleNoteChange = (issueKey, note) => {
    setJiraNotes((prev) => ({
      ...prev,
      [issueKey]: note,
    }));

    saveIssueMetadata({ issueKey, note }).catch((error) => {
      console.error("Failed to persist note", issueKey, error);
    });
  };

  const handleRowPriorityChange = (issueKey, value) => {
    const priority = clampPriority(value);

    setJiraRowPriorities((prev) => ({
      ...prev,
      [issueKey]: priority,
    }));

    saveIssueMetadata({ issueKey, priority }).catch((error) => {
      console.error("Failed to persist priority", issueKey, error);
    });
  };

  const handleStatusDraftChange = (issueKey, value) => {
    setStatusDrafts((prev) => ({
      ...prev,
      [issueKey]: value,
    }));
  };

  const handleAssigneeDraftChange = (issueKey, value) => {
    setAssigneeDrafts((prev) => ({
      ...prev,
      [issueKey]: value,
    }));
  };

  const setRowUpdateMessage = (issueKey, next) => {
    setRowUpdateState((prev) => ({
      ...prev,
      [issueKey]: {
        loading: false,
        error: "",
        success: "",
        ...(prev[issueKey] || {}),
        ...next,
      },
    }));
  };

  const updateIssueInRuns = (issueKey, updater) => {
    setJqlRuns((prevRuns) =>
      prevRuns.map((run) => ({
        ...run,
        issues: (run.issues || []).map((issue) => {
          if (issue.key !== issueKey) {
            return issue;
          }

          return updater(issue);
        }),
      }))
    );
  };

  const handleStatusUpdate = async (issueKey, fallbackStatus) => {
    const targetStatus = String(statusDrafts[issueKey] || fallbackStatus || "").trim();
    if (!targetStatus) {
      setRowUpdateMessage(issueKey, { error: "Choose a status before updating." });
      return;
    }

    setRowUpdateMessage(issueKey, { loading: true, error: "", success: "" });

    try {
      await updateJiraIssueStatus({ issueKey, targetStatus });
      updateIssueInRuns(issueKey, (issue) => ({
        ...issue,
        fields: {
          ...issue.fields,
          status: {
            ...(issue.fields?.status || {}),
            name: targetStatus,
          },
        },
      }));
      setRowUpdateMessage(issueKey, { loading: false, success: `Status updated to ${targetStatus}.` });
    } catch (error) {
      setRowUpdateMessage(issueKey, {
        loading: false,
        error: error instanceof Error ? error.message : "Failed to update status",
      });
    }
  };

  const handleAssigneeUpdate = async (issueKey) => {
    const assignee = String(assigneeDrafts[issueKey] || "").trim();
    if (!assignee) {
      setRowUpdateMessage(issueKey, { error: "Choose or type an assignee before updating." });
      return;
    }

    setRowUpdateMessage(issueKey, { loading: true, error: "", success: "" });

    try {
      const result = await updateJiraIssueAssignee({ issueKey, assignee });
      const nextAssignee = String(result?.resolvedAssignee || assignee).trim() || assignee;
      updateIssueInRuns(issueKey, (issue) => ({
        ...issue,
        fields: {
          ...issue.fields,
          assignee: {
            ...(issue.fields?.assignee || {}),
            displayName: nextAssignee,
          },
        },
      }));
      setRowUpdateMessage(issueKey, { loading: false, success: "Assignee updated." });
    } catch (error) {
      setRowUpdateMessage(issueKey, {
        loading: false,
        error: error instanceof Error ? error.message : "Failed to update assignee",
      });
    }
  };

  const handleRunJql = async () => {
    const selected = jqlInputs.slice(0, jqlCount).map((item) => item.trim());
    const nonEmpty = selected.filter(Boolean);

    if (nonEmpty.length === 0) {
      setJqlError("Please enter at least one JQL.");
      setJqlRuns([]);
      return;
    }

    setJqlError("");
    setJqlLoading(true);

    const runResults = await Promise.all(
      selected.map(async (jql, idx) => {
        const label = (jqlLabels[idx] || "").trim() || `JQL ${idx + 1}`;

        if (!jql) {
          return {
            index: idx,
            label,
            jql,
            issues: [],
            total: 0,
            error: "No JQL entered for this slot.",
          };
        }

        try {
          const data = await fetchJiraSearch({ jql, maxResults: jqlMaxResults });
          return {
            index: idx,
            label,
            jql,
            issues: data?.issues || [],
            total: Number(data?.total || 0),
            error: null,
          };
        } catch (error) {
          return {
            index: idx,
            label,
            jql,
            issues: [],
            total: 0,
            error: error instanceof Error ? error.message : "Failed to run query",
          };
        }
      })
    );

    const allIssueKeys = Array.from(
      new Set(
        runResults.flatMap((run) =>
          (run.issues || []).map((issue) => String(issue.key || "").trim())
        )
      )
    ).filter((key) => key.length > 0);

    if (allIssueKeys.length > 0) {
      try {
        const persisted = await fetchIssueMetadataBulk(allIssueKeys);
        const nextNotes = {};
        const nextPriorities = {};

        allIssueKeys.forEach((issueKey) => {
          const item = persisted?.[issueKey];
          if (!item) {
            return;
          }

          if (typeof item.note === "string") {
            nextNotes[issueKey] = item.note;
          }
          if (item.priority !== undefined) {
            nextPriorities[issueKey] = clampPriority(item.priority);
          }
        });

        if (Object.keys(nextNotes).length > 0) {
          setJiraNotes((prev) => {
            const merged = { ...prev };
            Object.entries(nextNotes).forEach(([issueKey, note]) => {
              if (merged[issueKey] === undefined) {
                merged[issueKey] = note;
              }
            });
            return merged;
          });
        }
        if (Object.keys(nextPriorities).length > 0) {
          setJiraRowPriorities((prev) => {
            const merged = { ...prev };
            Object.entries(nextPriorities).forEach(([issueKey, priority]) => {
              if (merged[issueKey] === undefined) {
                merged[issueKey] = priority;
              }
            });
            return merged;
          });
        }
      } catch (error) {
        console.error("Failed to fetch persisted issue metadata", error);
      }
    }

    setJqlRuns([...runResults].sort((a, b) => a.index - b.index));
    setJqlLoading(false);
  };

  return {
    jiraState,
    jiraApiMeta,
    jqlCount,
    jqlInputs,
    jqlLabels,
    jqlLoading,
    jqlRuns,
    jqlError,
    jqlMaxResults,
    jiraNotes,
    jiraRowPriorities,
    selectedForPush,
    pushState,
    saveState,
    statusDrafts,
    assigneeDrafts,
    rowUpdateState,
    isClosedLikeStatus,
    clampPriority,
    getPriorityClass,
    getPriorityRowClass,
    formatDate,
    setJqlCount,
    setJqlMaxResults,
    handleJiraTest,
    handleJqlChange,
    handleJqlLabelChange,
    handleResetSavedQueries,
    handleRunJql,
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
  };
};
