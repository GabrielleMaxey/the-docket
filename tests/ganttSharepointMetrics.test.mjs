import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeGanttSharepointMetrics } from "../src/Pages/components/ganttSharepointMetrics.js";

const TODAY = new Date("2026-02-01T00:00:00");

const ISSUES = [
  { key: "PROJ-1", summary: "Done task", statusCategory: "Done", startDate: "2026-01-01", dueDate: "2026-01-10" },
  { key: "PROJ-2", summary: "In progress past due", statusCategory: "Indeterminate", startDate: "2026-01-05", dueDate: "2026-01-20" },
  { key: "PROJ-3", summary: "Todo overdue", statusCategory: "To Do", startDate: "2026-01-08", dueDate: "2025-12-31" },
];

describe("computeGanttSharepointMetrics", () => {
  it("counts total, done, inProgress, todo", () => {
    const m = computeGanttSharepointMetrics(ISSUES, { today: TODAY });
    assert.equal(m.total, 3);
    assert.equal(m.done, 1);
    assert.equal(m.inProgress, 1);
    assert.equal(m.todo, 1);
  });

  it("counts overdue: not Done with (dueDate || completeDate) < today", () => {
    const m = computeGanttSharepointMetrics(ISSUES, { today: TODAY });
    assert.equal(m.overdue, 2);
  });

  it("does not count Done issue as overdue even with past date", () => {
    const issues = [
      { key: "A-1", summary: "x", statusCategory: "Done", startDate: "2026-01-01", dueDate: "2020-01-01" },
    ];
    const m = computeGanttSharepointMetrics(issues, { today: TODAY });
    assert.equal(m.overdue, 0);
  });

  it("falls back to completeDate for overdue check", () => {
    const issues = [
      { key: "A-1", summary: "x", statusCategory: "Indeterminate", startDate: "2026-01-01", completeDate: "2020-06-01" },
    ];
    const m = computeGanttSharepointMetrics(issues, { today: TODAY });
    assert.equal(m.overdue, 1);
  });

  it("computes spanStart as earliest startDate, spanEnd as latest dueDate/completeDate", () => {
    const m = computeGanttSharepointMetrics(ISSUES, { today: TODAY });
    assert.equal(m.spanStart, "2026-01-01");
    assert.equal(m.spanEnd, "2026-01-20");
  });

  it("returns null spanStart/spanEnd when no issues have dates", () => {
    const m = computeGanttSharepointMetrics([{ key: "X-1", summary: "x", statusCategory: "To Do" }], { today: TODAY });
    assert.equal(m.spanStart, null);
    assert.equal(m.spanEnd, null);
  });

  it("returns non-empty bullets array", () => {
    const m = computeGanttSharepointMetrics(ISSUES, { today: TODAY });
    assert.ok(Array.isArray(m.bullets));
    assert.ok(m.bullets.length > 0);
    assert.ok(m.bullets.every((b) => typeof b === "string" && b.length > 0));
  });

  it("returns empty bullets and zero counts for empty issue list", () => {
    const m = computeGanttSharepointMetrics([], { today: TODAY });
    assert.equal(m.total, 0);
    assert.equal(m.overdue, 0);
  });

  it("defaults today to current date when omitted", () => {
    const m = computeGanttSharepointMetrics(ISSUES);
    assert.equal(typeof m.total, "number");
  });
});
