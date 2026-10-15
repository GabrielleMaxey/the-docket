import { describe, it, beforeEach, afterEach, mock } from "node:test";
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
    mock.restoreAll();
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

  it("preserves original rows and bytes when the second staged write fails", () => {
    const [original] = replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("original"), mimeType: "image/png", filename: "same.png" },
    ]);
    const stored = getNoteImageFile(db, "ABC-1", original.id);
    const rows = listNoteImages(db, "ABC-1");
    const writeFileSync = fs.writeFileSync;
    let writes = 0;
    mock.method(fs, "writeFileSync", (...args) => {
      writes += 1;
      if (writes === 2) throw new Error("controlled write failure");
      return writeFileSync(...args);
    });

    assert.throws(() => replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("first"), mimeType: "image/png", filename: "same.png" },
      { buffer: Buffer.from("second"), mimeType: "image/png", filename: "second.png" },
    ]), /controlled write failure/);

    assert.deepEqual(listNoteImages(db, "ABC-1"), rows);
    assert.equal(fs.readFileSync(stored.storagePath, "utf8"), "original");
    assert.deepEqual(fs.readdirSync(path.join(baseDir, "ABC-1")), [path.basename(path.dirname(stored.storagePath))]);
  });

  it("rolls back replaced rows and removes staging when a database insert fails", () => {
    const [original] = replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("original"), mimeType: "image/png", filename: "same.png" },
    ]);
    const stored = getNoteImageFile(db, "ABC-1", original.id);
    const rows = listNoteImages(db, "ABC-1");
    db.exec(`CREATE TRIGGER reject_second_image BEFORE INSERT ON issue_note_images
      WHEN NEW.sort_order = 1 BEGIN SELECT RAISE(ABORT, 'controlled insert failure'); END`);

    assert.throws(() => replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("first"), mimeType: "image/png", filename: "same.png" },
      { buffer: Buffer.from("second"), mimeType: "image/jpeg", filename: "second.jpg" },
    ]), /controlled insert failure/);

    assert.deepEqual(listNoteImages(db, "ABC-1"), rows);
    assert.equal(fs.readFileSync(stored.storagePath, "utf8"), "original");
    assert.deepEqual(fs.readdirSync(path.join(baseDir, "ABC-1")), [path.basename(path.dirname(stored.storagePath))]);
  });

  it("keeps same-filename original bytes until replacement commits", () => {
    const [original] = replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("original"), mimeType: "image/png", filename: "same.png" },
    ]);
    const stored = getNoteImageFile(db, "ABC-1", original.id);
    const rows = listNoteImages(db, "ABC-1");
    const writeFileSync = fs.writeFileSync;
    mock.method(fs, "writeFileSync", (...args) => {
      assert.deepEqual(listNoteImages(db, "ABC-1"), rows);
      assert.equal(fs.readFileSync(stored.storagePath, "utf8"), "original");
      return writeFileSync(...args);
    });

    const images = replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("replacement"), mimeType: "image/jpeg", filename: "same.png" },
    ]);

    assert.deepEqual(listNoteImages(db, "ABC-1"), images);
    assert.equal(images[0].mimeType, "image/jpeg");
    assert.equal(images[0].byteSize, 11);
    assert.equal(fs.existsSync(stored.storagePath), false);
    assert.equal(fs.readFileSync(getNoteImageFile(db, "ABC-1", images[0].id).storagePath, "utf8"), "replacement");
  });

  it("clears an empty replacement only after its database transaction commits", () => {
    const [original] = replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("original"), mimeType: "image/png", filename: "same.png" },
    ]);
    const stored = getNoteImageFile(db, "ABC-1", original.id);
    db.exec(`CREATE TRIGGER reject_clear BEFORE DELETE ON issue_note_images
      BEGIN SELECT RAISE(ABORT, 'controlled delete failure'); END`);

    assert.throws(() => replaceNoteImages(db, baseDir, "ABC-1", []), /controlled delete failure/);
    assert.deepEqual(listNoteImages(db, "ABC-1"), [original]);
    assert.equal(fs.readFileSync(stored.storagePath, "utf8"), "original");
    db.exec("DROP TRIGGER reject_clear");

    assert.deepEqual(replaceNoteImages(db, baseDir, "ABC-1", []), []);
    assert.deepEqual(listNoteImages(db, "ABC-1"), []);
    assert.equal(fs.existsSync(stored.storagePath), false);
  });

  it("returns committed images and a safe warning when old-file cleanup fails", () => {
    const [original] = replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("original"), mimeType: "image/png", filename: "private-name.png" },
    ]);
    const stored = getNoteImageFile(db, "ABC-1", original.id);
    const rmSync = fs.rmSync;
    mock.method(fs, "rmSync", (target, options) => {
      if (target === stored.storagePath || target === path.dirname(stored.storagePath)) {
        throw new Error(`private cleanup detail: ${stored.storagePath}`);
      }
      return rmSync(target, options);
    });
    const warnings = [];
    mock.method(console, "error", (...args) => warnings.push(args.join(" ")));

    const images = replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("replacement"), mimeType: "image/png", filename: "new.png" },
    ]);

    assert.deepEqual(listNoteImages(db, "ABC-1"), images);
    assert.equal(fs.readFileSync(getNoteImageFile(db, "ABC-1", images[0].id).storagePath, "utf8"), "replacement");
    assert.equal(warnings.length, 1);
    assert.doesNotMatch(warnings[0], /private|ABC-1|note-images-test-/);
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
