import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFieldMappingsMap } from "../server/lib/epicFilterJql.mjs";
import { buildReportDueWindowsAndLinks } from "../server/lib/reportWorkWeekLinks.mjs";

describe("buildReportDueWindowsAndLinks", () => {
  const mappingsByRole = buildFieldMappingsMap([
    { role: "due_date", field_id: "duedate", field_name: "Due date" },
  ]);

  it("names the overdue lookback and upcoming cutoff, and emits Work Week links for buckets with work", () => {
    const result = buildReportDueWindowsAndLinks({
      snapshot: {
        includePastDue: true,
        pastDueLookbackYears: 0.5,
        dueByDate: "2026-09-13",
        dueByField: "due_date",
      },
      mappingsByRole,
      presetUnionScope: '(parent = PROJ-1 OR key = PROJ-1)',
      epicMetrics: [
        {
          overdueOpenIssues: 2,
          dueByOpenIssues: 1,
          openStatusCounts: { "In Progress": 3, Backlog: 4 },
        },
      ],
    });

    assert.match(result.windowContext, /within the past 6 months/);
    assert.match(result.windowContext, /from today through 2026-09-13/);
    assert.match(result.appendedSection, /Open these tasks in Work Week/);
    assert.match(result.appendedSection, /\/#\/work-week\?/);
    assert.match(result.appendedSection, /Overdue/);
    assert.match(result.appendedSection, /Upcoming/);
    assert.match(result.appendedSection, /In progress/);
    const decodedLinks = decodeURIComponent(result.appendedSection.replace(/\+/g, " "));
    assert.match(decodedLinks, /parent = PROJ-1/);
    assert.match(result.appendedSection, /Backlog/);
  });

  it("omits Work Week links when there is no saved preset scope", () => {
    const result = buildReportDueWindowsAndLinks({
      snapshot: {
        includePastDue: true,
        pastDueLookbackYears: 0.5,
        dueByDate: "2026-09-13",
        dueByField: "due_date",
      },
      mappingsByRole,
      presetUnionScope: "",
      epicMetrics: [
        {
          overdueOpenIssues: 2,
          dueByOpenIssues: 1,
          openStatusCounts: { "In Progress": 3, Backlog: 4 },
        },
      ],
    });
    assert.equal(result.appendedSection, "");
  });

  it("omits Work Week links for empty overdue, upcoming, in progress, and backlog buckets", () => {
    const result = buildReportDueWindowsAndLinks({
      snapshot: {
        includePastDue: true,
        pastDueLookbackYears: 0.5,
        dueByDate: "2026-09-13",
        dueByField: "due_date",
      },
      mappingsByRole,
      presetUnionScope: '(parent = PROJ-1 OR key = PROJ-1)',
      epicMetrics: [
        {
          overdueOpenIssues: 0,
          dueByOpenIssues: 0,
          openStatusCounts: { "Ready for Verification": 2 },
        },
      ],
    });
    assert.equal(result.appendedSection, "");
  });

  it("keeps only buckets that have work in the snapshot", () => {
    const result = buildReportDueWindowsAndLinks({
      snapshot: {
        includePastDue: true,
        pastDueLookbackYears: 0.5,
        dueByDate: "2026-09-13",
        dueByField: "due_date",
      },
      mappingsByRole,
      presetUnionScope: '(parent = PROJ-1 OR key = PROJ-1)',
      epicMetrics: [
        {
          overdueOpenIssues: 1,
          dueByOpenIssues: 0,
          openStatusCounts: { Backlog: 2 },
        },
      ],
    });
    assert.match(result.appendedSection, /Overdue/);
    assert.match(result.appendedSection, /Backlog/);
    assert.doesNotMatch(result.appendedSection, /Upcoming/);
    assert.doesNotMatch(result.appendedSection, /In progress/);
  });
});
