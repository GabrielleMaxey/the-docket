export const errorMessage = (error, fallback) =>
  error instanceof Error ? error.message : fallback;

export const mergeIssueMapsPreferExisting = (previous, additions) => {
  const merged = { ...previous };
  Object.entries(additions || {}).forEach(([key, value]) => {
    if (merged[key] === undefined) {
      merged[key] = value;
    }
  });
  return merged;
};
