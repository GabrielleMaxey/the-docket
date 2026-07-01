import { fetchIssueMetadataBulk, fetchJiraSearchAll, fetchLatestJiraCommentsBulk, saveIssueMetadata } from "../../services/jiraClient";
import { parsePriorityFromComment } from "../../../shared/priorityFromComment.mjs";
import { enrichRunWithParentDoneDates } from "../../utils/jiraIssueDoneDates.js";
import { persistJqlRunsToStorage, mergeJqlRuns, partitionJqlRuns } from "../../utils/jqlRunPersistence.js";

const errorMessage = (error, fallback) =>
  error instanceof Error ? error.message : fallback;

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

const applyDrillDownMetadata = async ({
  issueKeys,
  pullLatestComment,
  clampPriority,
  setJiraRowPriorities,
  setPrioritySourceByKey,
  setJiraNotes,
}) => {
  if (issueKeys.length === 0) {
    return;
  }

  const latestComments = await fetchLatestJiraCommentsBulk(issueKeys);
  const priorityFromComment = {};
  const prioritySource = {};

  issueKeys.forEach((key) => {
    const { text, author } = readCommentEntry(latestComments?.[key]);
    const parsed = parsePriorityFromComment(text);
    if (parsed) {
      priorityFromComment[key] = clampPriority(parsed.priority);
      prioritySource[key] = { source: "jira-comment", author: author || "Jira" };
    }
    if (pullLatestComment && text) {
      setJiraNotes((prev) => ({ ...prev, [key]: text }));
    }
  });

  if (Object.keys(priorityFromComment).length > 0) {
    setJiraRowPriorities((prev) => ({ ...prev, ...priorityFromComment }));
    if (setPrioritySourceByKey) {
      setPrioritySourceByKey((prev) => ({ ...prev, ...prioritySource }));
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
    if (item.priority !== undefined && priorityFromComment[key] === undefined) {
      nextPriorities[key] = clampPriority(item.priority);
    }
  });
  if (!pullLatestComment && Object.keys(nextNotes).length > 0) {
    setJiraNotes((prev) => mergeIssueMapsPreferExisting(prev, nextNotes));
  }
  if (Object.keys(nextPriorities).length > 0) {
    setJiraRowPriorities((prev) => mergeIssueMapsPreferExisting(prev, nextPriorities));
  }
};

/**
 * Runs JQL slot(s), merges persisted notes/priorities from the proxy DB for returned keys,
 * syncs PRIORITY P# from latest Jira comments, and updates React state via the provided setters.
 */
export async function runJqlWorkflow({
  jqlInputs,
  jqlCount,
  jqlLabels,
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
  fieldMappingRows,
}) {
  const selected = jqlInputs.slice(0, jqlCount).map((item) => String(item || "").trim());
  const nonEmpty = selected.filter(Boolean);

  if (nonEmpty.length === 0) {
    setJqlError("Please enter at least one JQL.");
    setJqlRuns([]);
    setShowRestoredJqlBanner(false);
    return;
  }

  setShowRestoredJqlBanner(false);
  setJqlError("");
  setJqlLoading(true);

  try {
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
            loaded: 0,
            loadComplete: true,
            error: "No JQL entered for this slot.",
          };
        }

        try {
          const data = await fetchJiraSearchAll({ jql, maxTotal: jqlMaxResults });
          return {
            index: idx,
            label,
            jql,
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
            issues: [],
            total: 0,
            loaded: 0,
            loadComplete: true,
            error: errorMessage(error, "Failed to run query"),
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
      let latestComments = {};

      try {
        latestComments = await fetchLatestJiraCommentsBulk(allIssueKeys);
      } catch (error) {
        console.error("Failed to fetch latest Jira comments", error);
      }

      const priorityFromComment = {};
      const prioritySource = {};
      const commentNotes = {};

      allIssueKeys.forEach((issueKey) => {
        const { text, author } = readCommentEntry(latestComments?.[issueKey]);
        if (!text) {
          return;
        }

        if (pullLatestComment) {
          commentNotes[issueKey] = text;
        }

        const parsed = parsePriorityFromComment(text);
        if (parsed) {
          priorityFromComment[issueKey] = clampPriority(parsed.priority);
          prioritySource[issueKey] = {
            source: "jira-comment",
            author: author || "Jira",
          };
          if (parsed.noteSnippet && pullLatestComment) {
            commentNotes[issueKey] = text;
          }
        }
      });

      if (pullLatestComment && Object.keys(commentNotes).length > 0) {
        setJiraNotes((prev) => ({ ...prev, ...commentNotes }));
      }

      if (Object.keys(priorityFromComment).length > 0) {
        setJiraRowPriorities((prev) => ({ ...prev, ...priorityFromComment }));
        if (setPrioritySourceByKey) {
          setPrioritySourceByKey((prev) => ({ ...prev, ...prioritySource }));
        }

        await Promise.all(
          Object.entries(priorityFromComment).map(([issueKey, priority]) =>
            saveIssueMetadata({ issueKey, priority }).catch((error) => {
              console.error("Failed to persist priority from Jira comment", issueKey, error);
            })
          )
        );
      }

      try {
        const persisted = await fetchIssueMetadataBulk(allIssueKeys);
        const nextNotes = {};
        const nextPriorities = {};

        allIssueKeys.forEach((issueKey) => {
          const item = persisted?.[issueKey];
          if (!item) {
            return;
          }

          if (!pullLatestComment && typeof item.note === "string") {
            nextNotes[issueKey] = item.note;
          }
          if (item.priority !== undefined && priorityFromComment[issueKey] === undefined) {
            nextPriorities[issueKey] = clampPriority(item.priority);
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

    const enrichedRuns = await Promise.all(
      runResults.map((run) => enrichRunWithParentDoneDates(run, fieldMappingRows))
    );

    const sortedRuns = [...enrichedRuns].sort((a, b) => a.index - b.index);
    setJqlRuns((prev) => {
      const { drillDown } = partitionJqlRuns(prev);
      const next = mergeJqlRuns(drillDown, sortedRuns);
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
      const nextRegular = regular.map((item, idx) => {
        const itemIndex = item.index ?? idx;
        return itemIndex === runIndex ? enriched : item;
      });
      const next = mergeJqlRuns(drillDown, nextRegular);
      persistJqlRunsToStorage(next);
      return next;
    });

    const issueKeys = (enriched.issues || [])
      .map((issue) => String(issue.key || "").trim())
      .filter(Boolean);

    if (issueKeys.length === 0) {
      return;
    }

    const latestComments = await fetchLatestJiraCommentsBulk(issueKeys);
    const priorityFromComment = {};
    const prioritySource = {};

    issueKeys.forEach((issueKey) => {
      const { text, author } = readCommentEntry(latestComments?.[issueKey]);
      const parsed = parsePriorityFromComment(text);
      if (parsed) {
        priorityFromComment[issueKey] = clampPriority(parsed.priority);
        prioritySource[issueKey] = { source: "jira-comment", author: author || "Jira" };
      }
      if (pullLatestComment && text) {
        setJiraNotes((prev) => ({ ...prev, [issueKey]: text }));
      }
    });

    if (Object.keys(priorityFromComment).length > 0) {
      setJiraRowPriorities((prev) => ({ ...prev, ...priorityFromComment }));
      if (setPrioritySourceByKey) {
        setPrioritySourceByKey((prev) => ({ ...prev, ...prioritySource }));
      }
    }
  } catch (error) {
    console.error("Failed to load remaining JQL issues", error);
  } finally {
    setJqlLoading(false);
  }
}

const DRILL_DOWN_RUN_INDEX = -1;

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
  fieldMappingRows,
  isStale = () => false,
}) {
  const normalized = String(issueKey || "").trim().toUpperCase();
  if (!normalized) {
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
        setPrioritySourceByKey,
        setJiraNotes,
      });
    } catch (error) {
      console.error("Failed to enrich drill-down issue", error);
    }

    if (isStale()) {
      return false;
    }

    setJqlRuns((prev) => {
      const { regular } = partitionJqlRuns(prev);
      const next = mergeJqlRuns([enriched], regular);
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
  jqlMaxResults = 200,
  pullLatestComment,
  clampPriority,
  setJqlRuns,
  setJqlLoading,
  setJiraRowPriorities,
  setPrioritySourceByKey,
  setJiraNotes,
  setJqlError,
  fieldMappingRows,
  isStale = () => false,
}) {
  const assignee = String(assigneeName || "").trim();
  if (!assignee) {
    return false;
  }

  setJqlLoading(true);
  setJqlError("");

  try {
    const jql = `assignee = "${escapeJqlString(assignee)}" ORDER BY updated DESC`;
    const data = await fetchJiraSearchAll({ jql, maxTotal: jqlMaxResults });
    if (isStale()) {
      return false;
    }

    const issues = data?.issues || [];
    const total = Number(data?.total ?? issues.length);

    if (issues.length === 0) {
      setJqlError(`No open issues found for assignee "${assignee}".`);
      return false;
    }

    const drillRun = {
      index: DRILL_DOWN_RUN_INDEX,
      label: `Drill-down: ${assignee}`,
      jql,
      issues,
      total,
      loaded: issues.length,
      loadComplete: issues.length >= total,
      error: null,
      isDrillDown: true,
      drillDownAssignee: assignee,
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
        setPrioritySourceByKey,
        setJiraNotes,
      });
    } catch (error) {
      console.error("Failed to enrich assignee drill-down issues", error);
    }

    if (isStale()) {
      return false;
    }

    setJqlRuns((prev) => {
      const { regular } = partitionJqlRuns(prev);
      const next = mergeJqlRuns([enriched], regular);
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
