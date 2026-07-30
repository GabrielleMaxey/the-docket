import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeBinarySpreadsheet,
  parseImportPriority,
  parseIssueMetadataCsv,
  planIssueMetadataImport,
  normalizeImportIssueKey,
} from "../server/lib/issueMetadataImport.mjs";

describe("issueMetadataImport", () => {
  it("parses priority formats", () => {
    assert.equal(parseImportPriority("2"), 2);
    assert.equal(parseImportPriority("P3"), 3);
    assert.equal(parseImportPriority("PRIORITY P4"), 4);
    assert.equal(parseImportPriority("1 - Critical"), 1);
    assert.equal(parseImportPriority("1.0"), 1);
    assert.equal(parseImportPriority("13"), 13);
    assert.equal(parseImportPriority("P12"), 12);
    assert.equal(parseImportPriority("25"), 20);
    assert.equal(parseImportPriority("P21"), 20);
    assert.equal(parseImportPriority("Completed"), null);
    assert.equal(parseImportPriority(""), null);
  });

  it("normalizes ODI cell variants", () => {
    assert.equal(normalizeImportIssueKey("ODI-100"), "ODI-100");
    assert.equal(normalizeImportIssueKey("ODI 25789"), "ODI-25789");
    assert.equal(normalizeImportIssueKey("25789"), "ODI-25789");
    assert.equal(normalizeImportIssueKey("See ODI-25789 details"), "ODI-25789");
  });

  it("requires ODI and Priority headers", () => {
    const result = parseIssueMetadataCsv("Developer,notes\nAlice,hi\n");
    assert.equal(result.ok, false);
  });

  it("rejects binary spreadsheet uploads", () => {
    const result = parseIssueMetadataCsv("\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1binary");
    assert.equal(result.ok, false);
    assert.match(result.error, /Excel workbook/i);
    assert.equal(looksLikeBinarySpreadsheet("\xD0\xCF\x11\xE0"), true);
  });

  it("parses NORA tracker CSV rows", () => {
    const csv = [
      "Priority,ODI,Developer,Jira Status,notes",
      "P1,ODI-100,Alice,Open,First note",
      '2,odi-200,Bob,In Progress,"Quoted, note"',
      ",ODI-300,Carol,Open,skip me",
    ].join("\n");

    const parsed = parseIssueMetadataCsv(csv);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.rows.length, 3);
    assert.equal(parsed.rows[0].odi, "ODI-100");
    assert.equal(parsed.rows[1].notes, "Quoted, note");
  });

  it("skips title rows and matches Priority Ranking headers", () => {
    const csv = [
      "NORA Jira Tasks Prioritization",
      "Priority Ranking,ODI Key,Developer,Jira Status,notes",
      "2,25789,Alice,Open,hello",
    ].join("\n");
    const parsed = parseIssueMetadataCsv(csv);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.headerLineIndex, 1);
    const plan = planIssueMetadataImport(parsed.rows, {});
    assert.equal(plan.updatedPriorities, 1);
    assert.equal(plan.upserts[0].issueKey, "ODI-25789");
    assert.equal(plan.upserts[0].priority, 2);
  });

  it("parses semicolon and tab Excel exports", () => {
    const semi = parseIssueMetadataCsv("Priority;ODI;notes\nP2;ODI-9;hello\n");
    assert.equal(semi.ok, true);
    assert.equal(semi.delimiter, ";");
    assert.equal(semi.rows[0].odi, "ODI-9");

    const tab = parseIssueMetadataCsv("Priority\tODI\tnotes\n3\tODI-8\tx\n");
    assert.equal(tab.ok, true);
    assert.equal(tab.delimiter, "\t");
    assert.equal(tab.rows[0].odi, "ODI-8");
  });

  it("imports NORA sheet ranks including values above 20", () => {
    const csv = [
      "Priority,ODI,Jira Type,Description,Developer,Jira Status,Notes",
      "1,ODI-25578,Feature,desc,Sid,Ready for Verification,",
      "13,ODI-25421,Feature,desc,BB,Backlog,",
      "25,ODI-25499,Feature,desc,BB,Backlog,",
      ",ODI-25468,Feature,desc,,Backlog,",
      "Completed,,,,,,",
    ].join("\n");
    const parsed = parseIssueMetadataCsv(csv);
    assert.equal(parsed.ok, true);
    const plan = planIssueMetadataImport(parsed.rows, {});
    assert.equal(plan.updatedPriorities, 3);
    assert.equal(plan.skipped, 2);
    assert.equal(plan.errors.length, 0);
    const byKey = Object.fromEntries(plan.upserts.map((u) => [u.issueKey, u]));
    assert.equal(byKey["ODI-25578"].priority, 1);
    assert.equal(byKey["ODI-25421"].priority, 13);
    assert.equal(byKey["ODI-25499"].priority, 20);
  });

  it("overwrites priority and fills empty notes only", () => {
    const parsed = parseIssueMetadataCsv(
      [
        "Priority,ODI,notes",
        "P2,ODI-1,From sheet",
        "3,ODI-2,Should not overwrite",
        "bad,ODI-3,x",
      ].join("\n")
    );

    const plan = planIssueMetadataImport(parsed.rows, {
      "ODI-1": { note: "", priority: 9 },
      "ODI-2": { note: "Keep me", priority: 1 },
    });

    assert.equal(plan.updatedPriorities, 2);
    assert.equal(plan.filledNotes, 1);
    assert.equal(plan.skipped, 1);

    const byKey = Object.fromEntries(plan.upserts.map((u) => [u.issueKey, u]));
    assert.equal(byKey["ODI-1"].priority, 2);
    assert.equal(byKey["ODI-1"].note, "From sheet");
    assert.equal(byKey["ODI-2"].priority, 3);
    assert.equal(byKey["ODI-2"].note, "Keep me");
  });
});
