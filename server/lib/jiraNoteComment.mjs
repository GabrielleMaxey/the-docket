// Builds the ADF comment body for note pushes and orchestrates attachment
// upload + comment posting for note images.

const MEDIA_FILE_ID_RE = /\/file\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;

export const extractMediaIdFromUrl = (url) => {
  const match = String(url || "").match(MEDIA_FILE_ID_RE);
  return match ? match[1] : "";
};

export const buildNoteCommentAdf = ({ noteText = "", mediaIds = [] } = {}) => {
  const content = [];
  const text = String(noteText || "").trim();

  if (text) {
    content.push({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
  }

  for (const id of mediaIds || []) {
    content.push({
      type: "mediaSingle",
      attrs: { layout: "center" },
      content: [
        {
          type: "media",
          attrs: { type: "file", id: String(id), collection: "" },
        },
      ],
    });
  }

  return { type: "doc", version: 1, content };
};

const buildAttachmentFormData = ({ buffer, filename, mimeType }) => {
  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: mimeType }), filename);
  return formData;
};

export const pushNoteCommentWithImages = async ({
  issueKey,
  noteText = "",
  imageBuffers = [],
  jiraRequest,
  jiraMultipartRequest,
  resolveAttachmentMediaId,
}) => {
  const mediaIds = [];

  for (const image of imageBuffers) {
    const uploadResult = await jiraMultipartRequest({
      method: "POST",
      pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
      formData: buildAttachmentFormData(image),
    });

    if (!uploadResult.ok) {
      return { ok: false, status: uploadResult.status, data: uploadResult.data };
    }

    const uploaded = Array.isArray(uploadResult.data) ? uploadResult.data[0] : uploadResult.data;
    const attachmentId = uploaded?.id != null ? String(uploaded.id) : "";
    if (!attachmentId) {
      return {
        ok: false,
        status: 502,
        data: { error: "Jira attachment upload returned no id" },
      };
    }

    // ADF media nodes need the Media Services UUID, not the numeric attachment id.
    const mediaId = await resolveAttachmentMediaId(attachmentId);
    if (!mediaId) {
      return {
        ok: false,
        status: 502,
        data: {
          error: "Could not resolve Jira media id for uploaded attachment",
          attachmentId,
        },
      };
    }
    mediaIds.push(mediaId);
  }

  const commentResult = await jiraRequest({
    method: "POST",
    pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    body: { body: buildNoteCommentAdf({ noteText, mediaIds }) },
  });

  if (!commentResult.ok) {
    return { ok: false, status: commentResult.status, data: commentResult.data };
  }

  return { ok: true, status: commentResult.status, data: commentResult.data };
};
