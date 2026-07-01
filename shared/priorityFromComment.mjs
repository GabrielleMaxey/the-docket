/**
 * Parse team priority prefix from Jira comment text (PRIORITY P1 … P10).
 * Used when PMs/managers push ranking via comment convention.
 */
export const parsePriorityFromComment = (text) => {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^PRIORITY\s+P(\d{1,2})\b(?:\s*[—–-]\s*)?/i);
  if (!match) {
    return null;
  }

  const priority = Number(match[1]);
  if (!Number.isFinite(priority) || priority < 1 || priority > 10) {
    return null;
  }

  const noteSnippet = raw.slice(match[0].length).trim();
  return { priority, noteSnippet };
};
