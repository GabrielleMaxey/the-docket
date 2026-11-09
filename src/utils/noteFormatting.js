// Pure text-edit helpers behind the note toolbar. Each takes and returns
// { value, selectionStart, selectionEnd } so they run (and are tested) without a DOM.

const clamp = (n, lo, hi) => Math.min(Math.max(Number.isFinite(n) ? n : 0, lo), hi);

const normalize = (edit) => {
  const value = String(edit?.value ?? "");
  const a = clamp(edit?.selectionStart, 0, value.length);
  const b = clamp(edit?.selectionEnd ?? a, 0, value.length);
  return { value, s: Math.min(a, b), e: Math.max(a, b) };
};

const lineStart = (v, i) => (i <= 0 ? 0 : v.lastIndexOf("\n", i - 1) + 1);
const lineEnd = (v, i) => {
  const at = v.indexOf("\n", i);
  return at === -1 ? v.length : at;
};
const isBlank = (line) => line.replace(/\r$/, "").trim() === "";
const makeEdit = (value, start, end = start) => ({ value, selectionStart: start, selectionEnd: end });

const PREFIX = { bullet: /^[-*] /, numbered: /^\d+\. /, quote: /^> / };

export function toggleWrap(edit, marker) {
  const { value, s, e } = normalize(edit);
  const m = marker.length;
  const selected = value.slice(s, e);
  if (s === e) {
    return makeEdit(value.slice(0, s) + marker + marker + value.slice(e), s + m);
  }
  const boldInItalic = marker === "*" && selected.startsWith("**") && selected.endsWith("**");
  if (selected.length >= m * 2 && selected.startsWith(marker) && selected.endsWith(marker) && !boldInItalic) {
    const inner = selected.slice(m, selected.length - m);
    return makeEdit(value.slice(0, s) + inner + value.slice(e), s, s + inner.length);
  }
  const surrounded =
    value.slice(s - m, s) === marker &&
    value.slice(e, e + m) === marker &&
    s - m >= 0 &&
    !(marker === "*" && (value[s - 2] === "*" || value[e + 1] === "*"));
  if (surrounded) {
    return makeEdit(value.slice(0, s - m) + selected + value.slice(e + m), s - m, e - m);
  }
  return makeEdit(value.slice(0, s) + marker + selected + marker + value.slice(e), s + m, e + m);
}

// Rewrites every line touched by the selection with fn(lines) -> lines.
function mapLines(edit, fn) {
  const { value, s, e: rawEnd } = normalize(edit);
  const e = rawEnd > s && value[rawEnd - 1] === "\n" ? rawEnd - 1 : rawEnd;
  const start = lineStart(value, s);
  const end = lineEnd(value, e);
  const oldLines = value.slice(start, end).split("\n");
  const newLines = fn(oldLines);
  const block = newLines.join("\n");
  const next = value.slice(0, start) + block + value.slice(end);
  if (s === rawEnd) {
    const delta = newLines[0].length - oldLines[0].length;
    return makeEdit(next, Math.max(start, s + delta));
  }
  return makeEdit(next, start, start + block.length);
}

export function toggleLinePrefix(edit, kind) {
  const re = PREFIX[kind];
  return mapLines(edit, (lines) => {
    const content = lines.filter((l) => !isBlank(l));
    const targets = content.length ? content : lines;
    const allHave = targets.every((l) => re.test(l));
    let n = 0;
    return lines.map((line) => {
      if (content.length && isBlank(line)) return line;
      if (allHave) return line.replace(re, "");
      const bare = kind === "quote" ? line : line.replace(PREFIX.bullet, "").replace(PREFIX.numbered, "");
      const prefix = kind === "bullet" ? "- " : kind === "quote" ? "> " : `${++n}. `;
      return re.test(bare) ? bare : prefix + bare;
    });
  });
}

export function setHeading(edit, level) {
  const hashes = level > 0 ? `${"#".repeat(Math.min(level, 3))} ` : "";
  return mapLines(edit, (lines) => {
    const hasContent = lines.some((l) => !isBlank(l));
    return lines.map((line) => (hasContent && isBlank(line) ? line : hashes + line.replace(/^#{1,6} /, "")));
  });
}

export function insertLink(edit, url) {
  const { value, s, e } = normalize(edit);
  const text = value.slice(s, e);
  const link = `[${text}](${url})`;
  const next = value.slice(0, s) + link + value.slice(e);
  return makeEdit(next, text ? s + link.length : s + 1);
}

export function continueList(edit) {
  const { value, s, e } = normalize(edit);
  if (s !== e) return null;
  const start = lineStart(value, s);
  let end = lineEnd(value, s);
  if (value[end - 1] === "\r") end -= 1;
  if (s !== end) return null;
  const match = /^(\s*)([-*]|\d+\.) (.*)$/.exec(value.slice(start, end));
  if (!match) return null;
  const [, indent, marker, rest] = match;
  if (rest.trim() === "") {
    return makeEdit(value.slice(0, start) + value.slice(end), start);
  }
  const eol = value.includes("\r\n") ? "\r\n" : "\n";
  const nextMarker = /^\d+\.$/.test(marker) ? `${parseInt(marker, 10) + 1}.` : marker;
  const insert = `${eol}${indent}${nextMarker} `;
  return makeEdit(value.slice(0, end) + insert + value.slice(end), end + insert.length);
}

export function linkOverSelection(edit, pastedText) {
  const { value, s, e } = normalize(edit);
  const url = String(pastedText ?? "").trim();
  if (s === e || !/^https?:\/\/\S+$/i.test(url)) return null;
  return insertLink({ value, selectionStart: s, selectionEnd: e }, url);
}
