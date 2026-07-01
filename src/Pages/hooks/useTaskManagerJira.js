import React from "react";
import {
  fetchFieldMappings,
  pushJiraIssueNote,
  saveIssueMetadata,
  updateJiraIssueAssignee,
  updateJiraIssueStatus,
} from "../../services/jiraClient";
import { runJqlWorkflow, loadRemainingJqlIssues, loadDrillDownIssueByKey, loadDrillDownIssuesByAssignee } from "./jiraJqlRunWorkflow.js";
import {
  drillDownJqlRuns,
  loadDrillDownRunsFromSessionStorage,
  mergeJqlRuns,
  partitionJqlRuns,
  persistDrillDownRunsToSessionStorage,
  persistJqlRunsToStorage,
  savableJqlRuns,
} from "../../utils/jqlRunPersistence.js";
import { enrichRunWithParentDoneDates, runsNeedParentMrddEnrich } from "../../utils/jiraIssueDoneDates.js";
import {
  BACKGROUND_JOB_IDS,
  runBackgroundJob,
  useAttachBackgroundJob,
  useBackgroundJobRunning,
} from "../../hooks/useBackgroundJobs.js";
import {
  DEFAULT_JQL_COUNT,
  DEFAULT_JQL_LABELS,
  DEFAULT_JQLS,
  WORK_WEEK_STORAGE_KEYS,
  normalizeJqlCount,
  normalizeJqlSlotValues,
} from "../../utils/workWeekStorage.js";

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
      jqlLabels: DEFAULT_JQL_LABELS,
      pullLatestComment: false,
    };
  }

  try {
    const raw = window.localStorage.getItem(WORK_WEEK_STORAGE_KEYS.jiraPreferences);
    if (!raw) {
      return {
        jqlCount: DEFAULT_JQL_COUNT,
        jqlInputs: DEFAULT_JQLS,
        jqlLabels: DEFAULT_JQL_LABELS,
        pullLatestComment: false,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      jqlCount: normalizeJqlCount(parsed?.jqlCount),
      jqlInputs: normalizeJqlSlotValues(parsed?.jqlInputs, DEFAULT_JQLS),
      jqlLabels: normalizeJqlSlotValues(parsed?.jqlLabels, DEFAULT_JQL_LABELS),
      pullLatestComment: parsed?.pullLatestComment === true,
    };
  } catch {
    return {
      jqlCount: DEFAULT_JQL_COUNT,
      jqlInputs: DEFAULT_JQLS,
      jqlLabels: DEFAULT_JQL_LABELS,
      pullLatestComment: false,
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
    const raw = window.localStorage.getItem(WORK_WEEK_STORAGE_KEYS.jqlRuns);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const runs = parsed.filter((run) => isValidJqlRun(run) && !run?.isDrillDown);
    return runs.length === 0 ? [] : [...runs].sort((a, b) => a.index - b.index);
  } catch {
    return [];
  }
};

const loadInitialJqlRuns = () =>
  mergeJqlRuns(loadDrillDownRunsFromSessionStorage(), loadStoredJqlRuns());

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
  const storedNotes = readJsonObject(WORK_WEEK_STORAGE_KEYS.jiraNotes);
  const storedRowPriorities = readJsonObject(WORK_WEEK_STORAGE_KEYS.jiraRowPriorities);

  const [jqlCount, setJqlCount] = React.useState(stored.jqlCount);
  const [jqlInputs, setJqlInputs] = React.useState(stored.jqlInputs);
  const [jqlLabels, setJqlLabels] = React.useState(stored.jqlLabels);
  const [jqlLoadingLocal, setJqlLoadingLocal] = React.useState(false);
  const [jqlPending, setJqlPending] = React.useState(false);
  const bgJqlRunning = useBackgroundJobRunning(BACKGROUND_JOB_IDS.WORK_WEEK_JQL);
  const jqlLoading = jqlLoadingLocal || jqlPending || bgJqlRunning;
  const [jqlRuns, setJqlRuns] = React.useState(loadInitialJqlRuns);
  const [showRestoredJqlBanner, setShowRestoredJqlBanner] = React.useState(
    () => loadStoredJqlRuns().length > 0
  );
  const [jqlError, setJqlError] = React.useState("");
  const [jqlMaxResults, setJqlMaxResults] = React.useState(200);
  const [pullLatestComment, setPullLatestComment] = React.useState(stored.pullLatestComment);
  const [jiraNotes, setJiraNotes] = React.useState(storedNotes);
  const [jiraRowPriorities, setJiraRowPriorities] = React.useState(storedRowPriorities);
  const [prioritySourceByKey, setPrioritySourceByKey] = React.useState({});
  const [selectedForPush, setSelectedForPush] = React.useState({});
  const [lastPushedJiraNoteByKey, setLastPushedJiraNoteByKey] = React.useState({});
  const [pushState, setPushState] = React.useState({});
  const [saveState, setSaveState] = React.useState({});
  const [statusDrafts, setStatusDrafts] = React.useState({});
  const [assigneeDrafts, setAssigneeDrafts] = React.useState({});
  const [assigneeAccountIds, setAssigneeAccountIds] = React.useState({});
  const [rowUpdateState, setRowUpdateState] = React.useState({});
  const [fieldMappingRows, setFieldMappingRows] = React.useState([]);
  const [fieldMappingsLoading, setFieldMappingsLoading] = React.useState(true);

  const reloadJqlRunsFromStorage = React.useCallback(() => {
    const storedRuns = loadStoredJqlRuns();
    if (storedRuns.length > 0) {
      setShowRestoredJqlBanner(false);
    }
    setJqlRuns((prev) => {
      const { drillDown } = partitionJqlRuns(prev);
      if (storedRuns.length === 0) {
        return drillDown.length > 0 ? drillDown : prev;
      }
      return mergeJqlRuns(drillDown, storedRuns);
    });
  }, []);

  useAttachBackgroundJob(BACKGROUND_JOB_IDS.WORK_WEEK_JQL, {
    onSuccess: reloadJqlRunsFromStorage,
    onFinally: () => setJqlPending(false),
  });

  React.useEffect(() => {
    setFieldMappingsLoading(true);
    fetchFieldMappings()
      .then((rows) => setFieldMappingRows(Array.isArray(rows) ? rows : []))
      .catch((error) => {
        console.warn("Failed to load Jira field mappings", error);
      })
      .finally(() => setFieldMappingsLoading(false));
  }, []);

  React.useEffect(() => {
    const { drillDown, regular } = partitionJqlRuns(jqlRuns);
    if (fieldMappingsLoading || regular.length === 0 || !runsNeedParentMrddEnrich(regular)) {
      return;
    }

    let cancelled = false;
    Promise.all(regular.map((run) => enrichRunWithParentDoneDates(run, fieldMappingRows))).then(
      (enrichedRegular) => {
        if (cancelled) {
          return;
        }
        setJqlRuns((prev) => {
          const { drillDown: currentDrillDown } = partitionJqlRuns(prev);
          const enrichedByIndex = new Map(enrichedRegular.map((run) => [run.index, run]));
          const mergedRegular = partitionJqlRuns(prev)
            .regular.map((run) => enrichedByIndex.get(run.index) || run)
            .sort((a, b) => a.index - b.index);
          return mergeJqlRuns(currentDrillDown, mergedRegular);
        });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [fieldMappingRows, fieldMappingsLoading, jqlRuns]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      WORK_WEEK_STORAGE_KEYS.jiraPreferences,
      JSON.stringify({
        jqlCount,
        jqlInputs,
        jqlLabels,
        pullLatestComment,
      })
    );
    window.localStorage.setItem(WORK_WEEK_STORAGE_KEYS.jiraNotes, JSON.stringify(jiraNotes));
    window.localStorage.setItem(
      WORK_WEEK_STORAGE_KEYS.jiraRowPriorities,
      JSON.stringify(jiraRowPriorities)
    );
  }, [jqlCount, jqlInputs, jqlLabels, pullLatestComment, jiraNotes, jiraRowPriorities]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savable = savableJqlRuns(jqlRuns);
    if (savable.length === 0) {
      window.localStorage.removeItem(WORK_WEEK_STORAGE_KEYS.jqlRuns);
    } else {
      try {
        window.localStorage.setItem(WORK_WEEK_STORAGE_KEYS.jqlRuns, JSON.stringify(savable));
      } catch (error) {
        console.warn("Could not persist JQL results to localStorage (size or quota).", error);
      }
    }

    persistDrillDownRunsToSessionStorage(jqlRuns);
  }, [jqlRuns]);

  const handleJqlChange = (index, value) => {
    setJqlInputs((prev) => patchIndexedArray(prev, index, value));
  };

  const handleJqlLabelChange = (index, value) => {
    setJqlLabels((prev) => patchIndexedArray(prev, index, value));
  };

  const handleResetSavedQueries = () => {
    setJqlCount(DEFAULT_JQL_COUNT);
    setJqlInputs(DEFAULT_JQLS);
    setJqlLabels(DEFAULT_JQL_LABELS);
    setJqlRuns([]);
    setShowRestoredJqlBanner(false);
    setJqlError("");
    setLastPushedJiraNoteByKey({});

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(WORK_WEEK_STORAGE_KEYS.jiraPreferences);
      window.localStorage.removeItem(WORK_WEEK_STORAGE_KEYS.jqlRuns);
      // Do not remove header reminders (`workWeekTasksReminders` in WorkWeekTasks.jsx) or
      // notes/priorities — reset is JQL prefs + cached runs only.
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
    setPrioritySourceByKey((prev) => {
      const next = { ...prev };
      delete next[issueKey];
      return next;
    });

    saveIssueMetadata({ issueKey, priority }).catch((error) => {
      console.error("Failed to persist priority", issueKey, error);
    });
  };

  const handleStatusDraftChange = (issueKey, value) => {
    setStatusDrafts((prev) => patchIssueKeyed(prev, issueKey, value));
  };

  const handleAssigneeDraftChange = (issueKey, value, accountId) => {
    setAssigneeDrafts((prev) => patchIssueKeyed(prev, issueKey, value));
    setAssigneeAccountIds((prev) => {
      const next = { ...prev };
      if (accountId) {
        next[issueKey] = accountId;
      } else {
        delete next[issueKey];
      }
      return next;
    });
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
    const assignee =
      String(assigneeAccountIds[issueKey] || assigneeDrafts[issueKey] || "").trim();
    if (!assignee) {
      setRowUpdateMessage(issueKey, { error: "Choose or type an assignee before updating." });
      return;
    }

    setRowUpdateMessage(issueKey, { loading: true, error: "", success: "" });

    try {
      const result = await updateJiraIssueAssignee({ issueKey, assignee });
      const nextAssignee = String(result?.resolvedAssignee || assigneeDrafts[issueKey] || assignee).trim() || assignee;
      updateIssueInRuns(issueKey, (issue) => ({
        ...issue,
        fields: {
          ...issue.fields,
          assignee: {
            ...(issue.fields?.assignee || {}),
            displayName: nextAssignee,
            accountId: result?.accountId || issue.fields?.assignee?.accountId,
          },
        },
      }));
      setAssigneeDrafts((prev) => ({ ...prev, [issueKey]: nextAssignee }));
      setAssigneeAccountIds((prev) => {
        const next = { ...prev };
        delete next[issueKey];
        return next;
      });
      setRowUpdateMessage(issueKey, {
        loading: false,
        success: `Assigned to ${nextAssignee}.`,
      });
    } catch (error) {
      setRowUpdateMessage(issueKey, {
        loading: false,
        error: errorMessage(error, "Failed to update assignee"),
      });
    }
  };

  const handleRunJql = () => {
    setJqlPending(true);
    runBackgroundJob(BACKGROUND_JOB_IDS.WORK_WEEK_JQL, {
      label: "Running JQL",
      run: () =>
        runJqlWorkflow({
          jqlInputs,
          jqlCount,
          jqlLabels,
          jqlMaxResults,
          pullLatestComment,
          clampPriority,
          setJqlError,
          setJqlRuns,
          setShowRestoredJqlBanner,
          setJqlLoading: setJqlLoadingLocal,
          setJiraNotes,
          setJiraRowPriorities,
          setPrioritySourceByKey,
          fieldMappingRows,
        }),
    }).finally(() => setJqlPending(false));
  };

  const handleLoadRemainingJql = (runIndex) => {
    setJqlPending(true);
    runBackgroundJob(BACKGROUND_JOB_IDS.WORK_WEEK_JQL, {
      label: "Loading JQL results",
      run: () =>
        loadRemainingJqlIssues({
          runIndex,
          jqlRuns,
          jqlMaxResults,
          clampPriority,
          setJqlRuns,
          setJqlLoading: setJqlLoadingLocal,
          setJiraRowPriorities,
          setPrioritySourceByKey,
          setJiraNotes,
          pullLatestComment,
          fieldMappingRows,
        }),
    }).finally(() => setJqlPending(false));
  };

  const drillDownFetchSeqRef = React.useRef(0);

  const handleDrillDownToKey = React.useCallback(
    (issueKey) => {
      const fetchSeq = ++drillDownFetchSeqRef.current;
      return loadDrillDownIssueByKey({
        issueKey,
        pullLatestComment,
        clampPriority,
        setJqlRuns,
        setJqlLoading: setJqlLoadingLocal,
        setJiraRowPriorities,
        setPrioritySourceByKey,
        setJiraNotes,
        setJqlError,
        fieldMappingRows,
        isStale: () => fetchSeq !== drillDownFetchSeqRef.current,
      });
    },
    [pullLatestComment, clampPriority, fieldMappingRows]
  );

  const handleDrillDownToAssignee = React.useCallback(
    (assigneeName) => {
      const fetchSeq = ++drillDownFetchSeqRef.current;
      return loadDrillDownIssuesByAssignee({
        assigneeName,
        jqlMaxResults,
        pullLatestComment,
        clampPriority,
        setJqlRuns,
        setJqlLoading: setJqlLoadingLocal,
        setJiraRowPriorities,
        setPrioritySourceByKey,
        setJiraNotes,
        setJqlError,
        fieldMappingRows,
        isStale: () => fetchSeq !== drillDownFetchSeqRef.current,
      });
    },
    [jqlMaxResults, pullLatestComment, clampPriority, fieldMappingRows]
  );

  const clearDrillDownRuns = React.useCallback(() => {
    drillDownFetchSeqRef.current += 1;
    setJqlRuns((prev) => {
      const next = prev.filter((run) => !run.isDrillDown);
      if (next.length === prev.length) {
        return prev;
      }
      persistJqlRunsToStorage(next);
      persistDrillDownRunsToSessionStorage(next);
      return next;
    });
  }, []);

  const clearDrillDownRun = React.useCallback((drillDownId) => {
    const id = String(drillDownId || "").trim();
    if (!id) {
      return;
    }

    setJqlRuns((prev) => {
      const next = prev.filter((run) => run.drillDownId !== id);
      if (next.length === prev.length) {
        return prev;
      }
      persistJqlRunsToStorage(next);
      persistDrillDownRunsToSessionStorage(drillDownJqlRuns(next));
      return next;
    });
  }, []);

  return {
    jqlCount,
    jqlInputs,
    jqlLabels,
    jqlLoading,
    jqlRuns,
    showRestoredJqlBanner,
    jqlError,
    jqlMaxResults,
    pullLatestComment,
    jiraNotes,
    jiraRowPriorities,
    prioritySourceByKey,
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
    filtersLoading: fieldMappingsLoading,
    setJqlCount,
    setJqlMaxResults,
    setPullLatestComment,
    handleJqlChange,
    handleJqlLabelChange,
    handleResetSavedQueries,
    handleRunJql,
    handleLoadRemainingJql,
    handleDrillDownToKey,
    handleDrillDownToAssignee,
    clearDrillDownRuns,
    clearDrillDownRun,
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
