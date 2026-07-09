import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildParentCandidatesFromIssues,
  buildParentDropdownFromCandidates,
} from "../shared/jiraParentCandidates.mjs";

describe("buildParentCandidatesFromIssues", () => {
  it("walks parent chains from tasks to stories and epics", () => {
    const candidates = buildParentCandidatesFromIssues([
      { key: "ODI-300", summary: "Platform Epic", issueType: "Epic", parentKey: "" },
      { key: "ODI-200", summary: "Auth Story", issueType: "Story", parentKey: "ODI-300" },
      { key: "ODI-101", summary: "Configure SSO", issueType: "Task", parentKey: "ODI-200" },
    ]);

    assert.equal(candidates.epics.length, 1);
    assert.equal(candidates.epics[0].key, "ODI-300");
    assert.equal(candidates.stories.length, 1);
    assert.equal(candidates.stories[0].key, "ODI-200");
    assert.equal(candidates.stories[0].epicKey, "ODI-300");
    assert.match(candidates.chains[0].chainLabel, /ODI-101.*ODI-200.*ODI-300/);
  });

  it("builds parent dropdown options by issue type", () => {
    const candidates = buildParentCandidatesFromIssues([
      { key: "ODI-300", summary: "Epic", issueType: "Epic", parentKey: "" },
      { key: "ODI-200", summary: "Story", issueType: "Story", parentKey: "ODI-300" },
    ]);

    assert.equal(
      buildParentDropdownFromCandidates({ candidates, issueType: "Story" })[0].value,
      "ODI-300"
    );
    assert.equal(
      buildParentDropdownFromCandidates({ candidates, issueType: "Task" })[0].value,
      "ODI-200"
    );
  });
});
