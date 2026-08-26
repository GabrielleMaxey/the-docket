export const NOTE_IMAGE_MAX_COUNT = 5;
export const NOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/vnd.ms-excel",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
  ".md",
  ".pdf",
  ".doc",
  ".docx",
  ".xlsx",
  ".csv",
]);

const fileExtension = (name) => {
  const raw = String(name || "");
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return "";
  return raw.slice(idx).toLowerCase();
};

export const isAllowedNoteImageMime = (mime, filename = "") => {
  const normalized = String(mime || "").trim().toLowerCase();
  if (ALLOWED_MIMES.has(normalized)) {
    return true;
  }
  if (!normalized || normalized === "application/octet-stream") {
    return ALLOWED_EXTENSIONS.has(fileExtension(filename));
  }
  return false;
};

export const NOTE_IMAGE_TOO_MANY_MESSAGE = `You can add up to ${NOTE_IMAGE_MAX_COUNT} files.`;
export const NOTE_IMAGE_BAD_MIME_MESSAGE =
  "Choose a PNG, JPEG, GIF, WebP, TXT, MD, PDF, DOC, DOCX, XLSX, or CSV file.";
export const NOTE_IMAGE_TOO_LARGE_MESSAGE = `Each file must be ${
  NOTE_IMAGE_MAX_BYTES / (1024 * 1024)
} MB or smaller.`;

export const validateNoteImageFile = (file, currentCount) => {
  if (currentCount >= NOTE_IMAGE_MAX_COUNT) {
    return { ok: false, error: NOTE_IMAGE_TOO_MANY_MESSAGE };
  }

  if (!isAllowedNoteImageMime(file?.type, file?.name || file?.originalname)) {
    return { ok: false, error: NOTE_IMAGE_BAD_MIME_MESSAGE };
  }

  if (file.size > NOTE_IMAGE_MAX_BYTES) {
    return { ok: false, error: NOTE_IMAGE_TOO_LARGE_MESSAGE };
  }

  return { ok: true };
};

export const partitionNoteImageFiles = (existingCount, files) => {
  const accepted = [];
  let error = "";

  for (const file of files || []) {
    const result = validateNoteImageFile(file, existingCount + accepted.length);
    if (!result.ok) {
      error = result.error;
      continue;
    }
    accepted.push(file);
  }

  return { accepted, error };
};
