import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GANTT_REPORT_TYPE, buildGanttPlanHealthMarkdown, compareGanttSnapshots, computeGanttPlanHealth, isGanttPlanHealthData,
} from "../shared/ganttPlanHealth.mjs";

const gi = (key, o = {}) => ({ key, summary: `Summary ${key}`, status: "To Do", statusCategory: "To Do", assignee: "Pat Lee", startDate: "", dueDate: "", completeDate: "", plannedStart: "", plannedFinish: "", parentKey: "", ...o });

// today = 2026-11-05. Every expected number below is calculated by hand from this fixture.
const ISSUES = [
  gi("A-1", { statusCategory: "Done", status: "Done", plannedStart: "2026-08-01", plannedFinish: "2026-08-31", startDate: "2026-08-05", completeDate: "2026-08-31", dueDate: "2026-08-31" }),
  gi("A-2", { statusCategory: "Done", status: "Done", plannedStart: "2026-09-01", plannedFinish: "2026-09-10", startDate: "2026-09-01", completeDate: "2026-09-20" }),
  gi("A-3", { statusCategory: "Done", status: "Done", dueDate: "2026-09-30", completeDate: "2026-09-25" }),
  gi("A-4", { statusCategory: "Done", status: "Done" }),
  gi("A-5", { statusCategory: "Indeterminate", status: "In Progress", dueDate: "2026-10-25", plannedFinish: "2026-10-15", plannedStart: "2026-09-28", startDate: "2026-10-01" }),
  gi("A-6", { dueDate: "2026-11-01", plannedStart: "2026-10-20" }),
  gi("A-7", { dueDate: "2026-12-01", plannedFinish: "2026-12-01" }),
  gi("A-8", { statusCategory: "Indeterminate", status: "In Progress" }),
  gi("A-9", { dueDate: "2026-06-01" }),
];
const OPTS = { today: "2026-11-05", displayName: "Alpha program", baseUrl: "https://example.atlassian.net/browse/" };
const data = computeGanttPlanHealth(ISSUES, OPTS);
const kpi = (label) => data.kpis.find((k) => k.label === label);
const buckets = (rows) => Object.fromEntries(rows.map((r) => [r.label, r.count]));

describe("computeGanttPlanHealth", () => {
  it("labels the report and records the as-of date and issue count", () => {
    assert.equal(data.title, "Plan health: Alpha program");
    assert.equal(data.meta.asOf, "2026-11-05");
    assert.equal(data.meta.issueCount, 9);
    assert.equal(data.baseUrl, "https://example.atlassian.net/browse/");
  });

  it("measures completion slip against planned finish, falling back to the due date", () => {
    // A-1 0d, A-2 +10d, A-3 -5d (due-date fallback); A-4 has no dates to measure
    assert.deepEqual(buckets(data.slipBuckets), { "Early": 1, "On time": 1, "1–7 d late": 0, "8–30 d late": 1, "31+ d late": 0 });
    assert.equal(kpi("On-time completions").value, "67%");
    assert.match(kpi("On-time completions").sub, /2 of 3 measured/);
    assert.equal(data.meta.doneUnmeasured, 1);
  });

  it("finds open work past its current due date and how long it has been overdue", () => {
    // A-5 11d, A-6 4d, A-9 157d; A-7 is in the future
    assert.deepEqual(buckets(data.overdueBuckets), { "1–7 d": 1, "8–30 d": 1, "31–90 d": 0, "90+ d": 1 });
    assert.equal(kpi("Overdue open").value, 3);
    assert.match(kpi("Overdue open").sub, /median 11 d/);
    assert.deepEqual(data.attention.map((r) => [r.key, r.overdueDays]), [["A-9", 157], ["A-5", 11], ["A-6", 4]]);
  });

  it("counts due dates pushed past the planned finish", () => {
    // only A-5 differs (due 10-25 vs planned 10-15 = +10); A-1's two dates are equal
    assert.equal(kpi("Re-planned").value, 1);
    assert.match(kpi("Re-planned").sub, /median \+10 d/);
    assert.equal(data.attention.find((r) => r.key === "A-5").pushedDays, 10);
  });

  it("finds late starts and work that should have started", () => {
    // started late: A-1 (+4), A-5 (+3); A-2 started on plan. Not started although planned: A-6 (16d)
    assert.equal(kpi("Late starts").value, 3);
    assert.match(kpi("Late starts").sub, /2 started late/);
    assert.match(kpi("Late starts").sub, /1 not started/);
  });

  it("compares actual with planned duration for finished work with all four dates", () => {
    // A-1 planned 30d actual 26d (0.87x); A-2 planned 9d actual 19d (2.11x) -> median 1.49x
    assert.equal(data.meta.durationSample, 2);
    assert.equal(data.meta.plannedDaysTotal, 39);
    assert.equal(data.meta.actualDaysTotal, 45);
    assert.equal(kpi("Actual vs planned").value, "1.5×");
  });

  it("flags open work that has no due date or planned finish", () => {
    assert.equal(kpi("No schedule").value, 1);
    assert.deepEqual(data.noSchedule.map((r) => r.key), ["A-8"]);
  });

  it("reports totals and completion share", () => {
    assert.equal(kpi("Issues").value, 9);
    assert.equal(kpi("Done").value, "44%");
    assert.match(kpi("Done").sub, /4 of 9/);
  });

  it("charts planned finishes against completions over twelve months around today", () => {
    assert.deepEqual(data.months.length, 12);
    assert.equal(data.months[0], "Feb '26");
    assert.deepEqual(data.planned, [0, 0, 0, 0, 1, 0, 1, 2, 1, 1, 1, 0]);
    assert.deepEqual(data.completed, [0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0]);
  });

  it("writes grounded takeaways naming the most overdue issues", () => {
    const leads = data.takeaways.map((t) => t.lead);
    assert.deepEqual(leads, ["On-time delivery", "Overdue work", "Plan changes", "Schedule gaps"]);
    assert.deepEqual(data.takeaways[1].keys, ["A-9", "A-5", "A-6"]);
  });

  it("keeps a compact row per issue so snapshots can be compared", () => {
    assert.equal(data.items.length, 9);
    assert.deepEqual(data.items.find((r) => r.key === "A-5"), { key: "A-5", summary: "Summary A-5", status: "In Progress", dueDate: "2026-10-25", plannedFinish: "2026-10-15", completeDate: "" });
  });

  it("copes with an empty plan", () => {
    const empty = computeGanttPlanHealth([], OPTS);
    assert.equal(empty.meta.issueCount, 0);
    assert.equal(empty.kpis.find((k) => k.label === "On-time completions").value, "n/a");
    assert.equal(empty.kpis.find((k) => k.label === "Actual vs planned").value, "n/a");
    assert.deepEqual(empty.takeaways, []);
  });

  it("ignores malformed dates instead of producing NaN", () => {
    const bad = computeGanttPlanHealth([gi("B-1", { dueDate: "soon", plannedFinish: "2026-13-45" })], OPTS);
    assert.equal(bad.kpis.find((k) => k.label === "Overdue open").value, 0);
    assert.equal(bad.kpis.find((k) => k.label === "No schedule").value, 1);
  });
});

describe("markdown and validation", () => {
  it("renders the key sections with issue links", () => {
    const md = buildGanttPlanHealthMarkdown(data);
    assert.match(md, /^# Plan health: Alpha program/);
    assert.match(md, /## Summary/);
    assert.match(md, /## Needing attention/);
    assert.match(md, /\[A-9\]\(https:\/\/example\.atlassian\.net\/browse\/A-9\)/);
    assert.match(md, /## Key takeaways/);
  });

  it("includes the AI narrative when present", () => {
    assert.match(buildGanttPlanHealthMarkdown({ ...data, narrative: "Delivery is slipping." }), /## AI summary\n\nDelivery is slipping\./);
  });

  it("recognises its own data shape only", () => {
    assert.equal(isGanttPlanHealthData(data), true);
    assert.equal(isGanttPlanHealthData({ title: "x" }), false);
    assert.equal(isGanttPlanHealthData(null), false);
    assert.equal(GANTT_REPORT_TYPE, "gantt_report");
  });
});

describe("compareGanttSnapshots", () => {
  const prev = { items: [
    { key: "A-5", summary: "Five", status: "In Progress", dueDate: "2026-10-15", plannedFinish: "2026-10-01", completeDate: "" },
    { key: "A-6", summary: "Six", status: "To Do", dueDate: "2026-11-01", plannedFinish: "", completeDate: "" },
    { key: "A-7", summary: "Seven", status: "To Do", dueDate: "2026-12-01", plannedFinish: "", completeDate: "" },
    { key: "A-0", summary: "Gone", status: "To Do", dueDate: "2026-10-01", plannedFinish: "", completeDate: "" },
  ] };
  const curr = { items: [
    { key: "A-5", summary: "Five", status: "In Progress", dueDate: "2026-10-25", plannedFinish: "2026-10-01", completeDate: "" },
    { key: "A-6", summary: "Six", status: "Done", dueDate: "2026-11-01", plannedFinish: "", completeDate: "2026-11-03" },
    { key: "A-7", summary: "Seven", status: "To Do", dueDate: "2026-11-20", plannedFinish: "", completeDate: "" },
    { key: "A-10", summary: "New", status: "To Do", dueDate: "", plannedFinish: "", completeDate: "" },
  ] };
  const diff = compareGanttSnapshots(prev, curr);

  it("lists due dates that moved, with direction and days", () => {
    assert.deepEqual(diff.moved.map((m) => [m.key, m.from, m.to, m.days]), [["A-5", "2026-10-15", "2026-10-25", 10], ["A-7", "2026-12-01", "2026-11-20", -11]]);
  });

  it("lists newly finished, added and removed issues", () => {
    assert.deepEqual(diff.finished.map((r) => r.key), ["A-6"]);
    assert.deepEqual(diff.added.map((r) => r.key), ["A-10"]);
    assert.deepEqual(diff.removed.map((r) => r.key), ["A-0"]);
  });

  it("returns empty lists when either snapshot is missing", () => {
    assert.deepEqual(compareGanttSnapshots(null, curr), { moved: [], finished: [], added: [], removed: [] });
  });
});

import { isComparableSnapshot } from "../shared/ganttPlanHealth.mjs";
describe("isComparableSnapshot", () => {
  it("only compares snapshots of the same scope", () => {
    assert.equal(isComparableSnapshot({ meta: { scope: "Entire plan" } }, { meta: { scope: "Entire plan" } }), true);
    assert.equal(isComparableSnapshot({ meta: { scope: "Entire plan" } }, { meta: { scope: "Current view" } }), false);
    assert.equal(isComparableSnapshot(null, { meta: { scope: "Entire plan" } }), false);
  });
});
