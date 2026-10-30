import test from "node:test";
import assert from "node:assert/strict";
import {
  createInlinePattern,
  isTableSeparator,
  parseDetailsBlock,
  parseMarkdownTable,
  splitTableRow,
} from "../src/utils/reportMarkdown.js";

const parse = (text, start = 0) => parseMarkdownTable(text.split("\n"), start);

test("splitTableRow trims cells, drops outer pipes and keeps escaped pipes", () => {
  assert.deepEqual(splitTableRow("| a | b | c |"), ["a", "b", "c"]);
  assert.deepEqual(splitTableRow("a | b"), ["a", "b"]);
  assert.deepEqual(splitTableRow("| a \\| b | c |"), ["a | b", "c"]);
  assert.deepEqual(splitTableRow("| | |"), ["", ""]);
});

test("isTableSeparator accepts dash rows with alignment colons only", () => {
  assert.equal(isTableSeparator("|---|---|"), true);
  assert.equal(isTableSeparator("| :--- | ---: | :---: |"), true);
  assert.equal(isTableSeparator("| a | b |"), false);
  assert.equal(isTableSeparator("---"), false);
});

test("parses a table with header, separator and rows", () => {
  const t = parse("| # | Issue |\n|---|---|\n| 1 | ODI-1 |\n| 2 | ODI-2 |\nafter");
  assert.deepEqual(t.header, ["#", "Issue"]);
  assert.deepEqual(t.rows, [["1", "ODI-1"], ["2", "ODI-2"]]);
  assert.equal(t.nextIndex, 4);
});

test("an empty header row is dropped (key/value tables)", () => {
  const t = parse("| | |\n|---|---|\n| Total weekly capacity | 40 hours |\n| Buffer | 2.5 hours |");
  assert.equal(t.header, null);
  assert.deepEqual(t.rows[0], ["Total weekly capacity", "40 hours"]);
  assert.equal(t.rows.length, 2);
});

test("tolerates blank lines between rows and ragged rows", () => {
  const t = parse("| a | b |\n|---|---|\n\n| 1 |\n\n| 2 | 3 | 4 |\n\nplain text");
  assert.deepEqual(t.rows, [["1", "", ""], ["2", "3", "4"]]);
  assert.deepEqual(t.header, ["a", "b", ""]);
  assert.equal(t.nextIndex, 6);
});

test("reads column alignment from the separator", () => {
  const t = parse("| a | b | c |\n|:---|---:|:---:|\n| 1 | 2 | 3 |");
  assert.deepEqual(t.aligns, [null, "right", "center"]);
});

test("returns null when there is no separator row or it is not a pipe row", () => {
  assert.equal(parse("| a | b |\n| 1 | 2 |"), null);
  assert.equal(parse("just text\n|---|---|"), null);
  assert.equal(parse("| only line |"), null);
});

test("underscores inside identifiers are not italic or bold, but standalone ones are", () => {
  const find = (text) => createInlinePattern().exec(text);
  assert.equal(find("[Maint - PSX_Coredump_handling]"), null);
  assert.equal(find("config__value__here"), null);
  assert.equal(find("snake_case_name stays")?.[5], undefined);
  assert.equal(find("an _emphasised_ word")?.[5], "emphasised");
  assert.equal(find("a __strong__ word")?.[3], "strong");
  assert.equal(find("**bold** stays")?.[2], "bold");
});

test("parses a details block with summary and markdown body", () => {
  const lines = ["<details>", "<summary>How it works</summary>", "", "| a | b |", "|---|---|", "| 1 | 2 |", "</details>", "after"];
  const d = parseDetailsBlock(lines, 0);
  assert.equal(d.summary, "How it works");
  assert.ok(d.body.includes("| a | b |"));
  assert.equal(d.nextIndex, 7);
});

test("details block without summary gets a default and unterminated blocks are ignored", () => {
  assert.equal(parseDetailsBlock(["<details>", "text", "</details>"], 0).summary, "Details");
  assert.equal(parseDetailsBlock(["<details>", "<summary>x</summary>", "text"], 0), null);
  assert.equal(parseDetailsBlock(["not details"], 0), null);
});
