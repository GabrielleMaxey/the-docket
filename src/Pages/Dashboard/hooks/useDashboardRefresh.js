import React from "react";
import {
  fetchDashboardMetrics,
  fetchJiraHealth,
  fetchWatchedAssignees,
  refreshDashboardMetrics,
} from "../../../services/jiraClient";
import { useFlash } from "../../hooks/useFlash";
import {
  BACKGROUND_JOB_IDS,
  cancelBackgroundJob,
  getBackgroundJob,
  runBackgroundJob,
  useAttachBackgroundJob,
  useBackgroundJobRunning,
} from "../../../hooks/useBackgroundJobs.js";
import { collectEpicCompletionCounts, getTerminalIssueCount, normalizePastDueLookbackYears } from "../../../../shared/dashboardMetrics.mjs";
import {
  sameNumberSet,
  sameStringSet,
  getWorkloadStatusCounts,
  defaultDashboardDueByDate,
  buildDashboardRefreshTimeoutMessage,
  getDashboardRefreshTimeoutMs,
  resolveEffectiveRefreshScope,
  getDashboardRefreshStatusHint,
} from "../utils/dashboardMetricsUtils";

const buildRefreshPayload = ({
  selectedPresetIds,
  includePastDue,
  dueByDate,
  dueByField,
  pastDueLookbackYears,
  assigneeNames,
  selectedWatchedIds,
  refreshScope,
}) => ({
  epicPresetIds: selectedPresetIds,
  includePastDue,
  dueByDate: dueByDate || null,
  dueByField,
  pastDueLookbackYears,
  assigneeNames,
  watchedAssigneeIds: selectedWatchedIds,
  refreshScope,
});

const scopeAffectsProjects = (scope) => !scope || scope === "all" || scope === "projects";
const scopeAffectsContributors = (scope) => !scope || scope === "all" || scope === "contributors";

const isAbortError = (error) =>
  error?.name === "AbortError" || String(error?.message || "").toLowerCase() === "cancelled";

const isTimeoutError = (error) => error?.name === "TimeoutError";

const formatRefreshError = (error, refreshScope) => {
  if (isTimeoutError(error)) {
    return buildDashboardRefreshTimeoutMessage(refreshScope);
  }
  return error instanceof Error ? error.message : "Failed to refresh dashboard";
};

export const useDashboardRefresh = ({
  selectedPresetIds,
  includePastDue,
  setSelectedPresetIds,
  setIncludePastDue,
}) => {
  const [snapshot, setSnapshot] = React.useState(null);
  const [metricsLoading, setMetricsLoading] = React.useState(true);
  const [refreshError, setRefreshError] = React.useState("");
  const [jiraBaseUrl, setJiraBaseUrl] = React.useState("");
  const [watchedPeople, setWatchedPeople] = React.useState([]);
  const [assigneeNames, setAssigneeNames] = React.useState([]);
  const [selectedWatchedIds, setSelectedWatchedIds] = React.useState([]);
  const [assigneeInput, setAssigneeInput] = React.useState("");
  const [dueByDate, setDueByDate] = React.useState(() => defaultDashboardDueByDate());
  const [dueByField, setDueByField] = React.useState("most_recent_done_date");
  const [pastDueLookbackYears, setPastDueLookbackYears] = React.useState(1);
  const [refreshFlash, flashRefresh] = useFlash();
  const [refreshPending, setRefreshPending] = React.useState(false);
  const [pendingScope, setPendingScope] = React.useState(null);
  const bgRefreshRunning = useBackgroundJobRunning(BACKGROUND_JOB_IDS.DASHBOARD_REFRESH);
  const refreshLoading = refreshPending || bgRefreshRunning;

  const activeRefreshScope = React.useMemo(() => {
    if (refreshPending) {
      return pendingScope || "all";
    }
    if (bgRefreshRunning) {
      return getBackgroundJob(BACKGROUND_JOB_IDS.DASHBOARD_REFRESH)?.scope || "all";
    }
    return null;
  }, [refreshPending, pendingScope, bgRefreshRunning]);

  const projectsRefreshLoading =
    refreshLoading && scopeAffectsProjects(activeRefreshScope);
  const contributorsRefreshLoading =
    refreshLoading && scopeAffectsContributors(activeRefreshScope);

  useAttachBackgroundJob(BACKGROUND_JOB_IDS.DASHBOARD_REFRESH, {
    onSuccess: (data) => {
      setSnapshot(data);
      flashRefresh("Dashboard updated.");
    },
    onError: (error) => {
      if (isAbortError(error)) {
        return;
      }
      const scope = getBackgroundJob(BACKGROUND_JOB_IDS.DASHBOARD_REFRESH)?.scope || "all";
      setRefreshError(formatRefreshError(error, scope));
    },
    onFinally: () => {
      setRefreshPending(false);
      setPendingScope(null);
    },
  });

  const loadMetrics = React.useCallback(async () => {
    setMetricsLoading(true);
    try {
      const data = await fetchDashboardMetrics();
      setSnapshot(data);
      if (data) {
        setSelectedPresetIds(data.epicPresetIds || []);
        setIncludePastDue(Boolean(data.includePastDue));
        setDueByDate(data.dueByDate || defaultDashboardDueByDate());
        setDueByField(data.dueByField || "most_recent_done_date");
        setPastDueLookbackYears(normalizePastDueLookbackYears(data.pastDueLookbackYears));
        setAssigneeNames(data.assigneeNames || []);
        setSelectedWatchedIds(data.watchedAssigneeIds || []);
      } else {
        setIncludePastDue(true);
        setDueByDate(defaultDashboardDueByDate());
      }
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Failed to load dashboard metrics");
    } finally {
      setMetricsLoading(false);
    }
  }, [setSelectedPresetIds, setIncludePastDue]);

  React.useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  React.useEffect(() => {
    fetchJiraHealth()
      .then((health) => setJiraBaseUrl(String(health?.jiraBaseUrl || "").trim()))
      .catch(() => setJiraBaseUrl(""));

    fetchWatchedAssignees()
      .then((items) => setWatchedPeople(items))
      .catch(() => setWatchedPeople([]));
  }, []);

  const projectFiltersStale = React.useMemo(() => {
    if (!snapshot) {
      return false;
    }

    return (
      !sameNumberSet(selectedPresetIds, snapshot.epicPresetIds || []) ||
      includePastDue !== Boolean(snapshot.includePastDue) ||
      (dueByDate || null) !== (snapshot.dueByDate || null) ||
      (dueByField || "most_recent_done_date") !== (snapshot.dueByField || "most_recent_done_date") ||
      pastDueLookbackYears !== normalizePastDueLookbackYears(snapshot.pastDueLookbackYears)
    );
  }, [
    snapshot,
    selectedPresetIds,
    includePastDue,
    dueByDate,
    dueByField,
    pastDueLookbackYears,
  ]);

  const contributorFiltersStale = React.useMemo(() => {
    if (!snapshot) {
      return false;
    }

    return (
      !sameStringSet(assigneeNames, snapshot.assigneeNames || []) ||
      !sameNumberSet(selectedWatchedIds, snapshot.watchedAssigneeIds || [])
    );
  }, [snapshot, assigneeNames, selectedWatchedIds]);

  const filtersStale = projectFiltersStale || contributorFiltersStale;

  const runScopedRefresh = React.useCallback(
    ({ refreshScope, label, successMessage = "Dashboard updated." }) => {
      setRefreshError("");
      setRefreshPending(true);
      setPendingScope(refreshScope);

      const payload = buildRefreshPayload({
        selectedPresetIds,
        includePastDue,
        dueByDate,
        dueByField,
        pastDueLookbackYears,
        assigneeNames,
        selectedWatchedIds,
        refreshScope,
      });

      return runBackgroundJob(BACKGROUND_JOB_IDS.DASHBOARD_REFRESH, {
        label,
        scope: refreshScope,
        timeoutMs: getDashboardRefreshTimeoutMs(refreshScope),
        run: (signal) => refreshDashboardMetrics(payload, { signal }),
      })
        .then((data) => {
          setSnapshot(data);
          flashRefresh(successMessage);
        })
        .catch((error) => {
          if (isAbortError(error)) {
            return;
          }
          setRefreshError(formatRefreshError(error, refreshScope));
        })
        .finally(() => {
          setRefreshPending(false);
          setPendingScope(null);
        });
    },
    [
      selectedPresetIds,
      includePastDue,
      dueByDate,
      dueByField,
      pastDueLookbackYears,
      assigneeNames,
      selectedWatchedIds,
      flashRefresh,
    ]
  );

  const handleRefresh = React.useCallback(() => {
    const epicScope = selectedPresetIds.length > 0 || includePastDue;
    const contributorScope = assigneeNames.length > 0 || selectedWatchedIds.length > 0;
    const refreshScope = resolveEffectiveRefreshScope({
      hasEpicScope: epicScope,
      hasContributorScope: contributorScope,
      requestedScope: "all",
    });

    const refreshMeta = {
      all: { label: "Refreshing dashboard", successMessage: "Dashboard updated." },
      projects: {
        label: "Refreshing project metrics",
        successMessage: "Project metrics updated.",
      },
      contributors: {
        label: "Refreshing contributor metrics",
        successMessage: "Contributor metrics updated.",
      },
    }[refreshScope];

    return runScopedRefresh({ refreshScope, ...refreshMeta });
  }, [
    runScopedRefresh,
    selectedPresetIds,
    includePastDue,
    assigneeNames,
    selectedWatchedIds,
  ]);

  const handleRefreshProjects = React.useCallback(
    () =>
      runScopedRefresh({
        refreshScope: "projects",
        label: "Refreshing project metrics",
        successMessage: "Project metrics updated.",
      }),
    [runScopedRefresh]
  );

  const handleRefreshContributors = React.useCallback(
    () =>
      runScopedRefresh({
        refreshScope: "contributors",
        label: "Refreshing contributor metrics",
        successMessage: "Contributor metrics updated.",
      }),
    [runScopedRefresh]
  );

  const handleCancelRefresh = React.useCallback(() => {
    cancelBackgroundJob(BACKGROUND_JOB_IDS.DASHBOARD_REFRESH);
    setRefreshPending(false);
    setPendingScope(null);
  }, []);

  const handleAddAssignee = React.useCallback(() => {
    const name = assigneeInput.trim();
    if (!name) {
      return;
    }

    setAssigneeNames((prev) => {
      const exists = prev.some((item) => item.toLowerCase() === name.toLowerCase());
      return exists ? prev : [...prev, name];
    });
    setAssigneeInput("");
  }, [assigneeInput]);

  const handleRemoveAssignee = React.useCallback((name) => {
    setAssigneeNames((prev) => prev.filter((item) => item !== name));
  }, []);

  const handleToggleWatched = React.useCallback((id) => {
    setSelectedWatchedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const personWatches = React.useMemo(
    () => watchedPeople.filter((item) => item.watchType !== "jql"),
    [watchedPeople]
  );
  const jqlWatches = React.useMemo(
    () => watchedPeople.filter((item) => item.watchType === "jql"),
    [watchedPeople]
  );

  const displayEpics = snapshot?.epics || [];
  const pastDueEpics = displayEpics.filter((epic) => epic.isPastDue);
  const assigneeMetrics = snapshot?.assignees || [];
  const showOverall = displayEpics.length >= 1;
  const hasEpicScope = selectedPresetIds.length > 0 || includePastDue;
  const hasContributorScope = assigneeNames.length > 0 || selectedWatchedIds.length > 0;
  const effectiveRefreshScope = resolveEffectiveRefreshScope({ hasEpicScope, hasContributorScope });
  const canSubmit = (hasEpicScope || hasContributorScope) && !refreshLoading;
  const canSubmitProjects = hasEpicScope && !projectsRefreshLoading;
  const canSubmitContributors = hasContributorScope && !contributorsRefreshLoading;

  const epicNameByKey = React.useMemo(() => {
    const map = {};
    for (const epic of snapshot?.epics || []) {
      const key = String(epic.epicKey || "").trim();
      if (key) {
        map[key] = epic.epicName || epic.label || key;
      }
    }
    return map;
  }, [snapshot?.epics]);

  const overallTotals = React.useMemo(() => {
    const epics = snapshot?.epics || [];
    let totalIssues = 0;
    let resolvedIssues = 0;
    let openIssues = 0;
    let overdueOpenIssues = 0;
    let inProgressIssues = 0;
    const { epicsComplete, epicCount } = collectEpicCompletionCounts(epics);

    for (const epic of epics) {
      totalIssues += Number(epic.totalIssues || 0);
      openIssues += Number(epic.openIssues || 0);
      overdueOpenIssues += Number(epic.overdueOpenIssues || 0);
      resolvedIssues += getTerminalIssueCount(epic);
      const workload = getWorkloadStatusCounts(epic);
      inProgressIssues += workload.inProgress;
    }

    return {
      totalIssues,
      resolvedIssues,
      openIssues,
      overdueOpenIssues,
      inProgressIssues,
      completeEpics: epicsComplete,
      epicCount,
    };
  }, [snapshot?.epics]);

  return {
    snapshot,
    metricsLoading,
    refreshLoading,
    projectsRefreshLoading,
    contributorsRefreshLoading,
    refreshError,
    jiraBaseUrl,
    watchedPeople,
    assigneeNames,
    setAssigneeNames,
    selectedWatchedIds,
    setSelectedWatchedIds,
    assigneeInput,
    setAssigneeInput,
    dueByDate,
    setDueByDate,
    dueByField,
    setDueByField,
    pastDueLookbackYears,
    setPastDueLookbackYears,
    refreshFlash,
    loadMetrics,
    filtersStale,
    projectFiltersStale,
    contributorFiltersStale,
    handleRefresh,
    handleRefreshProjects,
    handleRefreshContributors,
    handleCancelRefresh,
    handleAddAssignee,
    handleRemoveAssignee,
    handleToggleWatched,
    personWatches,
    jqlWatches,
    displayEpics,
    pastDueEpics,
    assigneeMetrics,
    showOverall,
    hasEpicScope,
    hasContributorScope,
    effectiveRefreshScope,
    canSubmit,
    canSubmitProjects,
    canSubmitContributors,
    epicNameByKey,
    overallTotals,
  };
};
