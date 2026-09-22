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
