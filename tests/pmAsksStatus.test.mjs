import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePmAskStatus, isClosedPmAskStatus, PM_ASK_STATUSES } from "../shared/pmAskStatus.mjs";

describe("normalizePmAskStatus", () => {
  it("defaults unknown/empty to open", () => {
    assert.equal(normalizePmAskStatus(""), "open");
    assert.equal(normalizePmAskStatus("nope"), "open");
  });
  it("accepts open, done, canceled", () => {
    for (const s of PM_ASK_STATUSES) {
      assert.equal(normalizePmAskStatus(s), s);
      assert.equal(normalizePmAskStatus(s.toUpperCase()), s);
    }
  });
  it("isClosedPmAskStatus is true for done and canceled only", () => {
    assert.equal(isClosedPmAskStatus("open"), false);
    assert.equal(isClosedPmAskStatus("done"), true);
    assert.equal(isClosedPmAskStatus("canceled"), true);
  });
});
