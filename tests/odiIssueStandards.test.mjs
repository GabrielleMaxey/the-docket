import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isJobStorySummary,
  isImperativeSubtaskTitle,
  isStoryIssueTypeName,
  partitionOdiStandardsErrors,
  validateBugDescription,
  validateOdiIssueCreate,
} from "../shared/odiIssueStandards.mjs";
import { isEpicIssueType } from "../shared/dashboardMetrics.mjs";

describe("issue type family matching", () => {
  it("recognizes ODI epic variants", () => {
    assert.equal(isEpicIssueType("Epic"), true);
    assert.equal(isEpicIssueType("Epic (Feature)"), true);
    assert.equal(isEpicIssueType("Story"), false);
  });

  it("recognizes ODI story variants", () => {
    assert.equal(isStoryIssueTypeName("Story"), true);
    assert.equal(isStoryIssueTypeName("Story (User Story)"), true);
    assert.equal(isStoryIssueTypeName("Epic (Feature)"), false);
  });
});

describe("isJobStorySummary", () => {
  it("accepts valid job story titles", () => {
    assert.equal(
      isJobStorySummary(
        "When I refresh the dashboard, I want overdue tasks highlighted, so I can prioritize my week."
      ),
      true
    );
  });

  it("rejects non-job-story titles", () => {
    assert.equal(isJobStorySummary("Add dashboard overdue highlight"), false);
    assert.equal(isJobStorySummary("When something happens"), false);
  });
});

describe("isImperativeSubtaskTitle", () => {
  it("accepts imperative sub-task titles", () => {
    assert.equal(isImperativeSubtaskTitle("Configure LDAP sync"), true);
  });

  it("rejects job-story-like sub-task titles", () => {
    assert.equal(
      isImperativeSubtaskTitle("When user logs in, I want sync enabled, so I can test."),
      false
    );
  });
});

describe("validateBugDescription", () => {
  it("requires structured bug descriptions", () => {
    assert.equal(validateBugDescription(""), "Bug description is required.");
    assert.equal(
      validateBugDescription("Broken"),
      "Bug description is too short. Include what is broken, reproduction steps, and expected vs actual behavior."
    );
    assert.equal(
      validateBugDescription("x".repeat(50)),
      "Bug description should use labeled sections or hyphen bullets (reproduction, expected vs actual, environment)."
    );
    assert.equal(
      validateBugDescription(
        "Login fails for SSO users.\n\nSteps to reproduce:\n- Open login\n- Choose SSO"
      ),
      null
    );
  });
});

describe("validateOdiIssueCreate", () => {
  it("enforces story standards", () => {
    const result = validateOdiIssueCreate({
      issueType: "Story",
      summary: "Add login feature",
      description: "Need login",
      epicKey: "",
      assignee: "alice@example.com",
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((item) => item.includes("Job Story")));
    assert.ok(result.errors.some((item) => item.includes("not assigned")));
    assert.ok(result.errors.some((item) => item.includes("Epic parent")));
  });

  it("accepts a valid story create payload", () => {
    const result = validateOdiIssueCreate({
      issueType: "Story",
      summary:
        "When SSO users sign in, I want session timeout handled, so I can stay authenticated safely.",
      description:
        "SSO sessions expire without warning.\n\nAsk:\n- Extend session handling\n\nGoal / outcome:\n- Users remain signed in during active work",
      epicKey: "PROJ-1000",
      assignee: "",
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("enforces sub-task standards", () => {
    const result = validateOdiIssueCreate({
      issueType: "Task",
      summary: "When X, I want Y, so I can Z.",
      epicKey: "PROJ-2000",
      isSubtask: true,
      parentRole: "story",
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((item) => item.includes("imperative")));
  });

  it("requires bug epic parent and priority", () => {
    const result = validateOdiIssueCreate({
      issueType: "Bug",
      summary: "Login fails",
      description: "Login fails for SSO users.\n\nSteps to reproduce:\n- Open login\n- Choose SSO",
      epicKey: "PROJ-3000",
      parentRole: "story",
      priority: "",
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((item) => item.includes("Epic only")));
    assert.ok(result.errors.some((item) => item.includes("priority")));
  });

  it("requires standalone tasks to use a story parent", () => {
    const result = validateOdiIssueCreate({
      issueType: "Task",
      summary: "Configure LDAP sync",
      epicKey: "PROJ-4000",
      parentRole: "epic",
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((item) => item.includes("Story parent")));
  });

  it("allows skipping description standards while keeping hard checks", () => {
    const result = validateOdiIssueCreate({
      issueType: "Bug",
      summary: "Login fails",
      description: "too short",
      epicKey: "PROJ-3000",
      parentRole: "epic",
      priority: "High",
      skipDescriptionStandards: true,
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("partitions description errors from hard standards errors", () => {
    const { descriptionErrors, hardErrors } = partitionOdiStandardsErrors([
      "Bug description is too short. Include what is broken, reproduction steps, and expected vs actual behavior.",
      "Bug priority is required (Low, Medium, High, or Critical).",
    ]);

    assert.equal(descriptionErrors.length, 1);
    assert.equal(hardErrors.length, 1);
    assert.match(descriptionErrors[0], /description/i);
    assert.match(hardErrors[0], /priority/i);
  });
});
