import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDays, buildFlowNarrativeContext, buildFlowReportMarkdown, computeFlowReport, dayStr, daysBetween, median } from "../shared/flowMetrics.mjs";

const NOW = "2026-11-05";
const OPTS = { now: NOW, windowStart: "2025-11-05", windowEnd: "2026-11-05", baseUrl: "https://example.atlassian.net/browse/", siteLabel: "example.atlassian.net", personName: "" };

const issue = (over) => ({
  summary: "s", status: "Closed", statusCategory: "done", type: "Sub-task", priority: "Low",
  parent: "", parentSummary: "", created: null, updated: null, resolved: null, dueDate: null, transitions: [],
  ...over,
});

const fixture = () => [
  issue({ key: "ODI-1", type: "Bug", created: "2026-01-10T09:00:00.000-0700", resolved: "2026-01-20T09:00:00.000-0700", dueDate: "2026-01-18", parent: "ODI-100", parentSummary: "[GCP] Migration", transitions: [{ at: "2026-01-12T08:00:00.000-0700", from: "Backlog", to: "In Progress" }] }),
  issue({ key: "ODI-2", created: "2026-02-01", resolved: "2026-04-02", dueDate: "2026-04-10", parent: "ODI-100", parentSummary: "[GCP] Migration", transitions: [{ at: "2026-02-10", from: "Backlog", to: "In Progress" }] }),
  // created before the window, resolved inside it
  issue({ key: "ODI-3", created: "2025-09-01", resolved: "2025-12-15", parent: "ODI-100", parentSummary: "[GCP] Migration", transitions: [] }),
  issue({ key: "ODI-4", status: "In Progress", statusCategory: "indeterminate", created: "2026-03-01", updated: "2026-10-30", parent: "ODI-100", parentSummary: "[GCP] Migration", transitions: [{ at: "2026-03-05", from: "Backlog", to: "In Progress" }] }),
  issue({ key: "ODI-5", type: "Bug", status: "Backlog", statusCategory: "new", created: "2026-10-20", updated: "2026-10-21", transitions: [] }),
  issue({ key: "ODI-6", type: "Task", status: "Backlog", statusCategory: "new", created: "2026-06-01", transitions: [] }),
  // entirely outside the window
  issue({ key: "ODI-7", created: "2024-01-01", resolved: "2024-06-01" }),
  issue({ key: "ODI-8", type: "Bug", priority: "High", created: "2026-09-01", resolved: "2026-09-03", transitions: [{ at: "2026-09-02", from: "Backlog", to: "In Progress" }] }),
];

describe("flowMetrics helpers", () => {
  it("computes medians without coercing empty input", () => {
    assert.equal(median([]), null);
    assert.equal(median([5]), 5);
    assert.equal(median([2, 10, 60]), 10);
    assert.equal(median([2, 10]), 6);
  });

  it("reduces timestamps to the calendar day Jira reported", () => {
    assert.equal(dayStr("2026-03-31T23:30:00.000-0700"), "2026-03-31");
    assert.equal(dayStr(null), null);
    assert.equal(dayStr(undefined), null);
    assert.equal(dayStr(""), null);
    assert.equal(daysBetween("2026-02-01", "2026-04-02"), 60);
    assert.equal(addDays("2026-11-05", -90), "2026-08-07");
  });
});

describe("computeFlowReport", () => {
  const data = computeFlowReport(fixture(), OPTS);

  it("scopes to issues created or resolved inside the window", () => {
    assert.equal(data.meta.issueCount, 7);
    assert.equal(data.open.length, 3);
    assert.ok(!data.open.some((r) => r.key === "ODI-7"));
  });

  it("builds monthly created/resolved series over every calendar month in the window", () => {
    assert.equal(data.months.length, 13);
    assert.deepEqual(data.months.slice(0, 4), ["Nov '25", "Dec", "Jan '26", "Feb"]);
    assert.equal(data.months[12], "Nov");
    assert.deepEqual(data.created, [0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0]);
    assert.deepEqual(data.resolved, [0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0]);
    assert.match(data.flowNote, /\(6\)\. Resolved includes 1 older issue closed in this window \(4\)\./);
  });

  it("status, type and priority groups each add up to the total", () => {
    const sum = (rows) => rows.reduce((a, r) => a + r.count, 0);
    assert.equal(sum(data.status), 7);
    assert.equal(sum(data.types), 7);
    assert.equal(sum(data.priorities), 7);
    assert.deepEqual(data.status.map((s) => [s.label, s.count]), [["Closed", 4], ["Backlog", 2], ["In Progress", 1]]);
  });

  it("computes lead time, buckets and median by type", () => {
    assert.deepEqual(data.leadBuckets.map((b) => b.count), [1, 1, 1, 0]);
    assert.deepEqual(data.leadByType.map((r) => [r.label, r.days]), [["Bug (2)", 6], ["Sub-task (1)", 60]]);
    const kpi = (label) => data.kpis.find((k) => k.label === label);
    assert.equal(kpi("Median lead time").value, "10 d");
    assert.match(kpi("Median lead time").sub, /mean 24 d/);
  });

  it("computes cycle time from the changelog", () => {
    const cycle = data.kpis.find((k) => k.label === "Median cycle time");
    assert.equal(cycle.value, "8 d");
    assert.equal(data.meta.cycleTimeAvailable, true);
  });

  it("measures idle from the last status change when changelogs are present", () => {
    assert.equal(data.meta.idleBasis, "status-change");
    assert.deepEqual(data.open.map((r) => [r.key, r.age, r.idle]), [["ODI-4", 249, 245], ["ODI-6", 157, 157], ["ODI-5", 16, 16]]);
    assert.deepEqual(data.aging.map((b) => b.count), [1, 0, 1, 1]);
    assert.deepEqual(data.idleBuckets.map((b) => b.count), [1, 0, 2]);
    const stalled = data.kpis.find((k) => k.label.startsWith("Stalled"));
    assert.equal(stalled.value, 2);
    assert.match(stalled.sub, /^67% of open work$/);
  });

  it("falls back to last-updated and says so when changelogs are missing", () => {
    const noLog = fixture().map((i) => ({ ...i, transitions: null }));
    const fallback = computeFlowReport(noLog, OPTS);
    assert.equal(fallback.meta.idleBasis, "updated");
    assert.equal(fallback.meta.cycleTimeAvailable, false);
    assert.equal(fallback.open.find((r) => r.key === "ODI-4").idle, 6);
    assert.equal(fallback.open.filter((r) => r.idle >= 30).length, 1);
    assert.match(fallback.footnote, /last-updated date/);
    assert.ok(!fallback.kpis.some((k) => k.label === "Median cycle time"));
  });

  it("computes throughput and the 90-day count", () => {
    const t = data.kpis.find((k) => k.label === "Throughput");
    assert.equal(t.value, "0.33");
    assert.match(t.sub, /1 in last 90 d/);
  });

  it("reports due-date adherence without treating missing dates as zero", () => {
    assert.equal(data.dueNote, "Due dates were set on only 2 resolved issues: 1 finished on time and 1 finished late (by 2 days).");
  });

  it("groups progress by parent", () => {
    assert.deepEqual(data.parents, [{ key: "ODI-100", name: "Migration", done: 3, total: 4 }]);
  });

  it("generates takeaways that cite the stalled items", () => {
    const stalled = data.takeaways.find((t) => t.lead === "Stalled In Progress");
    assert.deepEqual(stalled.keys, ["ODI-4"]);
    assert.match(stalled.text, /^1 of your 1 in-progress item has had no status change in 245 days/);
    assert.deepEqual(data.takeaways.find((t) => t.lead === "Old backlog").keys, ["ODI-6"]);
  });

  it("sets title, chips and site label", () => {
    assert.equal(data.title, "My Assigned Work: Past 12 months");
    assert.deepEqual(data.chips, ["Site: example.atlassian.net", "7 issues · all in ODI", "Data as of 2026-11-05"]);
  });

  it("handles an empty issue set", () => {
    const empty = computeFlowReport([], OPTS);
    assert.equal(empty.meta.issueCount, 0);
    assert.equal(empty.kpis.find((k) => k.label === "Resolved").value, "0%");
    assert.equal(empty.kpis.find((k) => k.label === "Median lead time").value, "—");
    assert.deepEqual(empty.open, []);
  });

  it("treats done issues without a resolution date as resolved but not as lead-time samples", () => {
    const r = computeFlowReport([issue({ key: "ODI-9", created: "2026-05-01", resolved: null, transitions: null })], OPTS);
    assert.equal(r.meta.issueCount, 1);
    assert.equal(r.status[0].label, "Closed");
    assert.deepEqual(r.leadBuckets.map((b) => b.count), [0, 0, 0, 0]);
  });
});

describe("buildFlowReportMarkdown", () => {
  it("renders the key sections and links issues", () => {
    const md = buildFlowReportMarkdown(computeFlowReport(fixture(), OPTS));
    assert.match(md, /^# My Assigned Work: /);
    assert.match(md, /\| Resolved \| 57% \| 4 closed of 7 \|/);
    assert.match(md, /\[ODI-4\]\(https:\/\/example\.atlassian\.net\/browse\/ODI-4\)/);
    assert.match(md, /## Key takeaways/);
  });

  it("returns an empty string for missing data", () => {
    assert.equal(buildFlowReportMarkdown(null), "");
  });
});

describe("assignee on open work", () => {
  const issues = [
    { key: "ODI-1", summary: "A", status: "In Progress", statusCategory: "indeterminate", type: "Task", priority: "", parent: "", parentSummary: "", created: "2026-09-01T10:00:00.000+0000", updated: "2026-09-02T10:00:00.000+0000", resolved: null, dueDate: null, assignee: "Pat Lee", transitions: [] },
    { key: "ODI-2", summary: "B", status: "Backlog", statusCategory: "new", type: "Task", priority: "", parent: "", parentSummary: "", created: "2026-09-01T10:00:00.000+0000", updated: "2026-09-03T10:00:00.000+0000", resolved: null, dueDate: null, assignee: "", transitions: [] },
  ];

  it("puts the assignee on each open row, with Unassigned as the fallback", () => {
    const data = computeFlowReport(issues, { ...OPTS, allAssignees: true });
    const byKey = Object.fromEntries(data.open.map((r) => [r.key, r.assignee]));
    assert.deepEqual(byKey, { "ODI-1": "Pat Lee", "ODI-2": "Unassigned" });
    assert.equal(data.meta.allAssignees, true);
  });

  it("adds an Assignee column to the markdown only for all-assignee reports", () => {
    const all = buildFlowReportMarkdown(computeFlowReport(issues, { ...OPTS, allAssignees: true }));
    assert.match(all, /\| Issue \| Summary \| Status \| Assignee \| Parent \|/);
    assert.match(all, /Pat Lee/);
    const mine = buildFlowReportMarkdown(computeFlowReport(issues, OPTS));
    assert.doesNotMatch(mine, /Assignee/);
  });
});

describe("AI narrative support", () => {
  const issues = Array.from({ length: 14 }, (_, i) => ({
    key: `ODI-${i + 1}`, summary: `Item ${i + 1}`, status: "In Progress", statusCategory: "indeterminate", type: "Task", priority: "", parent: "", parentSummary: "",
    created: "2026-01-01T10:00:00.000+0000", updated: `2026-0${(i % 9) + 1}-15T10:00:00.000+0000`, resolved: null, dueDate: null, assignee: `P${i}`, transitions: [],
  }));
  const data = computeFlowReport(issues, { ...OPTS, scopeLabel: "Alpha", allAssignees: true });

  it("builds a compact grounded context: title, KPIs, scope, the 10 most idle items and takeaways", () => {
    const ctx = buildFlowNarrativeContext(data);
    assert.match(ctx, new RegExp(data.title.replace(/[()]/g, "\\$&")));
    for (const k of data.kpis) assert.ok(ctx.includes(k.label), `missing KPI ${k.label}`);
    assert.match(ctx, /Projects: Alpha/);
    const listed = data.open.slice(0, 10).map((r) => r.key);
    for (const key of listed) assert.ok(ctx.includes(key));
    assert.ok(!ctx.includes(data.open[10].key), "only the 10 most idle items are listed");
    assert.ok(ctx.length < 6000);
  });

  it("adds the narrative to the markdown only when present", () => {
    assert.doesNotMatch(buildFlowReportMarkdown(data), /AI summary/);
    const md = buildFlowReportMarkdown({ ...data, narrative: "Work is mostly stalled." });
    assert.match(md, /## AI summary\n\nWork is mostly stalled\./);
  });
});
