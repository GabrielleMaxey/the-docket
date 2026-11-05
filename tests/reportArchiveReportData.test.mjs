import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findLatestGeneratedReport, isDashboardReportType, listGeneratedReports, mapGeneratedReportRow } from "../server/lib/reportArchive.mjs";

const row = (id, meta, extra = {}) => ({ id, source: "dashboard", report_type: "gantt_report", label: `R${id}`, content: "md", meta_json: JSON.stringify(meta), created_at: "2026-11-05T10:00:00.000Z", ...extra });

describe("archive rows carrying full report data", () => {
  const heavy = { slug: "alpha", ganttReport: { items: new Array(5).fill({ key: "A-1" }) }, flowReport: { kpis: [1] }, savedFrom: "gantt" };

  it("drops the full report data from list rows but flags that it exists", () => {
    const item = mapGeneratedReportRow(row(1, heavy));
    assert.equal(item.meta.ganttReport, undefined);
    assert.equal(item.meta.flowReport, undefined);
    assert.equal(item.meta.hasReportData, true);
    assert.equal(item.meta.slug, "alpha");
  });

  it("keeps it when the full report is requested", () => {
    const item = mapGeneratedReportRow(row(1, heavy), { includeContent: true });
    assert.equal(item.meta.ganttReport.items.length, 5);
    assert.equal(item.meta.flowReport.kpis[0], 1);
  });

  it("leaves other rows untouched", () => {
    const item = mapGeneratedReportRow(row(2, { audience: "team" }, { report_type: "dashboard_report" }));
    assert.deepEqual(item.meta, { audience: "team" });
  });
});

describe("gantt_report in the archive", () => {
  it("shows under the dashboard source", () => {
    assert.equal(isDashboardReportType("gantt_report"), true);
    let sql = "";
    const db = { prepare: (text) => { sql = text; return { all: () => [] }; } };
    listGeneratedReports(db, { source: "dashboard" });
    assert.match(sql, /'gantt_report'/);
  });

  it("finds the latest report of a type whose meta matches", () => {
    const rows = [row(9, { slug: "beta", ganttReport: { items: [] } }), row(8, { slug: "alpha", ganttReport: { items: [{ key: "A-1" }] } }), row(7, { slug: "alpha", ganttReport: { items: [] } })];
    const db = { prepare: () => ({ all: () => rows }) };
    const found = findLatestGeneratedReport(db, { reportType: "gantt_report", metaMatch: { slug: "alpha" } });
    assert.equal(found.id, 8);
    assert.equal(found.meta.ganttReport.items.length, 1);
    assert.equal(findLatestGeneratedReport(db, { reportType: "gantt_report", metaMatch: { slug: "gamma" } }), null);
  });
});
