export const NOTE_IMAGE_MAX_COUNT = 5;
export const NOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_NOTE_IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export const isAllowedNoteImageMime = (mime) => ALLOWED_NOTE_IMAGE_MIMES.has(mime);

export const validateNoteImageFile = (file, currentCount) => {
  if (currentCount >= NOTE_IMAGE_MAX_COUNT) {
    return { ok: false, error: `You can add up to ${NOTE_IMAGE_MAX_COUNT} images.` };
  }

  if (!isAllowedNoteImageMime(file?.type)) {
    return { ok: false, error: "Choose a PNG, JPEG, GIF, or WebP image." };
  }

  if (file.size > NOTE_IMAGE_MAX_BYTES) {
    return { ok: false, error: "Each image must be 5 MB or smaller." };
  }

  return { ok: true };
};
