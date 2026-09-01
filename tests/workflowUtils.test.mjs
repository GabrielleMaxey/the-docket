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
        { "PROJ-1": "local", "PROJ-2": undefined },
        { "PROJ-1": "remote", "PROJ-2": "remote", "PROJ-3": "remote" }
      ),
      { "PROJ-1": "local", "PROJ-2": "remote", "PROJ-3": "remote" }
    );
  });
});
