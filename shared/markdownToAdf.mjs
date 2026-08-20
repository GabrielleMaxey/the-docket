// Converts a small, common subset of markdown into Jira ADF nodes for note pushes:
// **bold**, *italic*/_italic_, `code`, [text](url), # headings, - / * bullet lists,
// 1. numbered lists, and line breaks (single newline -> hardBreak, blank line -> new
// paragraph). Anything not recognized is left as plain text, never dropped.

const INLINE_PATTERN =
  /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\(([^)]+)\)/;

const parseInline = (text) => {
  const nodes = [];
  let remaining = String(text || "");

  while (remaining.length > 0) {
    const match = INLINE_PATTERN.exec(remaining);
    if (!match) {
      nodes.push({ type: "text", text: remaining });
      break;
    }

    if (match.index > 0) {
      nodes.push({ type: "text", text: remaining.slice(0, match.index) });
    }

    if (match[1] !== undefined) {
      nodes.push({ type: "text", text: match[1], marks: [{ type: "code" }] });
    } else if (match[2] !== undefined || match[3] !== undefined) {
      nodes.push({ type: "text", text: match[2] ?? match[3], marks: [{ type: "strong" }] });
    } else if (match[4] !== undefined || match[5] !== undefined) {
      nodes.push({ type: "text", text: match[4] ?? match[5], marks: [{ type: "em" }] });
    } else if (match[6] !== undefined) {
      nodes.push({
        type: "text",
        text: match[6],
        marks: [{ type: "link", attrs: { href: match[7] } }],
      });
    }

    remaining = remaining.slice(match.index + match[0].length);
  }

  return nodes.filter((node) => node.text.length > 0);
};

const paragraphFromLines = (lines) => {
  const content = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      content.push({ type: "hardBreak" });
    }
    content.push(...parseInline(line));
  });
  return { type: "paragraph", content: content.length > 0 ? content : [{ type: "text", text: "" }] };
};

const listNode = (type, lines, stripPattern) => ({
  type,
  content: lines.map((line) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: parseInline(line.replace(stripPattern, "")) }],
  })),
});

const BULLET_LINE = /^[-*]\s+/;
const ORDERED_LINE = /^\d+\.\s+/;
const HEADING_LINE = /^(#{1,6})\s+(.*)$/;

const parseBlock = (rawBlock) => {
  const lines = rawBlock
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return null;
  }

  if (lines.every((line) => BULLET_LINE.test(line))) {
    return listNode("bulletList", lines, BULLET_LINE);
  }

  if (lines.every((line) => ORDERED_LINE.test(line))) {
    return listNode("orderedList", lines, ORDERED_LINE);
  }

  if (lines.length === 1) {
    const headingMatch = lines[0].match(HEADING_LINE);
    if (headingMatch) {
      return {
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: parseInline(headingMatch[2]),
      };
    }
  }

  return paragraphFromLines(lines);
};

// Returns a flat array of ADF block nodes — not a full { type: "doc", ... } document —
// so callers (e.g. note pushes) can append more nodes, like image attachments, after it.
export const markdownTextToAdfNodes = (text) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(/\n{2,}/)
    .map((block) => parseBlock(block))
    .filter(Boolean);
};
