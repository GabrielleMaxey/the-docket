import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAiHelperIntakePrompt,
  createEmptyAiHelperIntake,
  getAiHelperIntakeFields,
  getRequiredAiHelperIntakeFields,
  hasAiHelperIntakeAnswers,
  listBlankOptionalIntakeFields,
  normalizeAiHelperIntake,
  validateAiHelperIntake,
} from "../shared/aiHelperIntake.mjs";
import { buildAiDraftSystemPrompt, buildAiDraftUserPrompt } from "../server/lib/aiInstructions.mjs";

const storyIntake = {
  asA: "NORA customer",
  iWant: "to rate my NORA interaction in one tap",
  soThat: "I can give feedback without filling out a form",
};

describe("intake field sets", () => {
  it("requires only the basic ask on a Story", () => {
    const required = getRequiredAiHelperIntakeFields("Story").map((field) => field.id);
    assert.deepEqual(required, ["asA", "iWant", "soThat"]);
  });

  it("gives Bugs and Tasks their own question sets", () => {
    assert.deepEqual(
      getRequiredAiHelperIntakeFields("Bug").map((field) => field.id),
      ["whatBroke", "expected", "actual"]
    );
    assert.deepEqual(
      getRequiredAiHelperIntakeFields("Task").map((field) => field.id),
      ["whatNeedsDoing", "whyItMatters"]
    );
  });

  it("falls back to the Task field set for unknown issue types", () => {
    assert.deepEqual(getAiHelperIntakeFields("Epic"), getAiHelperIntakeFields("Task"));
  });

  it("creates a blank value for every field", () => {
    const empty = createEmptyAiHelperIntake("Story");
    assert.equal(Object.keys(empty).length, getAiHelperIntakeFields("Story").length);
    assert.ok(Object.values(empty).every((value) => value === ""));
    assert.equal(hasAiHelperIntakeAnswers("Story", empty), false);
  });
});

describe("normalizeAiHelperIntake", () => {
  it("trims answers and drops blanks", () => {
    const normalized = normalizeAiHelperIntake("Story", {
      asA: "  NORA customer  ",
      iWant: "",
      goalWhy: "   ",
    });
    assert.deepEqual(normalized, { asA: "NORA customer" });
  });

  it("drops keys that do not belong to the issue type", () => {
    const normalized = normalizeAiHelperIntake("Task", {
      whatNeedsDoing: "Add the footer template",
      whyItMatters: "Nothing to tap without it",
      asA: "NORA customer",
    });
    assert.deepEqual(Object.keys(normalized).sort(), ["whatNeedsDoing", "whyItMatters"]);
  });

  it("tolerates missing input", () => {
    assert.deepEqual(normalizeAiHelperIntake("Story", null), {});
    assert.deepEqual(normalizeAiHelperIntake("Story", undefined), {});
  });
});

describe("validateAiHelperIntake", () => {
  it("passes when the basic ask is answered and everything else is blank", () => {
    const result = validateAiHelperIntake("Story", storyIntake);
    assert.equal(result.valid, true);
    assert.deepEqual(result.missingFieldIds, []);
    assert.deepEqual(result.errors, []);
  });

  it("reports each missing required field", () => {
    const result = validateAiHelperIntake("Story", { asA: "NORA customer" });
    assert.equal(result.valid, false);
    assert.deepEqual(result.missingFieldIds, ["iWant", "soThat"]);
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors[0].includes("I want"));
  });

  it("treats whitespace-only answers as missing", () => {
    const result = validateAiHelperIntake("Story", { ...storyIntake, soThat: "   " });
    assert.equal(result.valid, false);
    assert.deepEqual(result.missingFieldIds, ["soThat"]);
  });
});

describe("listBlankOptionalIntakeFields", () => {
  it("lists optional prompts the author skipped", () => {
    const blank = listBlankOptionalIntakeFields("Story", storyIntake).map((field) => field.id);
    assert.ok(blank.includes("goalWhy"));
    assert.ok(blank.includes("outOfScope"));
    assert.ok(!blank.includes("asA"), "required fields are never listed as skipped optional ones");
  });

  it("omits optional prompts that were answered", () => {
    const blank = listBlankOptionalIntakeFields("Story", {
      ...storyIntake,
      goalWhy: "Response rates are at historic lows",
    }).map((field) => field.id);
    assert.ok(!blank.includes("goalWhy"));
  });
});

describe("buildAiHelperIntakePrompt", () => {
  it("returns an empty block when nothing was answered", () => {
    assert.equal(buildAiHelperIntakePrompt("Story", createEmptyAiHelperIntake("Story")), "");
  });

  it("passes answers through verbatim under their labels", () => {
    const prompt = buildAiHelperIntakePrompt("Story", storyIntake);
    assert.ok(prompt.includes("- As a: NORA customer"));
    assert.ok(prompt.includes("- I want: to rate my NORA interaction in one tap"));
    assert.ok(prompt.includes("- So that: I can give feedback without filling out a form"));
  });

  it("names blank prompts and forbids inventing content for them", () => {
    const prompt = buildAiHelperIntakePrompt("Story", storyIntake);
    assert.ok(prompt.includes("The author left these blank:"));
    assert.ok(prompt.includes("Out of scope"));
    assert.ok(prompt.includes("Do not invent content for the blank prompts."));
  });

  it("omits the blank-prompt warning when every field is answered", () => {
    const filled = {};
    for (const field of getAiHelperIntakeFields("Task")) {
      filled[field.id] = `answer for ${field.id}`;
    }
    const prompt = buildAiHelperIntakePrompt("Task", filled);
    assert.ok(!prompt.includes("The author left these blank:"));
  });
});

describe("AI draft prompts with guided intake", () => {
  it("adds intake rules to the system prompt only when intake is supplied", () => {
    const withIntake = buildAiDraftSystemPrompt({ isStory: true, isBug: false, hasIntake: true });
    const withoutIntake = buildAiDraftSystemPrompt({ isStory: true, isBug: false });
    assert.ok(withIntake.includes("Guided intake rules:"));
    assert.ok(!withoutIntake.includes("Guided intake rules:"));
    assert.ok(withIntake.startsWith(withoutIntake));
  });

  it("embeds the intake block and keeps the job story title format for Stories", () => {
    const prompt = buildAiDraftUserPrompt({
      summary: "",
      context: "Epic: NORA feedback",
      isStory: true,
      isBug: false,
      intakeBlock: buildAiHelperIntakePrompt("Story", storyIntake),
    });
    assert.ok(prompt.includes("derive the title from the intake answers"));
    assert.ok(prompt.includes("- As a: NORA customer"));
    assert.ok(prompt.includes('"label": "User story"'));
    assert.ok(prompt.includes("When <situation>, I want <ask>, so I can <outcome>."));
  });

  it("asks Bugs and Tasks for a generated title when intake is supplied", () => {
    const bugPrompt = buildAiDraftUserPrompt({
      summary: "",
      isStory: false,
      isBug: true,
      intakeBlock: buildAiHelperIntakePrompt("Bug", {
        whatBroke: "Footer renders without buttons",
        expected: "Four tappable options",
        actual: "Plain text",
      }),
    });
    const taskPrompt = buildAiDraftUserPrompt({
      summary: "",
      isStory: false,
      isBug: false,
      intakeBlock: buildAiHelperIntakePrompt("Task", {
        whatNeedsDoing: "Add the footer template",
        whyItMatters: "Nothing to tap without it",
      }),
    });
    assert.ok(bugPrompt.includes('Also return "summary"'));
    assert.ok(taskPrompt.includes('Also return "summary"'));
    assert.ok(bugPrompt.includes("- What is broken: Footer renders without buttons"));
  });

  it("leaves the original prompt shape untouched without intake", () => {
    const prompt = buildAiDraftUserPrompt({
      summary: "When I resolve a ticket, I want feedback, so I can improve NORA.",
      context: "",
      isStory: true,
      isBug: false,
    });
    assert.ok(prompt.includes("Title provided: When I resolve a ticket"));
    assert.ok(!prompt.includes("Guided intake answers"));
    assert.ok(!prompt.includes('"label": "User story"'));
    assert.ok(!prompt.includes('Also return "summary"'));
  });
});
