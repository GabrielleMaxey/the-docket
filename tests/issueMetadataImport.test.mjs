import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseImportPriority,
  parseIssueMetadataCsv,
  planIssueMetadataImport,
} from "../server/lib/issueMetadataImport.mjs";

describe("issueMetadataImport", () => {
  it("parses priority formats", () => {
    assert.equal(parseImportPriority("2"), 2);
    assert.equal(parseImportPriority("P3"), 3);
    assert.equal(parseImportPriority("PRIORITY P4"), 4);
    assert.equal(parseImportPriority("1 - Critical"), 1);
    assert.equal(parseImportPriority("11"), null);
    assert.equal(parseImportPriority(""), null);
  });

  it("requires ODI and Priority headers", () => {
    const result = parseIssueMetadataCsv("Developer,notes\nAlice,hi\n");
    assert.equal(result.ok, false);
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

  it("extracts issue keys embedded in ODI cells", () => {
    const parsed = parseIssueMetadataCsv(
      "Priority,ODI,notes\n2,See ODI-25789 for details,n\n"
    );
    assert.equal(parsed.ok, true);
    const plan = planIssueMetadataImport(parsed.rows, {});
    assert.equal(plan.updatedPriorities, 1);
    assert.equal(plan.upserts[0].issueKey, "ODI-25789");
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
