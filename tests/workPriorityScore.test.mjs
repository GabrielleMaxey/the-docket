import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PRIORITY_WEIGHTS, scoreIssue } from "../shared/workPriorityScore.mjs";

const now = new Date("2026-10-28T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(now.getTime() - n * DAY).toISOString();

describe("scoreIssue", () => {
  it("jira priority bands", () => {
    const cases = [
      ["Highest", 50],
      ["High", 40],
      ["Medium", 30],
      ["Low", 20],
      ["Lowest", 10],
      ["high", 40],
      ["", 30],
      [undefined, 30],
      ["Blocker-ish", 30],
    ];
    for (const [jiraPriority, expected] of cases) {
      assert.equal(scoreIssue({ jiraPriority }, { now }).components.priority, expected, String(jiraPriority));
    }
  });

  it("status bands", () => {
    for (const status of ["In Progress", "analyzing", "Ready for Verification"]) {
      assert.equal(scoreIssue({ status }, { now }).components.status, 20, status);
    }
    for (const status of ["Backlog", "Ready for Work", "Something New", undefined]) {
      assert.equal(scoreIssue({ status }, { now }).components.status, 5, String(status));
    }
  });

  it("staleness bands", () => {
    const cases = [[1, 5], [2, 5], [3, 10], [6, 10], [7, 15], [14, 15], [15, 20], [29, 20], [30, 25], [90, 25]];
    for (const [days, expected] of cases) {
      const r = scoreIssue({ status: "In Progress", updated: daysAgo(days) }, { now });
      assert.equal(r.components.staleness, expected, `${days}d`);
    }
    const future = scoreIssue({ status: "In Progress", updated: new Date(now.getTime() + 3 * DAY).toISOString() }, { now });
    assert.equal(future.components.staleness, 5);
    const garbage = scoreIssue({ status: "In Progress", updated: "garbage" }, { now });
    assert.equal(garbage.components.staleness, 0);
  });

  it("backlog staleness cap", () => {
    assert.equal(scoreIssue({ status: "Backlog", updated: daysAgo(40) }, { now }).components.staleness, 10);
    assert.equal(scoreIssue({ status: "In Progress", updated: daysAgo(40) }, { now }).components.staleness, 25);
  });

  it("due bands", () => {
    const cases = [["2026-10-27", 25], ["2026-10-28", 25], ["2026-10-29", 15], ["2026-10-30", 15], ["2026-11-02", 15], ["2026-11-03", 0], [null, 0], ["2026-13-45", 0]];
    for (const [dueDate, expected] of cases) {
      assert.equal(scoreIssue({ dueDate }, { now }).components.due, expected, String(dueDate));
    }
    const friday = new Date("2026-10-30T12:00:00Z");
    assert.equal(scoreIssue({ dueDate: "2026-11-04" }, { now: friday }).components.due, 15);
    assert.equal(scoreIssue({ dueDate: "2026-11-05" }, { now: friday }).components.due, 0);
  });

  it("blocker flags", () => {
    assert.equal(scoreIssue({ blocks: true }, { now }).components.blocker, 30);
    assert.equal(scoreIssue({ blockedBy: true }, { now }).components.blocker, 20);
    assert.equal(scoreIssue({ blocks: true, blockedBy: true }, { now }).components.blocker, 50);
    assert.equal(scoreIssue({}, { now }).components.blocker, 0);
  });

  it("manual priority", () => {
    const cases = [[1, 30], [10, Math.round((30 * 11) / 20)], [20, 2], [0, 0], [null, 0], [undefined, 0], ["abc", 0], ["5", Math.round((30 * 16) / 20)], [25, 2]];
    for (const [manualPriority, expected] of cases) {
      assert.equal(scoreIssue({ manualPriority }, { now }).components.manual, expected, String(manualPriority));
    }
    assert.equal(Math.round((30 * 11) / 20), 17);
    assert.equal(Math.round((30 * 16) / 20), 24);
  });

  it("full example", () => {
    const input = { jiraPriority: "High", status: "In Progress", updated: daysAgo(8), dueDate: "2026-10-20", blocks: true, manualPriority: 1 };
    const r = scoreIssue(input, { now });
    assert.equal(r.score, 160);
    assert.deepEqual(r.reasons, [
      "High priority (+40)",
      "In Progress (+20)",
      "Stale 8 days (+15)",
      "Overdue (+25)",
      "Blocks another open issue (+30)",
      "Manual priority 1 (+30)",
    ]);
  });

  it("empty input is neutral", () => {
    const r = scoreIssue({}, { now });
    assert.equal(r.score, 35);
    assert.equal(r.components.staleness, 0);
    assert.equal(r.reasons.length, 2);
  });

  it("does not mutate input", () => {
    const input = Object.freeze({ jiraPriority: "High", status: "Backlog", updated: daysAgo(5) });
    assert.doesNotThrow(() => scoreIssue(input, { now }));
  });

  it("weights override", () => {
    const before = JSON.stringify(DEFAULT_PRIORITY_WEIGHTS);
    const r = scoreIssue({ jiraPriority: "High" }, { now, weights: { priority: { high: 99 } } });
    assert.equal(r.components.priority, 99);
    const base = scoreIssue({ jiraPriority: "High" }, { now });
    const bogus = scoreIssue({ jiraPriority: "High" }, { now, weights: { bogus: 1 } });
    assert.deepEqual(bogus, base);
    assert.ok(Object.isFrozen(DEFAULT_PRIORITY_WEIGHTS));
    assert.ok(Object.isFrozen(DEFAULT_PRIORITY_WEIGHTS.priority));
    assert.equal(JSON.stringify(DEFAULT_PRIORITY_WEIGHTS), before);
  });
});
