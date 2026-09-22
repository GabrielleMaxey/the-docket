// Limits and validation for Jira issue attachments (Create Issue + Task Management rows).
// Shared by browser and proxy so both sides reject the same files with the same wording.
// Separate from noteImageLimits.mjs: note images are small inline comment media, while
// attachments include screen recordings (.mov) that can be hundreds of MB.

export const ATTACHMENT_MAX_COUNT = 10;
export const ATTACHMENT_DEFAULT_MAX_MB = 250;

const ALLOWED_EXTENSIONS = new Set([
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".svg",
  // Video / screen recordings
  ".mov", ".mp4", ".m4v", ".webm",
  // Documents
  ".pdf", ".txt", ".md", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".ppt", ".pptx",
  // Logs, config, data
  ".log", ".json", ".xml", ".yaml", ".yml", ".har",
  // Archives
  ".zip", ".gz", ".tgz",
]);

export const ATTACHMENT_ACCEPT = [...ALLOWED_EXTENSIONS].join(",");

export const attachmentExtension = (name) => {
  const raw = String(name || "");
  const idx = raw.lastIndexOf(".");
  return idx < 0 ? "" : raw.slice(idx).toLowerCase();
};

export const isAllowedAttachmentName = (filename) =>
  ALLOWED_EXTENSIONS.has(attachmentExtension(filename));

export const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const attachmentMaxBytes = (maxMb = ATTACHMENT_DEFAULT_MAX_MB) => maxMb * 1024 * 1024;

export const ATTACHMENT_BAD_TYPE_MESSAGE =
  "Unsupported file type. Use an image (PNG, JPG, GIF, WebP, HEIC), video (MOV, MP4, WebM), document (PDF, Office, TXT, MD, CSV), log/data file (LOG, JSON, XML, YAML, HAR), or archive (ZIP, GZ).";

export const attachmentTooManyMessage = (max = ATTACHMENT_MAX_COUNT) =>
  `You can attach up to ${max} files at a time.`;

export const attachmentTooLargeMessage = (maxMb = ATTACHMENT_DEFAULT_MAX_MB) =>
  `Each file must be ${maxMb} MB or smaller.`;

/**
 * Validates files being added to an existing selection.
 * @param {Array<{name: string, size: number}>} incoming
 * @param {Array<{name: string, size: number}>} existing
 * @returns {{ accepted: Array, errors: string[] }}
 */
export const validateAttachmentSelection = (
  incoming,
  existing = [],
  { maxCount = ATTACHMENT_MAX_COUNT, maxMb = ATTACHMENT_DEFAULT_MAX_MB } = {}
) => {
  const accepted = [];
  const errors = [];
  const maxBytes = attachmentMaxBytes(maxMb);
  const seen = new Set(existing.map((file) => `${file.name}:${file.size}`));

  for (const file of incoming || []) {
    const name = String(file?.name || "");
    if (!isAllowedAttachmentName(name)) {
      errors.push(`${name || "File"}: ${ATTACHMENT_BAD_TYPE_MESSAGE}`);
      continue;
    }
    if ((Number(file?.size) || 0) > maxBytes) {
      errors.push(`${name} is ${formatBytes(file.size)}. ${attachmentTooLargeMessage(maxMb)}`);
      continue;
    }
    if ((Number(file?.size) || 0) === 0) {
      errors.push(`${name} is empty.`);
      continue;
    }
    const identity = `${name}:${file.size}`;
    if (seen.has(identity)) {
      continue; // same file picked twice — silently ignore
    }
    if (existing.length + accepted.length >= maxCount) {
      errors.push(attachmentTooManyMessage(maxCount));
      break;
    }
    seen.add(identity);
    accepted.push(file);
  }

  return { accepted, errors };
};
