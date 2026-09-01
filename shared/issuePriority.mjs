export const MAX_ISSUE_PRIORITY = 20;

export const clampIssuePriority = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_ISSUE_PRIORITY, Math.round(num)));
};
