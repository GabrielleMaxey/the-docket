import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes,
  isAllowedAttachmentName,
  validateAttachmentSelection,
} from "../shared/attachmentLimits.mjs";
import { listIssueAttachments, uploadAttachmentsToIssue } from "../server/lib/jiraAttachments.mjs";

const MB = 1024 * 1024;

describe("attachment validation", () => {
  it("accepts PNG, MOV, and general document types", () => {
    for (const name of ["shot.PNG", "repro.mov", "run.log", "spec.pdf", "data.xlsx", "trace.har"]) {
      assert.equal(isAllowedAttachmentName(name), true, name);
    }
  });

  it("rejects executables and extensionless files", () => {
    for (const name of ["install.sh", "app.exe", "tool.command", "README"]) {
      assert.equal(isAllowedAttachmentName(name), false, name);
    }
  });

  it("rejects oversized and empty files, keeps the rest", () => {
    const { accepted, errors } = validateAttachmentSelection(
      [
        { name: "big.mov", size: 300 * MB },
        { name: "empty.png", size: 0 },
        { name: "ok.png", size: 2 * MB },
      ],
      [],
      { maxMb: 250 }
    );
    assert.deepEqual(accepted.map((f) => f.name), ["ok.png"]);
    assert.equal(errors.length, 2);
    assert.match(errors[0], /big\.mov is 300\.0 MB/);
  });

  it("enforces the file count and ignores duplicates", () => {
    const existing = [{ name: "a.png", size: 10 }];
    const { accepted, errors } = validateAttachmentSelection(
      [
        { name: "a.png", size: 10 },
        { name: "b.png", size: 10 },
        { name: "c.png", size: 10 },
      ],
      existing,
      { maxCount: 2 }
    );
    assert.deepEqual(accepted.map((f) => f.name), ["b.png"]);
    assert.match(errors[0], /up to 2 files/);
  });

  it("formats sizes", () => {
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1.5 * MB), "1.5 MB");
  });
});

describe("uploadAttachmentsToIssue", () => {
  const openBlob = async (_path, { type }) => new Blob(["x"], { type });

  it("uploads each file separately and reports partial failures", async () => {
    const calls = [];
    const jiraMultipartRequest = async ({ pathWithQuery, formData }) => {
      const file = formData.get("file");
      calls.push({ pathWithQuery, name: file.name });
      if (file.name === "huge.mov") {
        return { ok: false, status: 413, data: {} };
      }
      return { ok: true, status: 200, data: [{ id: 101, filename: file.name, size: 1, mimeType: file.type }] };
    };

    const result = await uploadAttachmentsToIssue({
      issueKey: "ODI-123",
      files: [
        { path: "/tmp/a", originalname: "screen.png", mimetype: "image/png", size: 1 },
        { path: "/tmp/b", originalname: "huge.mov", mimetype: "video/quicktime", size: 500 * MB },
      ],
      jiraMultipartRequest,
      openBlob,
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].pathWithQuery, "/rest/api/3/issue/ODI-123/attachments");
    assert.deepEqual(result.uploaded.map((a) => a.filename), ["screen.png"]);
    assert.equal(result.failed.length, 1);
    assert.match(result.failed[0].error, /huge\.mov .* larger than Jira allows/);
  });

  it("reports a read error without calling Jira", async () => {
    let called = false;
    const result = await uploadAttachmentsToIssue({
      issueKey: "ODI-1",
      files: [{ path: "/nope", originalname: "gone.png", mimetype: "image/png", size: 1 }],
      jiraMultipartRequest: async () => {
        called = true;
        return { ok: true, data: [] };
      },
      openBlob: async () => {
        throw new Error("ENOENT");
      },
    });
    assert.equal(called, false);
    assert.match(result.failed[0].error, /gone\.png failed to upload: ENOENT/);
  });
});

describe("listIssueAttachments", () => {
  it("returns newest first", async () => {
    const jiraRequest = async () => ({
      ok: true,
      data: {
        fields: {
          attachment: [
            { id: 1, filename: "old.png", size: 5, created: "2026-01-01T00:00:00.000+0000" },
            { id: 2, filename: "new.mov", size: 9, created: "2026-09-01T00:00:00.000+0000" },
          ],
        },
      },
    });
    const result = await listIssueAttachments({ issueKey: "ODI-1", jiraRequest });
    assert.deepEqual(result.attachments.map((a) => a.filename), ["new.mov", "old.png"]);
  });
});
