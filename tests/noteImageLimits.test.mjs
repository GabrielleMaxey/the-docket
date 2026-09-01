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
      { type: "image/png", size: 100, name: "a.png" },
      NOTE_IMAGE_MAX_COUNT
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /up to 5 files/i);
  });

  it("rejects unsupported type", () => {
    const result = validateNoteImageFile(
      { type: "application/zip", size: 100, name: "a.zip" },
      0
    );
    assert.equal(result.ok, false);
  });

  it("accepts png under size limit", () => {
    const result = validateNoteImageFile(
      { type: "image/png", size: 1024, name: "a.png" },
      0
    );
    assert.equal(result.ok, true);
  });

  it("accepts pdf by mime", () => {
    const result = validateNoteImageFile(
      { type: "application/pdf", size: 1024, name: "a.pdf" },
      0
    );
    assert.equal(result.ok, true);
  });

  it("accepts docx by extension when mime is octet-stream", () => {
    const result = validateNoteImageFile(
      {
        type: "application/octet-stream",
        size: 1024,
        name: "spec.docx",
      },
      0
    );
    assert.equal(result.ok, true);
  });

  it("accepts csv and xlsx", () => {
    assert.equal(
      validateNoteImageFile({ type: "text/csv", size: 10, name: "a.csv" }, 0).ok,
      true
    );
    assert.equal(
      validateNoteImageFile(
        {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size: 10,
          name: "a.xlsx",
        },
        0
      ).ok,
      true
    );
  });
});

describe("partitionNoteImageFiles", () => {
  const png = () => ({ type: "image/png", size: 100, name: "a.png" });

  it("caps sequential batches at max count", () => {
    let count = 0;
    const first = partitionNoteImageFiles(count, [png(), png(), png()]);
    count += first.accepted.length;
    assert.equal(first.accepted.length, 3);

    const second = partitionNoteImageFiles(count, [png(), png(), png()]);
    assert.equal(second.accepted.length, 2);
    assert.match(second.error, /up to 5 files/i);
  });
});
