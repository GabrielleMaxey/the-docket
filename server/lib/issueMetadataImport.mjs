const ISSUE_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/i;

export const normalizeImportIssueKey = (value) => String(value || "").trim().toUpperCase();

export const parseImportPriority = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const prefixed = raw.match(/^(?:PRIORITY\s+)?P(\d{1,2})$/i);
  if (prefixed) {
    const priority = Number(prefixed[1]);
    return Number.isFinite(priority) && priority >= 1 && priority <= 10 ? priority : null;
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const rounded = Math.round(numeric);
  return rounded >= 1 && rounded <= 10 ? rounded : null;
};

const parseCsvLine = (line) => {
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
    } else if (ch === ",") {
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

/**
 * Parse NORA tracker CSV into row objects.
 * Required headers: ODI, Priority. Optional: notes.
 */
export const parseIssueMetadataCsv = (csvText) => {
  const lines = splitCsvLines(csvText);
  if (lines.length === 0) {
    return { ok: false, error: "CSV is empty" };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const odiIndex = headers.indexOf("odi");
  const priorityIndex = headers.indexOf("priority");
  const notesIndex = headers.indexOf("notes");

  if (odiIndex < 0 || priorityIndex < 0) {
    return { ok: false, error: "CSV must include ODI and Priority columns" };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    rows.push({
      rowNumber: i + 1,
      odi: cells[odiIndex] ?? "",
      priority: cells[priorityIndex] ?? "",
      notes: notesIndex >= 0 ? cells[notesIndex] ?? "" : "",
    });
  }

  return { ok: true, rows };
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
