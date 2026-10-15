import fs from "fs";
import path from "path";
import { createLogger } from "./logger.mjs";

const log = createLogger("note-images");

const sanitizeForPath = (value) => {
  const sanitized = String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "_");
  return sanitized || "_";
};

const noteImagesDirFor = (baseDir, issueKey) => path.join(baseDir, sanitizeForPath(issueKey));

const mapImageRow = (row) => ({
  id: row.id,
  mimeType: row.mime_type,
  filename: row.filename,
  byteSize: row.byte_size,
});

export const listNoteImages = (db, issueKey) =>
  db
    .prepare(
      "SELECT id, mime_type, filename, byte_size FROM issue_note_images WHERE issue_key = ? ORDER BY sort_order, id"
    )
    .all(issueKey)
    .map(mapImageRow);

export const getNoteImageFile = (db, issueKey, id) => {
  const row = db
    .prepare(
      "SELECT id, mime_type, filename, storage_path, byte_size FROM issue_note_images WHERE issue_key = ? AND id = ?"
    )
    .get(issueKey, id);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    mimeType: row.mime_type,
    filename: row.filename,
    byteSize: row.byte_size,
    storagePath: row.storage_path,
  };
};

export const deleteAllNoteImages = (db, baseDir, issueKey) => {
  db.prepare("DELETE FROM issue_note_images WHERE issue_key = ?").run(issueKey);
  fs.rmSync(noteImagesDirFor(baseDir, issueKey), { recursive: true, force: true });
};

// Snapshot replace, not incremental sync.
export const replaceNoteImages = (db, baseDir, issueKey, files) => {
  const oldPaths = db
    .prepare("SELECT storage_path FROM issue_note_images WHERE issue_key = ?")
    .all(issueKey)
    .map((row) => row.storage_path);
  const dir = noteImagesDirFor(baseDir, issueKey);
  let generationDir;
  let images;

  try {
    if (files?.length) {
      fs.mkdirSync(dir, { recursive: true });
      generationDir = fs.mkdtempSync(path.join(dir, "generation-"));
    }

    const staged = (files || []).map((file, index) => {
      const storagePath = path.join(generationDir, `${index}-${sanitizeForPath(file.filename)}`);
      fs.writeFileSync(storagePath, file.buffer);
      return {
        issueKey,
        sortOrder: index,
        mimeType: file.mimeType,
        filename: file.filename,
        storagePath,
        byteSize: file.buffer.length,
      };
    });

    images = db.transaction(() => {
      db.prepare("DELETE FROM issue_note_images WHERE issue_key = ?").run(issueKey);
      const insert = db.prepare(`
        INSERT INTO issue_note_images (issue_key, sort_order, mime_type, filename, storage_path, byte_size)
        VALUES (@issueKey, @sortOrder, @mimeType, @filename, @storagePath, @byteSize)
      `);
      return staged.map((file) => {
        const { lastInsertRowid: id } = insert.run(file);
        return { id: Number(id), mimeType: file.mimeType, filename: file.filename, byteSize: file.byteSize };
      });
    })();
  } catch (error) {
    if (generationDir) {
      try {
        fs.rmSync(generationDir, { recursive: true, force: true });
      } catch {
        log.warn("Failed to clean up staged note image files.");
      }
    }
    throw error;
  }

  try {
    for (const storagePath of oldPaths) {
      fs.rmSync(storagePath, { force: true });
    }
    for (const oldDir of new Set(oldPaths.map((storagePath) => path.dirname(storagePath)))) {
      if (oldDir !== dir && path.dirname(oldDir) === dir) {
        fs.rmdirSync(oldDir);
      }
    }
  } catch {
    log.warn("Failed to clean up old note image files after replacement committed.");
  }

  return images;
};
