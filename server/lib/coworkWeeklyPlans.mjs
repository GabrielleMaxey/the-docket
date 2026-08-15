import fs from "node:fs";
import path from "node:path";

const COWORK_WEEKLY_PLAN_RE = /^weekly-plan-.+\.md$/i;

export const isCoworkWeeklyPlanFilename = (name) =>
  COWORK_WEEKLY_PLAN_RE.test(String(name || "").trim());

export const coworkFileId = (filename) => `file:${String(filename || "").trim()}`;

export const parseCoworkFileId = (id) => {
  const value = String(id || "").trim();
  if (!value.startsWith("file:")) {
    return null;
  }
  const filename = value.slice("file:".length);
  return isCoworkWeeklyPlanFilename(filename) ? filename : null;
};

/** Resolve a safe absolute path under dataDir for a weekly-plan filename. */
export const resolveCoworkWeeklyPlanPath = (dataDir, filename) => {
  const raw = String(filename || "").trim();
  const base = path.basename(raw);
  if (
    !isCoworkWeeklyPlanFilename(base) ||
    base !== raw ||
    base.includes("..")
  ) {
    return { ok: false, error: "Invalid weekly plan filename" };
  }

  const root = path.resolve(String(dataDir || ""));
  const full = path.resolve(root, base);
  if (!full.startsWith(root + path.sep) && full !== root) {
    return { ok: false, error: "Invalid weekly plan path" };
  }

  return { ok: true, fullPath: full, filename: base };
};

export const mapCoworkFileToListItem = ({ filename, modifiedAt, sizeBytes }) => ({
  id: coworkFileId(filename),
  kind: "cowork_file",
  source: "work_week",
  reportType: "cowork_weekly_plan",
  label: filename,
  createdAt: modifiedAt,
  filename,
  sizeBytes: Number(sizeBytes) || 0,
  meta: { fromCoworkFile: true, filename },
});

export const listCoworkWeeklyPlans = (dataDir) => {
  const root = path.resolve(String(dataDir || ""));
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (!entry.isFile() || !isCoworkWeeklyPlanFilename(entry.name)) {
      continue;
    }
    const resolved = resolveCoworkWeeklyPlanPath(root, entry.name);
    if (!resolved.ok) {
      continue;
    }
    const stat = fs.statSync(resolved.fullPath);
    items.push(
      mapCoworkFileToListItem({
        filename: entry.name,
        modifiedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      })
    );
  }

  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items;
};

export const readCoworkWeeklyPlan = (dataDir, filename) => {
  const resolved = resolveCoworkWeeklyPlanPath(dataDir, filename);
  if (!resolved.ok) {
    return resolved;
  }

  if (!fs.existsSync(resolved.fullPath)) {
    return { ok: false, error: "Weekly plan file not found", status: 404 };
  }

  const stat = fs.statSync(resolved.fullPath);
  if (!stat.isFile()) {
    return { ok: false, error: "Weekly plan file not found", status: 404 };
  }

  const content = fs.readFileSync(resolved.fullPath, "utf8");
  return {
    ok: true,
    item: {
      ...mapCoworkFileToListItem({
        filename: resolved.filename,
        modifiedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      }),
      content,
      report: content,
    },
  };
};

// Deletes a single weekly-plan-*.md file from disk. Reuses
// resolveCoworkWeeklyPlanPath's existing safety checks (filename pattern,
// no path traversal, confined to dataDir) rather than re-validating here -
// this is a real, irreversible filesystem delete, not a database row, so
// it only ever runs against a path that's already been through that
// validation.
export const deleteCoworkWeeklyPlan = (dataDir, filename) => {
  const resolved = resolveCoworkWeeklyPlanPath(dataDir, filename);
  if (!resolved.ok) {
    return resolved;
  }

  if (!fs.existsSync(resolved.fullPath)) {
    return { ok: false, error: "Weekly plan file not found", status: 404 };
  }

  const stat = fs.statSync(resolved.fullPath);
  if (!stat.isFile()) {
    return { ok: false, error: "Weekly plan file not found", status: 404 };
  }

  fs.unlinkSync(resolved.fullPath);
  return { ok: true, filename: resolved.filename };
};

// Deletes every weekly-plan-*.md file currently in dataDir. Reuses
// listCoworkWeeklyPlans to enumerate exactly what's currently listed (same
// pattern as reportArchive.mjs sharing its filter logic between list and
// bulk-delete), so "Delete all" can't drift from what the Files tab shows.
export const deleteAllCoworkWeeklyPlans = (dataDir) => {
  const items = listCoworkWeeklyPlans(dataDir);
  let deletedCount = 0;
  const errors = [];

  for (const item of items) {
    const result = deleteCoworkWeeklyPlan(dataDir, item.filename);
    if (result.ok) {
      deletedCount += 1;
    } else {
      errors.push({ filename: item.filename, error: result.error });
    }
  }

  return { deletedCount, errors };
};
