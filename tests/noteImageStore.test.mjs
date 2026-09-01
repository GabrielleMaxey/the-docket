import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { initDatabase } from "../server/db/schema.mjs";
import {
  listNoteImages,
  getNoteImageFile,
  replaceNoteImages,
  deleteAllNoteImages,
} from "../server/lib/noteImageStore.mjs";

describe("noteImageStore", () => {
  let db;
  let baseDir;

  beforeEach(() => {
    db = new Database(":memory:");
    initDatabase(db);
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "note-images-test-"));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it("writes files to disk and inserts rows", () => {
    const images = replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("one"), mimeType: "image/png", filename: "a.png" },
      { buffer: Buffer.from("two"), mimeType: "image/jpeg", filename: "b.jpg" },
    ]);

    assert.equal(images.length, 2);
    assert.equal(listNoteImages(db, "ABC-1").length, 2);

    const stored = getNoteImageFile(db, "ABC-1", images[0].id);
    assert.equal(fs.readFileSync(stored.storagePath, "utf8"), "one");
    assert.equal(stored.mimeType, "image/png");
  });

  it("clears any previously kept images for the issue before saving the new set", () => {
    replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("old"), mimeType: "image/png", filename: "old.png" },
    ]);
    replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("new"), mimeType: "image/png", filename: "new.png" },
    ]);

    const images = listNoteImages(db, "ABC-1");
    assert.equal(images.length, 1);
    assert.equal(images[0].filename, "new.png");
  });

  it("removes rows and files from disk", () => {
    replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("one"), mimeType: "image/png", filename: "a.png" },
    ]);

    deleteAllNoteImages(db, baseDir, "ABC-1");

    assert.equal(listNoteImages(db, "ABC-1").length, 0);
    assert.equal(fs.existsSync(path.join(baseDir, "ABC-1")), false);
  });

  it("sanitizes issue keys used as directory names", () => {
    replaceNoteImages(db, baseDir, "../../etc", [
      { buffer: Buffer.from("x"), mimeType: "image/png", filename: "x.png" },
    ]);

    const [image] = listNoteImages(db, "../../etc");
    const stored = getNoteImageFile(db, "../../etc", image.id);
    assert.ok(stored.storagePath.startsWith(baseDir));
  });

  it("returns null for a missing image", () => {
    assert.equal(getNoteImageFile(db, "ABC-1", 999), null);
  });

  it("keeps issues isolated from each other", () => {
    replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("one"), mimeType: "image/png", filename: "a.png" },
    ]);
    replaceNoteImages(db, baseDir, "ABC-2", [
      { buffer: Buffer.from("two"), mimeType: "image/png", filename: "b.png" },
    ]);

    deleteAllNoteImages(db, baseDir, "ABC-1");

    assert.equal(listNoteImages(db, "ABC-1").length, 0);
    assert.equal(listNoteImages(db, "ABC-2").length, 1);
  });
});
