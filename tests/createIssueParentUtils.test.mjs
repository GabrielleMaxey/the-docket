import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildQueryIssueParentError,
  isValidOdiIssueKey,
  resolveManualKeyOutcome,
  resolveQueryIssueParent,
} from "../shared/createIssueParentUtils.mjs";

describe("createIssueParentUtils", () => {
  it("validates ODI issue key format", () => {
    assert.equal(isValidOdiIssueKey("ODI-123"), true);
    assert.equal(isValidOdiIssueKey("odi-123"), true);
    assert.equal(isValidOdiIssueKey("bad"), false);
  });

  it("resolves manual epic key for story create in parent mode", () => {
    const outcome = resolveManualKeyOutcome({
      issue: { isEpic: true, isStory: false, issueType: "Epic (Feature)" },
      issueType: "Bug",
      key: "ODI-23263",
      mode: "parent",
    });
    assert.equal(outcome.kind, "direct-parent");
    assert.equal(outcome.parentKey, "ODI-23263");
    assert.equal(outcome.parentRole, "epic");
  });

  it("loads epic options for manual preset epic key", () => {
    const outcome = resolveManualKeyOutcome({
      issue: { isEpic: true, isStory: false, issueType: "Epic (Feature)" },
      issueType: "Story",
      key: "ODI-100",
      mode: "preset",
    });
    assert.equal(outcome.kind, "load-epic-options");
    assert.equal(outcome.epicKey, "ODI-100");
  });

  it("resolves query issue parent from chain data", () => {
    const resolved = resolveQueryIssueParent({
      selectedQueryIssueKey: "ODI-101",
      issueType: "Task",
      chains: [
        {
          issueKey: "ODI-101",
          storyKey: "ODI-200",
          epicKey: "ODI-300",
        },
      ],
    });
    assert.equal(resolved?.parentKey, "ODI-200");
    assert.equal(resolved?.parentRole, "story");
  });

  it("builds query issue parent errors by issue type", () => {
    assert.match(buildQueryIssueParentError("ODI-1", "Task"), /Story parent/);
    assert.match(buildQueryIssueParentError("ODI-1", "Bug"), /Epic parent/);
  });
});
