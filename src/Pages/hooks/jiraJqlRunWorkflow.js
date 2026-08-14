import {
  fetchEpicPresetScopeJql,
  fetchIssueMetadataBulk,
  fetchJiraSearchAll,
  fetchLatestJiraCommentsBulk,
  fetchTeamPriorityBulk,
} from "../../services/jiraClient";
import { enrichRunWithParentDoneDates } from "../../utils/jiraIssueDoneDates.js";
import { getConfiguredJqlSlotIndexes } from "../../utils/workWeekStorage.js";
import {
  isDrillDownDismissed,
  persistJqlRunsToStorage,
  mergeJqlRuns,
  partitionJqlRuns,
} from "../../utils/jqlRunPersistence.js";

const errorMessage = (error, fallback) =>
  error instanceof Error ? error.message : fallback;

// Lumen's Task Manager targets a single Jira project (ODI) - same default
// used in CreateIssueModal.jsx. The unassigned drill-down is scoped to it so
// clicking "Unassigned" returns ODI's unassigned backlog rather than every
// unassigned issue across every project the API token can see.
const UNASSIGNED_DRILLDOWN_PROJECT_KEY = "ODI";

const mergeIssueMapsPreferExisting = (previous, additions) => {
  const merged = { ...previous };
  Object.entries(additions).forEach(([key, value]) => {
    if (merged[key] === undefined) {
      merged[key] = value;
    }
  });
  return merged;
};

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

const escapeJqlString = (value) =>
  String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const applyTeamPriorityState = async ({
  issueKeys,
  clampPriority,
  setJiraRowPriorities,
  setPrioritySourceByKey,
}) => {
  const keys = [
    ...new Set(
      (Array.isArray(issueKeys) ? issueKeys : [])
        .map((key) => String(key || "").trim())
        .filter(Boolean)
    ),
  ];
  if (keys.length === 0) {
    return;
  }

  try {
    const teamItems = await fetchTeamPriorityBulk(keys);
    const teamPriorities = {};
    const teamSource = {};
    keys.forEach((issueKey) => {
      teamSource[issueKey] = { source: "team-db", author: "Team" };
    });
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

const applyDrillDownMetadata = async ({
  issueKeys,
  pullLatestComment,
  clampPriority,
  setJiraRowPriorities,
  setJiraNotes,
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
      } catch (error) {
        console.error("Failed to fetch persisted issue metadata", error);
      }
    }

    if (teamIssueKeys.size > 0) {
      try {
        const persisted = await fetchIssueMetadataBulk([...teamIssueKeys]);
        const nextNotes = {};
        [...teamIssueKeys].forEach((issueKey) => {
          const item = persisted?.[issueKey];
          if (!item) {
            return;
          }
          if (!pullLatestComment && typeof item.note === "string") {
            nextNotes[issueKey] = item.note;
          }
          if (hydrateNoteImages) {
            hydrateNoteImages(issueKey, { keepNoteImages: item.keepNoteImages, images: item.images });
          }
        });
        if (!pullLatestComment && Object.keys(nextNotes).length > 0) {
          setJiraNotes((prev) => mergeIssueMapsPreferExisting(prev, nextNotes));
        }
      } catch (error) {
        console.error("Failed to fetch notes for team-slot issues", error);
      }
    }

    await applyTeamPriorityState({
      issueKeys: [...teamIssueKeys],
      clampPriority,
      setJiraRowPriorities,
      setPrioritySourceByKey,
    });

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
      await applyTeamPriorityState({
        issueKeys,
        clampPriority,
        setJiraRowPriorities,
        setPrioritySourceByKey,
      });
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
      issueKeys.forEach((issueKey) => {
        const item = persisted?.[issueKey];
        if (item?.priority !== undefined) {
          nextPriorities[issueKey] = clampPriority(item.priority);
        }
      });
      if (Object.keys(nextPriorities).length > 0) {
        setJiraRowPriorities((prev) => mergeIssueMapsPreferExisting(prev, nextPriorities));
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

    let jql;
    if (isUnassigned && scopedPresetId) {
      // Reuse the preset's own resolved scope (handles epic-key fallback,
      // Jira filter lookup, and hand-authored JQL identically to how the
      // Dashboard computed this card's own numbers) rather than
      // reconstructing an approximation. Wrapped in parens because preset
      // JQL can be an unparenthesized OR chain - concatenating a clause
      // without wrapping would only scope the last OR-branch.
      let scopeJql = "";
      try {
        scopeJql = await fetchEpicPresetScopeJql(scopedPresetId);
      } catch {
        scopeJql = "";
      }
      jql = scopeJql
        ? `(${scopeJql}) AND assignee is EMPTY ORDER BY updated DESC`
        : `project = ${UNASSIGNED_DRILLDOWN_PROJECT_KEY} AND assignee is EMPTY ORDER BY updated DESC`;
    } else if (isUnassigned) {
      jql = `project = ${UNASSIGNED_DRILLDOWN_PROJECT_KEY} AND assignee is EMPTY ORDER BY updated DESC`;
    } else {
      jql = `assignee = "${escapeJqlString(assignee)}" ORDER BY updated DESC`;
    }

    const data = await fetchJiraSearchAll({ jql, maxTotal: jqlMaxResults });
    if (isStale()) {
      return false;
    }

    const issues = data?.issues || [];
    const total = Number(data?.total ?? issues.length);

    if (issues.length === 0) {
      setJqlError(
        isUnassigned
          ? scopedPresetId
            ? "No unassigned issues found in this project."
            : "No unassigned issues found."
          : `No open issues found for assignee "${assignee}".`
      );
      return false;
    }

    const drillRun = {
      index: DRILL_DOWN_RUN_INDEX,
      drillDownId: makeDrillDownId("assignee", `${assignee}${scopeSuffix}`),
      drillDownType: "assignee",
      drillDownValue: assignee,
      label: `Drill-down: ${assignee}`,
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
