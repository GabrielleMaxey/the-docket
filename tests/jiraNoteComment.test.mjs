import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNoteCommentAdf,
  pushNoteCommentWithImages,
} from "../server/lib/jiraNoteComment.mjs";

describe("buildNoteCommentAdf", () => {
  it("includes text paragraph and mediaSingle per attachment", () => {
    const doc = buildNoteCommentAdf({
      noteText: "Hello",
      attachmentIds: ["10001", "10002"],
    });
    assert.equal(doc.type, "doc");
    const types = doc.content.map((n) => n.type);
    assert.ok(types.includes("paragraph"));
    assert.equal(types.filter((t) => t === "mediaSingle").length, 2);
  });

  it("allows images-only comment", () => {
    const doc = buildNoteCommentAdf({ noteText: "", attachmentIds: ["1"] });
    assert.equal(doc.content.some((n) => n.type === "mediaSingle"), true);
    assert.equal(doc.content.some((n) => n.type === "paragraph"), false);
  });

  it("uses the Jira Cloud media attachment attrs shape", () => {
    const doc = buildNoteCommentAdf({ noteText: "", attachmentIds: ["10001"] });
    const mediaSingle = doc.content.find((n) => n.type === "mediaSingle");
    const media = mediaSingle.content[0];
    assert.equal(media.type, "media");
    assert.equal(media.attrs.type, "file");
    assert.equal(media.attrs.id, "10001");
  });
});

describe("pushNoteCommentWithImages", () => {
  it("uploads each image, collects attachment ids, and posts the comment with them", async () => {
    const uploadCalls = [];
    const jiraMultipartRequest = async ({ pathWithQuery, formData }) => {
      uploadCalls.push({ pathWithQuery, formData });
      return { ok: true, status: 200, data: [{ id: `${uploadCalls.length}` }] };
    };

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
    });

    assert.equal(result.ok, true);
    assert.equal(uploadCalls.length, 2);
    assert.equal(uploadCalls[0].pathWithQuery, "/rest/api/3/issue/ABC-1/attachments");
    const mediaTypes = commentBody.body.content
      .filter((n) => n.type === "mediaSingle")
      .map((n) => n.content[0].attrs.id);
    assert.deepEqual(mediaTypes, ["1", "2"]);
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
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 413);
  });
});
