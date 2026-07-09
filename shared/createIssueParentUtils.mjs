import { resolveParentFromChain } from "./jiraParentCandidates.mjs";

export const ODI_ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/i;
export const MANUAL_KEY_DEBOUNCE_MS = 500;

export const normalizeIssueKey = (key) => String(key || "").trim().toUpperCase();

export const isValidOdiIssueKey = (key) => ODI_ISSUE_KEY_PATTERN.test(normalizeIssueKey(key));

const manualKeyMismatchError = ({ issue, issueType, key, mode }) => {
  const normalizedKey = normalizeIssueKey(key);
  if (issue.isStory) {
    return mode === "parent"
      ? `${normalizedKey} is a Story. Enter a Story key for Task, or switch issue type.`
      : `${normalizedKey} is a Story. Enter an Epic key, or switch issue type to Task.`;
  }
  if (issue.isEpic) {
    return mode === "parent"
      ? `${normalizedKey} is an Epic. Enter an Epic key for Story/Bug, or switch issue type to Task for a Story parent.`
      : `${normalizedKey} is a ${issue.issueType}. Enter an Epic key for Story/Bug, or a Story key for Task.`;
  }
  return `${normalizedKey} is a ${issue.issueType}. Enter an Epic key for Story/Bug, or a Story key for Task.`;
};

export const resolveManualKeyOutcome = ({ issue, issueType, key, mode = "parent" }) => {
  const normalizedKey = normalizeIssueKey(key);

  if (issue.isEpic && (issueType === "Story" || issueType === "Bug")) {
    if (mode === "preset") {
      return { kind: "load-epic-options", epicKey: normalizedKey, issue };
    }
    return {
      kind: "direct-parent",
      parentKey: normalizedKey,
      parentRole: "epic",
      sourceEpicKey: normalizedKey,
      issue,
    };
  }

  if (issue.isStory && issueType === "Task") {
    return {
      kind: "direct-parent",
      parentKey: normalizedKey,
      parentRole: "story",
      sourceEpicKey: "",
      issue,
    };
  }

  return {
    kind: "invalid",
    error: manualKeyMismatchError({ issue, issueType, key, mode }),
    issue,
  };
};

export const resolveQueryIssueParent = ({ chains, selectedQueryIssueKey, issueType }) => {
  if (!selectedQueryIssueKey || !Array.isArray(chains)) {
    return null;
  }
  const chain = chains.find((item) => item.issueKey === selectedQueryIssueKey);
  return resolveParentFromChain(chain, issueType);
};

export const buildQueryIssueParentError = (issueKey, issueType) =>
  issueType === "Task"
    ? `${normalizeIssueKey(issueKey)} has no Story parent in its chain. Select a Story parent below or enter one manually.`
    : `${normalizeIssueKey(issueKey)} has no Epic parent in its chain. Select an Epic parent below or enter one manually.`;

export const emptyManualKeyCheck = () => ({
  loading: false,
  valid: false,
  error: "",
  issue: null,
});
