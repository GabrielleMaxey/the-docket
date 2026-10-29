import { validateMetadataPatch } from "../../../shared/issueMetadataFields.mjs";
import { getSiteContext, siteStorageKey, readSiteStorage } from "../../utils/siteContextStore.js";
import React from "react";
import {
  DEFAULT_JQL_COUNT,
  DEFAULT_JQL_LABELS,
  DEFAULT_JQL_SHARED_PROGRAM_IDS,
  DEFAULT_JQLS,
  WORK_WEEK_STORAGE_KEYS,
  isConfiguredJqlRun,
  normalizeJqlCount,
  normalizeJqlSlotValues,
} from "../../utils/workWeekStorage.js";
import {
  fetchFieldMappings,
  fetchJiraSearch,
  fetchTeamPriorityHealth, getTeamPriorityHealthSnapshot, subscribeTeamPriorityHealth, assertTeamPriorityEnabled,
  pushJiraIssueNote,
  saveIssueMetadata,
  saveTeamPriority,
  saveTeamDate,
  deleteTeamDate,
  saveKeptNoteImages,
  deleteKeptNoteImages,
  fetchKeptNoteImageBlob,
  updateJiraIssueAssignee,
  updateJiraIssueStatus,
  updateJiraIssueDateField,
  updatePinnedGantt,
  JIRA_UNASSIGNED_ASSIGNEE,
  isJiraUnassignValue,
} from "../../services/jiraClient";
import { fetchOptionalTeamHealth, hydrateCombinedRun, runJqlWorkflow, loadRemainingJqlIssues, loadDrillDownIssueByKey, loadDrillDownIssuesByAssignee, loadDrillDownByJql } from "./jiraJqlRunWorkflow.js";
import {
  dismissDrillDownId,
  drillDownJqlRuns,
  isDrillDownDismissed,
  loadDrillDownRunsFromSessionStorage,
  mergeJqlRuns,
  partitionJqlRuns,
  persistDrillDownRunsToSessionStorage,
  persistJqlRunsToStorage,
  savableJqlRuns,
} from "../../utils/jqlRunPersistence.js";
import { enrichRunWithParentDoneDates, runsNeedParentMrddEnrich } from "../../utils/jiraIssueDoneDates.js";
import { isClosedLikeStatus } from "../../../shared/dashboardMetrics.mjs";
import { errorMessage } from "../../utils/workflow.js";
import { formatDate as formatLocalDate } from "../../utils/format.js";
import { useFlash } from "./useFlash.js";
import {
  BACKGROUND_JOB_IDS,
  runBackgroundJob,
  useAttachBackgroundJob,
  useBackgroundJobRunning,
} from "../../hooks/useBackgroundJobs.js";
import { partitionNoteImageFiles } from "../../../shared/noteImageLimits.mjs";
import {
  MAX_ISSUE_PRIORITY,
  clampIssuePriority as clampPriority,
} from "../../../shared/issuePriority.mjs";
import { buildNotePushFingerprint } from "../../utils/notePushFingerprint.js";

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

const DEFAULT_STORED_PREFERENCES = {
  jqlCount: DEFAULT_JQL_COUNT,
  jqlInputs: DEFAULT_JQLS,
  jqlLabels: DEFAULT_JQL_LABELS,
  jqlSharedProgramIds: DEFAULT_JQL_SHARED_PROGRAM_IDS,
  pullLatestComment: false,
};

const getDefaultStoredPreferences = () => ({
  ...DEFAULT_STORED_PREFERENCES,
  jqlInputs: [...DEFAULT_STORED_PREFERENCES.jqlInputs],
  jqlLabels: [...DEFAULT_STORED_PREFERENCES.jqlLabels],
  jqlSharedProgramIds: [...DEFAULT_STORED_PREFERENCES.jqlSharedProgramIds],
});

const normalizeStoredPreferences = (parsed) => ({
  jqlCount: normalizeJqlCount(parsed?.jqlCount),
  jqlInputs: normalizeJqlSlotValues(parsed?.jqlInputs, DEFAULT_JQLS),
  jqlLabels: normalizeJqlSlotValues(parsed?.jqlLabels, DEFAULT_JQL_LABELS),
  jqlSharedProgramIds: normalizeJqlSlotValues(
    parsed?.jqlSharedProgramIds,
    DEFAULT_JQL_SHARED_PROGRAM_IDS
  ),
  pullLatestComment: parsed?.pullLatestComment === true,
});

const loadStoredPreferences = () => {
  if (typeof window === "undefined") {
    return getDefaultStoredPreferences();
  }

  try {
    const raw = readSiteStorage(window.localStorage, WORK_WEEK_STORAGE_KEYS.jiraPreferences);
    if (!raw) {
      return getDefaultStoredPreferences();
    }

    return normalizeStoredPreferences(JSON.parse(raw));
  } catch {
    return getDefaultStoredPreferences();
  }
};

const readJsonObject = (storageKey) => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = readSiteStorage(window.localStorage, storageKey);
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
    const raw = readSiteStorage(window.localStorage, WORK_WEEK_STORAGE_KEYS.jqlRuns);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const runs = parsed.filter(
      (run) => isValidJqlRun(run) && !run?.isDrillDown && isConfiguredJqlRun(run)
    );
    return runs.length === 0 ? [] : [...runs].sort((a, b) => a.index - b.index);
  } catch {
    return [];
  }
};

const loadInitialJqlRuns = () =>
  mergeJqlRuns(loadDrillDownRunsFromSessionStorage(), loadStoredJqlRuns());

const priorityTierClass = (prefix, value) => {
  const clamped = clampPriority(value);
  if (clamped < 1 || clamped > MAX_ISSUE_PRIORITY) {
    return `${prefix}-neutral`;
  }

  return `${prefix}-${clamped}`;
};

const getPriorityClass = (value) => priorityTierClass("ww-priority", value);

const getPriorityRowClass = (value) => priorityTierClass("ww-row-priority", value);

const formatDate = (value) => formatLocalDate(value, undefined, "-");

const patchIndexedArray = (previous, index, nextValue) => {
  const next = [...previous];
  next[index] = nextValue;
  return next;
};

const patchIssueKeyed = (previous, issueKey, nextValue) => ({
  ...previous,
  [issueKey]: nextValue,
});

const removeIssueKeyed = (previous, issueKey) => {
  const next = { ...previous };
  delete next[issueKey];
  return next;
};

const countUnsavedAssigneeEdits = (assigneeDrafts, assigneeAccountIds) => {
  const keys = new Set([
    ...Object.keys(assigneeDrafts || {}),
    ...Object.keys(assigneeAccountIds || {}),
  ]);
  return keys.size;
};

const formatJqlRefreshNotice = ({ unsavedAssigneeCount, pullLatestComment }) => {
  const parts = [];

  if (unsavedAssigneeCount > 0) {
    parts.push(
      unsavedAssigneeCount === 1
        ? "Cleared 1 unsaved assignee edit"
        : `Cleared ${unsavedAssigneeCount} unsaved assignee edits`
    );
  }

  if (pullLatestComment) {
    parts.push("row notes will be overwritten from Jira where a comment exists");
  } else if (unsavedAssigneeCount > 0) {
    parts.push("local notes are unchanged (unpushed notes are kept)");
  }

  if (parts.length === 0) {
    return "";
  }

  return `${parts.join("; ")} while refreshing from Jira.`;
};

const NOTE_AUTOSAVE_DELAY_MS = 350;

export const useTaskManagerJira = ({ siteContext: explicitSiteContext, combinedRun, onConfirmedIssue, onConfirmedTeam } = {}) => {
  const siteContext = React.useRef(explicitSiteContext || getSiteContext()).current;
  const combined = Boolean(combinedRun);
  const instanceId = siteContext?.instanceId;
  const stored = combined ? getDefaultStoredPreferences() : loadStoredPreferences();
  const storedNotes = combined ? {} : readJsonObject(WORK_WEEK_STORAGE_KEYS.jiraNotes);
  const storedRowPriorities = combined ? {} : readJsonObject(WORK_WEEK_STORAGE_KEYS.jiraRowPriorities);
  const storedPlanningMeta = combined ? {} : readJsonObject(WORK_WEEK_STORAGE_KEYS.planningMetaByKey);

  const [jqlCount, setJqlCount] = React.useState(stored.jqlCount);
  const [jqlInputs, setJqlInputs] = React.useState(stored.jqlInputs);
  const [jqlLabels, setJqlLabels] = React.useState(stored.jqlLabels);
  const [jqlSharedProgramIds, setJqlSharedProgramIds] = React.useState(
    stored.jqlSharedProgramIds || DEFAULT_JQL_SHARED_PROGRAM_IDS
  );
  const [jqlLoadingLocal, setJqlLoadingLocal] = React.useState(false);
  const [jqlPending, setJqlPending] = React.useState(false);
  const bgJqlRunning = useBackgroundJobRunning(BACKGROUND_JOB_IDS.WORK_WEEK_JQL);
  const jqlLoading = jqlLoadingLocal || jqlPending || bgJqlRunning;
  const [jqlRuns, setJqlRuns] = React.useState(() => combined ? [combinedRun] : loadInitialJqlRuns());
  const [showRestoredJqlBanner, setShowRestoredJqlBanner] = React.useState(
    () => !combined && loadStoredJqlRuns().length > 0
  );
  // Older shared-row browser fields have no Local/Team provenance. Preserve their
  // original cache for recovery; display Local database values instead of guessing.
  const ambiguousCache = React.useRef({
    keys: new Set(jqlRuns.filter(run => run.sharedProgramId || stored.jqlSharedProgramIds?.[run.index]).flatMap(run => (run.issues || []).map(issue => issue.key))),
    priorities: storedRowPriorities, planning: storedPlanningMeta,
  }).current;
  const [jqlError, setJqlError] = React.useState("");
  const [jqlMaxResults, setJqlMaxResults] = React.useState(200);
  const [pullLatestComment, setPullLatestComment] = React.useState(stored.pullLatestComment);
  const [jiraNotes, setJiraNotes] = React.useState(storedNotes);
  const [jiraRowPriorities, setJiraRowPriorities] = React.useState(() => Object.fromEntries(Object.entries(storedRowPriorities).filter(([key]) => !ambiguousCache.keys.has(key))));
  const [prioritySourceByKey, setPrioritySourceByKey] = React.useState({});
  const [selectedForPush, setSelectedForPush] = React.useState({});
  const [lastPushedJiraNoteByKey, setLastPushedJiraNoteByKey] = React.useState({});
  const [pushState, setPushState] = React.useState({});
  const [saveState, setSaveState] = React.useState({});
  const [statusDrafts, setStatusDrafts] = React.useState({});
  const [iddDrafts, setIddDrafts] = React.useState({});
  const [dueDateDrafts, setDueDateDrafts] = React.useState({});
  const [mrdDrafts, setMrdDrafts] = React.useState({});
  const [startDateByKey, setStartDateByKey] = React.useState({});
  const [completeDateByKey, setCompleteDateByKey] = React.useState({});
  const [planningMetaByKey, setPlanningMetaByKey] = React.useState(() => Object.fromEntries(Object.entries(storedPlanningMeta).filter(([key]) => !ambiguousCache.keys.has(key))));
  const [showPlanningPanel, setShowPlanningPanel] = React.useState(() => {
    try { return localStorage.getItem("ww_show_planning") === "true"; } catch { return false; }
  });
  const [expandedPlanningKey, setExpandedPlanningKey] = React.useState(null);
  const [collapsedRowKeys, setCollapsedRowKeys] = React.useState(() => new Set());
  const [assigneeDrafts, setAssigneeDrafts] = React.useState({});
  const [assigneeAccountIds, setAssigneeAccountIds] = React.useState({});
  const [rowUpdateState, setRowUpdateState] = React.useState({});
  const [noteImagesByKey, setNoteImagesByKey] = React.useState({});
  const [noteImageErrorsByKey, setNoteImageErrorsByKey] = React.useState({});
  const [keepNoteImagesByKey, setKeepNoteImagesByKey] = React.useState({});
  const [noteImageKeepPendingByKey, setNoteImageKeepPendingByKey] = React.useState({});
  const [assigneeRefreshNotice, flashJqlRefreshNotice] = useFlash(5000);
  const [fieldMappingRows, setFieldMappingRows] = React.useState(combinedRun?.fieldMappings || []);
  const [teamHealth, setTeamHealth] = React.useState(getTeamPriorityHealthSnapshot);
  React.useEffect(() => subscribeTeamPriorityHealth(() => setTeamHealth(getTeamPriorityHealthSnapshot())), []);
  const teamEnabled = teamHealth?.enabled === true;
  const teamConnected = teamEnabled && teamHealth?.connected === true;
  const [teamRowPriorities, setTeamRowPriorities] = React.useState({});
  const [hydrationReady, setHydrationReady] = React.useState(!combined && ambiguousCache.keys.size === 0);
  const [teamPlanningMetaByKey, setTeamPlanningMetaByKey] = React.useState({});
  const [teamStartDateByKey, setTeamStartDateByKey] = React.useState({});
  const [teamCompleteDateByKey, setTeamCompleteDateByKey] = React.useState({});
  const pendingTeamFields = React.useRef({});
  const reconcileTeam = React.useCallback((issueKey, patch) => {
    for (const [field, value] of Object.entries(patch)) {
      if (pendingTeamFields.current[issueKey]?.[field]) continue;
      if (field === "priority") {
        setTeamRowPriorities((prev) => patchIssueKeyed(prev, issueKey, value));
        setPrioritySourceByKey((prev) => patchIssueKeyed(prev, issueKey, { source: "team-db", author: "Team" }));
      } else if (field === "startDate" || field === "completeDate") {
        (field === "startDate" ? setTeamStartDateByKey : setTeamCompleteDateByKey)((prev) => patchIssueKeyed(prev, issueKey, value));
      } else {
        setTeamPlanningMetaByKey((prev) => ({ ...prev,
          [issueKey]: { ...prev[issueKey], [field === "followUp" ? "teamFollowUp" : field]: value } }));
      }
    }
  }, []);
  const persistTeamChange = React.useCallback(async (issueKey, patch, save) => {
    try { assertTeamPriorityEnabled(); }
    catch (error) { setJqlError(error.message); throw error; }
    if (!combined) return save();
    // Keep pending and failed fields private until their own save is confirmed.
    const token = {};
    const pending = pendingTeamFields.current[issueKey] ||= {};
    for (const field of Object.keys(patch)) pending[field] = token;
    const result = await save();
    for (const field of Object.keys(patch)) if (pending[field] === token) delete pending[field];
    onConfirmedTeam?.(siteContext, issueKey, patch);
    reconcileTeam(issueKey, patch);
    return result;
  }, [combined, onConfirmedTeam, reconcileTeam, siteContext]);
  const [fieldMappingsLoading, setFieldMappingsLoading] = React.useState(true);
  const enrichSeqRef = React.useRef(0);
  const noteImagesRef = React.useRef({});
  const hydratedNoteImageKeysRef = React.useRef(new Set());
  const pendingNoteImageKeepSyncKeysRef = React.useRef(new Set());
  const latestNoteDraftsRef = React.useRef(storedNotes);
  const pendingNoteSavesRef = React.useRef(new Map());

  React.useEffect(() => {
    noteImagesRef.current = noteImagesByKey;
  }, [noteImagesByKey]);

  React.useEffect(() => {
    latestNoteDraftsRef.current = jiraNotes;
  }, [jiraNotes]);

  React.useEffect(() => {
    const issueKeys = [...pendingNoteImageKeepSyncKeysRef.current];
    pendingNoteImageKeepSyncKeysRef.current.clear();

    issueKeys.forEach((issueKey) => {
      if (!keepNoteImagesByKey[issueKey]) {
        return;
      }

      saveKeptNoteImages({ issueKey, images: noteImagesByKey[issueKey] || [] }, { siteContext }).catch((error) => {
        setNoteImageErrorsByKey((prev) =>
          patchIssueKeyed(prev, issueKey, errorMessage(error, "Failed to keep note images."))
        );
      });
    });
  }, [keepNoteImagesByKey, noteImagesByKey]);

  React.useEffect(
    () => () => {
      Object.values(noteImagesRef.current)
        .flat()
        .forEach((image) => URL.revokeObjectURL(image.previewUrl));
    },
    []
  );

  useAttachBackgroundJob(BACKGROUND_JOB_IDS.WORK_WEEK_JQL, {
    onFinally: () => setJqlPending(false),
  });

  React.useEffect(() => {
    if (combined) { setFieldMappingsLoading(false); return; }
    setFieldMappingsLoading(true);
    fetchFieldMappings({ siteContext })
      .then((rows) => setFieldMappingRows(Array.isArray(rows) ? rows : []))
      .catch((error) => {
        console.warn("Failed to load Jira field mappings", error);
      })
      .finally(() => setFieldMappingsLoading(false));
  }, []);

  React.useEffect(() => {
    if (combined) return;
    const { regular } = partitionJqlRuns(jqlRuns);
    if (fieldMappingsLoading || regular.length === 0 || !runsNeedParentMrddEnrich(regular)) {
      return;
    }

    const seq = ++enrichSeqRef.current;
    Promise.all(regular.map((run) => enrichRunWithParentDoneDates(run, fieldMappingRows, { siteContext }))).then(
      (enrichedRegular) => {
        if (seq !== enrichSeqRef.current) {
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
  }, [fieldMappingRows, fieldMappingsLoading, jqlRuns]);

  React.useEffect(() => {
    if (combined || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.jiraPreferences, instanceId),
      JSON.stringify({
        jqlCount,
        jqlInputs,
        jqlLabels,
        jqlSharedProgramIds,
        pullLatestComment,
      })
    );
    window.localStorage.setItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.jiraNotes, instanceId), JSON.stringify(jiraNotes));
    window.localStorage.setItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.jiraRowPriorities, instanceId),
      JSON.stringify({ ...jiraRowPriorities, ...Object.fromEntries(Object.entries(ambiguousCache.priorities).filter(([key]) => ambiguousCache.keys.has(key))) })
    );
    window.localStorage.setItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.planningMetaByKey, instanceId),
      JSON.stringify({ ...planningMetaByKey, ...Object.fromEntries(Object.entries(ambiguousCache.planning).filter(([key]) => ambiguousCache.keys.has(key))) })
    );
  }, [
    jqlCount,
    jqlInputs,
    jqlLabels,
    jqlSharedProgramIds,
    pullLatestComment,
    jiraNotes,
    jiraRowPriorities,
    planningMetaByKey,
  ]);

  React.useEffect(() => {
    if (combined) return;
    setJqlRuns((prev) => {
      const { drillDown, regular } = partitionJqlRuns(prev);
      const nextRegular = regular.filter(isConfiguredJqlRun);
      if (nextRegular.length === regular.length) {
        return prev;
      }
      return mergeJqlRuns(drillDown, nextRegular);
    });
  }, [jqlInputs, jqlLabels]);

  React.useEffect(() => {
    if (combined || typeof window === "undefined") {
      return;
    }

    const savable = savableJqlRuns(jqlRuns).filter(isConfiguredJqlRun);
    if (savable.length === 0) {
      window.localStorage.removeItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.jqlRuns, instanceId));
    } else {
      try {
        window.localStorage.setItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.jqlRuns, instanceId), JSON.stringify(savable));
      } catch (error) {
        console.warn("Could not persist JQL results to localStorage (size or quota).", error);
      }
    }

    persistDrillDownRunsToSessionStorage(jqlRuns, instanceId);
  }, [jqlRuns]);

  const handleJqlChange = (index, value) => {
    setJqlInputs((prev) => patchIndexedArray(prev, index, value));
  };

  const handleJqlLabelChange = (index, value) => {
    setJqlLabels((prev) => patchIndexedArray(prev, index, value));
  };

  const handleJqlSharedProgramChange = (index, value) => {
    setJqlSharedProgramIds((prev) => patchIndexedArray(prev, index, String(value || "")));
  };

  const handleResetSavedQueries = () => {
    setJqlCount(DEFAULT_JQL_COUNT);
    setJqlInputs(DEFAULT_JQLS);
    setJqlLabels(DEFAULT_JQL_LABELS);
    setJqlSharedProgramIds(DEFAULT_JQL_SHARED_PROGRAM_IDS);
    setJqlRuns([]);
    setShowRestoredJqlBanner(false);
    setJqlError("");
    setLastPushedJiraNoteByKey({});

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.jiraPreferences, instanceId));
      window.localStorage.removeItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.jqlRuns, instanceId));
      // Do not remove header reminders (stored in the local db, see WorkWeekTasks.jsx) or
      // notes/priorities — reset is JQL prefs + cached runs only.
    }
  };

  const handleSelectForPush = (issueKey, checked) => {
    setSelectedForPush((prev) => ({ ...prev, [issueKey]: checked }));
  };

  const handleSelectAll = (issues, checked) => {
    const openIssues = issues.filter(
      (issue) => combined ? issue.fields?.status?.statusCategory?.key !== "done" : !isClosedLikeStatus(issue.fields?.status?.name || "")
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
    const images = noteImagesByKey[issueKey] || [];

    if (!note && images.length === 0) {
      setPushState((prev) => ({
        ...prev,
        [issueKey]: { loading: false, error: "Enter a note or add an image before pushing.", success: "" },
      }));
      return;
    }

    const fingerprint = buildNotePushFingerprint({ note, images });
    const lastPushedFingerprint = lastPushedJiraNoteByKey[issueKey];
    if (lastPushedFingerprint && fingerprint === lastPushedFingerprint) {
      setPushState((prev) => ({
        ...prev,
        [issueKey]: {
          loading: false,
          error: "",
          success: "Already pushed — edit the note or images to push again.",
        },
      }));
      return;
    }

    setPushState((prev) => ({
      ...prev,
      [issueKey]: { loading: true, error: "", success: "" },
    }));

    try {
      await pushJiraIssueNote({ issueKey, note, images }, { siteContext });
      setJiraNotes((prev) => patchIssueKeyed(prev, issueKey, note));
      if (images.length > 0) {
        clearNoteImagesForIssue(issueKey);
        setKeepNoteImagesByKey((prev) => removeIssueKeyed(prev, issueKey));
      }
      setLastPushedJiraNoteByKey((prev) =>
        patchIssueKeyed(prev, issueKey, buildNotePushFingerprint({ note, images: [] }))
      );
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
        selectedForPush[issue.key] && (combined ? issue.fields?.status?.statusCategory?.key !== "done" : !isClosedLikeStatus(issue.fields?.status?.name || ""))
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
      await runBackgroundJob(`note-autosave:${issueKey}`, {
        instanceId, siteSave: true, queue: true, label: "Saving note",
        run: () => saveIssueMetadata({ issueKey, note, priority }, { siteContext }),
      });
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

  const scheduleNoteAutosave = React.useCallback((issueKey) => {
    if (pendingNoteSavesRef.current.has(issueKey)) return;
    setSaveState((prev) => ({ ...prev, [issueKey]: { ...prev[issueKey], loading: true, success: "" } }));
    const delay = new Promise((resolve) => window.setTimeout(resolve, NOTE_AUTOSAVE_DELAY_MS));
    const pending = runBackgroundJob(`note-autosave:${issueKey}`, {
      instanceId, siteSave: true, queue: true, label: "Saving note",
      run: async () => {
        await delay;
        let savedNote;
        do {
          savedNote = String(latestNoteDraftsRef.current[issueKey] || "");
          await saveIssueMetadata({ issueKey, note: savedNote }, { siteContext });
        } while (String(latestNoteDraftsRef.current[issueKey] || "") !== savedNote);
      },
    });
    pendingNoteSavesRef.current.set(issueKey, pending);
    pending.then(() => {
      setSaveState((prev) => ({ ...prev, [issueKey]: { loading: false, error: "", success: "Saved locally" } }));
    }, (error) => {
      setSaveState((prev) => ({ ...prev, [issueKey]: { loading: false, error: errorMessage(error, "Failed to save note"), success: "" } }));
    }).finally(() => { pendingNoteSavesRef.current.delete(issueKey); });
  }, [instanceId, siteContext]);

  const handleNoteChange = (issueKey, note) => {
    latestNoteDraftsRef.current = patchIssueKeyed(latestNoteDraftsRef.current, issueKey, note);
    setJiraNotes((prev) => patchIssueKeyed(prev, issueKey, note));
    scheduleNoteAutosave(issueKey);
  };

  const handleNoteImagesAdd = (issueKey, files) => {
    const nextFiles = Array.from(files || []);
    let validationError = "";

    setNoteImagesByKey((prev) => {
      const existing = prev[issueKey] || [];
      const { accepted, error } = partitionNoteImageFiles(existing.length, nextFiles);
      validationError = error;

      if (accepted.length === 0) {
        return prev;
      }

      const added = accepted.map((file) => ({
        localId: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        mimeType: file.type,
        filename: file.name,
        byteSize: file.size,
      }));

      if (keepNoteImagesByKey[issueKey]) {
        pendingNoteImageKeepSyncKeysRef.current.add(issueKey);
      }

      return patchIssueKeyed(prev, issueKey, [...existing, ...added]);
    });

    setNoteImageErrorsByKey((prev) =>
      validationError
        ? patchIssueKeyed(prev, issueKey, validationError)
        : removeIssueKeyed(prev, issueKey)
    );
  };

  const handleNoteImageRemove = (issueKey, localId) => {
    const image = (noteImagesRef.current[issueKey] || []).find(
      (item) => item.localId === localId
    );
    if (image) {
      URL.revokeObjectURL(image.previewUrl);
    }

    setNoteImagesByKey((prev) => {
      const existing = prev[issueKey] || [];
      const next = existing.filter((item) => item.localId !== localId);
      if (next.length === existing.length) {
        return prev;
      }

      if (keepNoteImagesByKey[issueKey]) {
        pendingNoteImageKeepSyncKeysRef.current.add(issueKey);
      }

      return next.length === 0
        ? removeIssueKeyed(prev, issueKey)
        : patchIssueKeyed(prev, issueKey, next);
    });
    setNoteImageErrorsByKey((prev) => removeIssueKeyed(prev, issueKey));
  };

  const clearNoteImagesForIssue = (issueKey) => {
    (noteImagesRef.current[issueKey] || []).forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setNoteImagesByKey((prev) => removeIssueKeyed(prev, issueKey));
    setNoteImageErrorsByKey((prev) => removeIssueKeyed(prev, issueKey));
  };

  // Hydrate kept images once per issueKey; later metadata refreshes must not clobber local edits.
  const hydrateKeptNoteImages = React.useCallback((issueKey, { keepNoteImages, images } = {}) => {
    setKeepNoteImagesByKey((prev) => patchIssueKeyed(prev, issueKey, Boolean(keepNoteImages)));

    if (
      !keepNoteImages ||
      !Array.isArray(images) ||
      images.length === 0 ||
      hydratedNoteImageKeysRef.current.has(issueKey) ||
      (noteImagesRef.current[issueKey] || []).length > 0
    ) {
      return;
    }

    hydratedNoteImageKeysRef.current.add(issueKey);

    Promise.all(
      images.map(async (image) => {
        const blob = await fetchKeptNoteImageBlob(issueKey, image.id, { siteContext });
        const file = new File([blob], image.filename, { type: image.mimeType });
        return {
          localId: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          mimeType: image.mimeType,
          filename: image.filename,
          byteSize: image.byteSize,
        };
      })
    )
      .then((hydrated) => {
        setNoteImagesByKey((prev) =>
          (prev[issueKey] || []).length > 0 ? prev : patchIssueKeyed(prev, issueKey, hydrated)
        );
      })
      .catch((error) => {
        console.error("Failed to load kept note images", issueKey, error);
      });
  }, []);

  React.useEffect(() => {
    if (!combined) return;
    let cancelled = false;
    const issueKeys = (combinedRun.issues || []).map((issue) => issue.key);
    const teamHealth = fetchTeamPriorityHealth({ siteContext });
    Promise.allSettled([
      hydrateCombinedRun({ siteContext, teamHealth, issueKeys, clampPriority, setJiraNotes, setJiraRowPriorities, setTeamRowPriorities,
        setPrioritySourceByKey, setStartDateByKey, setCompleteDateByKey, setPlanningMetaByKey,
        hydrateNoteImages: hydrateKeptNoteImages, setTeamPlanningMetaByKey, setTeamStartDateByKey, setTeamCompleteDateByKey }),
      enrichRunWithParentDoneDates(combinedRun, combinedRun.fieldMappings, { siteContext, propagateErrors: true }).then((enriched) => {
        if (!cancelled) setJqlRuns((runs) => runs.map((run) => ({ ...enriched, issues: run.issues })));
      }),
      teamHealth,
    ]).then((outcomes) => {
      if (cancelled) return;
      const failures = outcomes.filter((outcome) => outcome.status === "rejected");
      const ready = failures.length === 0;
      setHydrationReady(ready);
      if (!ready) setJqlError(`Source metadata or inherited dates could not load. Editing is unavailable; refresh to retry. ${failures.map((outcome) => errorMessage(outcome.reason, "Read failed.")).join(" ")}`);
    });
    return () => { cancelled = true; };
  }, [combinedRun, siteContext]);

  React.useEffect(() => {
    if (combined) return;
    let cancelled = false;
    const teamHealth = fetchOptionalTeamHealth(siteContext);
    hydrateCombinedRun({ siteContext, teamHealth, issueKeys: [...ambiguousCache.keys], clampPriority,
      setJiraNotes, setJiraRowPriorities, setPrioritySourceByKey, setStartDateByKey, setCompleteDateByKey, setPlanningMetaByKey,
      setTeamRowPriorities, setTeamPlanningMetaByKey, setTeamStartDateByKey, setTeamCompleteDateByKey,
    }).then(() => { if (!cancelled) setHydrationReady(true); })
      .catch(error => { if (!cancelled) setJqlError(`Source metadata could not load. ${error.message}`); });
    return () => { cancelled = true; };
  }, [combined, siteContext]);

  const handleKeepNoteImagesToggle = async (issueKey, checked) => {
    if (checked && (noteImagesRef.current[issueKey] || []).length === 0) {
      setNoteImageErrorsByKey((prev) =>
        patchIssueKeyed(prev, issueKey, "Add an image before turning on Keep on this machine.")
      );
      return;
    }

    setNoteImageKeepPendingByKey((prev) => patchIssueKeyed(prev, issueKey, true));

    try {
      if (checked) {
        await saveKeptNoteImages({ issueKey, images: noteImagesRef.current[issueKey] || [] }, { siteContext });
      } else {
        await deleteKeptNoteImages(issueKey, { siteContext });
      }
      setKeepNoteImagesByKey((prev) => patchIssueKeyed(prev, issueKey, checked));
      setNoteImageErrorsByKey((prev) => removeIssueKeyed(prev, issueKey));
    } catch (error) {
      setNoteImageErrorsByKey((prev) =>
        patchIssueKeyed(prev, issueKey, errorMessage(error, "Failed to update Keep on this machine."))
      );
    } finally {
      setNoteImageKeepPendingByKey((prev) => removeIssueKeyed(prev, issueKey));
    }
  };

  const handleRowPriorityChange = (issueKey, value, options = {}) => {
    if (!hydrationReady) return;
    const priority = clampPriority(value);
    const sharedProgramId = String(options.sharedProgramId || "").trim();
    const alreadyTeam =
      (teamEnabled && prioritySourceByKey?.[issueKey]?.source === "team-db") ||
      Boolean(options.forceTeam);

    (sharedProgramId || alreadyTeam ? setTeamRowPriorities : setJiraRowPriorities)((prev) => patchIssueKeyed(prev, issueKey, priority));
    if (sharedProgramId || alreadyTeam) {
      setPrioritySourceByKey((prev) =>
        patchIssueKeyed(prev, issueKey, {
          source: "team-db",
          author: "Team",
        })
      );
      persistTeamChange(issueKey, { priority }, () => saveTeamPriority({ issueKey, priority }, { siteContext })).catch((error) => {
        console.error("Failed to persist team priority", issueKey, error);
        setJqlError(
          `Failed to save team priority for ${issueKey}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      });
      return;
    }

    setPrioritySourceByKey((prev) => removeIssueKeyed(prev, issueKey));
    saveIssueMetadata({ issueKey, priority }, { siteContext }).catch((error) => {
      console.error("Failed to persist priority", issueKey, error);
    });
  };

  const handleStatusDraftChange = (issueKey, value) => {
    setStatusDrafts((prev) => patchIssueKeyed(prev, issueKey, value));
  };

  const handleAssigneeDraftChange = (issueKey, value, accountId) => {
    setAssigneeDrafts((prev) => patchIssueKeyed(prev, issueKey, value));
    setAssigneeAccountIds((prev) =>
      accountId ? patchIssueKeyed(prev, issueKey, accountId) : removeIssueKeyed(prev, issueKey)
    );
  };

  const clearAssigneeDraftForIssue = (issueKey) => {
    setAssigneeDrafts((prev) => removeIssueKeyed(prev, issueKey));
    setAssigneeAccountIds((prev) => removeIssueKeyed(prev, issueKey));
  };

  const clearAllAssigneeDrafts = () => {
    setAssigneeDrafts({});
    setAssigneeAccountIds({});
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

  const reconcileIssue = React.useCallback((confirmedIssue) => {
    setJqlRuns((runs) => runs.map((run) => ({ ...run, issues: run.issues.map((issue) => {
      if (issue.key !== confirmedIssue.key) return issue;
      const originalAssignee = combinedRun?.issues.find((item) => item.key === issue.key)?.fields?.assignee?.accountId;
      return { ...issue, fields: { ...issue.fields, ...confirmedIssue.fields },
        combinedEligible: confirmedIssue.fields?.status?.statusCategory?.key !== "done" &&
          (!originalAssignee || confirmedIssue.fields?.assignee?.accountId === originalAssignee) };
    }) })));
  }, [combinedRun]);

  const confirmCombinedIssue = async (issueKey) => {
    if (!combined) return;
    try {
      const data = await fetchJiraSearch({ jql: `key = "${issueKey}"`, maxResults: 1, siteContext });
      const confirmed = data.issues?.find((issue) => issue.key === issueKey);
      if (!confirmed) throw new Error("The updated issue was not returned by Jira.");
      reconcileIssue(confirmed);
      onConfirmedIssue?.(siteContext, confirmed);
    } catch (error) {
      setJqlError(`Update saved for ${issueKey}, but eligibility could not be refreshed: ${errorMessage(error, "Refresh the loaded work to check Jira.")}`);
    }
  };

  // Shared loading/success/error lifecycle for a single-row Jira field push —
  // Status, Due date, and MRD all follow this same shape; each caller supplies
  // its own pre-validation, the API call, the local issue patch, and messages.
  const performRowFieldUpdate = async (issueKey, { apply, patchIssue, successMessage, errorFallback }) => {
    setRowUpdateMessage(issueKey, { loading: true, error: "", success: "" });

    try {
      await apply();
      if (patchIssue) {
        updateIssueInRuns(issueKey, patchIssue);
      }
      setRowUpdateMessage(issueKey, { loading: false, success: successMessage });
      await confirmCombinedIssue(issueKey);
    } catch (error) {
      setRowUpdateMessage(issueKey, {
        loading: false,
        error: errorMessage(error, errorFallback),
      });
    }
  };

  const handleStatusUpdate = async (issueKey, fallbackStatus) => {
    const targetStatus = String(statusDrafts[issueKey] || fallbackStatus || "").trim();
    if (!targetStatus) {
      setRowUpdateMessage(issueKey, { error: "Choose a status before updating." });
      return;
    }

    await performRowFieldUpdate(issueKey, {
      apply: () => updateJiraIssueStatus({ issueKey, targetStatus }, { siteContext }),
      patchIssue: (issue) => ({
        ...issue,
        fields: {
          ...issue.fields,
          status: { ...(issue.fields?.status || {}), name: targetStatus },
        },
      }),
      successMessage: `Status updated to ${targetStatus}.`,
      errorFallback: "Failed to update status",
    });
  };

  const handleIddDraftChange = (issueKey, value) => {
    setIddDrafts((prev) => patchIssueKeyed(prev, issueKey, value));
  };

  const handleIddUpdate = async (issueKey, fallbackValue, iddFieldId) => {
    const value = String(iddDrafts[issueKey] ?? fallbackValue ?? "").trim();

    await performRowFieldUpdate(issueKey, {
      apply: () => updateJiraIssueDateField({ issueKey, role: "initial_done_date", value }, { siteContext }),
      patchIssue: (issue) => ({ ...issue, fields: { ...issue.fields, [iddFieldId]: value || null } }),
      successMessage: value ? `IDD set to ${value}.` : "IDD cleared.",
      errorFallback: "Failed to update IDD",
    });
  };

  const handleDueDateDraftChange = (issueKey, value) => {
    setDueDateDrafts((prev) => patchIssueKeyed(prev, issueKey, value));
  };

  const handleMrdDraftChange = (issueKey, value) => {
    setMrdDrafts((prev) => patchIssueKeyed(prev, issueKey, value));
  };

  const handleDueDateUpdate = async (issueKey, fallbackValue) => {
    const value = String(dueDateDrafts[issueKey] ?? fallbackValue ?? "").trim();

    await performRowFieldUpdate(issueKey, {
      apply: () => updateJiraIssueDateField({ issueKey, role: "due_date", value }, { siteContext }),
      patchIssue: (issue) => ({ ...issue, fields: { ...issue.fields, duedate: value || null } }),
      successMessage: value ? `Due date set to ${value}.` : "Due date cleared.",
      errorFallback: "Failed to update Due date",
    });
  };

  const handleMrdUpdate = async (issueKey, fallbackValue, mrdFieldId) => {
    if (!mrdFieldId) {
      setRowUpdateMessage(issueKey, { error: "No MRD field mapped. Set it in Settings → Field mappings." });
      return;
    }

    const value = String(mrdDrafts[issueKey] ?? fallbackValue ?? "").trim();

    await performRowFieldUpdate(issueKey, {
      apply: () => updateJiraIssueDateField({ issueKey, role: "most_recent_done_date", value }, { siteContext }),
      patchIssue: (issue) => ({ ...issue, fields: { ...issue.fields, [mrdFieldId]: value || null } }),
      successMessage: value ? `MRD set to ${value}.` : "MRD cleared.",
      errorFallback: "Failed to update MRD",
    });
  };

  // No Jira field backs this, so it saves straight to a DB with no Update step —
  // shared-program issues go to the team store (same split as priority), everything
  // else stays in local SQLite.
  const handleStartDateChange = (issueKey, value, options = {}) => {
    const trimmed = String(value || "").trim();
    const sharedProgramId = String(options.sharedProgramId || "").trim();

    (sharedProgramId || options.forceTeam ? setTeamStartDateByKey : setStartDateByKey)((prev) => patchIssueKeyed(prev, issueKey, trimmed));

    if (sharedProgramId || options.forceTeam) {
      persistTeamChange(issueKey, { startDate: trimmed }, () => saveTeamDate({ issueKey, startDate: trimmed }, { siteContext })).catch((error) => {
        console.error("Failed to persist team start date", issueKey, error);
      });
      return;
    }

    saveIssueMetadata({ issueKey, startDate: trimmed }, { siteContext }).catch((error) => {
      console.error("Failed to persist start date", issueKey, error);
    });
  };

  // Same shape as Start date — manual, autosaves on change, no Update step.
  // The field's displayed default (falling back to MRD when empty) is computed
  // by the table, not here; this just persists whatever the input reports.
  const handleCompleteDateChange = (issueKey, value, options = {}) => {
    const trimmed = String(value || "").trim();
    const sharedProgramId = String(options.sharedProgramId || "").trim();

    (sharedProgramId || options.forceTeam ? setTeamCompleteDateByKey : setCompleteDateByKey)((prev) => patchIssueKeyed(prev, issueKey, trimmed));

    if (sharedProgramId || options.forceTeam) {
      persistTeamChange(issueKey, { completeDate: trimmed }, () => saveTeamDate({ issueKey, completeDate: trimmed }, { siteContext })).catch((error) => {
        console.error("Failed to persist team complete date", issueKey, error);
      });
      return;
    }

    saveIssueMetadata({ issueKey, completeDate: trimmed }, { siteContext }).catch((error) => {
      console.error("Failed to persist complete date", issueKey, error);
    });
  };

  // Explicit, deliberate removal of both tracked dates for an issue — never
  // triggered just by blanking a field (see putTeamDate/deleteTeamDate).
  const handleClearDateTracking = (issueKey, options = {}) => {
    const sharedProgramId = String(options.sharedProgramId || "").trim();

    (sharedProgramId || options.forceTeam ? setTeamStartDateByKey : setStartDateByKey)((prev) => removeIssueKeyed(prev, issueKey));
    (sharedProgramId || options.forceTeam ? setTeamCompleteDateByKey : setCompleteDateByKey)((prev) => removeIssueKeyed(prev, issueKey));

    if (sharedProgramId || options.forceTeam) {
      persistTeamChange(issueKey, { startDate: "", completeDate: "", plannedStart: "", plannedFinish: "", pmOverride: "" },
        () => deleteTeamDate(issueKey, { siteContext })).catch((error) => {
        console.error("Failed to clear team date tracking", issueKey, error);
      });
      return;
    }

    saveIssueMetadata({ issueKey, startDate: "", completeDate: "" }, { siteContext }).catch((error) => {
      console.error("Failed to clear date tracking", issueKey, error);
    });
  };

  const handleTogglePlanningPanel = () => {
    setShowPlanningPanel((prev) => {
      const next = !prev;
      try { localStorage.setItem("ww_show_planning", String(next)); } catch {}
      return next;
    });
  };

  const handleTogglePlanningRow = (issueKey) => {
    setExpandedPlanningKey((prev) => (prev === issueKey ? null : issueKey));
  };

  const collapsedRowKeysRef = React.useRef(collapsedRowKeys);
  React.useEffect(() => {
    collapsedRowKeysRef.current = collapsedRowKeys;
  }, [collapsedRowKeys]);

  const handleToggleRowExpand = React.useCallback((issueKey) => {
    const key = String(issueKey || "").trim();
    if (!key) return;
    const wasCollapsed = collapsedRowKeysRef.current.has(key);
    setCollapsedRowKeys((prev) => {
      const next = new Set(prev);
      if (wasCollapsed) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!wasCollapsed) {
      setExpandedPlanningKey((planKey) => (planKey === key ? null : planKey));
    }
  }, []);

  const handleExpandAllRows = React.useCallback((issueKeys) => {
    const keys = (Array.isArray(issueKeys) ? issueKeys : [])
      .map((key) => String(key || "").trim())
      .filter(Boolean);
    if (keys.length === 0) return;
    setCollapsedRowKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => next.delete(key));
      return next;
    });
  }, []);

  const handleCollapseAllRows = React.useCallback((issueKeys) => {
    const keys = (Array.isArray(issueKeys) ? issueKeys : [])
      .map((key) => String(key || "").trim())
      .filter(Boolean);
    if (keys.length === 0) return;
    setCollapsedRowKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => next.add(key));
      return next;
    });
    setExpandedPlanningKey((planKey) => (keys.includes(planKey) ? null : planKey));
  }, []);

  const handleSavePlanningAll = React.useCallback(async (issueKey, options = {}) => {
    if (options.sharedProgramId || options.forceTeam) assertTeamPriorityEnabled();
    if (!hydrationReady) return;
    const sharedProgramId = String(options.sharedProgramId || "").trim();
    const meta = (sharedProgramId || options.forceTeam ? teamPlanningMetaByKey : planningMetaByKey)[issueKey] || {};
    const patch = {
      followUp: (sharedProgramId || options.forceTeam ? meta.teamFollowUp : meta.followUp) ?? null,
      plannedStart: meta.plannedStart || "",
      plannedFinish: meta.plannedFinish || "",
      requestor: meta.requestor || "",
      hasOpenDecision: Boolean(meta.hasOpenDecision),
      openDecisionNote: meta.openDecisionNote || "",
      pmOverride: meta.pmOverride || "",
      startDate: (sharedProgramId || options.forceTeam ? teamStartDateByKey : startDateByKey)[issueKey] || "",
      completeDate: (sharedProgramId || options.forceTeam ? teamCompleteDateByKey : completeDateByKey)[issueKey] || "",
    };
    const { errors } = validateMetadataPatch(patch);
    if (errors.length) throw new Error(errors.join("; "));
    if (sharedProgramId || options.forceTeam) {
      return persistTeamChange(issueKey, patch, () => saveTeamDate({ issueKey, ...patch }, { siteContext }));
    }
    return saveIssueMetadata({ issueKey, ...patch }, { siteContext });
  }, [hydrationReady, planningMetaByKey, startDateByKey, completeDateByKey, teamPlanningMetaByKey, teamStartDateByKey, teamCompleteDateByKey, persistTeamChange]);

  const handlePlanningFieldChange = (issueKey, field, value, options = {}) => {
    const sharedProgramId = String(options.sharedProgramId || "").trim();
    const { patch, errors } = validateMetadataPatch({ [field]: value });
    if (errors.length) { console.error("Invalid planning field", errors.join("; ")); return; }
    const stateField = (sharedProgramId || options.forceTeam) && field === "followUp" ? "teamFollowUp" : field;
    (sharedProgramId || options.forceTeam ? setTeamPlanningMetaByKey : setPlanningMetaByKey)((prev) => ({
      ...prev,
      [issueKey]: { ...(prev[issueKey] || {}), [stateField]: patch[field] },
    }));
    if (sharedProgramId || options.forceTeam) {
      persistTeamChange(issueKey, patch, () => saveTeamDate({ issueKey, ...patch }, { siteContext })).catch((error) => {
        console.error(`Failed to persist team ${field}`, issueKey, error);
      });
    } else {
      saveIssueMetadata({ issueKey, ...patch }, { siteContext }).catch((error) => {
        console.error(`Failed to persist ${field}`, issueKey, error);
      });
    }
  };

  const handlePinnedGanttChange = React.useCallback((issueKey, pinned) => {
    setPlanningMetaByKey((prev) => ({
      ...prev,
      [issueKey]: { ...(prev[issueKey] || {}), pinnedGantt: pinned },
    }));
    updatePinnedGantt(issueKey, pinned, { siteContext }).catch((err) => {
      console.error("Failed to update Gantt pin for", issueKey, err);
    });
  }, []);

  const handleAssigneeUpdate = async (issueKey) => {
    const draftOrAccount =
      assigneeAccountIds[issueKey] === JIRA_UNASSIGNED_ASSIGNEE
        ? JIRA_UNASSIGNED_ASSIGNEE
        : String(assigneeAccountIds[issueKey] || assigneeDrafts[issueKey] || "").trim();

    if (!draftOrAccount) {
      setRowUpdateMessage(issueKey, { error: "Choose or type an assignee before updating." });
      return;
    }

    const unassigning = isJiraUnassignValue(draftOrAccount);

    setRowUpdateMessage(issueKey, { loading: true, error: "", success: "" });

    try {
      const result = await updateJiraIssueAssignee({
        issueKey,
        assignee: unassigning ? JIRA_UNASSIGNED_ASSIGNEE : draftOrAccount,
      }, { siteContext });

      if (unassigning) {
        updateIssueInRuns(issueKey, (issue) => ({
          ...issue,
          fields: {
            ...issue.fields,
            assignee: null,
          },
        }));
        await confirmCombinedIssue(issueKey);
        clearAssigneeDraftForIssue(issueKey);
        setRowUpdateMessage(issueKey, {
          loading: false,
          success: "Assignee set to Unassigned.",
        });
        return;
      }

      const nextAssignee =
        String(result?.resolvedAssignee || assigneeDrafts[issueKey] || draftOrAccount).trim() ||
        draftOrAccount;
      updateIssueInRuns(issueKey, (issue) => ({
        ...issue,
        fields: {
          ...issue.fields,
          assignee: result?.accountId
            ? { displayName: nextAssignee, accountId: result.accountId }
            : { displayName: nextAssignee },
        },
      }));
      await confirmCombinedIssue(issueKey);
      clearAssigneeDraftForIssue(issueKey);
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

  const handleRunJql = (overrides = {}) => {
    const nextJqlInputs = Array.isArray(overrides.jqlInputs) ? overrides.jqlInputs : jqlInputs;
    const nextJqlLabels = Array.isArray(overrides.jqlLabels) ? overrides.jqlLabels : jqlLabels;
    const nextSharedProgramIds = Array.isArray(overrides.jqlSharedProgramIds)
      ? overrides.jqlSharedProgramIds
      : jqlSharedProgramIds;

    const unsavedAssigneeCount = countUnsavedAssigneeEdits(assigneeDrafts, assigneeAccountIds);
    clearAllAssigneeDrafts();
    const notice = formatJqlRefreshNotice({ unsavedAssigneeCount, pullLatestComment });
    if (notice) {
      flashJqlRefreshNotice(notice);
    }
    setJqlPending(true);
    runBackgroundJob(BACKGROUND_JOB_IDS.WORK_WEEK_JQL, {
      label: "Running JQL",
      run: () =>
        runJqlWorkflow({
          siteContext,
          jqlInputs: nextJqlInputs,
          jqlLabels: nextJqlLabels,
          jqlSharedProgramIds: nextSharedProgramIds,
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
          setTeamRowPriorities, setTeamPlanningMetaByKey, setTeamStartDateByKey, setTeamCompleteDateByKey,
          setStartDateByKey,
          setCompleteDateByKey,
          setPlanningMetaByKey,
          hydrateNoteImages: hydrateKeptNoteImages,
          fieldMappingRows,
        }),
    }).finally(() => setJqlPending(false));
  };

  const handleLoadRemainingJql = (runIndex) => {
    const unsavedAssigneeCount = countUnsavedAssigneeEdits(assigneeDrafts, assigneeAccountIds);
    clearAllAssigneeDrafts();
    const notice = formatJqlRefreshNotice({ unsavedAssigneeCount, pullLatestComment });
    if (notice) {
      flashJqlRefreshNotice(notice);
    }
    setJqlPending(true);
    runBackgroundJob(BACKGROUND_JOB_IDS.WORK_WEEK_JQL, {
      label: "Loading JQL results",
      run: () =>
        loadRemainingJqlIssues({
          siteContext,
          runIndex,
          jqlRuns,
          jqlMaxResults,
          clampPriority,
          setJqlRuns,
          setJqlLoading: setJqlLoadingLocal,
          setJiraRowPriorities,
          setPrioritySourceByKey,
          setTeamRowPriorities, setTeamPlanningMetaByKey, setTeamStartDateByKey, setTeamCompleteDateByKey,
          setJiraNotes,
          setStartDateByKey,
          setCompleteDateByKey,
          setPlanningMetaByKey,
          pullLatestComment,
          fieldMappingRows,
        }),
    }).finally(() => setJqlPending(false));
  };

  const drillDownFetchSeqRef = React.useRef(0);

  const handleDrillDownToKey = React.useCallback(
    (issueKey) => {
      const normalized = String(issueKey || "").trim().toUpperCase();
      if (!normalized || isDrillDownDismissed(`issue:${normalized.toLowerCase()}`)) {
        return Promise.resolve(false);
      }

      const fetchSeq = ++drillDownFetchSeqRef.current;
      return loadDrillDownIssueByKey({
        siteContext,
        issueKey,
        pullLatestComment,
        clampPriority,
        setJqlRuns,
        setJqlLoading: setJqlLoadingLocal,
        setJiraRowPriorities,
        setPrioritySourceByKey,
        setJiraNotes,
        setStartDateByKey,
        setCompleteDateByKey,
        setPlanningMetaByKey,
        setJqlError,
        hydrateNoteImages: hydrateKeptNoteImages,
        fieldMappingRows,
        isStale: () => fetchSeq !== drillDownFetchSeqRef.current || siteContext?.generation !== getSiteContext()?.generation,
      });
    },
    [pullLatestComment, clampPriority, fieldMappingRows]
  );

  const handleDrillDownToAssignee = React.useCallback(
    (assigneeName, options = {}) => {
      const assignee = String(assigneeName || "").trim();
      const epicPresetId = String(options?.epicPresetId || "").trim();
      const scopeSuffix = epicPresetId ? `:${epicPresetId}` : "";
      if (!assignee || isDrillDownDismissed(`assignee:${assignee.toLowerCase()}${scopeSuffix}`)) {
        return Promise.resolve(false);
      }

      const fetchSeq = ++drillDownFetchSeqRef.current;
      return loadDrillDownIssuesByAssignee({
        siteContext,
        assigneeName,
        epicPresetId,
        jqlMaxResults,
        pullLatestComment,
        clampPriority,
        setJqlRuns,
        setJqlLoading: setJqlLoadingLocal,
        setJiraRowPriorities,
        setPrioritySourceByKey,
        setJiraNotes,
        setStartDateByKey,
        setCompleteDateByKey,
        setPlanningMetaByKey,
        setJqlError,
        hydrateNoteImages: hydrateKeptNoteImages,
        fieldMappingRows,
        isStale: () => fetchSeq !== drillDownFetchSeqRef.current || siteContext?.generation !== getSiteContext()?.generation,
      });
    },
    [jqlMaxResults, pullLatestComment, clampPriority, fieldMappingRows]
  );

  const handleDrillDownToJql = React.useCallback(
    (jql, label) => {
      const query = String(jql || "").trim();
      if (!query) {
        return Promise.resolve(false);
      }

      const fetchSeq = ++drillDownFetchSeqRef.current;
      return loadDrillDownByJql({
        siteContext,
        jql: query,
        label,
        jqlMaxResults,
        pullLatestComment,
        clampPriority,
        setJqlRuns,
        setJqlLoading: setJqlLoadingLocal,
        setJiraRowPriorities,
        setPrioritySourceByKey,
        setJiraNotes,
        setStartDateByKey,
        setCompleteDateByKey,
        setPlanningMetaByKey,
        setJqlError,
        hydrateNoteImages: hydrateKeptNoteImages,
        fieldMappingRows,
        isStale: () => fetchSeq !== drillDownFetchSeqRef.current || siteContext?.generation !== getSiteContext()?.generation,
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
      persistJqlRunsToStorage(next, instanceId);
      persistDrillDownRunsToSessionStorage(next, instanceId);
      return next;
    });
  }, []);

  const clearDrillDownRun = React.useCallback((drillDownId) => {
    const id = String(drillDownId || "").trim();
    if (!id) {
      return;
    }

    drillDownFetchSeqRef.current += 1;
    dismissDrillDownId(id);

    setJqlRuns((prev) => {
      const next = prev.filter((run) => run.drillDownId !== id);
      if (next.length === prev.length) {
        return prev;
      }
      persistJqlRunsToStorage(next, instanceId);
      persistDrillDownRunsToSessionStorage(drillDownJqlRuns(next), instanceId);
      return next;
    });
  }, []);

  return {
    reconcileIssue,
    reconcileTeam,
    teamAvailable: teamConnected && hydrationReady,
    teamEnabled,
    hydrationReady,
    teamPlanningMetaByKey,
    teamStartDateByKey,
    teamCompleteDateByKey,
    jqlCount,
    jqlInputs,
    jqlLabels,
    jqlSharedProgramIds,
    jqlLoading,
    jqlRuns,
    showRestoredJqlBanner,
    jqlError,
    assigneeRefreshNotice,
    jqlMaxResults,
    pullLatestComment,
    jiraNotes,
    jiraRowPriorities: teamEnabled ? { ...jiraRowPriorities, ...teamRowPriorities } : jiraRowPriorities,
    localRowPriorities: jiraRowPriorities,
    prioritySourceByKey: teamEnabled ? prioritySourceByKey : {},
    selectedForPush,
    lastPushedJiraNoteByKey,
    pushState,
    saveState,
    statusDrafts,
    iddDrafts,
    dueDateDrafts,
    mrdDrafts,
    startDateByKey: teamEnabled && !combined ? { ...startDateByKey, ...teamStartDateByKey } : startDateByKey,
    completeDateByKey: teamEnabled && !combined ? { ...completeDateByKey, ...teamCompleteDateByKey } : completeDateByKey,
    planningMetaByKey: teamEnabled && !combined ? Object.fromEntries([...new Set([...Object.keys(planningMetaByKey), ...Object.keys(teamPlanningMetaByKey)])].map(key => [key, { ...planningMetaByKey[key], ...teamPlanningMetaByKey[key] }])) : planningMetaByKey,
    showPlanningPanel,
    expandedPlanningKey,
    collapsedRowKeys,
    assigneeDrafts,
    rowUpdateState,
    noteImagesByKey,
    noteImageErrorsByKey,
    keepNoteImagesByKey,
    noteImageKeepPendingByKey,
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
    handleJqlSharedProgramChange,
    handleResetSavedQueries,
    handleRunJql,
    handleLoadRemainingJql,
    handleDrillDownToKey,
    handleDrillDownToAssignee,
    handleDrillDownToJql,
    clearDrillDownRuns,
    clearDrillDownRun,
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
    handleTogglePlanningPanel,
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
  };
};
