const ISSUE_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/i;
const ISSUE_KEY_FIND_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/i;
const DEFAULT_PROJECT_KEY = "ODI";

export const normalizeImportIssueKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (ISSUE_KEY_RE.test(raw)) {
    return raw.toUpperCase();
  }
  const found = raw.match(ISSUE_KEY_FIND_RE);
  if (found) {
    return found[1].toUpperCase();
  }
  // "ODI 25789" / "ODI_25789" / "odi- 25789"
  const spaced = raw.match(/^([A-Z][A-Z0-9]+)[\s_-]+(\d+)$/i);
  if (spaced) {
    return `${spaced[1].toUpperCase()}-${spaced[2]}`;
  }
  // Bare numeric key from Excel exports → assume ODI
  if (/^\d{3,6}$/.test(raw)) {
    return `${DEFAULT_PROJECT_KEY}-${raw}`;
  }
  return raw.toUpperCase();
};

export const parseImportPriority = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  // Section labels like "Completed" are not priorities.
  if (/^[A-Za-z]/.test(raw) && !/^(?:PRIORITY\s+)?P\d/i.test(raw)) {
    return null;
  }

  const prefixed = raw.match(/^(?:PRIORITY\s+)?P(\d{1,3})\b/i);
  if (prefixed) {
    const priority = Number(prefixed[1]);
    if (!Number.isFinite(priority) || priority < 1) {
      return null;
    }
    // App stores P1–P20; spreadsheet stack ranks may go past 20.
    return Math.min(20, Math.round(priority));
  }

  // Stack rank from Excel: "1", "13", "1.0", "1 - Critical"
  const leadingNumber = raw.match(/^(\d{1,3})(?:[.,]\d+)?\b/);
  if (leadingNumber) {
    const priority = Number(leadingNumber[1]);
    if (!Number.isFinite(priority) || priority < 1) {
      return null;
    }
    return Math.min(20, Math.round(priority));
  }

  return null;
};

const isSectionLabel = (value) => {
  const raw = String(value || "").trim();
  return /^(completed|done|backlog|unranked|parked|deferred)$/i.test(raw);
};

const detectDelimiter = (headerLine) => {
  const comma = (headerLine.match(/,/g) || []).length;
  const semicolon = (headerLine.match(/;/g) || []).length;
  const tab = (headerLine.match(/\t/g) || []).length;
  if (tab > comma && tab > semicolon) {
    return "\t";
  }
  if (semicolon > comma) {
    return ";";
  }
  return ",";
};

const parseCsvLine = (line, delimiter = ",") => {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
};

const splitCsvLines = (text) =>
  String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

const normalizeHeader = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const headerMatches = (header, match) => {
  if (!header) {
    return false;
  }
  if (typeof match !== "string") {
    return match.test(header);
  }
  return header === match || header.startsWith(`${match} `) || header.endsWith(` ${match}`);
};

const scoreHeaderRow = (headers) => {
  let score = 0;
  if (headers.some((h) => headerMatches(h, "odi") || headerMatches(h, "issue key") || headerMatches(h, "key") || headerMatches(h, "issue"))) {
    score += 2;
  }
  if (headers.some((h) => headerMatches(h, "priority") || headerMatches(h, "prio") || headerMatches(h, "rank") || /priorit/.test(h))) {
    score += 2;
  }
  if (headers.some((h) => h.includes("developer") || h.includes("status") || h.includes("note"))) {
    score += 1;
  }
  return score;
};

const findHeaderIndex = (headers, matchers) => {
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    for (const match of matchers) {
      if (headerMatches(header, match)) {
        return i;
      }
    }
  }
  return -1;
};
export const looksLikeBinarySpreadsheet = (text) => {
  const sample = String(text || "").slice(0, 16);
  if (!sample) {
    return false;
  }
  // OLE compound document (encrypted/legacy .xls/.xlsx) or ZIP-based xlsx magic
  if (sample.charCodeAt(0) === 0xd0 && sample.charCodeAt(1) === 0xcf) {
    return true;
  }
  if (sample.startsWith("PK")) {
    return true;
  }
  let weird = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code === 0 || code > 127) {
      weird += 1;
    }
  }
  return weird >= 4;
};

/**
 * Parse NORA tracker CSV into row objects.
 * Required headers: ODI (or issue key), Priority. Optional: notes.
 * Supports comma, semicolon, and tab-delimited Excel exports.
 * Skips title rows above the real header.
 */
export const parseIssueMetadataCsv = (csvText) => {
  if (looksLikeBinarySpreadsheet(csvText)) {
    return {
      ok: false,
      error:
        "That looks like an Excel workbook (.xlsx), not CSV. In Excel use File → Save As → CSV UTF-8 (unencrypted), then import the .csv file.",
    };
  }

  const lines = splitCsvLines(csvText);
  if (lines.length === 0) {
    return { ok: false, error: "CSV is empty" };
  }

  let best = null;
  const scanLimit = Math.min(lines.length, 15);
  for (let lineIndex = 0; lineIndex < scanLimit; lineIndex += 1) {
    const delimiter = detectDelimiter(lines[lineIndex]);
    const headers = parseCsvLine(lines[lineIndex], delimiter).map(normalizeHeader);
    const score = scoreHeaderRow(headers);
    const odiIndex = findHeaderIndex(headers, ["odi", "issue key", "issue key", "issue", "key", /^jira\s*key$/]);
    const priorityIndex = findHeaderIndex(headers, ["priority", "prio", "rank", /priorit/]);
    if (odiIndex < 0 || priorityIndex < 0) {
      continue;
    }
    if (!best || score > best.score) {
      best = {
        score,
        delimiter,
        headers,
        odiIndex,
        priorityIndex,
        notesIndex: findHeaderIndex(headers, ["notes", "note", "comments", "comment"]),
        headerLineIndex: lineIndex,
      };
    }
  }

  if (!best) {
    const preview = splitCsvLines(csvText)
      .slice(0, 3)
      .map((line) => line.slice(0, 120))
      .join(" / ");
    return {
      ok: false,
      error: `CSV must include ODI and Priority columns. Preview: ${preview || "(empty)"}`,
    };
  }

  const rows = [];
  for (let i = best.headerLineIndex + 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], best.delimiter);
    rows.push({
      rowNumber: i + 1,
      odi: cells[best.odiIndex] ?? "",
      priority: cells[best.priorityIndex] ?? "",
      notes: best.notesIndex >= 0 ? cells[best.notesIndex] ?? "" : "",
    });
  }

  return {
    ok: true,
    rows,
    delimiter: best.delimiter,
    headers: best.headers,
    headerLineIndex: best.headerLineIndex,
  };
};

/**
 * Plan upserts from parsed CSV rows and existing metadata map.
 * existingByKey: { [issueKey]: { note, priority } }
 */
export const planIssueMetadataImport = (rows, existingByKey = {}) => {
  const upserts = [];
  const errors = [];
  let updatedPriorities = 0;
  let filledNotes = 0;
  let skipped = 0;

  for (const row of rows || []) {
    const issueKey = normalizeImportIssueKey(row.odi);
    const priorityRaw = String(row.priority || "").trim();

    // Unranked rows (blank priority) and section headers — skip quietly.
    if (!priorityRaw || isSectionLabel(priorityRaw)) {
      skipped += 1;
      continue;
    }

    if (!issueKey || !ISSUE_KEY_RE.test(issueKey)) {
      skipped += 1;
      errors.push({
        row: row.rowNumber,
        reason: `Missing or invalid ODI issue key (${String(row.odi || "").slice(0, 40) || "empty"})`,
      });
      continue;
    }

    const priority = parseImportPriority(row.priority);
    if (priority == null) {
      skipped += 1;
      errors.push({
        row: row.rowNumber,
        reason: `Invalid priority (${priorityRaw.slice(0, 40)}; need a number rank or P1–P20)`,
      });
      continue;
    }

    const existing = existingByKey[issueKey] || {};
    const existingNote = String(existing.note || "");
    const csvNote = String(row.notes || "").trim();
    const shouldFillNote = !existingNote.trim() && Boolean(csvNote);
    const nextNote = shouldFillNote ? csvNote : existingNote;

    upserts.push({
      issueKey,
      priority,
      note: nextNote,
      filledNote: shouldFillNote,
    });
    updatedPriorities += 1;
    if (shouldFillNote) {
      filledNotes += 1;
    }
  }

  return { upserts, updatedPriorities, filledNotes, skipped, errors };
};
