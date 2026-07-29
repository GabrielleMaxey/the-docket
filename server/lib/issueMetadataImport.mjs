const ISSUE_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/i;
const ISSUE_KEY_FIND_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/i;

export const normalizeImportIssueKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (ISSUE_KEY_RE.test(raw)) {
    return raw.toUpperCase();
  }
  const found = raw.match(ISSUE_KEY_FIND_RE);
  return found ? found[1].toUpperCase() : raw.toUpperCase();
};

export const parseImportPriority = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const prefixed = raw.match(/^(?:PRIORITY\s+)?P(\d{1,2})\b/i);
  if (prefixed) {
    const priority = Number(prefixed[1]);
    return Number.isFinite(priority) && priority >= 1 && priority <= 10 ? priority : null;
  }

  const leadingNumber = raw.match(/^(\d{1,2})\b/);
  if (leadingNumber) {
    const priority = Number(leadingNumber[1]);
    return Number.isFinite(priority) && priority >= 1 && priority <= 10 ? priority : null;
  }

  return null;
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

const findHeaderIndex = (headers, candidates) => {
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate);
    if (index >= 0) {
      return index;
    }
  }
  return -1;
};

/**
 * Parse NORA tracker CSV into row objects.
 * Required headers: ODI (or issue key), Priority. Optional: notes.
 * Supports comma, semicolon, and tab-delimited Excel exports.
 */
export const parseIssueMetadataCsv = (csvText) => {
  const lines = splitCsvLines(csvText);
  if (lines.length === 0) {
    return { ok: false, error: "CSV is empty" };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
  const odiIndex = findHeaderIndex(headers, ["odi", "issue key", "issue", "key", "odi key"]);
  const priorityIndex = findHeaderIndex(headers, ["priority", "prio", "rank"]);
  const notesIndex = findHeaderIndex(headers, ["notes", "note", "comments", "comment"]);

  if (odiIndex < 0 || priorityIndex < 0) {
    return {
      ok: false,
      error: `CSV must include ODI and Priority columns (found: ${headers.filter(Boolean).join(", ") || "none"})`,
    };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], delimiter);
    rows.push({
      rowNumber: i + 1,
      odi: cells[odiIndex] ?? "",
      priority: cells[priorityIndex] ?? "",
      notes: notesIndex >= 0 ? cells[notesIndex] ?? "" : "",
    });
  }

  return { ok: true, rows, delimiter };
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
    if (!issueKey || !ISSUE_KEY_RE.test(issueKey)) {
      skipped += 1;
      errors.push({ row: row.rowNumber, reason: "Missing or invalid ODI issue key" });
      continue;
    }

    const priority = parseImportPriority(row.priority);
    if (priority == null) {
      skipped += 1;
      errors.push({ row: row.rowNumber, reason: "Invalid priority" });
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
