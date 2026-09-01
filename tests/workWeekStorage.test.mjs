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
      buildSharedProgramJql(["PROJ-23957", "proj-18520"]),
      "(parent in (PROJ-23957, PROJ-18520) OR key in (PROJ-23957, PROJ-18520)) ORDER BY updated DESC"
    );
  });

  it("returns empty string when there are no roots", () => {
    assert.equal(buildSharedProgramJql([]), "");
  });
});

describe("buildSharedProgramJqlWithDescendants", () => {
  it("adds a parent-in clause for direct children so their subtasks are reachable too", () => {
    assert.equal(
      buildSharedProgramJqlWithDescendants(["PROJ-23957"], ["PROJ-23958", "proj-23993"]),
      "(parent in (PROJ-23957) OR key in (PROJ-23957) OR parent in (PROJ-23958, PROJ-23993)) ORDER BY updated DESC"
    );
  });

  it("falls back to the direct-children-only JQL when no child keys are known", () => {
    assert.equal(
      buildSharedProgramJqlWithDescendants(["PROJ-23957"], []),
      "(parent in (PROJ-23957) OR key in (PROJ-23957)) ORDER BY updated DESC"
    );
  });

  it("returns empty string when there are no epic roots, regardless of child keys", () => {
    assert.equal(buildSharedProgramJqlWithDescendants([], ["PROJ-1"]), "");
  });

  it("dedupes and uppercases child keys", () => {
    assert.equal(
      buildSharedProgramJqlWithDescendants(["PROJ-1"], ["proj-2", "PROJ-2", "PROJ-3"]),
      "(parent in (PROJ-1) OR key in (PROJ-1) OR parent in (PROJ-2, PROJ-3)) ORDER BY updated DESC"
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
      jql: "parent = PROJ-1",
      label: "Custom",
      index: 0,
    });
    assert.equal(result.replaceJql, false);
    assert.equal(result.replaceLabel, false);
  });

  it("replaces the previous program query when switching programs", () => {
    const previous = buildSharedProgramJql(["PROJ-23957"]);
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
