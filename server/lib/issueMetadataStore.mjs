import { METADATA_COLUMNS, METADATA_DATE_FIELDS, validateMetadataPatch } from "../../shared/issueMetadataFields.mjs";
import { listNoteImages } from "./noteImageStore.mjs";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const normalizeKey = (value) => {
  const key = String(value || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(key)) throw fail("Invalid issue key");
  return key;
};

export const getLocalMetadata = (db, issueKeys) => {
  const keys = [...new Set(issueKeys.map(normalizeKey))];
  if (!keys.length) return {};
  const rows = db.prepare(`SELECT issue_key, ${Object.values(METADATA_COLUMNS).join(", ")}, keep_note_images FROM issue_metadata WHERE issue_key IN (${keys.map(() => "?").join(",")})`).all(...keys);
  return Object.fromEntries(rows.map((row) => [row.issue_key, {
    ...Object.fromEntries(Object.entries(METADATA_COLUMNS).map(([field, column]) => [field, ["hasOpenDecision", "pinnedGantt"].includes(field) ? Boolean(row[column]) : row[column]])),
    keepNoteImages: Boolean(row.keep_note_images),
    images: row.keep_note_images ? listNoteImages(db, row.issue_key) : [],
  }]));
};

export const writeLocalMetadata = (db, entries) => {
  if (!Array.isArray(entries) || entries.length > 5000) throw fail("Import must contain at most 5,000 rows");
  return db.transaction(() => {
    let updated = 0;
    for (const entry of entries) {
      const issueKey = normalizeKey(entry?.issueKey);
      const { patch, errors } = validateMetadataPatch(entry.patch);
      if (errors.length || !Object.keys(patch).length) throw fail(errors.join("; ") || "A metadata field is required");
      const current = getLocalMetadata(db, [issueKey])[issueKey];
      if (entry.expected === null && current) throw fail("Metadata changed; refresh and review before saving", 409);
      if (entry.expected !== undefined && entry.expected !== null) {
        const expected = validateMetadataPatch(entry.expected);
        if (expected.errors.length) throw fail(expected.errors.join("; "));
        for (const field of Object.keys(patch)) {
          if (!Object.hasOwn(expected.patch, field)) throw fail(`Expected value required for ${field}`);
          const actual = METADATA_DATE_FIELDS.includes(field) ? current?.[field] || null : current?.[field];
          if (actual !== expected.patch[field]) throw fail("Metadata changed; refresh and review before saving", 409);
        }
      }
      const dates = validateMetadataPatch({ plannedStart: current?.plannedStart || null, plannedFinish: current?.plannedFinish || null, ...Object.fromEntries(Object.entries(patch).filter(([field]) => ["plannedStart", "plannedFinish"].includes(field))) });
      if (dates.errors.length) throw fail(dates.errors.join("; "));
      const values = Object.entries(patch);
      const columns = values.map(([field]) => METADATA_COLUMNS[field]);
      db.prepare(`INSERT INTO issue_metadata (issue_key, ${columns.join(", ")}, updated_at)
        VALUES (?, ${values.map(() => "?").join(", ")}, CURRENT_TIMESTAMP)
        ON CONFLICT(issue_key) DO UPDATE SET ${columns.map((column) => `${column} = excluded.${column}`).join(", ")}, updated_at = CURRENT_TIMESTAMP`)
        .run(issueKey, ...values.map(([field, value]) => typeof value === "boolean" ? Number(value) : METADATA_DATE_FIELDS.includes(field) ? value || "" : value));
      updated += 1;
    }
    return { updated };
  })();
};
