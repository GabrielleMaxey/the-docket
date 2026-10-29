import test from "node:test";
import assert from "node:assert/strict";
import { extractTitleLabel, formatPrefixedTitle, isLabelPrefixedTitle, stripTitleLabel } from "../shared/issueTitle.mjs";

test("extractTitleLabel takes the first bracketed part, else a short whole title, else nothing", () => {
  assert.equal(extractTitleLabel("[Maint - PSX_Coredump_handling] Leverage PSX scripts"), "Maint - PSX_Coredump_handling");
  assert.equal(extractTitleLabel("Ribbon_sysDump_collector"), "Ribbon_sysDump_collector");
  assert.equal(extractTitleLabel("A very long epic title that is clearly a sentence and not a project name"), "");
  assert.equal(extractTitleLabel(""), "");
  assert.equal(extractTitleLabel(null), "");
});

test("formatPrefixedTitle builds [label] ask without doubling labels or trailing periods", () => {
  assert.equal(formatPrefixedTitle("Ribbon_sysDump_collector", "Automate customer lookups and forwarding."), "[Ribbon_sysDump_collector] Automate customer lookups and forwarding");
  assert.equal(formatPrefixedTitle("X", "[Old] Do the thing"), "[X] Do the thing");
  assert.equal(formatPrefixedTitle("X", "Handle all TNs"), "[X] Handle all TNs");
  assert.equal(formatPrefixedTitle("", "Do the thing"), "Do the thing");
  assert.equal(formatPrefixedTitle("X", ""), "[X]");
});

test("stripTitleLabel and isLabelPrefixedTitle", () => {
  assert.equal(stripTitleLabel("[A - B] hello world"), "hello world");
  assert.equal(stripTitleLabel("no label"), "no label");
  assert.equal(isLabelPrefixedTitle("[A - B] hello"), true);
  assert.equal(isLabelPrefixedTitle("[A - B]"), false);
  assert.equal(isLabelPrefixedTitle("hello"), false);
});
