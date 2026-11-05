/** Gantt data sources are addressed by one string: "__pinned__", a program slug, "preset:<id>" or "jql:<text>". */
export const GANTT_PINNED_SLUG = "__pinned__";
export const GANTT_MAX_JQL = 2000;

export const parseGanttSlug = (slug) => {
  const text = String(slug || "").trim();
  if (!text) return { kind: "invalid" };
  if (text === GANTT_PINNED_SLUG) return { kind: "pinned" };
  if (text.startsWith("preset:")) {
    const raw = text.slice(7).trim();
    const id = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : 0;
    return id > 0 ? { kind: "preset", presetId: id } : { kind: "invalid" };
  }
  if (text.startsWith("jql:")) {
    const jql = text.slice(4).trim();
    return jql && jql.length <= GANTT_MAX_JQL ? { kind: "jql", jql } : { kind: "invalid" };
  }
  return { kind: "program", slug: text };
};

/** Bounded, stable key for storing report snapshots (long custom JQL is hashed). */
export const ganttSnapshotKey = (slug) => {
  const text = String(slug || "").trim();
  if (text.length <= 100) return text;
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${text.slice(0, 80)}#${hash.toString(36)}`;
};
