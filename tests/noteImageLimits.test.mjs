import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_IMAGE_MAX_COUNT,
  validateNoteImageFile,
} from "../shared/noteImageLimits.mjs";

describe("validateNoteImageFile", () => {
  it("rejects when at max count", () => {
    const result = validateNoteImageFile(
      { type: "image/png", size: 100 },
      NOTE_IMAGE_MAX_COUNT
    );
    assert.equal(result.ok, false);
  });

  it("rejects non-image mime", () => {
    const result = validateNoteImageFile({ type: "application/pdf", size: 100 }, 0);
    assert.equal(result.ok, false);
  });

  it("accepts png under size limit", () => {
    const result = validateNoteImageFile({ type: "image/png", size: 1024 }, 0);
    assert.equal(result.ok, true);
  });
});
