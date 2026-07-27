export const NOTE_IMAGE_MAX_COUNT = 5;
export const NOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_NOTE_IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export const isAllowedNoteImageMime = (mime) => ALLOWED_NOTE_IMAGE_MIMES.has(mime);

export const NOTE_IMAGE_TOO_MANY_MESSAGE = `You can add up to ${NOTE_IMAGE_MAX_COUNT} images.`;
export const NOTE_IMAGE_BAD_MIME_MESSAGE = "Choose a PNG, JPEG, GIF, or WebP image.";
export const NOTE_IMAGE_TOO_LARGE_MESSAGE = `Each image must be ${
  NOTE_IMAGE_MAX_BYTES / (1024 * 1024)
} MB or smaller.`;

export const validateNoteImageFile = (file, currentCount) => {
  if (currentCount >= NOTE_IMAGE_MAX_COUNT) {
    return { ok: false, error: NOTE_IMAGE_TOO_MANY_MESSAGE };
  }

  if (!isAllowedNoteImageMime(file?.type)) {
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
