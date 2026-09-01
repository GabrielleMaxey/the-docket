/**
 * Guided "Use AI helper" intake for Create Issue.
 *
 * The intake collects the author's own words in a structured form so AI Draft has
 * real material to work from instead of inferring everything from a one-line title.
 * Only the basic ask is required; every other prompt may be left blank and finished
 * later in Jira.
 *
 * Shared by the UI panel, the generate-description route, and tests.
 */

const STORY_FIELDS = [
  {
    id: "asA",
    label: "As a",
    required: true,
    placeholder: "NORA customer",
    hint: "Who is this for? A role, persona, team, or customer type.",
  },
  {
    id: "iWant",
    label: "I want",
    required: true,
    multiline: true,
    placeholder: "to rate my NORA interaction in one tap (and optionally add a comment)",
    hint: "The capability, change, or deliverable being asked for.",
  },
  {
    id: "soThat",
    label: "So that",
    required: true,
    multiline: true,
    placeholder: "I can give feedback quickly without filling out a form",
    hint: "The result that proves this worked.",
  },
  {
    id: "goalWhy",
    label: "Goal / why now",
    multiline: true,
    placeholder: "Survey response rates are at historic lows; in-context asks lift response volume.",
    hint: "The business driver behind the ask — what changes if this ships.",
  },
  {
    id: "successCriteria",
    label: "How we'll know it worked",
    multiline: true,
    placeholder: "Response rate measurable in a dashboard; every response ties back to a ticket.",
    hint: "Measurable signals or acceptance criteria you already have in mind.",
  },
  {
    id: "inScope",
    label: "In scope",
    multiline: true,
    placeholder: "Rating footer on resolved emails, optional comment, response capture.",
  },
  {
    id: "outOfScope",
    label: "Out of scope",
    multiline: true,
    placeholder: "Voice/IVR channel, external portal or form.",
  },
  {
    id: "constraints",
    label: "Constraints, dependencies, or risks",
    multiline: true,
    placeholder: "Must render in Outlook web + desktop; suppress during active outages.",
  },
  {
    id: "affected",
    label: "Systems, teams, or customers affected",
    multiline: true,
    placeholder: "Service Assurance team, NORA email pipeline, CSAT dashboard.",
  },
  {
    id: "openQuestions",
    label: "Open questions / decisions still needed",
    multiline: true,
    placeholder: "Cool-down thresholds for high-frequency customers.",
  },
];

const BUG_FIELDS = [
  {
    id: "whatBroke",
    label: "What is broken",
    required: true,
    multiline: true,
    placeholder: "Feedback footer renders without buttons in Outlook desktop.",
  },
  {
    id: "expected",
    label: "Expected behavior",
    required: true,
    multiline: true,
    placeholder: "All four rating options render as tappable buttons.",
  },
  {
    id: "actual",
    label: "Actual behavior",
    required: true,
    multiline: true,
    placeholder: "Options render as plain text with no mailto link.",
  },
  {
    id: "steps",
    label: "Steps to reproduce",
    multiline: true,
    placeholder: "1. Resolve a ticket  2. Open the response in Outlook desktop",
  },
  {
    id: "environment",
    label: "Environment / systems affected",
    multiline: true,
    placeholder: "Outlook 365 desktop, Windows 11.",
  },
  {
    id: "impact",
    label: "Impact / who is affected",
    multiline: true,
    placeholder: "All customers on desktop Outlook — roughly half of responses.",
  },
  {
    id: "workaround",
    label: "Known workaround",
    multiline: true,
    placeholder: "Customers can reply manually to the feedback mailbox.",
  },
  {
    id: "openQuestions",
    label: "Open questions / anything else",
    multiline: true,
  },
];

const TASK_FIELDS = [
  {
    id: "whatNeedsDoing",
    label: "What needs to be done",
    required: true,
    multiline: true,
    placeholder: "Add the rating footer template to the NORA email renderer.",
  },
  {
    id: "whyItMatters",
    label: "Why it matters to the parent story",
    required: true,
    multiline: true,
    placeholder: "Without the footer there is nothing for customers to tap.",
  },
  {
    id: "definitionOfDone",
    label: "Definition of done",
    multiline: true,
    placeholder: "Footer renders on resolved emails in staging with working mailto links.",
  },
  {
    id: "constraints",
    label: "Constraints or dependencies",
    multiline: true,
    placeholder: "Blocked until the tracking token merge field is available.",
  },
  {
    id: "affected",
    label: "Systems or components touched",
    multiline: true,
  },
  {
    id: "openQuestions",
    label: "Open questions / anything else",
    multiline: true,
  },
];

const INTAKE_FIELDS_BY_TYPE = {
  Story: STORY_FIELDS,
  Bug: BUG_FIELDS,
  Task: TASK_FIELDS,
};

/** Field sets are keyed by the Create Issue type; unknown types fall back to Task. */
export const getAiHelperIntakeFields = (issueType) =>
  INTAKE_FIELDS_BY_TYPE[String(issueType || "").trim()] || TASK_FIELDS;

export const getRequiredAiHelperIntakeFields = (issueType) =>
  getAiHelperIntakeFields(issueType).filter((field) => field.required);

export const createEmptyAiHelperIntake = (issueType) => {
  const values = {};
  for (const field of getAiHelperIntakeFields(issueType)) {
    values[field.id] = "";
  }
  return values;
};

/** Trims values and drops anything not in this issue type's field set. */
export const normalizeAiHelperIntake = (issueType, values) => {
  const normalized = {};
  for (const field of getAiHelperIntakeFields(issueType)) {
    const text = String(values?.[field.id] || "").trim();
    if (text) {
      normalized[field.id] = text;
    }
  }
  return normalized;
};

export const hasAiHelperIntakeAnswers = (issueType, values) =>
  Object.keys(normalizeAiHelperIntake(issueType, values)).length > 0;

/**
 * Only the required fields block AI Draft. Everything else is optional by design —
 * the author is nudged to finish those in Jira after the issue exists.
 */
export const validateAiHelperIntake = (issueType, values) => {
  const normalized = normalizeAiHelperIntake(issueType, values);
  const missing = getRequiredAiHelperIntakeFields(issueType).filter(
    (field) => !normalized[field.id]
  );

  return {
    valid: missing.length === 0,
    missingFieldIds: missing.map((field) => field.id),
    errors: missing.map((field) => `"${field.label}" is required to run the AI helper.`),
  };
};

/** Optional prompts the author skipped — surfaced as a nudge to finish them in Jira. */
export const listBlankOptionalIntakeFields = (issueType, values) => {
  const normalized = normalizeAiHelperIntake(issueType, values);
  return getAiHelperIntakeFields(issueType)
    .filter((field) => !field.required && !normalized[field.id])
    .map((field) => ({ id: field.id, label: field.label }));
};

/**
 * Renders the intake as a prompt block. Answered fields are passed through verbatim;
 * skipped fields are named explicitly so the model leaves them out instead of
 * inventing content for them.
 */
export const buildAiHelperIntakePrompt = (issueType, values) => {
  const normalized = normalizeAiHelperIntake(issueType, values);
  const fields = getAiHelperIntakeFields(issueType);
  const answered = fields.filter((field) => normalized[field.id]);
  if (answered.length === 0) {
    return "";
  }

  const lines = [
    "Guided intake answers (the author's own words — use these as the primary source):",
    ...answered.map((field) => `- ${field.label}: ${normalized[field.id]}`),
  ];

  const skipped = fields.filter((field) => !normalized[field.id]);
  if (skipped.length > 0) {
    lines.push(
      "",
      `The author left these blank: ${skipped.map((field) => field.label).join(", ")}.`,
      "Do not invent content for the blank prompts. Omit those sections entirely."
    );
  }

  return lines.join("\n");
};
