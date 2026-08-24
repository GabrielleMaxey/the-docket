import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  errorMessage,
  mergeIssueMapsPreferExisting,
} from "../src/utils/workflow.js";

describe("workflow utilities", () => {
  it("returns Error messages and preserves fallbacks for non-Errors", () => {
    assert.equal(errorMessage(new Error("request failed"), "fallback"), "request failed");
    assert.equal(errorMessage("request failed", "fallback"), "fallback");
  });

  it("merges issue maps without replacing existing values", () => {
    assert.deepEqual(
      mergeIssueMapsPreferExisting(
        { "ODI-1": "local", "ODI-2": undefined },
        { "ODI-1": "remote", "ODI-2": "remote", "ODI-3": "remote" }
      ),
      { "ODI-1": "local", "ODI-2": "remote", "ODI-3": "remote" }
    );
  });
});
