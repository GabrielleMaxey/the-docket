import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import Database from "better-sqlite3";
import { initDatabase } from "../server/db/schema.mjs";
import { replaceNoteImages, listNoteImages } from "../server/lib/noteImageStore.mjs";
import { registerIssueMetadataRoutes } from "../server/routes/issueMetadataRoutes.mjs";

describe("issue metadata image routes", () => {
  let app;
  let baseDir;
  let db;
  let server;

  beforeEach(async () => {
    app = express();
    db = new Database(":memory:");
    initDatabase(db);
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "metadata-images-test-"));
    registerIssueMetadataRoutes(app, {
      db,
      noteImagesDir: baseDir,
      jiraRequest: async () => ({}),
      jiraMultipartRequest: async () => ({}),
      ensureEnvOrRespond: () => true,
      resolveJiraUser: async () => ({}),
    });
    server = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  const request = (pathname, options) =>
    fetch(`http://127.0.0.1:${server.address().port}${pathname}`, options);

  it("returns a response when a stored image disappears before streaming", async () => {
    const [image] = replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("image"), mimeType: "image/png", filename: "image.png" },
    ]);
    const stored = db
      .prepare("SELECT storage_path FROM issue_note_images WHERE id = ?")
      .get(image.id);
    fs.unlinkSync(stored.storage_path);

    const response = await request("/api/jira/issue-metadata/ABC-1/images/" + image.id);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Image not found" });
  });

  it("replaces kept images with an empty snapshot", async () => {
    replaceNoteImages(db, baseDir, "ABC-1", [
      { buffer: Buffer.from("image"), mimeType: "image/png", filename: "image.png" },
    ]);

    const response = await request("/api/jira/issue-metadata/ABC-1/images", {
      method: "POST",
      body: new FormData(),
    });

    assert.equal(response.status, 200);
    assert.equal(listNoteImages(db, "ABC-1").length, 0);
  });
});
