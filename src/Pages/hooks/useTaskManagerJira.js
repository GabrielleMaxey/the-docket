import React from "react";
import {
  fetchJiraHealth,
  fetchJiraMyself,
  pushJiraIssueNote,
  saveIssueMetadata,
  updateJiraIssueAssignee,
  updateJiraIssueStatus,
} from "../../services/jiraClient";
import { runJqlWorkflow } from "./jiraJqlRunWorkflow.js";

const STORAGE_KEY = "workWeekTimerJiraPreferences";
const NOTES_STORAGE_KEY = "workWeekTimerJiraNotes";
const ROW_PRIORITY_STORAGE_KEY = "workWeekTimerJiraRowPriorities";
const JQL_RUNS_STORAGE_KEY = "workWeekTimerJiraLastJqlRuns";
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

const readJsonObject = (storageKey) => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const isValidJqlRun = (run) =>
  Boolean(
    run &&
      typeof run === "object" &&
      Number.isFinite(Number(run.index)) &&
      Array.isArray(run.issues)
  );

const loadStoredJqlRuns = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(JQL_RUNS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const runs = parsed.filter(isValidJqlRun);
    return runs.length === 0 ? [] : [...runs].sort((a, b) => a.index - b.index);
  } catch {
    return [];
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

const priorityTierClass = (prefix, value) => {
  const clamped = clampPriority(value);
  if (clamped < 1 || clamped > 10) {
    return `${prefix}-neutral`;
  }

  return `${prefix}-${clamped}`;
};

const getPriorityClass = (value) => priorityTierClass("ww-priority", value);

const getPriorityRowClass = (value) => priorityTierClass("ww-row-priority", value);

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

const patchIndexedArray = (previous, index, nextValue) => {
  const next = [...previous];
  next[index] = nextValue;
  return next;
};

const patchIssueKeyed = (previous, issueKey, nextValue) => ({
  ...previous,
  [issueKey]: nextValue,
});

const errorMessage = (error, fallback) =>
  error instanceof Error ? error.message : fallback;

export const useTaskManagerJira = () => {
  const stored = loadStoredPreferences();
  const storedNotes = readJsonObject(NOTES_STORAGE_KEY);
  const storedRowPriorities = readJsonObject(ROW_PRIORITY_STORAGE_KEY);

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
  const [jqlRuns, setJqlRuns] = React.useState(loadStoredJqlRuns);
  const [showRestoredJqlBanner, setShowRestoredJqlBanner] = React.useState(
    () => loadStoredJqlRuns().length > 0
  );
  const [jqlError, setJqlError] = React.useState("");
  const [jqlMaxResults, setJqlMaxResults] = React.useState(200);
  const [jiraNotes, setJiraNotes] = React.useState(storedNotes);
  const [jiraRowPriorities, setJiraRowPriorities] = React.useState(storedRowPriorities);
  const [selectedForPush, setSelectedForPush] = React.useState({});
  const [lastPushedJiraNoteByKey, setLastPushedJiraNoteByKey] = React.useState({});
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
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(jiraNotes));
    window.localStorage.setItem(ROW_PRIORITY_STORAGE_KEY, JSON.stringify(jiraRowPriorities));
  }, [jqlCount, jqlInputs, jqlLabels, jiraNotes, jiraRowPriorities]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (jqlRuns.length === 0) {
      window.localStorage.removeItem(JQL_RUNS_STORAGE_KEY);
      return;
    }

    try {
      window.localStorage.setItem(JQL_RUNS_STORAGE_KEY, JSON.stringify(jqlRuns));
    } catch (error) {
      console.warn("Could not persist JQL results to localStorage (size or quota).", error);
    }
  }, [jqlRuns]);

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
        message: errorMessage(error, "Failed to connect to Jira"),
      });
    }
  };

  const handleJqlChange = (index, value) => {
    setJqlInputs((prev) => patchIndexedArray(prev, index, value));
  };

  const handleJqlLabelChange = (index, value) => {
    setJqlLabels((prev) => patchIndexedArray(prev, index, value));
  };

  const handleResetSavedQueries = () => {
    setJqlCount(DEFAULT_JQL_COUNT);
    setJqlInputs(DEFAULT_JQLS);
    setJqlLabels(DEFAULT_LABELS);
    setJqlRuns([]);
    setShowRestoredJqlBanner(false);
    setJqlError("");
    setLastPushedJiraNoteByKey({});

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(JQL_RUNS_STORAGE_KEY);
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

    const lastPushedSnapshot = lastPushedJiraNoteByKey[issueKey];
    if (typeof lastPushedSnapshot === "string" && lastPushedSnapshot.trim() && note === lastPushedSnapshot.trim()) {
      setPushState((prev) => ({
        ...prev,
        [issueKey]: {
          loading: false,
          error: "",
          success: "Already pushed — edit the note to push again.",
        },
      }));
      return;
    }

    setPushState((prev) => ({
      ...prev,
      [issueKey]: { loading: true, error: "", success: "" },
    }));

    try {
      await pushJiraIssueNote({ issueKey, note });
      setJiraNotes((prev) => patchIssueKeyed(prev, issueKey, note));
      setLastPushedJiraNoteByKey((prev) => patchIssueKeyed(prev, issueKey, note));
      setPushState((prev) => ({
        ...prev,
        [issueKey]: { loading: false, error: "", success: "Pushed to Jira." },
      }));
    } catch (error) {
      setPushState((prev) => ({
        ...prev,
        [issueKey]: {
          loading: false,
          error: errorMessage(error, "Failed to push note"),
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
          error: errorMessage(error, "Failed to save to DB"),
          success: "",
        },
      }));
    }
  };

  const handleNoteChange = (issueKey, note) => {
    setJiraNotes((prev) => patchIssueKeyed(prev, issueKey, note));

    saveIssueMetadata({ issueKey, note }).catch((error) => {
      console.error("Failed to persist note", issueKey, error);
    });
  };

  const handleRowPriorityChange = (issueKey, value) => {
    const priority = clampPriority(value);

    setJiraRowPriorities((prev) => patchIssueKeyed(prev, issueKey, priority));

    saveIssueMetadata({ issueKey, priority }).catch((error) => {
      console.error("Failed to persist priority", issueKey, error);
    });
  };

  const handleStatusDraftChange = (issueKey, value) => {
    setStatusDrafts((prev) => patchIssueKeyed(prev, issueKey, value));
  };

  const handleAssigneeDraftChange = (issueKey, value) => {
    setAssigneeDrafts((prev) => patchIssueKeyed(prev, issueKey, value));
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
        error: errorMessage(error, "Failed to update status"),
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
        error: errorMessage(error, "Failed to update assignee"),
      });
    }
  };

  const handleRunJql = () =>
    runJqlWorkflow({
      jqlInputs,
      jqlCount,
      jqlLabels,
      jqlMaxResults,
      clampPriority,
      setJqlError,
      setJqlRuns,
      setShowRestoredJqlBanner,
      setJqlLoading,
      setJiraNotes,
      setJiraRowPriorities,
    });

  return {
    jiraState,
    jiraApiMeta,
    jqlCount,
    jqlInputs,
    jqlLabels,
    jqlLoading,
    jqlRuns,
    showRestoredJqlBanner,
    jqlError,
    jqlMaxResults,
    jiraNotes,
    jiraRowPriorities,
    selectedForPush,
    lastPushedJiraNoteByKey,
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
