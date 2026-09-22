// Uploads files to a Jira issue and lists existing attachments.
// Files arrive from multer disk storage and are streamed to Jira with fs.openAsBlob, so a
// large screen recording is never buffered fully in memory.

import { openAsBlob } from "node:fs";
import { unlink } from "node:fs/promises";
import { formatBytes } from "../../shared/attachmentLimits.mjs";

const jiraUploadErrorMessage = (result, file) => {
  const name = file?.originalname || "file";
  if (result?.status === 413) {
    return `${name} (${formatBytes(file?.size)}) is larger than Jira allows for attachments.`;
  }
  if (result?.status === 403) {
    return `You don't have permission to add attachments to this issue.`;
  }
  if (result?.status === 404) {
    return `Issue not found, or attachments are disabled on this Jira site.`;
  }
  const detail =
    result?.data?.errorMessages?.[0] || result?.data?.error || result?.data?.message || "";
  return `${name} failed to upload${detail ? `: ${detail}` : ` (HTTP ${result?.status || "error"})`}.`;
};

const toAttachmentSummary = (item) => ({
  id: item?.id != null ? String(item.id) : "",
  filename: String(item?.filename || ""),
  size: Number(item?.size) || 0,
  mimeType: String(item?.mimeType || ""),
  created: String(item?.created || ""),
  author: String(item?.author?.displayName || ""),
});

/**
 * Uploads each file separately so one bad file doesn't sink the rest.
 * @param {{ issueKey: string, files: Array<{path: string, originalname: string, mimetype: string, size: number}>,
 *           jiraMultipartRequest: Function, openBlob?: Function }} args
 */
export const uploadAttachmentsToIssue = async ({
  issueKey,
  files,
  jiraMultipartRequest,
  openBlob = openAsBlob,
}) => {
  const uploaded = [];
  const failed = [];

  for (const file of files || []) {
    try {
      const blob = await openBlob(file.path, { type: file.mimetype || "application/octet-stream" });
      const formData = new FormData();
      formData.append("file", blob, file.originalname);
      const result = await jiraMultipartRequest({
        method: "POST",
        pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
        formData,
      });
      if (!result?.ok) {
        failed.push({ filename: file.originalname, error: jiraUploadErrorMessage(result, file) });
        continue;
      }
      const items = Array.isArray(result.data) ? result.data : [result.data];
      uploaded.push(...items.filter(Boolean).map(toAttachmentSummary));
    } catch (error) {
      failed.push({
        filename: file.originalname,
        error: `${file.originalname} failed to upload: ${error instanceof Error ? error.message : "unknown error"}.`,
      });
    }
  }

  return { uploaded, failed };
};

export const listIssueAttachments = async ({ issueKey, jiraRequest }) => {
  const result = await jiraRequest({
    method: "GET",
    pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=attachment`,
  });
  if (!result?.ok) {
    return { ok: false, status: result?.status || 500, data: result?.data };
  }
  const attachments = (result.data?.fields?.attachment || []).map(toAttachmentSummary);
  attachments.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return { ok: true, attachments };
};

export const removeTempFiles = async (files) => {
  await Promise.all(
    (files || []).map((file) => (file?.path ? unlink(file.path).catch(() => {}) : null))
  );
};
