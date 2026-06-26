import { fetchIssueMetadataBulk, fetchJiraSearch, fetchLatestJiraCommentsBulk } from "../../services/jiraClient";
import { enrichRunWithParentDoneDates } from "../../utils/jiraIssueDoneDates.js";

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

/**
 * Runs JQL slot(s), merges persisted notes/priorities from the proxy DB for returned keys,
 * and updates React state via the provided setters.
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
      if (pullLatestComment) {
        try {
          const latestComments = await fetchLatestJiraCommentsBulk(allIssueKeys);
          const nextNotes = {};

          allIssueKeys.forEach((issueKey) => {
            const comment = latestComments?.[issueKey];
            if (typeof comment === "string" && comment.trim()) {
              nextNotes[issueKey] = comment.trim();
            }
          });

          if (Object.keys(nextNotes).length > 0) {
            setJiraNotes((prev) => ({ ...prev, ...nextNotes }));
          }
        } catch (error) {
          console.error("Failed to fetch latest Jira comments", error);
        }
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
          if (item.priority !== undefined) {
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

    setJqlRuns([...enrichedRuns].sort((a, b) => a.index - b.index));
  } finally {
    setJqlLoading(false);
  }
}
