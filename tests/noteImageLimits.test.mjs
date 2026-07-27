import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_IMAGE_MAX_COUNT,
  partitionNoteImageFiles,
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

describe("partitionNoteImageFiles", () => {
  const png = () => ({ type: "image/png", size: 100 });

  it("caps sequential batches at max count", () => {
    let count = 0;
    const first = partitionNoteImageFiles(count, [png(), png(), png()]);
    count += first.accepted.length;
    assert.equal(first.accepted.length, 3);

    const second = partitionNoteImageFiles(count, [png(), png(), png()]);
    assert.equal(second.accepted.length, 2);
    assert.equal(second.error, `You can add up to ${NOTE_IMAGE_MAX_COUNT} images.`);
  });
});
