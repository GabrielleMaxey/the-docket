import React from "react";
import {
  fetchDashboardMetrics,
  fetchJiraHealth,
  fetchWatchedAssignees,
  refreshDashboardMetrics,
} from "../../../services/jiraClient";
import { useFlash } from "../../hooks/useFlash";
import { getTerminalIssueCount, normalizePastDueLookbackYears } from "../../../../shared/dashboardMetrics.mjs";
import {
  sameNumberSet,
  sameStringSet,
  getWorkloadStatusCounts,
} from "../utils/dashboardMetricsUtils";

export const useDashboardRefresh = ({
  selectedPresetIds,
  includePastDue,
  setSelectedPresetIds,
  setIncludePastDue,
}) => {
  const [snapshot, setSnapshot] = React.useState(null);
  const [metricsLoading, setMetricsLoading] = React.useState(true);
  const [refreshLoading, setRefreshLoading] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState("");
  const [jiraBaseUrl, setJiraBaseUrl] = React.useState("");
  const [watchedPeople, setWatchedPeople] = React.useState([]);
  const [assigneeNames, setAssigneeNames] = React.useState([]);
  const [selectedWatchedIds, setSelectedWatchedIds] = React.useState([]);
  const [assigneeInput, setAssigneeInput] = React.useState("");
  const [dueByDate, setDueByDate] = React.useState("");
  const [dueByField, setDueByField] = React.useState("most_recent_done_date");
  const [pastDueLookbackYears, setPastDueLookbackYears] = React.useState(1);
  const [refreshFlash, flashRefresh] = useFlash();

  const loadMetrics = React.useCallback(async () => {
    setMetricsLoading(true);
    try {
      const data = await fetchDashboardMetrics();
      setSnapshot(data);
      if (data) {
        setSelectedPresetIds(data.epicPresetIds || []);
        setIncludePastDue(Boolean(data.includePastDue));
        setDueByDate(data.dueByDate || "");
        setDueByField(data.dueByField || "most_recent_done_date");
        setPastDueLookbackYears(normalizePastDueLookbackYears(data.pastDueLookbackYears));
        setAssigneeNames(data.assigneeNames || []);
        setSelectedWatchedIds(data.watchedAssigneeIds || []);
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

  const filtersStale = React.useMemo(() => {
    if (!snapshot) {
      return false;
    }

    return (
      !sameNumberSet(selectedPresetIds, snapshot.epicPresetIds || []) ||
      includePastDue !== Boolean(snapshot.includePastDue) ||
      (dueByDate || null) !== (snapshot.dueByDate || null) ||
      (dueByField || "most_recent_done_date") !== (snapshot.dueByField || "most_recent_done_date") ||
      pastDueLookbackYears !== normalizePastDueLookbackYears(snapshot.pastDueLookbackYears) ||
      !sameStringSet(assigneeNames, snapshot.assigneeNames || []) ||
      !sameNumberSet(selectedWatchedIds, snapshot.watchedAssigneeIds || [])
    );
  }, [
    snapshot,
    selectedPresetIds,
    includePastDue,
    dueByDate,
    dueByField,
    pastDueLookbackYears,
    assigneeNames,
    selectedWatchedIds,
  ]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshError("");
    setRefreshLoading(true);
    try {
      const data = await refreshDashboardMetrics({
        epicPresetIds: selectedPresetIds,
        includePastDue,
        dueByDate: dueByDate || null,
        dueByField,
        pastDueLookbackYears,
        assigneeNames,
        watchedAssigneeIds: selectedWatchedIds,
      });
      setSnapshot(data);
      flashRefresh("Dashboard updated.");
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Failed to refresh dashboard");
    } finally {
      setRefreshLoading(false);
    }
  }, [
    selectedPresetIds,
    includePastDue,
    dueByDate,
    dueByField,
    pastDueLookbackYears,
    assigneeNames,
    selectedWatchedIds,
    flashRefresh,
  ]);

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
  const canSubmit = hasEpicScope && !refreshLoading;

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
    let completeEpics = 0;
    const epicTypePresets = epics.filter((epic) => epic.epicKey && epic.epicKey !== "JQL");

    for (const epic of epics) {
      totalIssues += Number(epic.totalIssues || 0);
      openIssues += Number(epic.openIssues || 0);
      overdueOpenIssues += Number(epic.overdueOpenIssues || 0);
      resolvedIssues += getTerminalIssueCount(epic);
      const workload = getWorkloadStatusCounts(epic);
      inProgressIssues += workload.inProgress;
    }

    for (const epic of epicTypePresets) {
      if (Number(epic.epicPercent || 0) >= 100) {
        completeEpics += 1;
      }
    }

    return {
      totalIssues,
      resolvedIssues,
      openIssues,
      overdueOpenIssues,
      inProgressIssues,
      completeEpics,
      epicCount: epicTypePresets.length,
    };
  }, [snapshot?.epics]);

  return {
    snapshot,
    metricsLoading,
    refreshLoading,
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
    handleRefresh,
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
    canSubmit,
    epicNameByKey,
    overallTotals,
  };
};
