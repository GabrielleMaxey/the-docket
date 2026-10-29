import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampIssuePriority } from "../shared/issuePriority.mjs";

describe("clampIssuePriority (team priority)", () => {
  it("clamps Atlas priorities to 0–20", () => {
    assert.equal(clampIssuePriority(0), 0);
    assert.equal(clampIssuePriority(13), 13);
    assert.equal(clampIssuePriority(25), 20);
    assert.equal(clampIssuePriority(-1), 0);
    assert.equal(clampIssuePriority("3"), 3);
  });
});
