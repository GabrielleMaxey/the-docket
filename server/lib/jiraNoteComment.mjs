// Builds the ADF comment body for note pushes and orchestrates attachment
// upload + comment posting for note images (Task 3: multipart push).

export const buildNoteCommentAdf = ({ noteText = "", attachmentIds = [] } = {}) => {
  const content = [];
  const text = String(noteText || "").trim();

  if (text) {
    content.push({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
  }

  for (const id of attachmentIds || []) {
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
}) => {
  const attachmentIds = [];

  for (const image of imageBuffers) {
    const uploadResult = await jiraMultipartRequest({
      method: "POST",
      pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
      formData: buildAttachmentFormData(image),
    });

    if (!uploadResult.ok) {
      // Any attachments already uploaded in this loop (ids collected above) are
      // orphaned on the Jira issue — no comment references them, but they are
      // not rolled back here.
      return { ok: false, status: uploadResult.status, data: uploadResult.data };
    }

    const uploaded = Array.isArray(uploadResult.data) ? uploadResult.data[0] : uploadResult.data;
    if (uploaded?.id) {
      attachmentIds.push(String(uploaded.id));
    }
  }

  const commentResult = await jiraRequest({
    method: "POST",
    pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    body: { body: buildNoteCommentAdf({ noteText, attachmentIds }) },
  });

  if (!commentResult.ok) {
    return { ok: false, status: commentResult.status, data: commentResult.data };
  }

  return { ok: true, status: commentResult.status, data: commentResult.data };
};
