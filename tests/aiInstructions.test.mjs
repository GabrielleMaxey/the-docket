import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CAREER_REPORT_TYPES,
  LUMEN_CORE_VALUES,
  PWB_PERIODS,
  AUDIENCE_CONFIGS,
  REPORT_WRITING_STYLE_RULES,
  STRENGTHS_GROWTH_INSTRUCTION,
  buildStatusReportSystemPrompt,
  buildOneOnOneSystemPrompt,
  buildPwbSystemPrompt,
  buildWeekPlanSystemPrompt,
  formatLumenCoreValuesBlock,
  isValidCareerReportType,
  isValidPwbPeriod,
} from "../server/lib/aiInstructions.mjs";

describe("isValidCareerReportType", () => {
  it("accepts the two known career report types", () => {
    assert.equal(isValidCareerReportType(CAREER_REPORT_TYPES.ONE_ON_ONE), true);
    assert.equal(isValidCareerReportType(CAREER_REPORT_TYPES.PWB), true);
  });

  it("rejects unknown, empty, and non-career types", () => {
    assert.equal(isValidCareerReportType("status"), false);
    assert.equal(isValidCareerReportType(""), false);
    assert.equal(isValidCareerReportType(undefined), false);
    assert.equal(isValidCareerReportType("ONE_ON_ONE"), false);
  });
});

describe("isValidPwbPeriod", () => {
  it("accepts all three known periods", () => {
    assert.equal(isValidPwbPeriod(PWB_PERIODS.QUARTERLY), true);
    assert.equal(isValidPwbPeriod(PWB_PERIODS.MID_YEAR), true);
    assert.equal(isValidPwbPeriod(PWB_PERIODS.YEARLY), true);
  });

  it("rejects unknown or missing periods", () => {
    assert.equal(isValidPwbPeriod("annual"), false);
    assert.equal(isValidPwbPeriod(""), false);
    assert.equal(isValidPwbPeriod(undefined), false);
    assert.equal(isValidPwbPeriod(null), false);
  });
});

describe("formatLumenCoreValuesBlock", () => {
  it("includes all 8 values by name", () => {
    const block = formatLumenCoreValuesBlock();
    for (const value of LUMEN_CORE_VALUES) {
      assert.match(block, new RegExp(value.name));
    }
    assert.equal(LUMEN_CORE_VALUES.length, 8);
  });

  it("instructs the model not to force-fit values", () => {
    assert.match(formatLumenCoreValuesBlock(), /only mention a specific value by name if/i);
  });
});

describe("STRENGTHS_GROWTH_INSTRUCTION", () => {
  it("requires both a positive and an improvement section", () => {
    assert.match(STRENGTHS_GROWTH_INSTRUCTION, /What's going well/);
    assert.match(STRENGTHS_GROWTH_INSTRUCTION, /Areas to improve/);
  });

  it("grounds both sections in data only, not personal judgments", () => {
    assert.match(STRENGTHS_GROWTH_INSTRUCTION, /ONLY on the metrics and items already in the data/);
    assert.match(STRENGTHS_GROWTH_INSTRUCTION, /Do not speculate about effort, attitude, or behavior/i);
  });
});

describe("buildOneOnOneSystemPrompt", () => {
  it("names the project and instructs bullet-point, scannable output", () => {
    const prompt = buildOneOnOneSystemPrompt({ label: "NORA", userGoals: "", companyGoals: "" });
    assert.match(prompt, /NORA/);
    assert.match(prompt, /bullet points/i);
    assert.match(prompt, /1:1/);
  });

  it("frames the report as an upward conversation with management, not a personal recap", () => {
    const prompt = buildOneOnOneSystemPrompt({ label: "NORA", userGoals: "", companyGoals: "" });
    assert.match(prompt, /management/i);
    assert.match(prompt, /skip-level/i);
    assert.match(prompt, /NOT a personal recap/i);
  });

  it("requires all five management-facing sections", () => {
    const prompt = buildOneOnOneSystemPrompt({ label: "NORA", userGoals: "", companyGoals: "" });
    assert.match(prompt, /\*\*Workload\*\*/);
    assert.match(prompt, /\*\*Consistency\*\*/);
    assert.match(prompt, /\*\*Completion rate\*\*/);
    assert.match(prompt, /\*\*Potential blockers\*\*/);
    assert.match(prompt, /\*\*Items to discuss\*\*/);
  });

  it("splits items to discuss into current and upcoming", () => {
    const prompt = buildOneOnOneSystemPrompt({ label: "NORA", userGoals: "", companyGoals: "" });
    assert.match(prompt, /right now/i);
    assert.match(prompt, /coming up/i);
  });

  it("instructs using a given completion rate exactly rather than recalculating it", () => {
    const prompt = buildOneOnOneSystemPrompt({ label: "NORA", userGoals: "", companyGoals: "" });
    assert.match(prompt, /completion rate is given directly in the data, use that exact number/i);
  });

  it("instructs treating a Backlog item with recent comment activity as active work, not a lull, and suggests a status fix", () => {
    const prompt = buildOneOnOneSystemPrompt({ label: "NORA", userGoals: "", companyGoals: "" });
    assert.match(prompt, /recent Jira comment activity despite sitting in Backlog/i);
    assert.match(prompt, /suggest moving it to a status that reflects the actual work/i);
  });

  it("instructs against manufacturing a consistency trend the data doesn't support", () => {
    const prompt = buildOneOnOneSystemPrompt({ label: "NORA", userGoals: "", companyGoals: "" });
    assert.match(prompt, /don't manufacture a trend that isn't there/i);
  });

  it("omits the goals section entirely when neither goal is provided", () => {
    const prompt = buildOneOnOneSystemPrompt({ label: "NORA", userGoals: "", companyGoals: "" });
    assert.doesNotMatch(prompt, /Your stated goals/);
    assert.doesNotMatch(prompt, /Company \/ team goals/);
  });

  it("includes only the user's goal when company goals are omitted", () => {
    const prompt = buildOneOnOneSystemPrompt({
      label: "NORA",
      userGoals: "Get promoted to senior engineer",
      companyGoals: "",
    });
    assert.match(prompt, /Your stated goals/);
    assert.match(prompt, /Get promoted to senior engineer/);
    assert.doesNotMatch(prompt, /Company \/ team goals/);
  });

  it("includes both goals and the combined-comparison instruction when both are provided", () => {
    const prompt = buildOneOnOneSystemPrompt({
      label: "NORA",
      userGoals: "Grow into tech lead",
      companyGoals: "Ship the platform migration by Q3",
    });
    assert.match(prompt, /Your stated goals/);
    assert.match(prompt, /Grow into tech lead/);
    assert.match(prompt, /Company \/ team goals/);
    assert.match(prompt, /Ship the platform migration by Q3/);
    assert.match(prompt, /don't force a connection that isn't there/);
  });

  it("always includes the Lumen core values block", () => {
    const prompt = buildOneOnOneSystemPrompt({ label: "NORA", userGoals: "", companyGoals: "" });
    assert.match(prompt, /Lumen's 8 Cultural Behaviors/);
    assert.match(prompt, /Customer Obsession/);
  });
});

describe("buildPwbSystemPrompt", () => {
  it("uses period-specific guidance for each of the three periods", () => {
    const quarterly = buildPwbSystemPrompt({ label: "NORA", period: PWB_PERIODS.QUARTERLY, userGoals: "", companyGoals: "" });
    assert.match(quarterly, /quarterly check-in/i);

    const midYear = buildPwbSystemPrompt({ label: "NORA", period: PWB_PERIODS.MID_YEAR, userGoals: "", companyGoals: "" });
    assert.match(midYear, /mid-year check-in/i);

    const yearly = buildPwbSystemPrompt({ label: "NORA", period: PWB_PERIODS.YEARLY, userGoals: "", companyGoals: "" });
    assert.match(yearly, /comprehensive narrative/i);
    assert.match(yearly, /formal PWB self-assessment/i);
  });

  it("instructs flowing prose, not bullet lists, unlike the 1:1 prompt", () => {
    const prompt = buildPwbSystemPrompt({ label: "NORA", period: PWB_PERIODS.YEARLY, userGoals: "", companyGoals: "" });
    assert.match(prompt, /no bullet lists/i);
  });

  it("includes goals when provided, matching the 1:1 prompt's goals-section behavior", () => {
    const prompt = buildPwbSystemPrompt({
      label: "NORA",
      period: PWB_PERIODS.YEARLY,
      userGoals: "Lead a cross-team initiative",
      companyGoals: "",
    });
    assert.match(prompt, /Your stated goals/);
    assert.match(prompt, /Lead a cross-team initiative/);
  });

  it("instructs treating a Backlog item with recent comment activity as real effort, and suggests a status fix", () => {
    const prompt = buildPwbSystemPrompt({ label: "NORA", period: PWB_PERIODS.QUARTERLY, userGoals: "", companyGoals: "" });
    assert.match(prompt, /recent Jira comment activity despite sitting in Backlog/i);
    assert.match(prompt, /a status update is worth doing/i);
  });

  it("always includes the Lumen core values block", () => {
    const prompt = buildPwbSystemPrompt({ label: "NORA", period: PWB_PERIODS.QUARTERLY, userGoals: "", companyGoals: "" });
    assert.match(prompt, /Lumen's 8 Cultural Behaviors/);
    assert.match(prompt, /Growth Mindset/);
  });
});

describe("buildWeekPlanSystemPrompt", () => {
  it("week plan prompt explains pre-ranked tasks", () => {
    const prompt = buildWeekPlanSystemPrompt({ focusStyle: "balance", capacityHours: 40 });
    assert.ok(prompt.includes("pre-ranked"));
    assert.ok(prompt.includes("best first"));
    assert.ok(prompt.includes("Do not invent scores or reasons"));
    assert.ok(prompt.includes("Only reference actual issue keys"));
    assert.ok(prompt.includes("Flag overdue items with"));
  });

  it("week plan prompt includes a score key built from the real weights", () => {
    const prompt = buildWeekPlanSystemPrompt({ focusStyle: "balance", capacityHours: 20 });
    assert.ok(prompt.includes("Score key"));
    assert.ok(prompt.includes("Highest 50"));
    assert.ok(prompt.includes("+30 if it blocks another open issue"));
    assert.ok(prompt.includes("+25 if due today or overdue"));
    assert.ok(prompt.includes("relative ordering"));
  });

  it("week plan prompt covers listed days, due dates, stale triage, blockers and estimates", () => {
    const prompt = buildWeekPlanSystemPrompt({ focusStyle: "balance", capacityHours: 20 });
    assert.ok(prompt.includes("Days to plan"));
    assert.ok(prompt.includes("no later than that date"));
    assert.ok(prompt.includes("more than 90 days"));
    assert.ok(prompt.includes("blocked by <key>"));
    assert.ok(prompt.includes("suggested time to spend working on that task"));
    assert.ok(prompt.includes("state this once at the top of the plan"));
    assert.ok(prompt.includes("not an estimate of how long the task takes"));
    assert.ok(prompt.includes("15%"));
  });
});

describe("REPORT_WRITING_STYLE_RULES", () => {
  it("bans hedged numbers, vague verbs, outcome-less activity, filler and invented specifics, with examples", () => {
    for (const phrase of ["approximately 12", "worked on", "made progress on", "Reviewed <item>", "It is worth noting that", "never estimate"]) {
      assert.ok(REPORT_WRITING_STYLE_RULES.includes(phrase), phrase);
    }
    assert.ok(REPORT_WRITING_STYLE_RULES.includes("at least 12"));
  });

  it("is part of the status, 1:1 and PWB report prompts", () => {
    const prompts = [
      buildStatusReportSystemPrompt({ label: "X" }),
      buildOneOnOneSystemPrompt({ label: "X", userGoals: "", companyGoals: "" }),
      buildPwbSystemPrompt({ label: "X", period: PWB_PERIODS.QUARTERLY, userGoals: "", companyGoals: "" }),
    ];
    for (const prompt of prompts) assert.ok(prompt.includes(REPORT_WRITING_STYLE_RULES));
  });

  it("status report prompt still opens with its original instruction", () => {
    assert.ok(buildStatusReportSystemPrompt({ label: "X" }).startsWith("You are writing a personal project status report"));
  });

  it("audience configs are untouched (the rules are added where the audience prompt is assembled)", () => {
    assert.ok(Object.values(AUDIENCE_CONFIGS).every((c) => !c.instruction.includes("Writing style rules")));
  });
});
