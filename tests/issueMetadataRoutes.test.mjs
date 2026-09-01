import { describe, it } from "node:test";
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
  const withServer = async (testFn) => {
    const app = express();
    app.use(express.json());
    const db = new Database(":memory:");
    initDatabase(db);
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "metadata-images-test-"));
    registerIssueMetadataRoutes(app, {
      db,
      noteImagesDir: baseDir,
      jiraRequest: async () => ({ ok: true, status: 201, data: {} }),
      jiraMultipartRequest: async () => ({ ok: true, status: 201, data: {} }),
      resolveJiraAttachmentMediaId: async () => "6e7c7f2c-dd7a-499c-bceb-6f32bfbf32b5",
      ensureEnvOrRespond: () => true,
      resolveJiraUser: async () => ({}),
    });
    const server = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });

    const request = (pathname, options) =>
      fetch(`http://127.0.0.1:${server.address().port}${pathname}`, options);

    try {
      return await testFn({ db, baseDir, request });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  };

  it("returns a response when a stored image disappears before streaming", async () => {
    await withServer(async ({ db, baseDir, request }) => {
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
  });

  it("replaces kept images with an empty snapshot", async () => {
    await withServer(async ({ db, baseDir, request }) => {
      replaceNoteImages(db, baseDir, "ABC-1", [
        { buffer: Buffer.from("image"), mimeType: "image/png", filename: "image.png" },
      ]);

      const response = await request("/api/jira/issue-metadata/ABC-1/images", {
        method: "POST",
        body: new FormData(),
      });

      assert.equal(response.status, 200);
      assert.equal(listNoteImages(db, "ABC-1").length, 0);
      assert.equal(
        db.prepare("SELECT keep_note_images FROM issue_metadata WHERE issue_key = ?").get("ABC-1")
          .keep_note_images,
        0
      );
    });
  });

  it("preserves kept images after a text-only comment push", async () => {
    await withServer(async ({ db, baseDir, request }) => {
      replaceNoteImages(db, baseDir, "ABC-1", [
        { buffer: Buffer.from("image"), mimeType: "image/png", filename: "image.png" },
      ]);
      db.prepare("INSERT INTO issue_metadata (issue_key, keep_note_images) VALUES (?, 1)").run("ABC-1");

      const response = await request("/api/jira/issues/ABC-1/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Text only" }),
      });

      assert.equal(response.status, 200);
      assert.equal(listNoteImages(db, "ABC-1").length, 1);
      assert.equal(
        db.prepare("SELECT keep_note_images FROM issue_metadata WHERE issue_key = ?").get("ABC-1")
          .keep_note_images,
        1
      );
    });
  });
});

describe("issue metadata date fields", () => {
  const withServer = async (testFn, { jiraRequest } = {}) => {
    const app = express();
    app.use(express.json());
    const db = new Database(":memory:");
    initDatabase(db);
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "metadata-dates-test-"));
    const jiraRequestCalls = [];
    registerIssueMetadataRoutes(app, {
      db,
      noteImagesDir: baseDir,
      jiraRequest:
        jiraRequest ||
        (async (options) => {
          jiraRequestCalls.push(options);
          return { ok: true, status: 204, data: null };
        }),
      jiraMultipartRequest: async () => ({ ok: true, status: 201, data: {} }),
      resolveJiraAttachmentMediaId: async () => "irrelevant",
      ensureEnvOrRespond: () => true,
      resolveJiraUser: async () => ({}),
    });
    const server = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });

    const request = (pathname, options) =>
      fetch(`http://127.0.0.1:${server.address().port}${pathname}`, options);

    try {
      return await testFn({ db, request, jiraRequestCalls });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  };

  it("saves and returns startDate via the PUT issue-metadata route", async () => {
    await withServer(async ({ db, request }) => {
      const response = await request("/api/jira/issue-metadata/ABC-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-03-01" }),
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.startDate, "2026-03-01");
      assert.equal(
        db.prepare("SELECT start_date FROM issue_metadata WHERE issue_key = ?").get("ABC-1").start_date,
        "2026-03-01"
      );
    });
  });

  it("preserves note and priority when only startDate is updated", async () => {
    await withServer(async ({ db, request }) => {
      db.prepare(
        "INSERT INTO issue_metadata (issue_key, note, priority, start_date) VALUES (?, ?, ?, ?)"
      ).run("ABC-1", "existing note", 5, "");

      const response = await request("/api/jira/issue-metadata/ABC-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-03-01" }),
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.note, "existing note");
      assert.equal(body.priority, 5);
    });
  });

  it("returns startDate from the bulk metadata route", async () => {
    await withServer(async ({ db, request }) => {
      db.prepare(
        "INSERT INTO issue_metadata (issue_key, start_date) VALUES (?, ?)"
      ).run("ABC-1", "2026-03-01");

      const response = await request("/api/jira/issue-metadata/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueKeys: ["ABC-1"] }),
      });

      const body = await response.json();
      assert.equal(body.items["ABC-1"].startDate, "2026-03-01");
    });
  });

  it("saves and returns completeDate independently of startDate", async () => {
    await withServer(async ({ db, request }) => {
      const response = await request("/api/jira/issue-metadata/ABC-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completeDate: "2026-04-15" }),
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.completeDate, "2026-04-15");
      assert.equal(body.startDate, "");
      assert.equal(
        db.prepare("SELECT complete_date FROM issue_metadata WHERE issue_key = ?").get("ABC-1")
          .complete_date,
        "2026-04-15"
      );
    });
  });

  it("preserves completeDate when only startDate is updated, and vice versa", async () => {
    await withServer(async ({ request }) => {
      await request("/api/jira/issue-metadata/ABC-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-03-01", completeDate: "2026-04-15" }),
      });

      const response = await request("/api/jira/issue-metadata/ABC-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-03-10" }),
      });

      const body = await response.json();
      assert.equal(body.startDate, "2026-03-10");
      assert.equal(body.completeDate, "2026-04-15");
    });
  });

  it("returns completeDate from the bulk metadata route", async () => {
    await withServer(async ({ db, request }) => {
      db.prepare(
        "INSERT INTO issue_metadata (issue_key, complete_date) VALUES (?, ?)"
      ).run("ABC-1", "2026-04-15");

      const response = await request("/api/jira/issue-metadata/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueKeys: ["ABC-1"] }),
      });

      const body = await response.json();
      assert.equal(body.items["ABC-1"].completeDate, "2026-04-15");
    });
  });

  it("CSV priority import preserves existing start/complete dates instead of wiping them", async () => {
    await withServer(async ({ db, request }) => {
      db.prepare(
        "INSERT INTO issue_metadata (issue_key, note, priority, start_date, complete_date) VALUES (?, ?, ?, ?, ?)"
      ).run("ABC-1", "", 0, "2026-03-01", "2026-04-15");

      const response = await request("/api/jira/issue-metadata/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText: "Key,Priority\nABC-1,5\n" }),
      });

      assert.equal(response.status, 200);
      const row = db
        .prepare("SELECT priority, start_date, complete_date FROM issue_metadata WHERE issue_key = ?")
        .get("ABC-1");
      assert.equal(row.priority, 5);
      assert.equal(row.start_date, "2026-03-01");
      assert.equal(row.complete_date, "2026-04-15");
    });
  });

  it("rejects an invalid role for the date-field route", async () => {
    await withServer(async ({ request }) => {
      const response = await request("/api/jira/issues/ABC-1/date-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "start_date", value: "2026-03-01" }),
      });

      assert.equal(response.status, 400);
    });
  });

  it("rejects a malformed date value for the date-field route", async () => {
    await withServer(async ({ request }) => {
      const response = await request("/api/jira/issues/ABC-1/date-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "due_date", value: "03/01/2026" }),
      });

      assert.equal(response.status, 400);
    });
  });

  it("pushes due_date to Jira's native duedate field by default", async () => {
    await withServer(async ({ request, jiraRequestCalls }) => {
      const response = await request("/api/jira/issues/ABC-1/date-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "due_date", value: "2026-03-01" }),
      });

      assert.equal(response.status, 200);
      assert.equal(jiraRequestCalls.length, 1);
      assert.equal(jiraRequestCalls[0].method, "PUT");
      assert.equal(jiraRequestCalls[0].pathWithQuery, "/rest/api/3/issue/ABC-1");
      assert.deepEqual(jiraRequestCalls[0].body, { fields: { duedate: "2026-03-01" } });
    });
  });

  it("pushes most_recent_done_date to the mapped custom field", async () => {
    await withServer(async ({ request, jiraRequestCalls }) => {
      const response = await request("/api/jira/issues/ABC-1/date-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "most_recent_done_date", value: "2026-03-01" }),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(jiraRequestCalls[0].body, {
        fields: { customfield_10009: "2026-03-01" },
      });
    });
  });

  it("clears a date by sending null when value is empty", async () => {
    await withServer(async ({ request, jiraRequestCalls }) => {
      const response = await request("/api/jira/issues/ABC-1/date-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "due_date", value: "" }),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(jiraRequestCalls[0].body, { fields: { duedate: null } });
    });
  });

  it("respects a custom MRD field mapping from Settings", async () => {
    await withServer(async ({ db, request, jiraRequestCalls }) => {
      db.prepare(
        "UPDATE jira_field_mappings SET field_id = ? WHERE role = 'most_recent_done_date'"
      ).run("customfield_99999");

      const response = await request("/api/jira/issues/ABC-1/date-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "most_recent_done_date", value: "2026-03-01" }),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(jiraRequestCalls[0].body, {
        fields: { customfield_99999: "2026-03-01" },
      });
    });
  });

  it("surfaces a Jira error response as-is", async () => {
    await withServer(
      async ({ request }) => {
        const response = await request("/api/jira/issues/ABC-1/date-field", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "due_date", value: "2026-03-01" }),
        });

        assert.equal(response.status, 400);
        const body = await response.json();
        assert.equal(body.errorMessages?.[0], "Field 'duedate' cannot be set.");
      },
      {
        jiraRequest: async () => ({
          ok: false,
          status: 400,
          data: { errorMessages: ["Field 'duedate' cannot be set."] },
        }),
      }
    );
  });
});
