export const ISSUE_KEY_BATCH_SIZE = 50;

export const chunkValues = (values, size = ISSUE_KEY_BATCH_SIZE) => {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};
