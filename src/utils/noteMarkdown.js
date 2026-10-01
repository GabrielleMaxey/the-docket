const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatInline = (raw) => {
  let text = escapeHtml(raw);
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  text = text.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>'
  );
  return text;
};

/** Safe HTML for the small markdown subset we store in notes (from Jira ADF pull / manual markdown). */
export const noteMarkdownToHtml = (markdown) => {
  const source = String(markdown || "").replace(/\r\n/g, "\n").trim();
  if (!source) return "";

  const blocks = source.split(/\n{2,}/);
  const html = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trimEnd());
    if (lines.length === 0) continue;

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      html.push(
        `<ul>${lines
          .map((line) => `<li>${formatInline(line.replace(/^[-*]\s+/, ""))}</li>`)
          .join("")}</ul>`
      );
      continue;
    }

    if (lines.every((line) => /^\d+\.\s+/.test(line))) {
      html.push(
        `<ol>${lines
          .map((line) => `<li>${formatInline(line.replace(/^\d+\.\s+/, ""))}</li>`)
          .join("")}</ol>`
      );
      continue;
    }

    if (lines.every((line) => /^>\s?/.test(line))) {
      html.push(
        `<blockquote>${lines
          .map((line) => formatInline(line.replace(/^>\s?/, "")))
          .join("<br/>")}</blockquote>`
      );
      continue;
    }

    if (lines[0].startsWith("```")) {
      const lang = lines[0].slice(3).trim();
      const codeLines = lines.slice(1);
      if (codeLines[codeLines.length - 1] === "```") {
        codeLines.pop();
      }
      html.push(
        `<pre${lang ? ` data-lang="${escapeHtml(lang)}"` : ""}><code>${escapeHtml(
          codeLines.join("\n")
        )}</code></pre>`
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      const level = Math.min(4, heading[1].length);
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }

    if (lines.length === 1 && /^(-{3,}|\*{3,}|_{3,})$/.test(lines[0].trim())) {
      html.push("<hr/>");
      continue;
    }

    html.push(`<p>${lines.map((line) => formatInline(line)).join("<br/>")}</p>`);
  }

  return html.join("");
};
