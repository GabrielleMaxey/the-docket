// Identifies a note + attached images as pushed to Jira, so a text-only match
// doesn't hide the fact that images were added/removed since the last push.
export const buildNotePushFingerprint = ({ note, images } = {}) => {
  const noteText = String(note || "").trim();
  const imageIdentity = (images || [])
    .map((image) => `${image.localId}:${image.filename}:${image.byteSize}`)
    .join(",");

  return `${noteText}||${imageIdentity}`;
};
