// Read-only "suggested order" scorer. Pure: no I/O, no clock reads, inputs never mutated.

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

export const DEFAULT_PRIORITY_WEIGHTS = deepFreeze({
  priority: { highest: 50, high: 40, medium: 30, low: 20, lowest: 10, unset: 30 },
  status: {
    active: 20,
    other: 5,
    activeNames: ["in progress", "analyzing", "ready for verification"],
  },
  staleness: { d30: 25, d15: 20, d7: 15, d3: 10, fresh: 5, cappedMax: 10 },
  due: { overdue: 25, soon: 15, businessDays: 3 },
  blocker: { blocks: 30, blockedBy: 20 },
  manual: { max: 30, maxPriority: 20 },
  blockerLinkNames: { blocks: ["blocks"], blockedBy: ["is blocked by"] },
});

const DAY_MS = 24 * 60 * 60 * 1000;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const mergeWeights = (overrides) => {
  const merged = {};
  for (const key of Object.keys(DEFAULT_PRIORITY_WEIGHTS)) {
    merged[key] = { ...DEFAULT_PRIORITY_WEIGHTS[key] };
    const override = isPlainObject(overrides) ? overrides[key] : undefined;
    if (isPlainObject(override)) Object.assign(merged[key], override);
  }
  return merged;
};

const PRIORITY_LABELS = {
  highest: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
  lowest: "Lowest",
};

const parseDueDate = (value) => {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return ms;
};

const thirdBusinessDayMs = (todayMs, count) => {
  let ms = todayMs;
  let counted = 0;
  while (counted < count) {
    ms += DAY_MS;
    const dow = new Date(ms).getUTCDay();
    if (dow !== 0 && dow !== 6) counted += 1;
  }
  return ms;
};

const normalizeManualPriority = (value, max) => {
  if (value === null || value === undefined || value === "") return null;
  const p = Number(value);
  return Number.isFinite(p) && p >= 1 ? Math.min(p, max) : null;
};

export function scoreIssue(input, options = {}) {
  const issue = isPlainObject(input) ? input : {};
  const now = options.now instanceof Date ? options.now : new Date(options.now);
  const w = mergeWeights(options.weights);
  const reasons = [];

  // Priority
  const priorityText = typeof issue.jiraPriority === "string" ? issue.jiraPriority.trim().toLowerCase() : "";
  const priorityKey = Object.hasOwn(PRIORITY_LABELS, priorityText) ? priorityText : null;
  const priority = priorityKey ? w.priority[priorityKey] : w.priority.unset;
  reasons.push(
    priorityKey
      ? `${PRIORITY_LABELS[priorityKey]} priority (+${priority})`
      : `Priority unset (+${priority})`,
  );

  // Status
  const statusText = typeof issue.status === "string" ? issue.status.trim() : "";
  const active = Array.isArray(w.status.activeNames) && w.status.activeNames.includes(statusText.toLowerCase());
  const status = active ? w.status.active : w.status.other;
  if (status) reasons.push(active ? `${statusText} (+${status})` : `Other open status (+${status})`);

  // Staleness
  let staleness = 0;
  const updatedMs = typeof issue.updated === "string" || issue.updated instanceof Date ? Date.parse(issue.updated) : NaN;
  const nowMs = now.getTime();
  if (Number.isFinite(updatedMs) && Number.isFinite(nowMs)) {
    const days = Math.max(0, Math.floor((nowMs - updatedMs) / DAY_MS));
    let band = w.staleness.fresh;
    if (days >= 30) band = w.staleness.d30;
    else if (days >= 15) band = w.staleness.d15;
    else if (days >= 7) band = w.staleness.d7;
    else if (days >= 3) band = w.staleness.d3;
    staleness = status === w.status.other ? Math.min(band, w.staleness.cappedMax) : band;
    if (staleness) {
      reasons.push(
        days < 3 ? `Updated recently (+${staleness})` : `Stale ${days} days (+${staleness})`,
      );
    }
  }

  // Due
  let due = 0;
  const dueMs = parseDueDate(issue.dueDate);
  if (dueMs !== null && Number.isFinite(nowMs)) {
    const d = new Date(nowMs);
    const todayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (dueMs <= todayMs) {
      due = w.due.overdue;
      reasons.push(dueMs === todayMs ? `Due today (+${due})` : `Overdue (+${due})`);
    } else if (dueMs <= thirdBusinessDayMs(todayMs, w.due.businessDays)) {
      due = w.due.soon;
      reasons.push(`Due within ${w.due.businessDays} business days (+${due})`);
    }
  }

  // Blockers
  let blocker = 0;
  if (issue.blocks) {
    blocker += w.blocker.blocks;
    reasons.push(`Blocks another open issue (+${w.blocker.blocks})`);
  }
  if (issue.blockedBy) {
    blocker += w.blocker.blockedBy;
    reasons.push(`Blocked by an open issue (+${w.blocker.blockedBy})`);
  }

  // Manual priority
  let manual = 0;
  const clamped = normalizeManualPriority(issue.manualPriority, w.manual.maxPriority);
  if (clamped !== null) {
    manual = Math.round((w.manual.max * (w.manual.maxPriority + 1 - clamped)) / w.manual.maxPriority);
    if (manual) reasons.push(`Manual priority ${clamped} (+${manual})`);
  }

  const components = { priority, status, staleness, due, blocker, manual };
  const score = priority + status + staleness + due + blocker + manual;
  return { score, components, reasons };
}

const isOpenLinkedIssue = (linked) => {
  const status = linked?.fields?.status;
  if (status?.statusCategory?.key === "done") return false;
  const name = typeof status?.name === "string" ? status.name : "";
  return !/(closed|resolved|done)/i.test(name);
};

const normalizeNames = (names) =>
  Array.isArray(names)
    ? names.filter((n) => typeof n === "string").map((n) => n.trim().toLowerCase())
    : [];

const textOf = (v) => (typeof v === "string" ? v : "");

export function toScoringInput(issue, extras = {}) {
  const src = isPlainObject(issue) ? issue : {};
  const opts = isPlainObject(extras) ? extras : {};
  const fields = isPlainObject(src.fields) ? src.fields : {};
  const names = mergeWeights(opts.weights).blockerLinkNames;
  const blockNames = normalizeNames(names.blocks);
  const blockedByNames = normalizeNames(names.blockedBy);

  let blocks = false;
  let blockedBy = false;
  const blocksKeys = [];
  const blockedByKeys = [];
  if (Array.isArray(fields.issuelinks)) {
    for (const entry of fields.issuelinks) {
      if (!isPlainObject(entry)) continue;
      const type = isPlainObject(entry.type) ? entry.type : {};
      const outward = textOf(type.outward).trim().toLowerCase();
      const inward = textOf(type.inward).trim().toLowerCase();
      if (isPlainObject(entry.outwardIssue) && entry.outwardIssue.key && blockNames.includes(outward)) {
        if (isOpenLinkedIssue(entry.outwardIssue)) {
          blocks = true;
          blocksKeys.push(String(entry.outwardIssue.key));
        }
      }
      if (isPlainObject(entry.inwardIssue) && entry.inwardIssue.key && blockedByNames.includes(inward)) {
        if (isOpenLinkedIssue(entry.inwardIssue)) {
          blockedBy = true;
          blockedByKeys.push(String(entry.inwardIssue.key));
        }
      }
    }
  }

  const status = fields.status?.name ?? (typeof src.status === "string" ? src.status : src.status?.name);
  return {
    key: src.key,
    jiraPriority: fields.priority?.name ?? (typeof src.priority === "string" ? src.priority : src.priority?.name),
    status,
    updated: fields.updated ?? src.updated,
    dueDate: opts.effectiveDueDate ?? null,
    manualPriority: opts.manualPriority ?? null,
    blocks,
    blockedBy,
    blocksKeys,
    blockedByKeys,
  };
}

const compareRanked = (a, b, maxPriority) => {
  if (a.score !== b.score) return b.score - a.score;
  const ma = normalizeManualPriority(a.manualPriority, maxPriority);
  const mb = normalizeManualPriority(b.manualPriority, maxPriority);
  if (ma !== mb) {
    if (ma === null) return 1;
    if (mb === null) return -1;
    return ma - mb;
  }
  const da = parseDueDate(a.dueDate);
  const db = parseDueDate(b.dueDate);
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }
  const ka = String(a.key ?? "");
  const kb = String(b.key ?? "");
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

export function rankIssues(inputs, options = {}) {
  if (!Array.isArray(inputs)) return [];
  const maxPriority = mergeWeights(options.weights).manual.maxPriority;
  return inputs
    .map((input) => ({ ...input, ...scoreIssue(input, options) }))
    .sort((a, b) => compareRanked(a, b, maxPriority));
}
