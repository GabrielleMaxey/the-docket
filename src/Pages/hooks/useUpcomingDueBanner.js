import React from "react";
import { personMatchesIssue } from "../../../shared/dashboardMetrics.mjs";
import { fetchDashboardMetrics, fetchJiraMyself } from "../../services/jiraClient.js";
import { splitDueByIssues } from "../Dashboard/utils/dashboardMetricsUtils.js";

const sortByDueDate = (left, right) =>
  String(left?.dueDate || "").localeCompare(String(right?.dueDate || ""), undefined, {
    numeric: true,
  });

const issueAssignedToUser = (issue, profile) => {
  const assignee = String(issue?.assignee || "").trim();
  if (!assignee || assignee === "Unassigned") {
    return false;
  }

  const displayName = String(profile?.displayName || "").trim();
  const emailAddress = String(profile?.emailAddress || "").trim();
  if (!displayName && !emailAddress) {
    return false;
  }

  const syntheticIssue = { fields: { assignee: { displayName: assignee } } };
  return (
    personMatchesIssue(syntheticIssue, displayName, displayName) ||
    personMatchesIssue(syntheticIssue, emailAddress, displayName)
  );
};

export const useUpcomingDueBanner = (enabled) => {
  const [loading, setLoading] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState(null);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([fetchDashboardMetrics(), fetchJiraMyself()])
      .then(([metrics, profile]) => {
        if (cancelled) {
          return;
        }
        setSnapshot(metrics);
        setCurrentUser(profile || null);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        setSnapshot(null);
        setCurrentUser(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load upcoming due dates");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const upcomingIssues = React.useMemo(() => {
    const issues = Array.isArray(snapshot?.dueByIssues) ? snapshot.dueByIssues : [];
    const { upcoming } = splitDueByIssues(issues);
    return [...upcoming]
      .filter((issue) => issueAssignedToUser(issue, currentUser))
      .sort(sortByDueDate);
  }, [snapshot, currentUser]);

  return {
    loading,
    error,
    dueByDate: snapshot?.dueByDate || "",
    refreshedAt: snapshot?.refreshedAt || "",
    upcomingIssues,
    currentUserDisplayName: String(currentUser?.displayName || "").trim(),
  };
};
