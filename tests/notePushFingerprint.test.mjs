import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildNotePushFingerprint } from "../src/utils/notePushFingerprint.js";

describe("buildNotePushFingerprint", () => {
  it("matches the post-push state (images cleared) when note text is unchanged", () => {
    const beforePush = buildNotePushFingerprint({
      note: "Fixed the bug",
      images: [{ localId: "1", filename: "a.png", byteSize: 100 }],
    });
    const afterPush = buildNotePushFingerprint({ note: "Fixed the bug", images: [] });

    // After push, images are cleared — fingerprint must use that post-clear state.
    assert.notEqual(beforePush, afterPush);
    const lastPushedFingerprint = afterPush;
    const currentFingerprint = buildNotePushFingerprint({ note: "Fixed the bug", images: [] });
    assert.equal(currentFingerprint, lastPushedFingerprint);
  });

  it("no longer matches once the note text changes", () => {
    const lastPushedFingerprint = buildNotePushFingerprint({ note: "Fixed the bug", images: [] });
    const currentFingerprint = buildNotePushFingerprint({ note: "Fixed the bug more", images: [] });
    assert.notEqual(currentFingerprint, lastPushedFingerprint);
  });

  it("no longer matches once new images are attached", () => {
    const lastPushedFingerprint = buildNotePushFingerprint({ note: "Fixed the bug", images: [] });
    const currentFingerprint = buildNotePushFingerprint({
      note: "Fixed the bug",
      images: [{ localId: "2", filename: "b.png", byteSize: 200 }],
    });
    assert.notEqual(currentFingerprint, lastPushedFingerprint);
  });
});
