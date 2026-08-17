export const buildNotePushFingerprint = ({ note, images } = {}) => {
  const noteText = String(note || "").trim();
  const imageIdentity = (images || [])
    .map((image) => `${image.localId}:${image.filename}:${image.byteSize}`)
    .join(",");

  return `${noteText}||${imageIdentity}`;
};
