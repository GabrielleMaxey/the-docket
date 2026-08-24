import { fetchIssueMetadataBulk, runEpicFilters } from "../../services/jiraClient";
import { errorMessage, mergeIssueMapsPreferExisting } from "../../utils/workflow.js";

export async function runEpicFilterWorkflow({
  epicPresetIds,
  includePastDue,
  jqlMaxResults,
  clampPriority,
  setEpicFilterError,
  setJqlRuns,
  setShowRestoredJqlBanner,
  setEpicFilterLoading,
  setJiraNotes,
  setJiraRowPriorities,
}) {
  if (epicPresetIds.length === 0 && !includePastDue) {
    setEpicFilterError("Select at least one epic preset or Past Due Projects.");
    return;
  }

  setShowRestoredJqlBanner(false);
  setEpicFilterError("");
  setEpicFilterLoading(true);

  try {
    const runResults = await runEpicFilters({
      epicPresetIds,
      includePastDue,
      maxResults: jqlMaxResults,
    });

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
          setJiraNotes((prev) => mergeIssueMapsPreferExisting(prev, nextNotes));
        }
        if (Object.keys(nextPriorities).length > 0) {
          setJiraRowPriorities((prev) => mergeIssueMapsPreferExisting(prev, nextPriorities));
        }
      } catch (error) {
        console.error("Failed to fetch persisted issue metadata", error);
      }
    }

    setJqlRuns([...runResults].sort((a, b) => a.index - b.index));
  } catch (error) {
    setEpicFilterError(errorMessage(error, "Failed to run selected epic filters"));
    setJqlRuns([]);
  } finally {
    setEpicFilterLoading(false);
  }
}
