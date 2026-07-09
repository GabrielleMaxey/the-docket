import { getIssueTypeName, isEpicIssueType } from "./dashboardMetrics.mjs";
import { isStoryIssueTypeName } from "./odiIssueStandards.mjs";

export const PARENT_CHAIN_MAX_DEPTH = 5;
const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/i;
const EPIC_LINK_FIELD_IDS = ["customfield_10014"];

const epicLinkValueToKey = (value) => {
  if (typeof value === "string") {
    const key = value.trim().toUpperCase();
    return ISSUE_KEY_PATTERN.test(key) ? key : "";
  }
  if (value && typeof value === "object") {
    const key = String(value.key || "").trim().toUpperCase();
    return ISSUE_KEY_PATTERN.test(key) ? key : "";
  }
  return "";
};

export const extractEpicLinkKeyFromIssue = (issue) => {
  const fields = issue?.fields;
  if (!fields || typeof fields !== "object") {
    return String(issue?.epicLinkKey || "").trim().toUpperCase();
  }

  for (const fieldId of EPIC_LINK_FIELD_IDS) {
    const linkedKey = epicLinkValueToKey(fields[fieldId]);
    if (linkedKey) {
      return linkedKey;
    }
  }

  for (const [fieldKey, value] of Object.entries(fields)) {
    if (!fieldKey.startsWith("customfield_")) {
      continue;
    }
    const linkedKey = epicLinkValueToKey(value);
    if (linkedKey) {
      return linkedKey;
    }
  }

  return "";
};

export const normalizeIssueRecord = (issue) => ({
  key: String(issue?.key || "").trim(),
  summary: String(issue?.fields?.summary || issue?.summary || "").trim(),
  issueType: getIssueTypeName(issue),
  parentKey: String(issue?.fields?.parent?.key || issue?.parentKey || "").trim(),
  epicLinkKey: extractEpicLinkKeyFromIssue(issue),
});

const epicRecordFromKey = (issueByKey, epicKey, fallbackSummary = "") => {
  const key = String(epicKey || "").trim().toUpperCase();
  if (!key) {
    return null;
  }

  const existing = issueByKey.get(key);
  if (existing) {
    return existing;
  }

  return {
    key,
    summary: String(fallbackSummary || "").trim(),
    issueType: "Epic",
    parentKey: "",
    epicLinkKey: "",
  };
};

const resolveEpicForChain = ({ chain, issueByKey, sourceIssue }) => {
  const epicInChain = chain.find((item) => isEpicIssueType(item.issueType));
  if (epicInChain?.key) {
    return epicInChain;
  }

  const storyInChain = chain.find((item) => isStoryIssueTypeName(item.issueType));
  const storyRecord = storyInChain ? issueByKey.get(storyInChain.key) : null;
  const linkedEpicKey = String(
    storyRecord?.epicLinkKey || (isStoryIssueTypeName(sourceIssue.issueType) ? sourceIssue.epicLinkKey : "") || ""
  )
    .trim()
    .toUpperCase();

  if (!linkedEpicKey) {
    return null;
  }

  return epicRecordFromKey(issueByKey, linkedEpicKey);
};

const uniqueEpicsFromChains = (chains) => {
  const map = new Map();
  for (const chain of chains || []) {
    const epicKey = String(chain?.epicKey || "").trim().toUpperCase();
    if (!epicKey || map.has(epicKey)) {
      continue;
    }
    map.set(epicKey, {
      key: epicKey,
      summary: String(chain?.epicSummary || "").trim(),
      issueCount: 0,
    });
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
};

const uniqueStoriesFromChains = (chains) => {
  const map = new Map();
  for (const chain of chains || []) {
    const storyKey = String(chain?.storyKey || "").trim().toUpperCase();
    if (!storyKey || map.has(storyKey)) {
      continue;
    }
    map.set(storyKey, {
      key: storyKey,
      summary: String(chain?.storySummary || "").trim(),
      epicKey: String(chain?.epicKey || "").trim().toUpperCase(),
      epicSummary: String(chain?.epicSummary || "").trim(),
      issueCount: 0,
    });
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
};

export const resolveParentFromChain = (chain, issueType) => {
  if (!chain) {
    return null;
  }

  if (issueType === "Task") {
    const storyKey = String(chain.storyKey || "").trim().toUpperCase();
    if (!storyKey) {
      return null;
    }
    return {
      parentKey: storyKey,
      parentRole: "story",
      sourceEpicKey: String(chain.epicKey || "").trim().toUpperCase(),
    };
  }

  if (issueType === "Story" || issueType === "Bug") {
    const epicKey = String(chain.epicKey || "").trim().toUpperCase();
    if (!epicKey) {
      return null;
    }
    return {
      parentKey: epicKey,
      parentRole: "epic",
      sourceEpicKey: epicKey,
    };
  }

  return null;
};

export const buildQueryIssueDropdownOptions = (candidates) => {
  const chains = candidates?.chains || [];
  return chains.map((chain) => ({
    key: `query-${chain.issueKey}`,
    value: chain.issueKey,
    text: `${chain.issueKey} (${chain.issueType})${
      chain.summary ? ` — ${chain.summary}` : ""
    }`,
    chainLabel: chain.chainLabel,
  }));
};

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
    const story = chain.find((item) => isStoryIssueTypeName(item.issueType));
    const epic = resolveEpicForChain({ chain, issueByKey, sourceIssue: issue });
    const epicKey = epic?.key || "";
    const epicSummary = epic?.summary || "";
    const storyKey = story?.key || "";
    const storySummary = story?.summary || "";

    chains.push({
      issueKey: issue.key,
      issueType: issue.issueType,
      summary: issue.summary,
      epicKey,
      epicSummary,
      storyKey,
      storySummary,
      chainLabel: [
        ...chain.map((item) => `${item.key} (${item.issueType})`),
        ...(epicKey && !chain.some((item) => item.key === epicKey)
          ? [`${epicKey} (Epic)`]
          : []),
      ].join(" → "),
    });

    if (epicKey) {
      const existing = epicMap.get(epicKey) || {
        key: epicKey,
        summary: epicSummary,
        issueCount: 0,
      };
      if (!existing.summary && epicSummary) {
        existing.summary = epicSummary;
      }
      existing.issueCount += 1;
      epicMap.set(epicKey, existing);
    }

    if (storyKey) {
      const existing = storyMap.get(storyKey) || {
        key: storyKey,
        summary: storySummary,
        epicKey,
        epicSummary,
        issueCount: 0,
      };
      existing.issueCount += 1;
      storyMap.set(storyKey, existing);
    }
  }

  const resolvedChains = chains.sort((a, b) => a.chainLabel.localeCompare(b.chainLabel));
  const resolvedEpics =
    epicMap.size > 0 ? [...epicMap.values()].sort((a, b) => a.key.localeCompare(b.key)) : uniqueEpicsFromChains(resolvedChains);
  const resolvedStories =
    storyMap.size > 0
      ? [...storyMap.values()].sort((a, b) => a.key.localeCompare(b.key))
      : uniqueStoriesFromChains(resolvedChains);

  return {
    epics: resolvedEpics,
    stories: resolvedStories,
    chains: resolvedChains,
    issueCount: issueByKey.size,
  };
};

export const buildParentDropdownFromCandidates = ({ candidates, issueType }) => {
  if (!candidates) {
    return [];
  }

  if (issueType === "Task") {
    const stories =
      candidates.stories?.length > 0 ? candidates.stories : uniqueStoriesFromChains(candidates.chains);
    return stories.map((story) => ({
      key: `story-${story.key}`,
      value: story.key,
      text: story.epicKey
        ? `Story: ${story.key} — ${story.summary || story.key} (Epic: ${story.epicKey})`
        : `Story: ${story.key} — ${story.summary || story.key}`,
      parentRole: "story",
    }));
  }

  const epics = candidates.epics?.length > 0 ? candidates.epics : uniqueEpicsFromChains(candidates.chains);
  return epics.map((epic) => ({
    key: `epic-${epic.key}`,
    value: epic.key,
    text: `Epic: ${epic.key} — ${epic.summary || epic.key}`,
    parentRole: "epic",
  }));
};
