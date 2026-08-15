// Disk + SQLite CRUD for "Keep on this machine" note image drafts.
// Images live under `<baseDir>/<sanitized issue key>/` with metadata in
// issue_note_images.

import fs from "fs";
import path from "path";

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

// Replaces the full kept-image set for an issue: deletes any previously kept
// images, then writes the given files. Keep-on is a snapshot of the current
// ephemeral images, not an incremental sync.
export const replaceNoteImages = (db, baseDir, issueKey, files) => {
  deleteAllNoteImages(db, baseDir, issueKey);

  if (!files || files.length === 0) {
    return [];
  }

  const dir = noteImagesDirFor(baseDir, issueKey);
  fs.mkdirSync(dir, { recursive: true });

  const insert = db.prepare(`
    INSERT INTO issue_note_images (issue_key, sort_order, mime_type, filename, storage_path, byte_size)
    VALUES (@issueKey, @sortOrder, @mimeType, @filename, @storagePath, @byteSize)
  `);

  return files.map((file, index) => {
    const storagePath = path.join(dir, `${index}-${sanitizeForPath(file.filename)}`);
    fs.writeFileSync(storagePath, file.buffer);

    const { lastInsertRowid: id } = insert.run({
      issueKey,
      sortOrder: index,
      mimeType: file.mimeType,
      filename: file.filename,
      storagePath,
      byteSize: file.buffer.length,
    });

    return { id: Number(id), mimeType: file.mimeType, filename: file.filename, byteSize: file.buffer.length };
  });
};
