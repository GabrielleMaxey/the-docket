import { fetchJiraSearch } from "../services/jiraClient.js";
import { chunkValues } from "../../shared/jiraBatch.mjs";
import { getFieldValue, formatDateOnly } from "../../shared/dashboardMetrics.mjs";
import { resolveMappedFieldId } from "../../shared/odiFieldIds.mjs";

const MAX_PARENT_HOPS = 5;

export const resolveFieldMappingRows = (rows) => {
  const map = new Map();
  for (const row of rows || []) {
    map.set(String(row.role || "").trim(), {
      role: String(row.role || "").trim(),
      fieldId: String(row.fieldId || row.field_id || "").trim(),
      fieldName: String(row.fieldName || row.field_name || "").trim(),
    });
  }
  return map;
};

export const issueHasOwnMrdd = (issue, mrdFieldId) =>
  Boolean(formatDateOnly(getFieldValue(issue, mrdFieldId)));

const fetchIssuesByKeys = async (keys) => {
  if (!keys.length) {
    return [];
  }

  const issues = [];
  for (const batch of chunkValues(keys)) {
    const data = await fetchJiraSearch({
      jql: `key in (${batch.join(",")})`,
      maxResults: batch.length,
    });
    issues.push(...(data?.issues || []));
  }

  return issues;
};

export const getMostRecentDoneDateForIssue = (issue, mrdFieldId, parentDateByKey = {}) => {
  if (!issue || !mrdFieldId) {
    return null;
  }

  const selfDate = formatDateOnly(getFieldValue(issue, mrdFieldId));
  if (selfDate) {
    return selfDate;
  }

  const parentKey = String(issue.fields?.parent?.key || "").trim();
  if (parentKey && parentDateByKey[parentKey]) {
    return parentDateByKey[parentKey];
  }

  return null;
};

export const buildParentMostRecentDoneDateMap = async (issues, mrdFieldId) => {
  if (!mrdFieldId || !Array.isArray(issues) || issues.length === 0) {
    return {};
  }

  const issueByKey = {};
  let keysToFetch = new Set(
    issues
      .filter((issue) => !issueHasOwnMrdd(issue, mrdFieldId))
      .map((issue) => String(issue.fields?.parent?.key || "").trim())
      .filter(Boolean)
  );

  if (keysToFetch.size === 0) {
    return {};
  }

  try {
    for (let hop = 0; hop < MAX_PARENT_HOPS && keysToFetch.size > 0; hop += 1) {
      const batch = [...keysToFetch].filter((key) => !issueByKey[key]);
      if (!batch.length) {
        break;
      }

      const fetched = await fetchIssuesByKeys(batch);
      keysToFetch = new Set();

      for (const issue of fetched) {
        const key = String(issue.key || "").trim();
        if (!key) {
          continue;
        }

        issueByKey[key] = issue;
        if (!issueHasOwnMrdd(issue, mrdFieldId)) {
          const parentKey = String(issue.fields?.parent?.key || "").trim();
          if (parentKey && !issueByKey[parentKey]) {
            keysToFetch.add(parentKey);
          }
        }
      }
    }

    const resolvedMrddByKey = new Map();
    const resolveMrddForKey = (key) => {
      const normalized = String(key || "").trim();
      if (!normalized) {
        return null;
      }
      if (resolvedMrddByKey.has(normalized)) {
        return resolvedMrddByKey.get(normalized);
      }

      const issue = issueByKey[normalized];
      if (!issue) {
        resolvedMrddByKey.set(normalized, null);
        return null;
      }

      const selfDate = formatDateOnly(getFieldValue(issue, mrdFieldId));
      if (selfDate) {
        resolvedMrddByKey.set(normalized, selfDate);
        return selfDate;
      }

      const parentKey = String(issue.fields?.parent?.key || "").trim();
      const inherited = parentKey ? resolveMrddForKey(parentKey) : null;
      resolvedMrddByKey.set(normalized, inherited);
      return inherited;
    };

    const map = {};
    for (const issue of issues) {
      if (issueHasOwnMrdd(issue, mrdFieldId)) {
        continue;
      }

      const parentKey = String(issue.fields?.parent?.key || "").trim();
      if (!parentKey) {
        continue;
      }

      const inherited = resolveMrddForKey(parentKey);
      if (inherited) {
        map[parentKey] = inherited;
      }
    }

    return map;
  } catch (error) {
    console.warn("Failed to load parent epic Most Recent Done Date values", error);
    return {};
  }
};

export const runsNeedParentMrddEnrich = (runs) =>
  (runs || []).some(
    (run) =>
      (run.issues || []).length > 0 &&
      (!run.mrdFieldId || run.parentMostRecentDoneDateByKey === undefined)
  );

export const enrichRunWithParentDoneDates = async (run, fieldMappingRows) => {
  const mappingsByRole = resolveFieldMappingRows(fieldMappingRows);
  const mrdFieldId = resolveMappedFieldId(mappingsByRole, "most_recent_done_date");
  const parentMostRecentDoneDateByKey = await buildParentMostRecentDoneDateMap(
    run.issues || [],
    mrdFieldId
  );

  return {
    ...run,
    mrdFieldId,
    parentMostRecentDoneDateByKey,
  };
};
