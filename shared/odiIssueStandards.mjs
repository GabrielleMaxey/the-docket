/**
 * ODI Jira create standards (Confluence: Jira Standards ODI Project Space Standards).
 * Shared by server validation, UI pre-checks, and tests.
 */

import { matchesIssueTypeFamily } from "./dashboardMetrics.mjs";

const JOB_STORY_PATTERN = /^when\s+.+\s+i want\s+.+\s+so (?:i )?can\s+.+/i;

const BUG_SECTION_HINTS = [
  "steps to reproduce",
  "expected",
  "actual",
  "environment",
  "workaround",
  "troubleshooting",
  "development",
  "fix approach",
];

const JOB_STORY_LIKE_PATTERN = /^when\s/i;

export const ODI_BUG_PRIORITIES = ["Low", "Medium", "High", "Critical"];

export const normalizeOdiBugPriority = (value) => {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const match = ODI_BUG_PRIORITIES.find((item) => item.toLowerCase() === text.toLowerCase());
  return match || null;
};

export const isStoryIssueTypeName = (issueTypeName) =>
  matchesIssueTypeFamily(issueTypeName, "story");

export const isJobStorySummary = (summary) => {
  const text = String(summary || "").trim();
  if (!text) {
    return false;
  }
  return JOB_STORY_PATTERN.test(text);
};

export const isImperativeSubtaskTitle = (title) => {
  const text = String(title || "").trim();
  if (text.length < 3) {
    return false;
  }
  if (JOB_STORY_LIKE_PATTERN.test(text) || /^i want\s/i.test(text)) {
    return false;
  }
  return true;
};

export const validateBugDescription = (description) => {
  const text = String(description || "").trim();
  if (!text) {
    return "Bug description is required per ODI standards.";
  }
  if (text.length < 40) {
    return "Bug description is too short. Include what is broken, reproduction steps, and expected vs actual behavior.";
  }

  const lower = text.toLowerCase();
  const hasSection = BUG_SECTION_HINTS.some((hint) => lower.includes(hint));
  const hasBullets = /\n-\s/.test(text) || /^-\s/m.test(text);
  if (!hasSection && !hasBullets) {
    return "Bug description should use labeled sections or hyphen bullets (reproduction, expected vs actual, environment).";
  }

  return null;
};

export const validateStoryDescription = (description) => {
  const text = String(description || "").trim();
  if (!text) {
    return "Story description is required per ODI standards.";
  }
  if (text.length < 20) {
    return "Story description is too short. Expand on the situation, ask, and goal outcome.";
  }
  return null;
};

export const isOdiDescriptionStandardsError = (message) => {
  const text = String(message || "").trim().toLowerCase();
  if (!text) {
    return false;
  }
  return (
    text.includes("description") ||
    text.includes("reproduction") ||
    text.includes("expected vs actual") ||
    text.includes("goal outcome")
  );
};

export const partitionOdiStandardsErrors = (errors) => {
  const descriptionErrors = [];
  const hardErrors = [];
  for (const item of Array.isArray(errors) ? errors : []) {
    if (isOdiDescriptionStandardsError(item)) {
      descriptionErrors.push(item);
    } else {
      hardErrors.push(item);
    }
  }
  return { descriptionErrors, hardErrors };
};

/**
 * @param {{
 *   issueType: string,
 *   summary: string,
 *   description?: string,
 *   epicKey?: string,
 *   assignee?: string,
 *   isSubtask?: boolean,
 *   parentRole?: "epic" | "story",
 *   priority?: string,
 *   skipDescriptionStandards?: boolean,
 * }} input
 * @returns {{ valid: boolean, errors: string[] }}
 */
export const validateOdiIssueCreate = ({
  issueType,
  summary,
  description = "",
  epicKey = "",
  assignee = "",
  isSubtask = false,
  parentRole = "",
  priority = "",
  skipDescriptionStandards = false,
}) => {
  const type = String(issueType || "").trim();
  const parentKey = String(epicKey || "").trim();
  const errors = [];

  if (!parentKey) {
    if (type === "Story" || type === "Bug") {
      errors.push("An Epic parent is required.");
    } else if (type === "Task") {
      errors.push("A Story parent is required.");
    }
  }

  if (type === "Story") {
    if (!isJobStorySummary(summary)) {
      errors.push(
        'Story title must use Job Story format: "When <situation>, I want <ask>, so I can <outcome>."'
      );
    }
    if (String(assignee || "").trim()) {
      errors.push("Stories are not assigned to individuals per ODI standards. Leave assignee empty.");
    }
    if (parentRole && parentRole !== "epic") {
      errors.push("Stories must be created under an Epic, not a Story.");
    }
    if (!skipDescriptionStandards) {
      const storyDescError = validateStoryDescription(description);
      if (storyDescError) {
        errors.push(storyDescError);
      }
    }
  } else if (type === "Bug") {
    if (parentRole && parentRole !== "epic") {
      errors.push("Bugs must be created under an Epic only.");
    }
    if (!normalizeOdiBugPriority(priority)) {
      errors.push("Bug priority is required (Low, Medium, High, or Critical).");
    }
    if (!skipDescriptionStandards) {
      const bugDescError = validateBugDescription(description);
      if (bugDescError) {
        errors.push(bugDescError);
      }
    }
  } else if (type === "Task") {
    if (parentRole && parentRole !== "story") {
      errors.push("Tasks must be created under a Story parent.");
    }
    if (isSubtask && !isImperativeSubtaskTitle(summary)) {
      errors.push(
        'Sub-task titles should be short imperative phrases (e.g. "Configure X", "Write tests for Y").'
      );
    }
  }

  return { valid: errors.length === 0, errors };
};
