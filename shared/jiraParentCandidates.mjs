import { getIssueTypeName, isEpicIssueType } from "./dashboardMetrics.mjs";
import { isStoryIssueTypeName } from "./odiIssueStandards.mjs";

export const PARENT_CHAIN_MAX_DEPTH = 5;

export const normalizeIssueRecord = (issue) => ({
  key: String(issue?.key || "").trim(),
  summary: String(issue?.fields?.summary || issue?.summary || "").trim(),
  issueType: getIssueTypeName(issue),
  parentKey: String(issue?.fields?.parent?.key || issue?.parentKey || "").trim(),
});

export const walkParentChain = (startKey, issueByKey, maxDepth = PARENT_CHAIN_MAX_DEPTH) => {
  const chain = [];
  let currentKey = String(startKey || "").trim();
  const visited = new Set();

  while (currentKey && !visited.has(currentKey) && chain.length < maxDepth) {
    visited.add(currentKey);
    const issue = issueByKey.get(currentKey);
    if (!issue) {
      break;
    }
    chain.push(issue);
    currentKey = issue.parentKey;
  }

  return chain;
};

export const buildParentCandidatesFromIssues = (issues) => {
  const issueByKey = new Map();
  for (const raw of issues) {
    const record =
      raw?.key && raw?.issueType && !raw?.fields ? raw : normalizeIssueRecord(raw);
    if (record.key) {
      issueByKey.set(record.key, record);
    }
  }

  const epicMap = new Map();
  const storyMap = new Map();
  const chains = [];

  for (const issue of issueByKey.values()) {
    const chain = walkParentChain(issue.key, issueByKey);
    const epic = chain.find((item) => isEpicIssueType(item.issueType));
    const story = chain.find((item) => isStoryIssueTypeName(item.issueType));

    chains.push({
      issueKey: issue.key,
      issueType: issue.issueType,
      summary: issue.summary,
      epicKey: epic?.key || "",
      epicSummary: epic?.summary || "",
      storyKey: story?.key || "",
      storySummary: story?.summary || "",
      chainLabel: chain.map((item) => `${item.key} (${item.issueType})`).join(" → "),
    });

    if (epic?.key) {
      const existing = epicMap.get(epic.key) || {
        key: epic.key,
        summary: epic.summary,
        issueCount: 0,
      };
      existing.issueCount += 1;
      epicMap.set(epic.key, existing);
    }

    if (story?.key) {
      const existing = storyMap.get(story.key) || {
        key: story.key,
        summary: story.summary,
        epicKey: epic?.key || "",
        epicSummary: epic?.summary || "",
        issueCount: 0,
      };
      existing.issueCount += 1;
      storyMap.set(story.key, existing);
    }
  }

  return {
    epics: [...epicMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    stories: [...storyMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    chains: chains.sort((a, b) => a.chainLabel.localeCompare(b.chainLabel)),
    issueCount: issueByKey.size,
  };
};

export const buildParentDropdownFromCandidates = ({ candidates, issueType }) => {
  if (!candidates) {
    return [];
  }

  if (issueType === "Task") {
    return candidates.stories.map((story) => ({
      key: `story-${story.key}`,
      value: story.key,
      text: story.epicKey
        ? `Story: ${story.key} — ${story.summary} (Epic: ${story.epicKey})`
        : `Story: ${story.key} — ${story.summary}`,
      parentRole: "story",
    }));
  }

  return candidates.epics.map((epic) => ({
    key: `epic-${epic.key}`,
    value: epic.key,
    text: `Epic: ${epic.key} — ${epic.summary}`,
    parentRole: "epic",
  }));
};
