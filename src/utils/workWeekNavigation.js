/** Hash-router links from Dashboard (or elsewhere) into Work Week with table filters. */
export const buildWorkWeekHref = ({ key, assignee, epicPresetId } = {}) => {
  const params = new URLSearchParams();
  const issueKey = String(key || "").trim();
  const assigneeName = String(assignee || "").trim();
  const epicPresetIdValue = String(epicPresetId || "").trim();

  if (issueKey) {
    params.set("key", issueKey);
  }
  if (assigneeName) {
    params.set("assignee", assigneeName);
  }
  if (assigneeName && epicPresetIdValue) {
    params.set("epicPresetId", epicPresetIdValue);
  }

  const query = params.toString();
  return query ? `/work-week?${query}` : "/work-week";
};

export const normalizeIssueKey = (key) => String(key || "").trim().toUpperCase();

export const issueKeyMatches = (issueKey, queryKey) =>
  normalizeIssueKey(issueKey) === normalizeIssueKey(queryKey);

export const findRunIndexForIssueKey = (jqlRuns, issueKey) => {
  const normalized = normalizeIssueKey(issueKey);
  if (!normalized || !Array.isArray(jqlRuns)) {
    return -1;
  }

  return jqlRuns.findIndex((run) =>
    (run.issues || []).some((issue) => normalizeIssueKey(issue.key) === normalized)
  );
};

export const findRunIndexForAssignee = (jqlRuns, assigneeName) => {
  const assignee = String(assigneeName || "").trim();
  if (!assignee || !Array.isArray(jqlRuns)) {
    return -1;
  }

  let bestIdx = -1;
  let bestCount = 0;

  jqlRuns.forEach((run, idx) => {
    const count = (run.issues || []).filter(
      (issue) => String(issue.fields?.assignee?.displayName || "") === assignee
    ).length;
    if (count > bestCount) {
      bestCount = count;
      bestIdx = idx;
    }
  });

  return bestIdx;
};

/** Pick the JQL tab that already contains the drill-down target, if any. */
export const findRunIndexForDrillDown = (jqlRuns, { key, assignee } = {}) => {
  const issueKey = String(key || "").trim();
  const assigneeName = String(assignee || "").trim();

  if (issueKey) {
    const drillDownIdx = jqlRuns.findIndex(
      (run) =>
        run.isDrillDown &&
        run.drillDownType === "issue" &&
        (run.issues || []).some((issue) => issueKeyMatches(issue.key, issueKey))
    );
    if (drillDownIdx >= 0) {
      return drillDownIdx;
    }
    return findRunIndexForIssueKey(jqlRuns, issueKey);
  }

  if (assigneeName) {
    const drillDownIdx = jqlRuns.findIndex(
      (run) =>
        run.isDrillDown &&
        run.drillDownType === "assignee" &&
        String(run.drillDownAssignee || "").trim() === assigneeName
    );
    if (drillDownIdx >= 0) {
      return drillDownIdx;
    }
    return findRunIndexForAssignee(jqlRuns, assigneeName);
  }

  return -1;
};

export const getRunStateKey = (run, arrayIndex) => {
  if (run?.isDrillDown) {
    return run.drillDownId || `drill-down-${arrayIndex}`;
  }
  return String(run?.index ?? arrayIndex);
};

export const jqlRunsContainIssueKey = (jqlRuns, issueKey) =>
  findRunIndexForIssueKey(jqlRuns, issueKey) >= 0;
