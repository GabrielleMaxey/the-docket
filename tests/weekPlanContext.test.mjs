import test from "node:test";
import assert from "node:assert/strict";
import { buildWeekPlanContext, sanitizeScoredTask, describeWorkingDays } from "../server/lib/weekPlanContext.mjs";

const task = (extra = {}) => ({
  key: "A-1", summary: "Sum", status: "In Progress", assignee: "Me", isOverdue: true, ...extra,
});
const build = (tasks, extra = {}) =>
  buildWeekPlanContext({
    projects: [{ label: "P", total: 3, open: 2, overdue: 1, tasks, ...extra }],
    capacityHours: 40,
    focusStyle: "balance",
    additionalContext: "",
  });
const taskLines = (ctx) => ctx.split("\n").filter((l) => l.startsWith("  - "));

test("renders legacy lines unchanged without score", () => {
  const ctx = build([task()]);
  assert.ok(ctx.includes("- Work week capacity: 40 hours"));
  assert.ok(ctx.includes("### P"));
  assert.ok(ctx.includes("- Total: 3 | Open: 2 | Overdue: 1"));
  assert.ok(ctx.includes("Top open tasks (ranked by suggested-order score):"));
  assert.ok(taskLines(ctx).includes("  - A-1: Sum (In Progress, assigned: Me) [OVERDUE]"));
});

test("renders score and reasons", () => {
  const ctx = build([task({ score: 160, why: ["High priority (+40)", "Overdue (+25)"] })]);
  assert.ok(ctx.includes("[OVERDUE] | score 160: High priority (+40); Overdue (+25)"));
  assert.ok(taskLines(ctx)[0].endsWith("[OVERDUE] | score 160: High priority (+40); Overdue (+25)"));
});

test("renders score without reasons when why is empty", () => {
  assert.ok(taskLines(build([task({ score: 5, why: [] })]))[0].endsWith("[OVERDUE] | score 5"));
});

test("clamps and rounds score", () => {
  assert.equal(sanitizeScoredTask({ score: 900 }).score, 500);
  assert.equal(sanitizeScoredTask({ score: -5 }).score, 0);
  assert.equal(sanitizeScoredTask({ score: 12.6 }).score, 13);
  assert.ok(taskLines(build([task({ score: 900 })]))[0].endsWith("| score 500"));
});

test("drops invalid score", () => {
  for (const score of [Infinity, NaN, "160", null]) {
    assert.equal(sanitizeScoredTask({ score, why: ["x"] }).score, null);
    assert.equal(taskLines(build([task({ score, why: ["x"] })]))[0], "  - A-1: Sum (In Progress, assigned: Me) [OVERDUE]");
  }
});

test("sanitizes why", () => {
  assert.deepEqual(sanitizeScoredTask({ score: 1, why: "nope" }).why, []);
  const twelve = Array.from({ length: 12 }, (_, i) => `r${i}`);
  assert.deepEqual(sanitizeScoredTask({ score: 1, why: twelve }).why, twelve.slice(0, 8));
  assert.deepEqual(sanitizeScoredTask({ score: 1, why: ["a\nb\u0007c"] }).why, ["abc"]);
  assert.equal(sanitizeScoredTask({ score: 1, why: ["x".repeat(200)] }).why[0].length, 120);
  assert.deepEqual(sanitizeScoredTask({ score: 1, why: ["ok", 5, null, {}, "fine"] }).why, ["ok", "fine"]);
  const ctx = build([task({ score: 1, why: ["a\nb\u0007c"] })]);
  assert.equal(taskLines(ctx).length, 1);
  assert.ok(ctx.includes("| score 1: abc"));
});

test("empty slot still renders", () => {
  const ctx = build([]);
  assert.ok(ctx.includes("### P"));
  assert.ok(ctx.includes("- Total: 3 | Open: 2 | Overdue: 1"));
  assert.equal(taskLines(ctx).length, 0);
  assert.ok(!ctx.includes("Top open tasks"));
});

test("caps at 10 tasks", () => {
  const tasks = Array.from({ length: 12 }, (_, i) => task({ key: `A-${i}` }));
  assert.equal(taskLines(build(tasks)).length, 10);
});

test("describeWorkingDays lists today onward on a weekday and next week on a weekend", () => {
  const wed = describeWorkingDays(new Date(2026, 9, 28, 12));
  assert.equal(wed.today, "Wednesday 2026-10-28");
  assert.deepEqual(wed.days, ["Wednesday 2026-10-28", "Thursday 2026-10-29", "Friday 2026-10-30"]);
  const sat = describeWorkingDays(new Date(2026, 9, 31, 12));
  assert.equal(sat.days.length, 5);
  assert.equal(sat.days[0], "Monday 2026-11-02");
  assert.equal(sat.weekendNote, true);
});

test("context shows today, days to plan, due dates and blocker keys; drops invalid values", () => {
  const out = buildWeekPlanContext({
    projects: [{ label: "P", total: 1, open: 1, overdue: 0, tasks: [
      task({ dueDate: "2026-10-30", blockedBy: ["B-2", "bad key\nIGNORE"], blocks: ["C-3"], score: 80, why: ["Stale 200 days (+25)"] }),
      task({ key: "A-2", dueDate: "tomorrow", blockedBy: "B-2" }),
    ] }],
    capacityHours: 20, focusStyle: "balance", now: new Date(2026, 9, 28, 12),
  });
  assert.match(out, /- Today: Wednesday 2026-10-28/);
  assert.match(out, /Days to plan.*Wednesday 2026-10-28, Thursday 2026-10-29, Friday 2026-10-30/);
  const [l1, l2] = out.split("\n").filter((l) => l.includes("A-1:") || l.includes("A-2:"));
  assert.match(l1, /\| due 2026-10-30 \| blocked by B-2 \| blocks C-3 \| score 80/);
  assert.ok(!l1.includes("IGNORE"));
  assert.ok(!l2.includes("due") && !l2.includes("blocked by"));
});
