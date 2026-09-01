import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNoteCommentAdf,
  extractMediaIdFromUrl,
  pushNoteCommentWithImages,
} from "../server/lib/jiraNoteComment.mjs";

describe("extractMediaIdFromUrl", () => {
  it("pulls the media UUID from a media download URL", () => {
    assert.equal(
      extractMediaIdFromUrl(
        "https://api.media.atlassian.com/file/6e7c7f2c-dd7a-499c-bceb-6f32bfbf32b5/binary?token=x"
      ),
      "6e7c7f2c-dd7a-499c-bceb-6f32bfbf32b5"
    );
  });

  it("returns empty string when no media id is present", () => {
    assert.equal(extractMediaIdFromUrl("https://example.com/other"), "");
  });
});

describe("buildNoteCommentAdf", () => {
  it("includes text paragraph and mediaSingle per media id", () => {
    const doc = buildNoteCommentAdf({
      noteText: "Hello",
      mediaIds: [
        "6e7c7f2c-dd7a-499c-bceb-6f32bfbf32b5",
        "7e7c7f2c-dd7a-499c-bceb-6f32bfbf32b6",
      ],
    });
    assert.equal(doc.type, "doc");
    const types = doc.content.map((n) => n.type);
    assert.ok(types.includes("paragraph"));
    assert.equal(types.filter((t) => t === "mediaSingle").length, 2);
  });

  it("allows images-only comment", () => {
    const doc = buildNoteCommentAdf({
      noteText: "",
      mediaIds: ["6e7c7f2c-dd7a-499c-bceb-6f32bfbf32b5"],
    });
    assert.equal(doc.content.some((n) => n.type === "mediaSingle"), true);
    assert.equal(doc.content.some((n) => n.type === "paragraph"), false);
  });

  it("uses the Jira Cloud media attachment attrs shape", () => {
    const mediaId = "6e7c7f2c-dd7a-499c-bceb-6f32bfbf32b5";
    const doc = buildNoteCommentAdf({ noteText: "", mediaIds: [mediaId] });
    const mediaSingle = doc.content.find((n) => n.type === "mediaSingle");
    const media = mediaSingle.content[0];
    assert.equal(media.type, "media");
    assert.equal(media.attrs.type, "file");
    assert.equal(media.attrs.id, mediaId);
  });
});

describe("pushNoteCommentWithImages", () => {
  it("uploads each image, resolves media ids, and posts the comment with them", async () => {
    const uploadCalls = [];
    const jiraMultipartRequest = async ({ pathWithQuery, formData }) => {
      uploadCalls.push({ pathWithQuery, formData });
      return { ok: true, status: 200, data: [{ id: `${uploadCalls.length}` }] };
    };

    const resolveAttachmentMediaId = async (attachmentId) =>
      `00000000-0000-4000-8000-00000000000${attachmentId}`;

    let commentBody = null;
    const jiraRequest = async ({ pathWithQuery, body }) => {
      commentBody = body;
      return { ok: true, status: 201, data: { id: "c1" } };
    };

    const result = await pushNoteCommentWithImages({
      issueKey: "ABC-1",
      noteText: "Hello",
      imageBuffers: [
        { buffer: Buffer.from("a"), filename: "a.png", mimeType: "image/png" },
        { buffer: Buffer.from("b"), filename: "b.png", mimeType: "image/png" },
      ],
      jiraRequest,
      jiraMultipartRequest,
      resolveAttachmentMediaId,
    });

    assert.equal(result.ok, true);
    assert.equal(uploadCalls.length, 2);
    assert.equal(uploadCalls[0].pathWithQuery, "/rest/api/3/issue/ABC-1/attachments");
    const mediaTypes = commentBody.body.content
      .filter((n) => n.type === "mediaSingle")
      .map((n) => n.content[0].attrs.id);
    assert.deepEqual(mediaTypes, [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("stops and returns failure when an upload fails", async () => {
    const jiraMultipartRequest = async () => ({ ok: false, status: 413, data: { error: "too big" } });
    const jiraRequest = async () => {
      throw new Error("comment should not be posted after a failed upload");
    };

    const result = await pushNoteCommentWithImages({
      issueKey: "ABC-1",
      noteText: "Hello",
      imageBuffers: [{ buffer: Buffer.from("a"), filename: "a.png", mimeType: "image/png" }],
      jiraRequest,
      jiraMultipartRequest,
      resolveAttachmentMediaId: async () => "unused",
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 413);
  });

  it("stops when media id resolution fails", async () => {
    const jiraMultipartRequest = async () => ({
      ok: true,
      status: 200,
      data: [{ id: "99" }],
    });
    const jiraRequest = async () => {
      throw new Error("comment should not be posted without a media id");
    };

    const result = await pushNoteCommentWithImages({
      issueKey: "ABC-1",
      noteText: "Hello",
      imageBuffers: [{ buffer: Buffer.from("a"), filename: "a.png", mimeType: "image/png" }],
      jiraRequest,
      jiraMultipartRequest,
      resolveAttachmentMediaId: async () => "",
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
  });
});
