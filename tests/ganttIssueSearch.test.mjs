import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterIssuesBySearch } from "../src/Pages/components/ganttIssueSearch.js";

describe("filterIssuesBySearch", () => {
  const issues = [
    { key: "ABC-1", summary: "Login redesign" },
    { key: "ABC-2", summary: "API gateway" },
  ];

  it("returns all when query empty", () => {
    assert.equal(filterIssuesBySearch(issues, "").length, 2);
    assert.equal(filterIssuesBySearch(issues, "   ").length, 2);
  });

  it("matches key case-insensitively", () => {
    assert.deepEqual(
      filterIssuesBySearch(issues, "abc-2").map((i) => i.key),
      ["ABC-2"]
    );
  });

  it("matches summary substring", () => {
    assert.deepEqual(
      filterIssuesBySearch(issues, "login").map((i) => i.key),
      ["ABC-1"]
    );
  });
});
