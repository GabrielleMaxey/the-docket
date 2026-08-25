import {
  fetchEpicPresetScopeJql,
  fetchIssueMetadataBulk,
  fetchJiraSearchAll,
  fetchLatestJiraCommentsBulk,
  fetchTeamPriorityBulk,
  fetchTeamDatesBulk,
} from "../../services/jiraClient";
import { enrichRunWithParentDoneDates } from "../../utils/jiraIssueDoneDates.js";
import { getConfiguredJqlSlotIndexes } from "../../utils/workWeekStorage.js";
import {
  isDrillDownDismissed,
  persistJqlRunsToStorage,
  mergeJqlRuns,
  partitionJqlRuns,
} from "../../utils/jqlRunPersistence.js";
import { escapeJqlString } from "../../../shared/directReportsJql.mjs";
import { errorMessage, mergeIssueMapsPreferExisting } from "../../utils/workflow.js";

const UNASSIGNED_DRILLDOWN_PROJECT_KEY = "";

const readCommentEntry = (entry) => {
  if (typeof entry === "string") {
    return { text: entry.trim(), author: "" };
  }
  if (entry && typeof entry === "object") {
    return {
      text: String(entry.text || "").trim(),
      author: String(entry.author || "").trim(),
    };
  }
  return { text: "", author: "" };
};

const dedupeIssueKeys = (issueKeys) => [
  ...new Set(
    (Array.isArray(issueKeys) ? issueKeys : [])
      .map((key) => String(key || "").trim())
      .filter(Boolean)
  ),
];

const applyTeamPriorityState = async ({
  issueKeys,
  clampPriority,
  setJiraRowPriorities,
  setPrioritySourceByKey,
}) => {
  const keys = dedupeIssueKeys(issueKeys);
  if (keys.length === 0) {
    return;
  }

  try {
    const teamItems = await fetchTeamPriorityBulk(keys);
    const teamPriorities = {};
    const teamSource = {};
    Object.entries(teamItems || {}).forEach(([issueKey, item]) => {
      if (!item || item.priority === undefined) {
        return;
      }
      teamPriorities[issueKey] = clampPriority(item.priority);
      teamSource[issueKey] = {
        source: "team-db",
        author: String(item.updatedBy || "Team"),
      };
    });
    if (Object.keys(teamPriorities).length > 0) {
      setJiraRowPriorities((prev) => ({ ...prev, ...teamPriorities }));
    }
    if (setPrioritySourceByKey && Object.keys(teamSource).length > 0) {
      setPrioritySourceByKey((prev) => ({ ...prev, ...teamSource }));
    }
  } catch (error) {
    console.error("Failed to fetch team priorities", error);
  }
};

const PLANNING_FIELD_KEYS = ["hasOpenDecision", "plannedStart", "plannedFinish", "pmOverride", "requestor", "openDecisionNote"];

const extractPlanningMeta = (item) => ({
  hasOpenDecision: Boolean(item?.hasOpenDecision),
  plannedStart: String(item?.plannedStart || ""),
  plannedFinish: String(item?.plannedFinish || ""),
  pmOverride: String(item?.pmOverride || ""),
  requestor: String(item?.requestor || ""),
  openDecisionNote: String(item?.openDecisionNote || ""),
});

const hasPlanningData = (item) =>
  item && PLANNING_FIELD_KEYS.some((f) => item[f] !== undefined && item[f] !== "" && item[f] !== false);

const applyTeamDateState = async ({ issueKeys, setStartDateByKey, setCompleteDateByKey, setPlanningMetaByKey }) => {
  if (!setStartDateByKey && !setCompleteDateByKey) {
    return;
  }
  const keys = dedupeIssueKeys(issueKeys);
  if (keys.length === 0) {
    return;
  }

  try {
    const teamItems = await fetchTeamDatesBulk(keys);
    const teamStartDates = {};
    const teamCompleteDates = {};
    const teamPlanningMeta = {};
    Object.entries(teamItems || {}).forEach(([issueKey, item]) => {
      if (item?.startDate) teamStartDates[issueKey] = item.startDate;
      if (item?.completeDate) teamCompleteDates[issueKey] = item.completeDate;
      if (hasPlanningData(item)) teamPlanningMeta[issueKey] = extractPlanningMeta(item);
    });
    if (setStartDateByKey && Object.keys(teamStartDates).length > 0) {
      setStartDateByKey((prev) => ({ ...prev, ...teamStartDates }));
    }
    if (setCompleteDateByKey && Object.keys(teamCompleteDates).length > 0) {
      setCompleteDateByKey((prev) => ({ ...prev, ...teamCompleteDates }));
    }
    if (setPlanningMetaByKey && Object.keys(teamPlanningMeta).length > 0) {
      setPlanningMetaByKey((prev) => ({ ...prev, ...teamPlanningMeta }));
    }
  } catch (error) {
    console.error("Failed to fetch team dates", error);
  }
};

const applyDrillDownMetadata = async ({
  issueKeys,
  pullLatestComment,
  clampPriority,
  setJiraRowPriorities,
  setJiraNotes,
  setStartDateByKey,
  setCompleteDateByKey,
  setPlanningMetaByKey,
  hydrateNoteImages,
}) => {
  if (issueKeys.length === 0) {
    return;
  }

  if (pullLatestComment) {
    try {
      const latestComments = await fetchLatestJiraCommentsBulk(issueKeys);
      const commentNotes = {};
      issueKeys.forEach((key) => {
        const { text } = readCommentEntry(latestComments?.[key]);
        if (text) {
          commentNotes[key] = text;
        }
      });
      if (Object.keys(commentNotes).length > 0) {
        setJiraNotes((prev) => ({ ...prev, ...commentNotes }));
      }
    } catch (error) {
      console.error("Failed to fetch latest Jira comments", error);
    }
  }

  const persisted = await fetchIssueMetadataBulk(issueKeys);
  const nextNotes = {};
  const nextPriorities = {};
  const nextStartDates = {};
  const nextCompleteDates = {};
  const nextPlanningMeta = {};
  issueKeys.forEach((key) => {
    const item = persisted?.[key];
    if (!item) {
      return;
    }
    if (!pullLatestComment && typeof item.note === "string") {
      nextNotes[key] = item.note;
    }
    if (item.priority !== undefined) {
      nextPriorities[key] = clampPriority(item.priority);
    }
    if (typeof item.startDate === "string" && item.startDate) {
      nextStartDates[key] = item.startDate;
    }
    if (typeof item.completeDate === "string" && item.completeDate) {
      nextCompleteDates[key] = item.completeDate;
    }
    if (hasPlanningData(item)) {
      nextPlanningMeta[key] = extractPlanningMeta(item);
    }
    if (hydrateNoteImages) {
      hydrateNoteImages(key, { keepNoteImages: item.keepNoteImages, images: item.images });
    }
  });
  if (!pullLatestComment && Object.keys(nextNotes).length > 0) {
    setJiraNotes((prev) => mergeIssueMapsPreferExisting(prev, nextNotes));
  }
  if (Object.keys(nextPriorities).length > 0) {
    setJiraRowPriorities((prev) => mergeIssueMapsPreferExisting(prev, nextPriorities));
  }
  if (setStartDateByKey && Object.keys(nextStartDates).length > 0) {
    setStartDateByKey((prev) => mergeIssueMapsPreferExisting(prev, nextStartDates));
  }
  if (setCompleteDateByKey && Object.keys(nextCompleteDates).length > 0) {
    setCompleteDateByKey((prev) => mergeIssueMapsPreferExisting(prev, nextCompleteDates));
  }
  if (setPlanningMetaByKey && Object.keys(nextPlanningMeta).length > 0) {
    setPlanningMetaByKey((prev) => mergeIssueMapsPreferExisting(prev, nextPlanningMeta));
  }
};

export async function runJqlWorkflow({
  jqlInputs,
  jqlLabels,
  jqlSharedProgramIds = [],
  jqlMaxResults,
  pullLatestComment,
  clampPriority,
  setJqlError,
  setJqlRuns,
  setShowRestoredJqlBanner,
  setJqlLoading,
  setJiraNotes,
  setJiraRowPriorities,
  setPrioritySourceByKey,
  setStartDateByKey,
  setCompleteDateByKey,
  setPlanningMetaByKey,
  hydrateNoteImages,
  fieldMappingRows,
}) {
  const configuredIndexes = getConfiguredJqlSlotIndexes(jqlInputs, jqlLabels);

  if (configuredIndexes.length === 0) {
    setJqlError("Please enter at least one JQL with a label.");
    setJqlRuns([]);
    setShowRestoredJqlBanner(false);
    return;
  }

  setShowRestoredJqlBanner(false);
  setJqlError("");
  setJqlLoading(true);

  try {
    const runResults = await Promise.all(
      configuredIndexes.map(async (idx) => {
        const jql = String(jqlInputs[idx] || "").trim();
        const label = String(jqlLabels[idx] || "").trim();
        const sharedProgramId = String(jqlSharedProgramIds[idx] || "").trim();

        try {
          const data = await fetchJiraSearchAll({ jql, maxTotal: jqlMaxResults });
          return {
            index: idx,
            label,
            jql,
            sharedProgramId,
            issues: data?.issues || [],
            total: Number(data?.total || 0),
            loaded: Number(data?.loaded || (data?.issues || []).length),
            loadComplete: Boolean(data?.isComplete),
            error: null,
          };
        } catch (error) {
          return {
            index: idx,
            label,
            jql,
            sharedProgramId,
            issues: [],
            total: 0,
            loaded: 0,
            loadComplete: true,
            error: errorMessage(error, "Failed to run query"),
          };
        }
      })
    );

    const teamIssueKeys = new Set();
    const localIssueKeys = new Set();
    runResults.forEach((run) => {
      const keys = (run.issues || [])
        .map((issue) => String(issue.key || "").trim().toUpperCase())
        .filter(Boolean);
      if (run.sharedProgramId) {
        keys.forEach((key) => teamIssueKeys.add(key));
      } else {
        keys.forEach((key) => localIssueKeys.add(key));
      }
    });

    // Prefer team mode when an issue appears in both a team and local slot.
    localIssueKeys.forEach((key) => {
      if (teamIssueKeys.has(key)) {
        localIssueKeys.delete(key);
      }
    });

    const localKeys = [...localIssueKeys];
    if (localKeys.length > 0) {
      if (pullLatestComment) {
        try {
          const latestComments = await fetchLatestJiraCommentsBulk(localKeys);
          const commentNotes = {};
          localKeys.forEach((issueKey) => {
            const { text } = readCommentEntry(latestComments?.[issueKey]);
            if (text) {
              commentNotes[issueKey] = text;
            }
          });
          if (Object.keys(commentNotes).length > 0) {
            setJiraNotes((prev) => ({ ...prev, ...commentNotes }));
          }
        } catch (error) {
          console.error("Failed to fetch latest Jira comments", error);
        }
      }

      try {
        const persisted = await fetchIssueMetadataBulk(localKeys);
        const nextNotes = {};
        const nextPriorities = {};
        const nextStartDates = {};
        const nextCompleteDates = {};
        const nextPlanningMeta = {};

        localKeys.forEach((issueKey) => {
          const item = persisted?.[issueKey];
          if (!item) {
            return;
          }

          if (!pullLatestComment && typeof item.note === "string") {
            nextNotes[issueKey] = item.note;
          }
          if (item.priority !== undefined) {
            nextPriorities[issueKey] = clampPriority(item.priority);
          }
          if (typeof item.startDate === "string" && item.startDate) {
            nextStartDates[issueKey] = item.startDate;
          }
          if (typeof item.completeDate === "string" && item.completeDate) {
            nextCompleteDates[issueKey] = item.completeDate;
          }
          if (hasPlanningData(item)) {
            nextPlanningMeta[issueKey] = extractPlanningMeta(item);
          }
          if (hydrateNoteImages) {
            hydrateNoteImages(issueKey, { keepNoteImages: item.keepNoteImages, images: item.images });
          }
        });

        if (!pullLatestComment && Object.keys(nextNotes).length > 0) {
          setJiraNotes((prev) => mergeIssueMapsPreferExisting(prev, nextNotes));
        }
        if (Object.keys(nextPriorities).length > 0) {
          setJiraRowPriorities((prev) => mergeIssueMapsPreferExisting(prev, nextPriorities));
        }
        if (setStartDateByKey && Object.keys(nextStartDates).length > 0) {
          setStartDateByKey((prev) => mergeIssueMapsPreferExisting(prev, nextStartDates));
        }
        if (setCompleteDateByKey && Object.keys(nextCompleteDates).length > 0) {
          setCompleteDateByKey((prev) => mergeIssueMapsPreferExisting(prev, nextCompleteDates));
        }
        if (setPlanningMetaByKey && Object.keys(nextPlanningMeta).length > 0) {
          setPlanningMetaByKey((prev) => mergeIssueMapsPreferExisting(prev, nextPlanningMeta));
        }
      } catch (error) {
        console.error("Failed to fetch persisted issue metadata", error);
      }
    }

    if (teamIssueKeys.size > 0) {
      try {
        const persisted = await fetchIssueMetadataBulk([...teamIssueKeys]);
        const nextNotes = {};
        const nextStartDates = {};
        const nextCompleteDates = {};
        const nextPlanningMeta = {};
        [...teamIssueKeys].forEach((issueKey) => {
          const item = persisted?.[issueKey];
          if (!item) {
            return;
          }
          if (!pullLatestComment && typeof item.note === "string") {
            nextNotes[issueKey] = item.note;
          }
          if (typeof item.startDate === "string" && item.startDate) {
            nextStartDates[issueKey] = item.startDate;
          }
          if (typeof item.completeDate === "string" && item.completeDate) {
            nextCompleteDates[issueKey] = item.completeDate;
          }
          if (hasPlanningData(item)) {
            nextPlanningMeta[issueKey] = extractPlanningMeta(item);
          }
          if (hydrateNoteImages) {
            hydrateNoteImages(issueKey, { keepNoteImages: item.keepNoteImages, images: item.images });
          }
        });
        if (!pullLatestComment && Object.keys(nextNotes).length > 0) {
          setJiraNotes((prev) => mergeIssueMapsPreferExisting(prev, nextNotes));
        }
        if (setStartDateByKey && Object.keys(nextStartDates).length > 0) {
          setStartDateByKey((prev) => mergeIssueMapsPreferExisting(prev, nextStartDates));
        }
        if (setCompleteDateByKey && Object.keys(nextCompleteDates).length > 0) {
          setCompleteDateByKey((prev) => mergeIssueMapsPreferExisting(prev, nextCompleteDates));
        }
        if (setPlanningMetaByKey && Object.keys(nextPlanningMeta).length > 0) {
          setPlanningMetaByKey((prev) => mergeIssueMapsPreferExisting(prev, nextPlanningMeta));
        }
      } catch (error) {
        console.error("Failed to fetch notes for team-slot issues", error);
      }
    }

    // Independent endpoints, disjoint state — no reason to serialize them.
    await Promise.all([
      applyTeamPriorityState({
        issueKeys: [...teamIssueKeys],
        clampPriority,
        setJiraRowPriorities,
        setPrioritySourceByKey,
      }),
      applyTeamDateState({ issueKeys: [...teamIssueKeys], setStartDateByKey, setCompleteDateByKey, setPlanningMetaByKey }),
    ]);

    const enrichedRuns = await Promise.all(
      runResults.map((run) => enrichRunWithParentDoneDates(run, fieldMappingRows))
    );

    const sortedRuns = [...enrichedRuns].sort((a, b) => a.index - b.index);
    setJqlRuns((prev) => {
      const { drillDown } = partitionJqlRuns(prev);
      const activeDrillDown = drillDown.filter((run) => !isDrillDownDismissed(run.drillDownId));
      const next = mergeJqlRuns(activeDrillDown, sortedRuns);
      persistJqlRunsToStorage(next);
      return next;
    });
  } finally {
    setJqlLoading(false);
  }
}

export async function loadRemainingJqlIssues({
  runIndex,
  jqlRuns,
  jqlMaxResults,
  clampPriority,
  setJqlRuns,
  setJqlLoading,
  setJiraRowPriorities,
  setPrioritySourceByKey,
  setJiraNotes,
  setStartDateByKey,
  setCompleteDateByKey,
  setPlanningMetaByKey,
  pullLatestComment,
  fieldMappingRows,
}) {
  const run = jqlRuns.find((item, idx) => (item.index ?? idx) === runIndex) || jqlRuns[runIndex];
  if (!run?.jql || run.loadComplete) {
    return;
  }

  const jiraTotal = Number(run.total || 0);
  const targetMax = Math.min(5000, Math.max(jqlMaxResults, jiraTotal || jqlMaxResults));
  const sharedProgramId = String(run.sharedProgramId || "").trim();

  setJqlLoading(true);
  try {
    const data = await fetchJiraSearchAll({ jql: run.jql, maxTotal: targetMax });
    const nextRun = {
      ...run,
      issues: data?.issues || [],
      total: Number(data?.total || run.total || 0),
      loaded: Number(data?.loaded || (data?.issues || []).length),
      loadComplete: Boolean(data?.isComplete),
    };

    const enriched = await enrichRunWithParentDoneDates(nextRun, fieldMappingRows);
    setJqlRuns((prev) => {
      const { drillDown, regular } = partitionJqlRuns(prev);
      const activeDrillDown = drillDown.filter((run) => !isDrillDownDismissed(run.drillDownId));
      const nextRegular = regular.map((item, idx) => {
        const itemIndex = item.index ?? idx;
        return itemIndex === runIndex ? enriched : item;
      });
      const next = mergeJqlRuns(activeDrillDown, nextRegular);
      persistJqlRunsToStorage(next);
      return next;
    });

    const issueKeys = (enriched.issues || [])
      .map((issue) => String(issue.key || "").trim())
      .filter(Boolean);

    if (issueKeys.length === 0) {
      return;
    }

    if (sharedProgramId) {
      await Promise.all([
        applyTeamPriorityState({
          issueKeys,
          clampPriority,
          setJiraRowPriorities,
          setPrioritySourceByKey,
        }),
        applyTeamDateState({ issueKeys, setStartDateByKey, setCompleteDateByKey, setPlanningMetaByKey }),
      ]);
      return;
    }

    if (pullLatestComment) {
      try {
        const latestComments = await fetchLatestJiraCommentsBulk(issueKeys);
        issueKeys.forEach((issueKey) => {
          const { text } = readCommentEntry(latestComments?.[issueKey]);
          if (text) {
            setJiraNotes((prev) => ({ ...prev, [issueKey]: text }));
          }
        });
      } catch (error) {
        console.error("Failed to fetch latest Jira comments", error);
      }
    }

    try {
      const persisted = await fetchIssueMetadataBulk(issueKeys);
      const nextPriorities = {};
      const nextStartDates = {};
      const nextCompleteDates = {};
      const nextPlanningMeta = {};
      issueKeys.forEach((issueKey) => {
        const item = persisted?.[issueKey];
        if (item?.priority !== undefined) {
          nextPriorities[issueKey] = clampPriority(item.priority);
        }
        if (typeof item?.startDate === "string" && item.startDate) {
          nextStartDates[issueKey] = item.startDate;
        }
        if (typeof item?.completeDate === "string" && item.completeDate) {
          nextCompleteDates[issueKey] = item.completeDate;
        }
        if (hasPlanningData(item)) {
          nextPlanningMeta[issueKey] = extractPlanningMeta(item);
        }
      });
      if (Object.keys(nextPriorities).length > 0) {
        setJiraRowPriorities((prev) => mergeIssueMapsPreferExisting(prev, nextPriorities));
      }
      if (setStartDateByKey && Object.keys(nextStartDates).length > 0) {
        setStartDateByKey((prev) => mergeIssueMapsPreferExisting(prev, nextStartDates));
      }
      if (setCompleteDateByKey && Object.keys(nextCompleteDates).length > 0) {
        setCompleteDateByKey((prev) => mergeIssueMapsPreferExisting(prev, nextCompleteDates));
      }
      if (setPlanningMetaByKey && Object.keys(nextPlanningMeta).length > 0) {
        setPlanningMetaByKey((prev) => mergeIssueMapsPreferExisting(prev, nextPlanningMeta));
      }
    } catch (error) {
      console.error("Failed to fetch persisted issue metadata", error);
    }
  } catch (error) {
    console.error("Failed to load remaining JQL issues", error);
  } finally {
    setJqlLoading(false);
  }
}

const DRILL_DOWN_RUN_INDEX = -1;

const makeDrillDownId = (kind, value) =>
  `${kind}:${String(value || "").trim().toLowerCase()}`;

export async function loadDrillDownIssueByKey({
  issueKey,
  pullLatestComment,
  clampPriority,
  setJqlRuns,
  setJqlLoading,
  setJiraRowPriorities,
  setPrioritySourceByKey,
  setJiraNotes,
  setStartDateByKey,
  setCompleteDateByKey,
  setPlanningMetaByKey,
  setJqlError,
  hydrateNoteImages,
  fieldMappingRows,
  isStale = () => false,
}) {
  const normalized = String(issueKey || "").trim().toUpperCase();
  if (!normalized) {
    return false;
  }

  if (isDrillDownDismissed(makeDrillDownId("issue", normalized))) {
    return false;
  }

  setJqlLoading(true);
  setJqlError("");

  try {
    const jql = `key = "${normalized}"`;
    const data = await fetchJiraSearchAll({ jql, maxTotal: 5 });
    if (isStale()) {
      return false;
    }

    const issues = data?.issues || [];

    if (issues.length === 0) {
      setJqlError(`No issue found for ${normalized}. Run JQL that includes this key, or check the key in Jira.`);
      return false;
    }

    const drillRun = {
      index: DRILL_DOWN_RUN_INDEX,
      drillDownId: makeDrillDownId("issue", normalized),
      drillDownType: "issue",
      drillDownValue: normalized,
      label: `Drill-down: ${normalized}`,
      jql,
      issues,
      total: issues.length,
      loaded: issues.length,
      loadComplete: true,
      error: null,
      isDrillDown: true,
    };

    const enriched = await enrichRunWithParentDoneDates(drillRun, fieldMappingRows);
    const issueKeys = issues
      .map((issue) => String(issue.key || "").trim())
      .filter(Boolean);

    try {
      await applyDrillDownMetadata({
        issueKeys,
        pullLatestComment,
        clampPriority,
        setJiraRowPriorities,
        setJiraNotes,
        setStartDateByKey,
        setCompleteDateByKey,
        setPlanningMetaByKey,
        hydrateNoteImages,
      });
    } catch (error) {
      console.error("Failed to enrich drill-down issue", error);
    }

    if (isStale()) {
      return false;
    }

    setJqlRuns((prev) => {
      const { drillDown, regular } = partitionJqlRuns(prev);
      const nextDrillDown = [
        enriched,
        ...drillDown.filter((run) => run.drillDownId !== enriched.drillDownId),
      ];
      const next = mergeJqlRuns(nextDrillDown, regular);
      persistJqlRunsToStorage(next);
      return next;
    });

    return true;
  } catch (error) {
    setJqlError(errorMessage(error, `Failed to load ${normalized}`));
    return false;
  } finally {
    setJqlLoading(false);
  }
}

export async function loadDrillDownIssuesByAssignee({
  assigneeName,
  epicPresetId,
  jqlMaxResults = 200,
  pullLatestComment,
  clampPriority,
  setJqlRuns,
  setJqlLoading,
  setJiraRowPriorities,
  setPrioritySourceByKey,
  setJiraNotes,
  setStartDateByKey,
  setCompleteDateByKey,
  setPlanningMetaByKey,
  setJqlError,
  hydrateNoteImages,
  fieldMappingRows,
  isStale = () => false,
}) {
  const assignee = String(assigneeName || "").trim();
  if (!assignee) {
    return false;
  }
  const scopedPresetId = String(epicPresetId || "").trim();
  const scopeSuffix = scopedPresetId ? `:${scopedPresetId}` : "";

  if (isDrillDownDismissed(makeDrillDownId("assignee", `${assignee}${scopeSuffix}`))) {
    return false;
  }

  setJqlLoading(true);
  setJqlError("");

  try {
    const isUnassigned =
      assignee.toLowerCase() === "unassigned" || assignee.toLowerCase() === "__unassigned__";

    let scopeJql = "";
    if (scopedPresetId) {
      try {
        scopeJql = await fetchEpicPresetScopeJql(scopedPresetId);
      } catch {
        scopeJql = "";
      }
    }

    const assigneeClause = isUnassigned
      ? "assignee is EMPTY"
      : `assignee = "${escapeJqlString(assignee)}"`;
    let jql;
    if (scopeJql) {
      jql = `(${scopeJql}) AND ${assigneeClause} ORDER BY updated DESC`;
    } else if (isUnassigned) {
      jql = `project = ${UNASSIGNED_DRILLDOWN_PROJECT_KEY} AND assignee is EMPTY ORDER BY updated DESC`;
    } else {
      jql = `${assigneeClause} ORDER BY updated DESC`;
    }

    const data = await fetchJiraSearchAll({ jql, maxTotal: jqlMaxResults });
    if (isStale()) {
      return false;
    }

    const issues = data?.issues || [];
    const total = Number(data?.total ?? issues.length);

    if (issues.length === 0) {
      let emptyMessage = `No open issues found for assignee "${assignee}".`;
      if (scopedPresetId && isUnassigned) {
        emptyMessage = "No unassigned issues found in this project.";
      } else if (scopedPresetId) {
        emptyMessage = `No issues found for assignee "${assignee}" in this project.`;
      } else if (isUnassigned) {
        emptyMessage = "No unassigned issues found.";
      }
      setJqlError(emptyMessage);
      return false;
    }

    const drillRun = {
      index: DRILL_DOWN_RUN_INDEX,
      drillDownId: makeDrillDownId("assignee", `${assignee}${scopeSuffix}`),
      drillDownType: "assignee",
      drillDownValue: assignee,
      label: scopedPresetId ? `Drill-down: ${assignee} (project)` : `Drill-down: ${assignee}`,
      jql,
      issues,
      total,
      loaded: issues.length,
      loadComplete: issues.length >= total,
      error: null,
      isDrillDown: true,
      drillDownAssignee: assignee,
      drillDownEpicPresetId: scopedPresetId || null,
    };

    const enriched = await enrichRunWithParentDoneDates(drillRun, fieldMappingRows);
    const issueKeys = issues
      .map((issue) => String(issue.key || "").trim())
      .filter(Boolean);

    try {
      await applyDrillDownMetadata({
        issueKeys,
        pullLatestComment,
        clampPriority,
        setJiraRowPriorities,
        setJiraNotes,
        setStartDateByKey,
        setCompleteDateByKey,
        setPlanningMetaByKey,
        hydrateNoteImages,
      });
    } catch (error) {
      console.error("Failed to enrich assignee drill-down issues", error);
    }

    if (isStale()) {
      return false;
    }

    setJqlRuns((prev) => {
      const { drillDown, regular } = partitionJqlRuns(prev);
      const nextDrillDown = [
        enriched,
        ...drillDown.filter((run) => run.drillDownId !== enriched.drillDownId),
      ];
      const next = mergeJqlRuns(nextDrillDown, regular);
      persistJqlRunsToStorage(next);
      return next;
    });

    return true;
  } catch (error) {
    setJqlError(errorMessage(error, `Failed to load tasks for ${assignee}`));
    return false;
  } finally {
    setJqlLoading(false);
  }
}

export async function loadDrillDownByJql({
  jql,
  label,
  jqlMaxResults = 200,
  pullLatestComment,
  clampPriority,
  setJqlRuns,
  setJqlLoading,
  setJiraRowPriorities,
  setPrioritySourceByKey,
  setJiraNotes,
  setStartDateByKey,
  setCompleteDateByKey,
  setPlanningMetaByKey,
  setJqlError,
  hydrateNoteImages,
  fieldMappingRows,
  isStale = () => false,
}) {
  const query = String(jql || "").trim();
  const tabLabel = String(label || "Work Week").trim() || "Work Week";
  if (!query) {
    return false;
  }

  const drillDownId = makeDrillDownId("jql", `${tabLabel}:${query}`.slice(0, 160));
  if (isDrillDownDismissed(drillDownId)) {
    return false;
  }

  setJqlLoading(true);
  setJqlError("");

  try {
    const data = await fetchJiraSearchAll({ jql: query, maxTotal: jqlMaxResults });
    if (isStale()) {
      return false;
    }

    const issues = data?.issues || [];
    const total = Number(data?.total ?? issues.length);
    const drillRun = {
      index: DRILL_DOWN_RUN_INDEX,
      drillDownId,
      drillDownType: "jql",
      drillDownValue: query,
      label: tabLabel,
      jql: query,
      issues,
      total,
      loaded: issues.length,
      loadComplete: issues.length >= total,
      error: null,
      isDrillDown: true,
    };

    const enriched = await enrichRunWithParentDoneDates(drillRun, fieldMappingRows);
    const issueKeys = issues
      .map((issue) => String(issue.key || "").trim())
      .filter(Boolean);

    try {
      await applyDrillDownMetadata({
        issueKeys,
        pullLatestComment,
        clampPriority,
        setJiraRowPriorities,
        setJiraNotes,
        setStartDateByKey,
        setCompleteDateByKey,
        setPlanningMetaByKey,
        hydrateNoteImages,
      });
    } catch (error) {
      console.error("Failed to enrich JQL drill-down", error);
    }

    if (isStale()) {
      return false;
    }

    setJqlRuns((prev) => {
      const { drillDown, regular } = partitionJqlRuns(prev);
      const nextDrillDown = [
        enriched,
        ...drillDown.filter((run) => run.drillDownId !== enriched.drillDownId),
      ];
      const next = mergeJqlRuns(nextDrillDown, regular);
      persistJqlRunsToStorage(next);
      return next;
    });

    return true;
  } catch (error) {
    setJqlError(errorMessage(error, `Failed to load ${tabLabel}`));
    return false;
  } finally {
    setJqlLoading(false);
  }
}
