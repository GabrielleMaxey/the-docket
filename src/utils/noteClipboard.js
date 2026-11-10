// Converts pasted HTML (Word, Outlook, web pages) into the small markdown subset notes use.
// DOM-free on purpose so it is unit-tested under Node. Only a fixed set of tags is read;
// attributes (other than a vetted http/https href) and everything else are discarded.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });

const safeHref = (tag) => {
  const m = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
  const raw = decodeEntities((m && (m[1] ?? m[2] ?? m[3])) || "").trim();
  if (!/^https?:\/\/\S+$/i.test(raw)) return "";
  return raw.replace(/\(/g, "%28").replace(/\)/g, "%29");
};

const INLINE_MARK = { b: "**", strong: "**", i: "*", em: "*" };
const BLOCK_2 = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);
const BLOCK_1 = new Set(["div", "tr", "ul", "ol", "li", "blockquote", "table"]);

export function htmlToNoteMarkdown(html) {
  if (typeof html !== "string" || !html) return "";
  const source = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!--[\s\S]*$/, "")
    .replace(/<(script|style|head|title|xml)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|head|title|xml)\b[\s\S]*$/gi, "");

  let out = "";
  const stack = [];
  const lists = [];

  const breakBefore = (n) => {
    if (!out) return;
    const have = /\n*$/.exec(out)[0].length;
    if (have < n) out += "\n".repeat(n - have);
  };

  const closeFrame = (frame) => {
    const inner = out.slice(frame.start);
    const core = inner.trim();
    if (!core) return;
    const lead = /^\s*/.exec(inner)[0];
    const trail = /\s*$/.exec(inner)[0];
    let wrapped = null;
    if (frame.tag === "a") {
      if (frame.href) wrapped = `[${core}](${frame.href})`;
    } else {
      wrapped = `${INLINE_MARK[frame.tag]}${core}${INLINE_MARK[frame.tag]}`;
    }
    if (wrapped) out = out.slice(0, frame.start) + lead + wrapped + trail;
  };

  for (const piece of source.split(/(<\/?[a-zA-Z][^>]*>)/)) {
    const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(piece);
    if (!tagMatch || !piece.endsWith(">")) {
      let text = decodeEntities(piece).replace(/\s+/g, " ");
      if (!out || out.endsWith("\n")) text = text.replace(/^ /, "");
      out += text;
      continue;
    }
    const closing = tagMatch[1] === "/";
    const tag = tagMatch[2].toLowerCase();

    if (tag === "br") {
      out += "\n";
    } else if (tag in INLINE_MARK || tag === "a") {
      if (!closing) {
        stack.push({ tag, start: out.length, href: tag === "a" ? safeHref(piece) : "" });
      } else {
        const at = stack.map((f) => f.tag).lastIndexOf(tag);
        if (at !== -1) {
          const [frame] = stack.splice(at);
          closeFrame(frame);
        }
      }
    } else if (tag === "ul" || tag === "ol") {
      if (!closing) {
        breakBefore(1);
        lists.push({ ordered: tag === "ol", n: 0 });
      } else {
        lists.pop();
        breakBefore(1);
      }
    } else if (tag === "li") {
      breakBefore(1);
      if (!closing) {
        const list = lists[lists.length - 1];
        const indent = "  ".repeat(Math.max(lists.length - 1, 0));
        out += list?.ordered ? `${indent}${++list.n}. ` : `${indent}- `;
      }
    } else if (/^h[1-6]$/.test(tag)) {
      breakBefore(2);
      if (!closing) out += `${"#".repeat(Math.min(Number(tag[1]), 3))} `;
    } else if (BLOCK_2.has(tag)) {
      breakBefore(2);
    } else if (BLOCK_1.has(tag)) {
      breakBefore(1);
    } else if ((tag === "td" || tag === "th") && closing) {
      if (!out.endsWith(" ")) out += " ";
    }
  }
  while (stack.length) closeFrame(stack.pop());

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
