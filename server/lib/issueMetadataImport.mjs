import { clampIssuePriority } from "../../shared/issuePriority.mjs";
import { IMPORT_FIELDS, METADATA_DATE_FIELDS, validateMetadataPatch } from "../../shared/issueMetadataFields.mjs";

const ISSUE_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/i;
const ISSUE_KEY_FIND_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/i;
const DEFAULT_PROJECT_KEY = "";

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
  // "PROJ 25789" / "PROJ_25789" / "proj- 25789"
  const spaced = raw.match(/^([A-Z][A-Z0-9]+)[\s_-]+(\d+)$/i);
  if (spaced) {
    return `${spaced[1].toUpperCase()}-${spaced[2]}`;
  }
  // Bare numeric key from Excel exports → assume project key
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

  if (/^[A-Za-z]/.test(raw) && !/^(?:PRIORITY\s+)?P\d/i.test(raw)) {
    return null;
  }

  const prefixed = raw.match(/^(?:PRIORITY\s+)?P(\d{1,3})\b/i);
  if (prefixed) {
    const priority = Number(prefixed[1]);
    if (!Number.isFinite(priority) || priority < 1) {
      return null;
    }
    return clampIssuePriority(priority);
  }

  const leadingNumber = raw.match(/^(\d{1,3})(?:[.,]\d+)?\b/);
  if (leadingNumber) {
    const priority = Number(leadingNumber[1]);
    if (!Number.isFinite(priority) || priority < 1) {
      return null;
    }
    return clampIssuePriority(priority);
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

const splitCsvLines = (text) => {
  const records = [];
  let current = "";
  let inQuotes = false;
  const csv = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i];
    if (ch === '"') {
      if (inQuotes && csv[i + 1] === '"') { current += '""'; i += 1; continue; }
      inQuotes = !inQuotes;
    }
    if (ch === "\n" && !inQuotes) {
      if (current.trim()) records.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) records.push(current);
  return records;
};

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
    const columns = {
      priority: priorityIndex,
      note: findHeaderIndex(headers.map((header) => header === "decision note" ? "" : header), ["notes", "note", "comments", "comment"]),
      followUp: headers.findIndex((header) => ["now/next", "now / next", "follow up"].includes(header)),
      requestor: headers.indexOf("requestor"),
      plannedStart: headers.indexOf("planned start"),
      plannedFinish: headers.indexOf("planned finish"),
      startDate: headers.indexOf("actual start"),
      openDecisionNote: headers.indexOf("decision note"),
    };
    if (odiIndex < 0 || !Object.values(columns).some((index) => index >= 0)) {
      continue;
    }
    if (!best || score > best.score) {
      best = {
        score,
        delimiter,
        headers,
        odiIndex,
        priorityIndex,
        notesIndex: columns.note,
        columns,
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
      error: `CSV must include an issue key and at least one supported metadata column (such as Priority). Preview: ${preview || "(empty)"}`,
    };
  }

  const rows = [];
  for (let i = best.headerLineIndex + 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], best.delimiter);
    if (rows.length === 5000) return { ok: false, error: "Import must contain at most 5,000 rows" };
    rows.push({
      rowNumber: i + 1,
      odi: cells[best.odiIndex] ?? "",
      priority: best.priorityIndex >= 0 ? cells[best.priorityIndex] ?? "" : "",
      notes: best.notesIndex >= 0 ? cells[best.notesIndex] ?? "" : "",
      ...Object.fromEntries(Object.entries(best.columns).filter(([field, index]) => !["priority", "note"].includes(field) && index >= 0).map(([field, index]) => [field, cells[index] ?? ""])),
    });
  }

  return {
    ok: true,
    rows,
    delimiter: best.delimiter,
    headers: best.headers,
    headerLineIndex: best.headerLineIndex,
    ignoredHeaders: best.headers.filter((_header, index) => index !== best.odiIndex && !Object.values(best.columns).includes(index)),
  };
};

export const planIssueMetadataImport = (rows, existingByKey = {}, { replaceNote = false } = {}) => {
  const upserts = [];
  const errors = [];
  let updatedPriorities = 0;
  let filledNotes = 0;
  let skipped = 0;
  if (!Array.isArray(rows) || rows.length > 5000) return { upserts, updatedPriorities, filledNotes, skipped, errors: [{ reason: "Import must contain at most 5,000 rows" }] };
  const keyCounts = new Map();
  for (const row of rows) {
    if (row.selected === false) continue;
    const key = normalizeImportIssueKey(row.issueKey ?? row.odi);
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }
  for (const row of rows) {
    if (row.selected === false) { skipped += 1; continue; }
    const issueKey = normalizeImportIssueKey(row.issueKey ?? row.odi);
    const priorityRaw = String(row.patch?.priority ?? row.priority ?? "").trim();
    if (isSectionLabel(priorityRaw)) { skipped += 1; continue; }
    const proposed = row.patch && typeof row.patch === "object" && !Array.isArray(row.patch) ? { ...row.patch } : {};
    const rowErrors = [];
    if (row.patch !== undefined && (!row.patch || typeof row.patch !== "object" || Array.isArray(row.patch))) rowErrors.push("A metadata patch object is required");
    if ((row.patch && Object.hasOwn(proposed, "priority")) || (!row.patch && priorityRaw)) {
      const priority = row.patch && proposed.priority === 0 ? 0 : parseImportPriority(priorityRaw);
      if (priority === null) rowErrors.push(`Invalid priority (${priorityRaw.slice(0, 40)}; need a number rank or P1–P20)`);
      else proposed.priority = priority;
    }
    const existing = existingByKey[issueKey];
    for (const field of IMPORT_FIELDS.filter((field) => field !== "priority")) {
      if (row.patch) continue;
      const raw = field === "note" ? row.notes ?? row.note : row[field];
      const value = typeof raw === "string" ? raw.trim() : raw;
      // Empty imported cells preserve the destination; only an explicit UI patch clears.
      if (value === undefined || value === null || value === "") continue;
      if (field === "note" && String(existing?.note || "").trim() && !(row.replaceNote === true || (row.replaceNote === undefined && replaceNote))) continue;
      proposed[field] = value;
    }
    if (Object.hasOwn(proposed, "note") && String(existing?.note || "").trim() && !(row.replaceNote === true || (row.replaceNote === undefined && replaceNote))) delete proposed.note;
    if (!Object.keys(proposed).length && !rowErrors.length) { skipped += 1; continue; }
    if (!ISSUE_KEY_RE.test(issueKey)) rowErrors.push(`Missing or invalid issue key (${String(row.odi || "").slice(0, 40) || "empty"})`);
    if (keyCounts.get(issueKey) > 1) rowErrors.push(`Duplicate issue key (${issueKey})`);
    const validated = validateMetadataPatch(proposed, { importOnly: true });
    rowErrors.push(...validated.errors);
    const dates = validateMetadataPatch({ plannedStart: existing?.plannedStart || null, plannedFinish: existing?.plannedFinish || null, ...Object.fromEntries(Object.entries(validated.patch).filter(([field]) => ["plannedStart", "plannedFinish"].includes(field))) });
    rowErrors.push(...dates.errors);
    if (rowErrors.length) {
      skipped += 1;
      errors.push({ row: row.rowNumber, issueKey, reason: [...new Set(rowErrors)].join("; "), errors: [...new Set(rowErrors)] });
      continue;
    }
    const patch = validated.patch;
    const expected = existing ? Object.fromEntries(Object.keys(patch).map((field) => [field, existing[field] ?? (field === "followUp" || METADATA_DATE_FIELDS.includes(field) ? null : field === "priority" ? 0 : "")])) : null;
    const filledNote = Object.hasOwn(patch, "note") && !String(existing?.note || "").trim();
    upserts.push({ ...(row.rowId !== undefined ? { rowId: row.rowId } : {}), issueKey, priority: patch.priority ?? existing?.priority ?? 0, note: patch.note ?? existing?.note ?? "", filledNote, patch, expected, validation: { errors: [] } });
    if (Object.hasOwn(patch, "priority")) updatedPriorities += 1;
    if (filledNote) filledNotes += 1;
  }
  return { upserts, updatedPriorities, filledNotes, skipped, errors };
};
