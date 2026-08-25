import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildParentCandidatesFromIssues,
  buildParentDropdownFromCandidates,
  buildQueryIssueDropdownOptions,
  resolveParentFromChain,
} from "../shared/jiraParentCandidates.mjs";

describe("buildParentCandidatesFromIssues", () => {
  it("walks parent chains from tasks to stories and epics", () => {
    const candidates = buildParentCandidatesFromIssues([
      { key: "PROJ-300", summary: "Platform Epic", issueType: "Epic", parentKey: "" },
      { key: "PROJ-200", summary: "Auth Story", issueType: "Story", parentKey: "PROJ-300" },
      { key: "PROJ-101", summary: "Configure SSO", issueType: "Task", parentKey: "PROJ-200" },
    ]);

    assert.equal(candidates.epics.length, 1);
    assert.equal(candidates.epics[0].key, "PROJ-300");
    assert.equal(candidates.stories.length, 1);
    assert.equal(candidates.stories[0].key, "PROJ-200");
    assert.equal(candidates.stories[0].epicKey, "PROJ-300");
    assert.match(candidates.chains[0].chainLabel, /PROJ-101.*PROJ-200.*PROJ-300/);
  });

  it("resolves epics from story epic link fields", () => {
    const candidates = buildParentCandidatesFromIssues([
      {
        key: "PROJ-200",
        summary: "Auth Story",
        issueType: "Story",
        parentKey: "",
        epicLinkKey: "PROJ-300",
      },
      { key: "PROJ-101", summary: "Configure SSO", issueType: "Task", parentKey: "PROJ-200" },
    ]);

    assert.equal(candidates.epics[0].key, "PROJ-300");
    assert.equal(candidates.chains[0].epicKey, "PROJ-300");
    assert.equal(
      buildParentDropdownFromCandidates({ candidates, issueType: "Story" })[0].value,
      "PROJ-300"
    );
  });

  it("builds parent dropdown options by issue type", () => {
    const candidates = buildParentCandidatesFromIssues([
      { key: "PROJ-300", summary: "Epic", issueType: "Epic", parentKey: "" },
      { key: "PROJ-200", summary: "Story", issueType: "Story", parentKey: "PROJ-300" },
    ]);

    assert.equal(
      buildParentDropdownFromCandidates({ candidates, issueType: "Story" })[0].value,
      "PROJ-300"
    );
    assert.equal(
      buildParentDropdownFromCandidates({ candidates, issueType: "Task" })[0].value,
      "PROJ-200"
    );
  });

  it("builds selectable query issue options and resolves parents", () => {
    const candidates = buildParentCandidatesFromIssues([
      { key: "PROJ-300", summary: "Epic", issueType: "Epic", parentKey: "" },
      { key: "PROJ-200", summary: "Story", issueType: "Story", parentKey: "PROJ-300" },
      { key: "PROJ-101", summary: "Task", issueType: "Task", parentKey: "PROJ-200" },
    ]);

    const options = buildQueryIssueDropdownOptions(candidates);
    assert.equal(options[0].value, "PROJ-101");
    assert.equal(resolveParentFromChain(candidates.chains[0], "Task")?.parentKey, "PROJ-200");
    assert.equal(resolveParentFromChain(candidates.chains[0], "Story")?.parentKey, "PROJ-300");
  });
});
