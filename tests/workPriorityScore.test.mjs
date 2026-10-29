import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PRIORITY_WEIGHTS, rankIssues, scoreIssue, toScoringInput } from "../shared/workPriorityScore.mjs";

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

  it("labels due-today as Due today and earlier dates as Overdue", () => {
    const today = scoreIssue({ dueDate: "2026-10-28" }, { now });
    assert.ok(today.reasons.includes("Due today (+25)"));
    assert.ok(!today.reasons.some((r) => r.startsWith("Overdue")));
    const past = scoreIssue({ dueDate: "2026-10-27" }, { now });
    assert.ok(past.reasons.includes("Overdue (+25)"));
    assert.ok(!past.reasons.some((r) => r.startsWith("Due today")));
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

const link = (side, typeName, key, status) => ({
  type: { outward: "blocks", inward: "is blocked by", [side === "outwardIssue" ? "outward" : "inward"]: typeName },
  [side]: key === undefined ? {} : { key, fields: { status: typeof status === "string" ? { name: status } : status } },
});

describe("toScoringInput", () => {
  it("reads standard Jira shape", () => {
    const issue = {
      key: "A-1",
      fields: { priority: { name: "High" }, status: { name: "In Progress" }, updated: "2026-10-20T00:00:00Z" },
    };
    const r = toScoringInput(issue, { effectiveDueDate: "2026-10-30", manualPriority: 3 });
    assert.equal(r.key, "A-1");
    assert.equal(r.jiraPriority, "High");
    assert.equal(r.status, "In Progress");
    assert.equal(r.updated, "2026-10-20T00:00:00Z");
    assert.equal(r.dueDate, "2026-10-30");
    assert.equal(r.manualPriority, 3);
    assert.equal(r.blocks, false);
    assert.equal(r.blockedBy, false);
  });

  it("flattened shape fallback", () => {
    const r = toScoringInput({ key: "A-1", status: "In Progress", summary: "x" });
    assert.equal(r.status, "In Progress");
    assert.equal(r.key, "A-1");
    assert.equal(r.blocks, false);
    assert.doesNotThrow(() => toScoringInput({}));
    assert.doesNotThrow(() => toScoringInput(null));
  });

  it("blocks flag", () => {
    const open = toScoringInput({ key: "A-1", fields: { issuelinks: [link("outwardIssue", "blocks", "B-1", "In Progress")] } });
    assert.equal(open.blocks, true);
    assert.equal(open.blockedBy, false);
    const done = toScoringInput({ key: "A-1", fields: { issuelinks: [link("outwardIssue", "blocks", "B-1", "Done")] } });
    assert.equal(done.blocks, false);
    const cat = toScoringInput({
      key: "A-1",
      fields: { issuelinks: [link("outwardIssue", "blocks", "B-1", { name: "Whatever", statusCategory: { key: "done" } })] },
    });
    assert.equal(cat.blocks, false);
  });

  it("blockedBy flag", () => {
    const r = toScoringInput({ key: "A-1", fields: { issuelinks: [link("inwardIssue", " Is Blocked By ", "B-1", "Backlog")] } });
    assert.equal(r.blockedBy, true);
    assert.equal(r.blocks, false);
  });

  it("custom link names", () => {
    const issue = { key: "A-1", fields: { issuelinks: [link("outwardIssue", "depends on", "B-1", "Backlog")] } };
    const custom = toScoringInput(issue, { weights: { blockerLinkNames: { blocks: ["depends on"], blockedBy: [] } } });
    assert.equal(custom.blocks, true);
    const dflt = toScoringInput(issue);
    assert.equal(dflt.blocks, false);
    assert.equal(dflt.blockedBy, false);
    assert.ok(Number.isFinite(scoreIssue(dflt, { now }).score));
  });

  it("malformed links ignored", () => {
    const links = [
      { type: { outward: "blocks", inward: "is blocked by" } },
      { type: { outward: "blocks" }, outwardIssue: { fields: { status: { name: "Open" } } } },
      null,
      "x",
      { outwardIssue: { key: "B-1" } },
    ];
    const r = toScoringInput({ key: "A-1", fields: { issuelinks: links } });
    assert.equal(r.blocks, false);
    assert.equal(r.blockedBy, false);
    for (const issuelinks of [null, "nope", {}, 5]) {
      const x = toScoringInput({ key: "A-1", fields: { issuelinks } });
      assert.equal(x.blocks, false);
      assert.equal(x.blockedBy, false);
    }
  });

  it("does not mutate the issue", () => {
    const issue = { key: "A-1", fields: { status: { name: "Open" }, issuelinks: [link("outwardIssue", "blocks", "B-1", "Open")] } };
    const copy = structuredClone(issue);
    toScoringInput(issue, { manualPriority: 2 });
    assert.deepEqual(issue, copy);
  });
});

describe("rankIssues", () => {
  const base = { status: "In Progress" };
  it("orders by score then manual, due, key", () => {
    const inputs = [
      { ...base, key: "A-3", jiraPriority: "Lowest", manualPriority: null, dueDate: null },
      { ...base, key: "A-2", jiraPriority: "High" },
      { ...base, key: "A-1", jiraPriority: "High" },
      { ...base, key: "Z-9", jiraPriority: "Highest", manualPriority: 1 },
    ];
    const out = rankIssues(inputs, { now });
    assert.deepEqual(out.map((i) => i.key), ["Z-9", "A-1", "A-2", "A-3"]);
    for (const item of out) {
      assert.equal(typeof item.score, "number");
      assert.ok(item.components);
      assert.ok(Array.isArray(item.reasons));
    }
  });

  it("breaks ties by manual priority, then due date, then key", () => {
    const t = (key, extra) => ({ ...base, key, jiraPriority: "Medium", ...extra });
    const tied = [
      t("A-4", { manualPriority: null, dueDate: null }),
      t("A-3", { manualPriority: null, dueDate: null }),
      t("A-2", { manualPriority: null, dueDate: null }),
      t("A-1", { manualPriority: null, dueDate: null }),
    ];
    assert.deepEqual(rankIssues(tied, { now }).map((i) => i.key), ["A-1", "A-2", "A-3", "A-4"]);
    // zero the manual/due weights so scores tie and only the tiebreakers decide
    const w = { manual: { max: 0 }, due: { overdue: 0, soon: 0 } };
    const mixed = [
      t("A-1", { manualPriority: null, dueDate: "2026-10-01" }),
      t("A-2", { manualPriority: 5, dueDate: null }),
      t("A-3", { manualPriority: null, dueDate: "2026-10-02" }),
      t("A-4", { manualPriority: null, dueDate: null }),
      t("A-0", { manualPriority: 9, dueDate: "2026-12-01" }),
    ];
    const out = rankIssues(mixed, { now, weights: w });
    assert.deepEqual(out.map((i) => i.key), ["A-2", "A-0", "A-1", "A-3", "A-4"]);
  });

  it("does not mutate inputs and is deterministic", () => {
    const inputs = [
      { ...base, key: "A-2", jiraPriority: "High" },
      { ...base, key: "A-1", jiraPriority: "Low" },
    ];
    const copy = structuredClone(inputs);
    const first = rankIssues(inputs, { now });
    const second = rankIssues(inputs, { now });
    assert.deepEqual(inputs, copy);
    assert.notEqual(first, inputs);
    assert.deepEqual(first, second);
    assert.equal("score" in inputs[0], false);
    assert.deepEqual(rankIssues([], { now }), []);
    assert.deepEqual(rankIssues(undefined, { now }), []);
  });
});
