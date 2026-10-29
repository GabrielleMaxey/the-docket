import test from "node:test";
import assert from "node:assert/strict";
import { buildWeekPlanProjects, isIssueOpen } from "../src/utils/weekPlanProjects.js";

const NOW = new Date("2026-10-28T12:00:00Z");
const UPDATED = "2026-10-27T12:00:00Z";

const issue = (key, { status = "To Do", priority = "Medium", duedate, summary = `Summary ${key}`, extra = {} } = {}) => ({
  key,
  fields: {
    summary,
    status: { name: status },
    priority: { name: priority },
    updated: UPDATED,
    ...(duedate ? { duedate } : {}),
    assignee: { displayName: "Pat" },
    ...extra,
  },
});

const run = (issues, extra = {}) => ({ label: "Run A", jql: "project = X", issues, ...extra });

test("ranks open tasks by score, not manual priority alone", () => {
  const a = issue("A-1", { priority: "Low" });
  const b = issue("B-1", { priority: "Highest", duedate: "2026-10-20" });
  const [p] = buildWeekPlanProjects([run([a, b])], { "A-1": 1, "B-1": 20 }, { now: NOW });
  assert.deepEqual(p.tasks.map((t) => t.key), ["B-1", "A-1"]);
  for (const t of p.tasks) {
    assert.equal(typeof t.score, "number");
    assert.ok(Array.isArray(t.why) && t.why.length > 0);
  }
});

test("closed issues excluded and counted", () => {
  const [p] = buildWeekPlanProjects([run([issue("A-1"), issue("A-2", { status: "Done" })])], {}, { now: NOW });
  assert.deepEqual(p.tasks.map((t) => t.key), ["A-1"]);
  assert.equal(p.total, 2);
  assert.equal(p.open, 1);
});

test("caps at ten", () => {
  const issues = Array.from({ length: 12 }, (_, n) => issue(`A-${n + 1}`));
  const [p] = buildWeekPlanProjects([run(issues)], {}, { now: NOW });
  assert.equal(p.tasks.length, 10);
  assert.equal(p.open, 12);
});

test("does not mutate manual priorities", () => {
  const priorities = { "A-1": "5", "A-2": 25, "A-3": 0 };
  const before = JSON.parse(JSON.stringify(priorities));
  buildWeekPlanProjects([run([issue("A-1"), issue("A-2"), issue("A-3")])], priorities, { now: NOW });
  assert.deepEqual(priorities, before);
});

test("uses run due-date context", () => {
  const child = issue("A-1", { extra: { parent: { key: "P-1" }, customfield_1: null } });
  const [p] = buildWeekPlanProjects(
    [run([child], { mrdFieldId: "customfield_1", parentMostRecentDoneDateByKey: { "P-1": "2026-10-01" } })],
    {},
    { now: NOW },
  );
  assert.ok(p.tasks[0].why.some((r) => r.startsWith("Overdue")));
});

test("flattened issue shape", () => {
  const flat = { key: "F-1", summary: "Flat one", status: "In Progress", assignee: "X" };
  const [p] = buildWeekPlanProjects([run([flat])], {}, { now: NOW });
  assert.equal(p.tasks[0].status, "In Progress");
  assert.equal(p.tasks[0].summary, "Flat one");
  assert.equal(p.tasks[0].assignee, "X");
  assert.ok(p.tasks[0].why.some((r) => r.startsWith("In Progress")));
});

test("skips unconfigured runs and empty runs", () => {
  const projects = buildWeekPlanProjects(
    [run([issue("A-1")]), run([issue("B-1")], { label: "", jql: "" }), run([], { label: "Empty" })],
    {},
    { now: NOW },
  );
  assert.equal(projects.length, 1);
  assert.equal(projects[0].label, "Run A");
});

test("empty open set", () => {
  const [p] = buildWeekPlanProjects([run([issue("A-1", { status: "Closed" }), issue("A-2", { status: "Done" })])], {}, { now: NOW });
  assert.deepEqual(p.tasks, []);
  assert.equal(p.open, 0);
  assert.equal(p.total, 2);
});

test("isIssueOpen, overdue count and label fallback preserved", () => {
  assert.equal(isIssueOpen({ status: "Resolved" }), false);
  assert.equal(isIssueOpen({ fields: { status: { name: "In Progress" } } }), true);
  const open = issue("A-1", { duedate: "2020-01-01" });
  const closed = issue("A-2", { status: "Done", duedate: "2020-01-01" });
  const [p, q] = buildWeekPlanProjects([{ jql: "x", label: "L", issues: [open, closed] }, { isDrillDown: true, index: 2, issues: [open] }], {}, { now: NOW });
  assert.equal(p.overdue, 1);
  assert.equal(q.label, "Run 3");
  assert.equal(p.tasks[0].isOverdue, true);
});

test("overdue comes from effective due date (metrics-page rule), not a stored flag", () => {
  const past = issue("A-1", { duedate: "2020-01-01" });
  const future = issue("A-2", { duedate: "2999-01-01" });
  const noDue = issue("A-3");
  const flagged = { ...issue("A-4"), isOverdue: true }; // stale flag must be ignored
  const [p] = buildWeekPlanProjects([run([past, future, noDue, flagged])], {}, { now: NOW });
  assert.equal(p.overdue, 1);
  const byKey = Object.fromEntries(p.tasks.map((t) => [t.key, t.isOverdue]));
  assert.deepEqual(byKey, { "A-1": true, "A-2": false, "A-3": false, "A-4": false });
});

test("unsaved due date typed in the results table counts without updating Jira", () => {
  const a = issue("A-1", { duedate: "2999-01-01" });
  const b = issue("A-2", { duedate: "2999-01-01" });
  const c = issue("A-3", { duedate: "2999-01-01" });
  const drafts = { "A-1": "2020-01-01", "A-2": "", "A-3": "garbage" };
  const [p] = buildWeekPlanProjects([run([a, b, c])], {}, { now: NOW, dueDateDrafts: drafts });
  assert.equal(p.overdue, 1);
  assert.equal(p.tasks[0].key, "A-1");
  assert.equal(p.tasks[0].isOverdue, true);
  assert.ok(p.tasks[0].why.some((w) => w.startsWith("Overdue")));
  assert.equal(a.fields.duedate, "2999-01-01"); // input not mutated
});
