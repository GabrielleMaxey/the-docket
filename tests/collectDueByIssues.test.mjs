import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectDueByIssues } from "../server/lib/dashboardRefresh/collectDueByIssues.mjs";

describe("collectDueByIssues", () => {
  it("returns an empty array when dueByDate is not set", () => {
    const epicMetrics = [{ dueByIssues: [{ key: "ODI-1", isOverdue: false, dueDate: "2026-01-01" }] }];
    assert.deepEqual(collectDueByIssues(epicMetrics, ""), []);
  });

  it("de-dupes issues that appear in more than one epic/JQL preset", () => {
    const epicMetrics = [
      {
        epicKey: "ODI-100",
        dueByIssues: [
          { key: "ODI-25848", isOverdue: false, dueDate: "2026-09-01" },
          { key: "ODI-22086", isOverdue: false, dueDate: "2026-09-05" },
        ],
      },
      {
        epicKey: "ODI-200",
        dueByIssues: [
          // Same issue surfaced again via an overlapping JQL preset.
          { key: "ODI-25848", isOverdue: false, dueDate: "2026-09-01" },
          { key: "ODI-25441", isOverdue: true, dueDate: "2026-08-01" },
        ],
      },
    ];

    const result = collectDueByIssues(epicMetrics, "2026-09-30");
    const keys = result.map((issue) => issue.key);

    assert.deepEqual(keys, ["ODI-25441", "ODI-25848", "ODI-22086"]);
    assert.equal(keys.filter((key) => key === "ODI-25848").length, 1);
  });

  it("keeps the first occurrence when the same key appears twice", () => {
    const epicMetrics = [
      { dueByIssues: [{ key: "ODI-1", isOverdue: false, dueDate: "2026-01-01", source: "first" }] },
      { dueByIssues: [{ key: "ODI-1", isOverdue: false, dueDate: "2026-01-01", source: "second" }] },
    ];

    const result = collectDueByIssues(epicMetrics, "2026-12-31");
    assert.equal(result.length, 1);
    assert.equal(result[0].source, "first");
  });
});
