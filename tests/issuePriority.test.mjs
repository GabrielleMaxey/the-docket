import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_ISSUE_PRIORITY, clampIssuePriority } from "../shared/issuePriority.mjs";

describe("clampIssuePriority", () => {
  it("clamps to 0–MAX and rounds", () => {
    assert.equal(MAX_ISSUE_PRIORITY, 20);
    assert.equal(clampIssuePriority(0), 0);
    assert.equal(clampIssuePriority(13), 13);
    assert.equal(clampIssuePriority(25), 20);
    assert.equal(clampIssuePriority(-1), 0);
    assert.equal(clampIssuePriority("3"), 3);
    assert.equal(clampIssuePriority(3.6), 4);
    assert.equal(clampIssuePriority(Number.NaN), 0);
  });
});
