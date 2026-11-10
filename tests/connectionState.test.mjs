import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OFFLINE_AFTER_FAILURES, initialConnectionState, nextConnectionState } from "../src/utils/connectionState.js";

describe("connectionState", () => {
  it("starts online with no failures", () => {
    assert.deepEqual(initialConnectionState(), { online: true, failures: 0 });
  });

  it("stays online after a single failed check", () => {
    const s = nextConnectionState(initialConnectionState(), false);
    assert.equal(s.online, true);
    assert.equal(s.failures, 1);
  });

  it("goes offline after consecutive failures", () => {
    let s = initialConnectionState();
    for (let i = 0; i < OFFLINE_AFTER_FAILURES; i++) s = nextConnectionState(s, false);
    assert.equal(s.online, false);
  });

  it("recovers immediately on one success and resets the failure count", () => {
    let s = initialConnectionState();
    for (let i = 0; i < OFFLINE_AFTER_FAILURES + 2; i++) s = nextConnectionState(s, false);
    s = nextConnectionState(s, true);
    assert.deepEqual(s, { online: true, failures: 0 });
  });

  it("a success between failures resets the count so blips never show the banner", () => {
    let s = nextConnectionState(initialConnectionState(), false);
    s = nextConnectionState(s, true);
    s = nextConnectionState(s, false);
    assert.equal(s.online, true);
  });

  it("does not mutate the previous state and caps the failure count", () => {
    const before = initialConnectionState();
    nextConnectionState(before, false);
    assert.deepEqual(before, { online: true, failures: 0 });
    let s = before;
    for (let i = 0; i < 100; i++) s = nextConnectionState(s, false);
    assert.ok(s.failures <= OFFLINE_AFTER_FAILURES);
  });
});
