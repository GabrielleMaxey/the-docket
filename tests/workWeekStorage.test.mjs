import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_JQLS,
  DEFAULT_JQL_LABELS,
  buildSharedProgramJql,
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
