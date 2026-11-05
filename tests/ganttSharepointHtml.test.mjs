import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildGanttSharepointHtml } from "../src/Pages/components/ganttSharepointHtml.js";

const BASE_METRICS = {
  total: 2,
  done: 1,
  inProgress: 1,
  todo: 0,
  overdue: 0,
  spanStart: "2026-01-01",
  spanEnd: "2026-01-31",
  bullets: ["2 total issues", "1 done"],
};

const BASE_ISSUES = [
  { key: "PROJ-1", summary: "Feature A", statusCategory: "Done", startDate: "2026-01-01", dueDate: "2026-01-15" },
  { key: "PROJ-2", summary: "Feature B", statusCategory: "Indeterminate", startDate: "2026-01-10", dueDate: "2026-01-31" },
];

describe("buildGanttSharepointHtml", () => {
  it("returns a string containing DOCTYPE", () => {
    const html = buildGanttSharepointHtml({ displayName: "My Plan", generatedAt: "2026-02-01", metrics: BASE_METRICS, issues: BASE_ISSUES });
    assert.ok(typeof html === "string");
    assert.ok(html.toLowerCase().includes("<!doctype html"));
  });

  it("contains no script tags", () => {
    const html = buildGanttSharepointHtml({
      displayName: "Plan",
      generatedAt: "2026-02-01",
      metrics: BASE_METRICS,
      summary: "Some summary",
      issues: BASE_ISSUES,
    });
    assert.equal(/<script/i.test(html), false);
  });

  it("includes issue keys in the output", () => {
    const html = buildGanttSharepointHtml({ displayName: "Plan", generatedAt: "2026-02-01", metrics: BASE_METRICS, issues: BASE_ISSUES });
    assert.ok(html.includes("PROJ-1"));
    assert.ok(html.includes("PROJ-2"));
  });

  it("omits summary section when summary is empty", () => {
    const withSummary = buildGanttSharepointHtml({ displayName: "Plan", generatedAt: "2026-02-01", metrics: BASE_METRICS, issues: BASE_ISSUES, summary: "Hello" });
    const withoutSummary = buildGanttSharepointHtml({ displayName: "Plan", generatedAt: "2026-02-01", metrics: BASE_METRICS, issues: BASE_ISSUES, summary: "" });
    assert.ok(withSummary.includes("Hello"));
    assert.ok(!withoutSummary.includes("Hello"));
  });

  it("escapes HTML in issue summaries and displayName", () => {
    const html = buildGanttSharepointHtml({
      displayName: "Plan",
      metrics: { bullets: ["x"], total: 1, done: 0, inProgress: 0, todo: 1, overdue: 0, spanStart: "2026-01-01", spanEnd: "2026-01-10" },
      summary: "<img onerror=alert(1)>",
      issues: [{ key: "A-1", summary: "<b>x</b>", startDate: "2026-01-01", dueDate: "2026-01-10", statusCategory: "To Do" }],
    });
    assert.equal(html.includes("<img"), false);
    assert.ok(html.includes("&lt;"));
  });

  it("uses overdue color for overdue issues", () => {
    const issues = [
      { key: "OD-1", summary: "Late task", statusCategory: "Indeterminate", startDate: "2026-01-01", dueDate: "2025-06-01" },
    ];
    const metrics = { ...BASE_METRICS, overdue: 1 };
    const html = buildGanttSharepointHtml({ displayName: "Plan", generatedAt: "2026-02-01", metrics, issues });
    assert.ok(html.includes("#dc2626"));
  });

  it("includes metric bullets in output", () => {
    const html = buildGanttSharepointHtml({ displayName: "Plan", generatedAt: "2026-02-01", metrics: BASE_METRICS, issues: BASE_ISSUES });
    assert.ok(html.includes("2 total issues"));
    assert.ok(html.includes("1 done"));
  });

  it("wraps issue key as link when jiraBaseUrl provided", () => {
    const html = buildGanttSharepointHtml({
      displayName: "Plan",
      generatedAt: "2026-02-01",
      metrics: BASE_METRICS,
      issues: BASE_ISSUES,
      jiraBaseUrl: "https://jira.example.com",
    });
    assert.ok(html.includes("https://jira.example.com/browse/PROJ-1"));
  });
});

describe("buildGanttSharepointHtml plan health section", () => {
  const planHealth = {
    kpis: [{ label: "Overdue open", value: 2, sub: "of 5 open" }, { label: "Done", value: "40%", sub: "2 of 5 issues" }],
    slipBuckets: [{ label: "On time", count: 3 }, { label: "1–7 d late", count: 1 }],
    overdueBuckets: [{ label: "1–7 d", count: 2 }],
    attention: [{ key: "PROJ-9", summary: "Late <thing>", status: "In Progress", assignee: "Ann", dueDate: "2026-01-05", overdueDays: 12, pushedDays: 4 }],
    noSchedule: [{ key: "PROJ-7", summary: "Unplanned", status: "To Do", assignee: "" }],
    takeaways: [{ lead: "Overdue work", text: "2 open issues are past due.", keys: ["PROJ-9"] }],
    months: ["Jan", "Feb"], planned: [2, 0], completed: [1, 3],
    flowNote: "Planned vs completed note.", footnote: "Footnote text here.", narrative: "",
  };
  const build = (extra) => buildGanttSharepointHtml({ displayName: "P", generatedAt: "x", metrics: BASE_METRICS, issues: BASE_ISSUES, jiraBaseUrl: "https://j.example", ...extra });

  it("omits the section by default", () => {
    assert.ok(!build({}).includes("Plan health"));
  });

  it("renders KPIs, buckets, attention and takeaways with inline styles only", () => {
    const html = build({ planHealth });
    assert.ok(html.includes("Plan health"));
    assert.ok(html.includes("Overdue open") && html.includes("40%"));
    assert.ok(html.includes("1–7 d late"));
    assert.ok(html.includes("https://j.example/browse/PROJ-9"));
    assert.ok(html.includes("Late &lt;thing&gt;"));
    assert.ok(html.includes("PROJ-7"));
    assert.ok(html.includes("2 open issues are past due."));
  });

  it("includes the full report: monthly chart, gap details, footnote, no layout divs that SharePoint may strip", () => {
    const html = build({ planHealth });
    const section = html.slice(html.indexOf("Plan health"), html.indexOf("<div class=\"timeline-wrap\">"));
    for (const text of ["Jan", "Feb", "Planned finishes", "Completed", "Planned vs completed note.", "Schedule gaps", "Unplanned", "To Do", "Footnote text here.", "Key takeaways"]) {
      assert.ok(section.includes(text), `missing: ${text}`);
    }
    assert.ok(!/<div/.test(section), "layout should use tables, not divs");
  });

  it("places plan health before the timeline table", () => {
    const html = build({ planHealth });
    assert.ok(html.indexOf("Plan health") >= 0);
    assert.ok(html.indexOf("Plan health") < html.indexOf("<div class=\"timeline-wrap\">"));
  });
});
