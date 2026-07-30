import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePriorityFromComment } from "../shared/priorityFromComment.mjs";

describe("parsePriorityFromComment", () => {
  it("parses PRIORITY P2 with em dash suffix", () => {
    const result = parsePriorityFromComment("PRIORITY P2 — Blocked on vendor");
    assert.equal(result?.priority, 2);
    assert.equal(result?.noteSnippet, "Blocked on vendor");
  });

  it("parses PRIORITY P10", () => {
    const result = parsePriorityFromComment("PRIORITY P10");
    assert.equal(result?.priority, 10);
    assert.equal(result?.noteSnippet, "");
  });

  it("parses PRIORITY P20", () => {
    const result = parsePriorityFromComment("PRIORITY P20 — Low");
    assert.equal(result?.priority, 20);
    assert.equal(result?.noteSnippet, "Low");
  });

  it("returns null without prefix", () => {
    assert.equal(parsePriorityFromComment("Just a note"), null);
  });

  it("returns null for P0 or P21", () => {
    assert.equal(parsePriorityFromComment("PRIORITY P0 — no"), null);
    assert.equal(parsePriorityFromComment("PRIORITY P21 — no"), null);
  });
});
