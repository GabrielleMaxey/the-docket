// Prompt-building helpers for the two career-conversation report types on
// Work Week's "My Metrics" panel: 1:1 prep (weekly/biweekly) and PWB review
// prep (quarterly/mid-year/yearly). Both are distinct from the existing
// "status report" type (kept as-is in reportRoutes.mjs) - these are written
// for a career conversation, not a workload snapshot.

// Lumen's 8 Cultural Behaviors, transcribed from the company's internal
// culture deck. Used as an optional evaluative lens so the LLM can note,
// where the work genuinely reflects one, which value it demonstrates -
// never force-fit, never invent an example that isn't in the data.
export const LUMEN_CORE_VALUES = [
  {
    name: "Teamwork",
    description:
      "Understanding, respecting, and collaborating with others toward a common goal. Showing up for each other every day, supporting a no-hero culture, and committing to the team's collective success.",
  },
  {
    name: "Trust",
    description:
      "Doing what you say you will do, owning your mistakes, and only sharing information that is yours to share. Being vulnerable, promoting authenticity, and empowering others to fully demonstrate trust.",
  },
  {
    name: "Transparency",
    description:
      "Telling the whole story by representing information and data accurately, completely, and timely even when difficult.",
  },
  {
    name: "Clarity",
    description:
      "Clear is kind. Communicating in a clear, concise, and thoughtful way. If anything is unclear, including goals, then ask.",
  },
  {
    name: "Courage",
    description:
      "Boldly advocating an idea or opinion especially when it creates a sense of vulnerability. Leaning in and being willing to rumble respectfully for the benefit of the conversation or desired result. Living into your values, asking for help, and supporting others to do the same.",
  },
  {
    name: "Customer Obsession",
    description:
      "Listening to our customers from a place of empathy to understand their needs. Taking ownership to determine priorities and advocating for the customer. Responding in a prompt manner to deliver and delight our customers beyond their expectations with a solution.",
  },
  {
    name: "Growth Mindset",
    description:
      "Having an open mind and a commitment to learning. Seeing challenges, failures, and change as opportunities for growth.",
  },
  {
    name: "Respect",
    description:
      "Valuing others' contributions, experiences, and well-being through active listening, thoughtful communication, and professionalism. Fostering a culture of mutual care and connection by recognizing and appreciating the unique qualities and skills of all individuals (Lumenaries, customers, partners, and communities).",
  },
];

export const formatLumenCoreValuesBlock = () =>
  [
    "## Lumen's 8 Cultural Behaviors (for reference only - do not quote this list verbatim in the report; only mention a specific value by name if the actual work data genuinely demonstrates it)",
    ...LUMEN_CORE_VALUES.map((v) => `- **${v.name}**: ${v.description}`),
  ].join("\n");

export const CAREER_REPORT_TYPES = {
  ONE_ON_ONE: "one_on_one",
  PWB: "pwb",
};

export const PWB_PERIODS = {
  QUARTERLY: "quarterly",
  MID_YEAR: "mid_year",
  YEARLY: "yearly",
};

const PWB_PERIOD_LABELS = {
  [PWB_PERIODS.QUARTERLY]: "quarterly",
  [PWB_PERIODS.MID_YEAR]: "mid-year",
  [PWB_PERIODS.YEARLY]: "annual",
};

export const isValidCareerReportType = (value) =>
  Object.values(CAREER_REPORT_TYPES).includes(value);

export const isValidPwbPeriod = (value) => Object.values(PWB_PERIODS).includes(value);

const buildGoalsSection = ({ userGoals, companyGoals }) => {
  const lines = [];
  if (userGoals) {
    lines.push("## Your stated goals", userGoals.trim());
  }
  if (companyGoals) {
    lines.push("", "## Company / team goals", companyGoals.trim());
  }
  if (lines.length === 0) {
    return "";
  }
  return [
    "",
    lines.join("\n"),
    "",
    userGoals && companyGoals
      ? "Note where the work below supports these goals, and honestly flag anything that seems disconnected from them - don't force a connection that isn't there."
      : userGoals
        ? "Note where the work below supports this goal, and honestly flag anything that seems disconnected from it."
        : "Note where the work below supports these team/company priorities.",
  ].join("\n");
};

export const buildOneOnOneSystemPrompt = ({ label, userGoals, companyGoals }) => {
  const goalsSection = buildGoalsSection({ userGoals, companyGoals });
  return [
    `You are helping someone prepare talking points for their weekly or biweekly 1:1 with their manager, based on their recent work on "${label}" at Lumen.
This is written FROM their perspective and FOR their own prep use - notes they can glance at or read from during the conversation, not a formal document.

Structure it as short, scannable sections with bullet points (unlike a typical narrative status report, brevity and scannability matter more here than flowing prose):
- What I got done recently (2-4 concrete bullets, specific issue keys/outcomes where useful)
- What I'm working on now / coming up next
- Anything blocking me or worth flagging to my manager
- A question or two worth raising, if the data suggests one (e.g. a stuck item, a scope question)

Keep it short enough to read in under a minute. Plain, first-person, conversational - like notes you'd actually jot down before a 1:1, not corporate-speak.`,
    goalsSection,
    formatLumenCoreValuesBlock(),
    "Base the report ONLY on the data provided below. Do not invent metrics, names, or accomplishments not present in the data.",
  ]
    .filter(Boolean)
    .join("\n\n");
};

export const buildPwbSystemPrompt = ({ label, period, userGoals, companyGoals }) => {
  const periodLabel = PWB_PERIOD_LABELS[period] || "review-period";
  const goalsSection = buildGoalsSection({ userGoals, companyGoals });
  const periodGuidance =
    period === PWB_PERIODS.YEARLY
      ? "This is a yearly review - write a comprehensive narrative covering the full scope of the work below, suitable to adapt directly into a formal PWB self-assessment."
      : period === PWB_PERIODS.MID_YEAR
        ? "This is a mid-year check-in - focus on progress against annual goals so far, and what adjustments (if any) make sense for the second half."
        : "This is a quarterly check-in - focus on recent momentum and near-term priorities rather than a full-year narrative.";

  return [
    `You are helping someone draft self-assessment language for their ${periodLabel} PWB review, based on their work on "${label}" at Lumen.
This is written in first person, as a professional but genuine self-assessment - the kind of writing someone would submit or read from in a formal review conversation, not casual notes.

${periodGuidance}

Structure it as 3-5 paragraphs of flowing prose (no bullet lists) covering:
- Key accomplishments and impact over the period
- Growth demonstrated - skills built, challenges navigated
- How the work connects to stated goals, if goals are provided below
- A candid look at what's ahead or what didn't go as planned, if the data supports that

Where the work genuinely reflects one of Lumen's 8 Cultural Behaviors (listed below for reference), you may name it naturally in a sentence - but only when the specific work actually demonstrates it, never as a checklist or forced mention of all eight.`,
    goalsSection,
    formatLumenCoreValuesBlock(),
    "Base the report ONLY on the data provided below. Do not invent metrics, names, or accomplishments not present in the data.",
  ]
    .filter(Boolean)
    .join("\n\n");
};
