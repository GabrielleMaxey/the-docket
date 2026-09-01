import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isCoworkWeeklyPlanFilename,
  listCoworkWeeklyPlans,
  parseCoworkFileId,
  readCoworkWeeklyPlan,
  resolveCoworkWeeklyPlanPath,
} from "../server/lib/coworkWeeklyPlans.mjs";

describe("coworkWeeklyPlans", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowork-plans-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("accepts weekly-plan filenames only", () => {
    assert.equal(isCoworkWeeklyPlanFilename("weekly-plan-2026-07-27.md"), true);
    assert.equal(isCoworkWeeklyPlanFilename("Weekly-Plan-foo.MD"), true);
    assert.equal(isCoworkWeeklyPlanFilename("other.md"), false);
    assert.equal(isCoworkWeeklyPlanFilename("../weekly-plan-x.md"), false);
  });

  it("parses file ids", () => {
    assert.equal(parseCoworkFileId("file:weekly-plan-2026-07-27.md"), "weekly-plan-2026-07-27.md");
    assert.equal(parseCoworkFileId("12"), null);
    assert.equal(parseCoworkFileId("file:evil.md"), null);
  });

  it("rejects path escape filenames", () => {
    const result = resolveCoworkWeeklyPlanPath(tmpDir, "../weekly-plan-x.md");
    assert.equal(result.ok, false);
  });

  it("lists and reads weekly plan files", () => {
    const name = "weekly-plan-2026-07-27.md";
    fs.writeFileSync(path.join(tmpDir, name), "# Plan\n\nDo the thing.\n", "utf8");
    fs.writeFileSync(path.join(tmpDir, "notes.txt"), "ignore", "utf8");

    const items = listCoworkWeeklyPlans(tmpDir);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, `file:${name}`);
    assert.equal(items[0].reportType, "cowork_weekly_plan");
    assert.equal(items[0].kind, "cowork_file");

    const read = readCoworkWeeklyPlan(tmpDir, name);
    assert.equal(read.ok, true);
    assert.match(read.item.content, /Do the thing/);
  });

  it("returns not found for missing file", () => {
    const read = readCoworkWeeklyPlan(tmpDir, "weekly-plan-missing.md");
    assert.equal(read.ok, false);
    assert.equal(read.status, 404);
  });
});
