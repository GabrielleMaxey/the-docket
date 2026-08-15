import React from "react";
import { fetchDashboardMetrics, fetchJiraMyself } from "../../services/jiraClient.js";
import { splitDueByIssues } from "../Dashboard/utils/dashboardMetricsUtils.js";

const sortByDueDate = (left, right) =>
  String(left?.dueDate || "").localeCompare(String(right?.dueDate || ""), undefined, {
    numeric: true,
  });

const normalize = (value) =>
  String(value || "").trim().toLowerCase();

const issueAssignedToUser = (issue, profile) => {
  const assignee = normalize(issue?.assignee);
  if (!assignee || assignee === "unassigned") {
    return false;
  }

  const displayName = normalize(profile?.displayName);
  const emailLocal = normalize(String(profile?.emailAddress || "").split("@")[0]);

  // Exact display name match (most reliable for how due-by issues are stored)
  if (displayName && assignee === displayName) {
    return true;
  }

  // Email local-part match (e.g. "jane.doe" ↔ "jane doe" after normalising dots)
  if (emailLocal) {
    const normEmailLocal = emailLocal.replace(/[._-]+/g, " ").trim();
    if (normEmailLocal && assignee === normEmailLocal) {
      return true;
    }
  }

  return false;
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
