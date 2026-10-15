import { randomUUID } from "node:crypto";
import { IMPORT_FIELDS } from "../../shared/issueMetadataFields.mjs";
import { normalizeImportIssueKey, planIssueMetadataImport } from "./issueMetadataImport.mjs";

const fail = (message, status = 400, code = "IMPORT_PREVIEW_INVALID") => Object.assign(new Error(message), { status, code });
const sameContext = (a, b) => a?.siteHost === b?.siteHost && a?.instanceId === b?.instanceId && a?.generation === b?.generation;

// The map is private to the API registration; neither expected values nor write entries come from a commit request.
export const createIssueImportPreviewStore = ({ writeMetadata, now = Date.now }) => {
  const previews = new Map();
  const completed = new Map();
  const cleanup = () => {
    for (const [id, item] of previews) if (!item.saving && item.expiresAt <= now()) previews.delete(id);
    for (const [id, item] of completed) if (item.expiresAt <= now()) completed.delete(id);
  };
  const createImportPreview = ({ siteContext, destination, rows, existingByKey, ignoredHeaders = [], supersedesPreviewId }) => {
    cleanup();
    if (!["local", "team"].includes(destination)) throw fail("Choose local or team as the destination");
    let predecessor;
    // Re-review occupies the same live slot, without discarding a good preview when replacement fails.
    if (supersedesPreviewId) {
      predecessor = previews.get(supersedesPreviewId);
      if (!predecessor || !sameContext(predecessor.siteContext, siteContext) || predecessor.saving) throw fail("Previous preview cannot be replaced. Create a fresh preview.", 409);
    }
    if (!predecessor && previews.size >= 5) throw fail("Five imports are awaiting review. Finish an import or wait 15 minutes before creating another.", 429, "IMPORT_PREVIEW_CAPACITY");
    if (!Array.isArray(rows) || !rows.length || rows.length > 5000 || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw fail("Import must contain between 1 and 5,000 rows");
    const sanitized = rows.map((row, index) => {
      if (row.patch !== undefined && (!row.patch || typeof row.patch !== "object" || Array.isArray(row.patch))) throw fail("A metadata patch object is required");
      if (row.patch && Object.keys(row.patch).some(field => !IMPORT_FIELDS.includes(field))) throw fail("Only supported metadata columns may be imported");
      const patch = row.patch ? { ...row.patch } : Object.fromEntries(IMPORT_FIELDS.map(field => [field, field === "note" ? row.notes ?? row.note : row[field]]).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ""));
      return { rowId: String(row.rowId ?? index + 1).slice(0, 100), issueKey: normalizeImportIssueKey(row.issueKey ?? row.odi), selected: row.selected !== false, patch, replaceNote: row.replaceNote === true };
    });
    if (new Set(sanitized.map(row => row.rowId)).size !== sanitized.length) throw fail("Each row must have a unique rowId");
    const plan = planIssueMetadataImport(sanitized, existingByKey);
    const diff = sanitized.filter(row => row.selected).map(row => {
      const entry = plan.upserts.find(item => item.rowId === row.rowId);
      return { rowId: row.rowId, issueKey: row.issueKey,
        saved: Object.fromEntries(IMPORT_FIELDS.map(field => [field, existingByKey[row.issueKey]?.[field] ?? null])),
        changes: Object.fromEntries(Object.entries(entry?.patch || {}).map(([field, after]) => [field, { before: entry.expected?.[field] ?? null, after }])),
      };
    });
    const publicContext = { instanceId: siteContext.instanceId, siteHost: siteContext.siteHost, generation: siteContext.generation };
    const preview = { previewId: randomUUID(), siteContext: publicContext, destination, rows: sanitized, diff, errors: plan.errors, ignoredHeaders, expiresAt: now() + 15 * 60 * 1000 };
    const item = structuredClone({ ...preview, entries: plan.upserts });
    if (predecessor) previews.delete(supersedesPreviewId);
    previews.set(preview.previewId, item);
    return preview;
  };
  const commitImportPreview = async ({ previewId, siteContext }) => {
    const done = completed.get(previewId);
    if (done && done.expiresAt > now() && sameContext(done.siteContext, siteContext)) return { ...done.result, duplicate: true };
    const item = previews.get(previewId);
    if (!item || item.expiresAt <= now()) {
      cleanup();
      throw fail("Preview expired or is no longer available. Review the import again.", 410, "IMPORT_PREVIEW_EXPIRED");
    }
    if (!sameContext(item.siteContext, siteContext)) throw fail("The Jira site changed. Review the import again.", 409, "SITE_CONTEXT_CHANGED");
    if (item.errors.length || !item.entries.length) throw fail("Fix or exclude invalid rows and review at least one change before saving");
    if (item.saving) return { ...await item.saving, duplicate: true };
    item.saving = Promise.resolve().then(() => writeMetadata({ destination: item.destination, siteContext: item.siteContext, entries: item.entries })).then(result => {
      const saved = { destination: item.destination, updated: result.updated };
      previews.delete(previewId);
      if (completed.size >= 5) completed.delete(completed.keys().next().value);
      completed.set(previewId, { siteContext: item.siteContext, result: saved, expiresAt: now() + 60 * 1000 });
      return saved;
    }).catch(error => {
      if (error.status === 409) previews.delete(previewId);
      item.saving = null;
      throw error;
    });
    return item.saving;
  };
  return { createImportPreview, commitImportPreview };
};
