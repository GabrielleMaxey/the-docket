import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_JQLS,
  DEFAULT_JQL_LABELS,
  buildSharedProgramJql,
  buildSharedProgramJqlWithDescendants,
  shouldReplaceSlotQueryForSharedProgram,
} from "../src/utils/workWeekStorage.js";

describe("buildSharedProgramJql", () => {
  it("builds parent-or-key JQL from epic roots", () => {
    assert.equal(
      buildSharedProgramJql(["ODI-23957", "odi-18520"]),
      "(parent in (ODI-23957, ODI-18520) OR key in (ODI-23957, ODI-18520)) ORDER BY updated DESC"
    );
  });

  it("returns empty string when there are no roots", () => {
    assert.equal(buildSharedProgramJql([]), "");
  });
});

describe("buildSharedProgramJqlWithDescendants", () => {
  it("adds a parent-in clause for direct children so their subtasks are reachable too", () => {
    assert.equal(
      buildSharedProgramJqlWithDescendants(["ODI-23957"], ["ODI-23958", "odi-23993"]),
      "(parent in (ODI-23957) OR key in (ODI-23957) OR parent in (ODI-23958, ODI-23993)) ORDER BY updated DESC"
    );
  });

  it("falls back to the direct-children-only JQL when no child keys are known", () => {
    assert.equal(
      buildSharedProgramJqlWithDescendants(["ODI-23957"], []),
      "(parent in (ODI-23957) OR key in (ODI-23957)) ORDER BY updated DESC"
    );
  });

  it("returns empty string when there are no epic roots, regardless of child keys", () => {
    assert.equal(buildSharedProgramJqlWithDescendants([], ["ODI-1"]), "");
  });

  it("dedupes and uppercases child keys", () => {
    assert.equal(
      buildSharedProgramJqlWithDescendants(["ODI-1"], ["odi-2", "ODI-2", "ODI-3"]),
      "(parent in (ODI-1) OR key in (ODI-1) OR parent in (ODI-2, ODI-3)) ORDER BY updated DESC"
    );
  });
});

describe("shouldReplaceSlotQueryForSharedProgram", () => {
  it("replaces default slot 0 query and label", () => {
    const result = shouldReplaceSlotQueryForSharedProgram({
      jql: DEFAULT_JQLS[0],
      label: DEFAULT_JQL_LABELS[0],
      index: 0,
    });
    assert.equal(result.replaceJql, true);
    assert.equal(result.replaceLabel, true);
  });

  it("keeps a custom preset query", () => {
    const result = shouldReplaceSlotQueryForSharedProgram({
      jql: "parent = ODI-1",
      label: "Custom",
      index: 0,
    });
    assert.equal(result.replaceJql, false);
    assert.equal(result.replaceLabel, false);
  });

  it("replaces the previous program query when switching programs", () => {
    const previous = buildSharedProgramJql(["ODI-23957"]);
    const result = shouldReplaceSlotQueryForSharedProgram({
      jql: previous,
      label: "NORA",
      index: 0,
      previousGeneratedJql: previous,
      previousLabel: "NORA",
    });
    assert.equal(result.replaceJql, true);
    assert.equal(result.replaceLabel, true);
  });
});
