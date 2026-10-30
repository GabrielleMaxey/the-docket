// Pure helpers for SimpleMarkdown (kept free of JSX so node:test can load them).

// Bold/italic with underscores only counts at word edges, so names such as
// PSX_Coredump_handling or snake_case keys are not turned into italics.
export const INLINE_PATTERN_SOURCE =
  "`([^`]+)`|\\*\\*([^*]+)\\*\\*|(?<![A-Za-z0-9_])__([^_]+)__(?![A-Za-z0-9_])|\\*([^*\\n]+)\\*|(?<![A-Za-z0-9_])_([^_\\n]+)_(?![A-Za-z0-9_])|\\[([^\\]]+)\\]\\(([^)]+)\\)";

export const createInlinePattern = () => new RegExp(INLINE_PATTERN_SOURCE, "g");

const isPipeRow = (line) => {
  const t = String(line ?? "").trim();
  return t.length > 1 && t.startsWith("|");
};

// "| a | b |" -> ["a", "b"]. Escaped pipes (\|) stay inside the cell.
export const splitTableRow = (line) => {
  let t = String(line ?? "").trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  const cells = [];
  let cell = "";
  for (let i = 0; i < t.length; i += 1) {
    if (t[i] === "\\" && t[i + 1] === "|") {
      cell += "|";
      i += 1;
    } else if (t[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += t[i];
    }
  }
  cells.push(cell.trim());
  return cells;
};

export const isTableSeparator = (line) => {
  if (!isPipeRow(line)) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
};

const alignmentOf = (cell) => {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return null;
};

// Reads a pipe table that starts at lines[start]. Needs a header row followed by a separator row.
// Blank lines between rows are tolerated while the next non-blank line is still a pipe row, because
// models sometimes double-space table rows. Returns null when lines[start] does not begin a table.
export const parseMarkdownTable = (lines, start) => {
  if (!isPipeRow(lines[start]) || !isTableSeparator(lines[start + 1])) return null;
  const headerCells = splitTableRow(lines[start]);
  const aligns = splitTableRow(lines[start + 1]).map(alignmentOf);
  const rows = [];
  let i = start + 2;
  let next = i;
  while (i < lines.length) {
    if (isPipeRow(lines[i]) && !isTableSeparator(lines[i])) {
      rows.push(splitTableRow(lines[i]));
      i += 1;
      next = i;
    } else if (String(lines[i] ?? "").trim() === "") {
      let j = i;
      while (j < lines.length && String(lines[j] ?? "").trim() === "") j += 1;
      if (j < lines.length && isPipeRow(lines[j]) && !isTableSeparator(lines[j])) {
        i = j;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  const hasHeader = headerCells.some((c) => c !== "");
  const width = Math.max(headerCells.length, ...rows.map((r) => r.length));
  const pad = (cells) => Array.from({ length: width }, (_, k) => cells[k] ?? "");
  return {
    header: hasHeader ? pad(headerCells) : null,
    rows: rows.map(pad),
    aligns: Array.from({ length: width }, (_, k) => aligns[k] ?? null),
    nextIndex: next,
  };
};

// <details> / <summary> block (collapsed by default in the viewer; plain markdown elsewhere).
//   <details>
//   <summary>Title</summary>
//   ...markdown body...
//   </details>
// Returns null unless lines[start] is a bare <details> line with a matching </details>.
export const parseDetailsBlock = (lines, start) => {
  if (String(lines[start] ?? "").trim().toLowerCase() !== "<details>") return null;
  let end = -1;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (String(lines[i] ?? "").trim().toLowerCase() === "</details>") {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  let summary = "Details";
  let bodyStart = start + 1;
  const m = /^<summary>(.*)<\/summary>$/i.exec(String(lines[bodyStart] ?? "").trim());
  if (m) {
    summary = m[1].trim() || summary;
    bodyStart += 1;
  }
  return { summary, body: lines.slice(bodyStart, end).join("\n"), nextIndex: end + 1 };
};
