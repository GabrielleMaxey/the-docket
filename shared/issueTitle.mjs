// Issue titles under an epic read "[Project label] short ask". The label is the text inside the
// first [...] of the parent's title; a parent title with no brackets is used whole when it is short
// enough to be a name.

const LEADING_LABEL = /^\s*\[[^\]]*\]\s*/;
const MAX_UNBRACKETED_LABEL = 40;

export const extractTitleLabel = (parentTitle) => {
  const text = String(parentTitle ?? "").trim();
  if (!text) return "";
  const match = text.match(/\[([^\]]+)\]/);
  if (match) return match[1].trim();
  return text.length <= MAX_UNBRACKETED_LABEL ? text : "";
};

export const stripTitleLabel = (title) => String(title ?? "").replace(LEADING_LABEL, "").trim();

export const formatPrefixedTitle = (label, ask) => {
  const cleanAsk = stripTitleLabel(ask).replace(/[.\s]+$/, "");
  const cleanLabel = String(label ?? "").trim();
  if (!cleanLabel) return cleanAsk;
  return cleanAsk ? `[${cleanLabel}] ${cleanAsk}` : `[${cleanLabel}]`;
};

export const isLabelPrefixedTitle = (title) => /^\s*\[[^\]]+\]\s*\S/.test(String(title ?? ""));
