import {
  buildParentCandidatesFromIssues,
  normalizeIssueRecord,
  PARENT_CHAIN_MAX_DEPTH,
} from "../../shared/jiraParentCandidates.mjs";
import { getJiraSearchFields } from "./jiraSearchFields.mjs";
import { searchAllIssues } from "./jiraSearchHelpers.mjs";

const EPIC_LINK_FIELD = "customfield_10014";
const PARENT_FETCH_FIELDS = ["summary", "issuetype", "parent", EPIC_LINK_FIELD];

const fetchIssuesByKeys = async ({ keys, jiraRequest, fields = PARENT_FETCH_FIELDS }) => {
  const uniqueKeys = [...new Set(keys.map((key) => String(key || "").trim()).filter(Boolean))];
  if (uniqueKeys.length === 0) {
    return [];
  }

  const jql = `key in (${uniqueKeys.join(",")}) ORDER BY key ASC`;
  const result = await jiraRequest({
    method: "POST",
    pathWithQuery: "/rest/api/3/search/jql",
    body: {
      jql,
      maxResults: uniqueKeys.length,
      fields: PARENT_FETCH_FIELDS,
    },
  });

  if (!result.ok) {
    throw new Error(
      result.data?.errorMessages?.join(" ") ||
        result.data?.message ||
        "Failed to load parent issues from Jira"
    );
  }

  return Array.isArray(result.data?.issues) ? result.data.issues : [];
};

const enrichParentChains = async ({ issueByKey, jiraRequest }) => {
  for (let depth = 0; depth < PARENT_CHAIN_MAX_DEPTH; depth += 1) {
    const missing = new Set();
    for (const issue of issueByKey.values()) {
      if (issue.parentKey && !issueByKey.has(issue.parentKey)) {
        missing.add(issue.parentKey);
      }
      if (issue.epicLinkKey && !issueByKey.has(issue.epicLinkKey)) {
        missing.add(issue.epicLinkKey);
      }
    }

    if (missing.size === 0) {
      break;
    }

    const parentIssues = await fetchIssuesByKeys({
      keys: [...missing],
      jiraRequest,
    });

    if (parentIssues.length === 0) {
      break;
    }

    for (const issue of parentIssues) {
      const record = normalizeIssueRecord(issue);
      if (record.key) {
        issueByKey.set(record.key, record);
      }
    }
  }
};

export const loadParentCandidatesFromJql = async ({
  jql,
  jiraRequest,
  runJiraSearchRequest,
  searchFields,
  maxTotal = 100,
}) => {
  const trimmedJql = String(jql || "").trim();
  if (!trimmedJql) {
    return {
      epics: [],
      stories: [],
      chains: [],
      issueCount: 0,
      loaded: 0,
      total: 0,
      isComplete: true,
    };
  }

  const search = await searchAllIssues({
    jql: trimmedJql,
    runJiraSearchRequest: (jqlArg, options = {}) =>
      runJiraSearchRequest(jqlArg, {
        ...options,
        fields: searchFields || options.fields,
      }),
    maxTotal,
  });

  const issueByKey = new Map();
  for (const issue of search.issues || []) {
    const record = normalizeIssueRecord(issue);
    if (record.key) {
      issueByKey.set(record.key, record);
    }
  }

  await enrichParentChains({ issueByKey, jiraRequest });

  const candidates = buildParentCandidatesFromIssues([...issueByKey.values()]);
  return {
    ...candidates,
    loaded: search.loaded,
    total: search.total,
    isComplete: search.isComplete,
  };
};
