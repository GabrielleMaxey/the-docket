import fs from "node:fs";
import { Pool } from "pg";
import { clampIssuePriority } from "../../shared/issuePriority.mjs";

const fields = {
  priority: "priority", followUp: "follow_up", note: "note", requestor: "requestor",
  openDecisionNote: "open_decision_note", pmOverride: "pm_override",
  hasOpenDecision: "has_open_decision", pinnedGantt: "pinned_gantt",
  startDate: "start_date", completeDate: "complete_date",
  plannedStart: "planned_start", plannedFinish: "planned_finish",
};
const dateFields = ["startDate", "completeDate", "plannedStart", "plannedFinish"];
const trackingFields = [...dateFields, "hasOpenDecision", "pmOverride", "requestor", "openDecisionNote"];
const selectMetadata = Object.entries(fields).map(([field, column]) =>
  `${dateFields.includes(field) ? `to_char(${column}, 'YYYY-MM-DD')` : column} AS "${field}"`
).join(", ");
let pool;

const fail = (message, status = 400, code = "TEAM_METADATA_INVALID") => Object.assign(new Error(message), { status, code });
export const isTeamPriorityConfigured = () => Boolean(String(process.env.TEAM_PRIORITY_DATABASE_URL || "").trim());

export const teamPoolOptions = (env = process.env) => {
  let url;
  try { url = new URL(env.TEAM_PRIORITY_DATABASE_URL); }
  catch { throw fail("Invalid TEAM_PRIORITY_DATABASE_URL", 503, "TEAM_DATABASE_CONFIG"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2) {
    throw fail("Database URL requires an explicit host, user and database", 503, "TEAM_DATABASE_CONFIG");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const caFile = String(env.TEAM_PRIORITY_DATABASE_CA_FILE || "").trim();
  for (const [key, value] of url.searchParams) {
    if (key !== "sslmode" || caFile || !(value === "verify-full" || (loopback && value === "disable"))) {
      throw fail("Database URL options conflict with verified TLS/SSL configuration; remove URL options", 503, "TEAM_DATABASE_CONFIG");
    }
  }
  const ssl = loopback && env.NODE_ENV !== "production" && url.searchParams.get("sslmode") !== "verify-full" && !caFile ? false : { rejectUnauthorized: true };
  if (caFile) {
    try { ssl.ca = fs.readFileSync(caFile, "utf8"); }
    catch { throw fail("Unable to read TEAM_PRIORITY_DATABASE_CA_FILE", 503, "TEAM_DATABASE_CONFIG"); }
  }
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)), ssl,
    max: 5, connectionTimeoutMillis: 5000, statement_timeout: 30000,
  };
};

export const getTeamPool = () => {
  if (!isTeamPriorityConfigured()) throw fail("Team data not configured — set TEAM_PRIORITY_DATABASE_URL", 503, "TEAM_DATABASE_UNCONFIGURED");
  if (!pool) {
    pool = new Pool(teamPoolOptions());
    pool.on("error", () => {
      // Health and subsequent requests surface outages without exposing driver details.
    });
  }
  return pool;
};

export const closeTeamPool = async () => {
  const previous = pool;
  pool = undefined;
  if (previous) await previous.end();
};

export const teamDatabaseError = (error) => {
  if (["TEAM_DATABASE_UNCONFIGURED", "TEAM_DATABASE_CONFIG", "TEAM_METADATA_INVALID", "TEAM_METADATA_CONFLICT", "TEAM_SCHEMA_REQUIRED", "TEAM_DATABASE_UNAVAILABLE"].includes(error?.code)) return error;
  if (["42P01", "42703", "3F000"].includes(error?.code)) return fail("Team schema unavailable — run npm run team-db:migrate", 503, "TEAM_SCHEMA_REQUIRED");
  if (["23514", "22007", "22008", "22P02", "22003", "23502"].includes(error?.code)) return fail("Invalid team metadata value", 400);
  return fail("Team database unavailable — check server configuration and run npm run team-db:migrate", 503, "TEAM_DATABASE_UNAVAILABLE");
};

export const getTeamStatus = async () => {
  if (!isTeamPriorityConfigured()) return { configured: false, connected: false };
  try {
    await getTeamPool().query("SELECT priority, follow_up, note, start_date, planned_finish FROM team_issue_metadata LIMIT 0");
    await getTeamPool().query("SELECT p.slug, e.site_host FROM shared_programs p LEFT JOIN shared_program_epics e ON e.program_slug = p.slug LIMIT 0");
    return { configured: true, connected: true };
  } catch (error) { return { configured: true, connected: false, error: teamDatabaseError(error).message }; }
};

export const normalizeTeamSiteHost = (siteHost) => {
  const host = String(siteHost || "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host)) throw fail("A canonical Jira site hostname is required");
  return host;
};
const issueKey = (key) => {
  const value = String(key || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(value)) throw fail("Invalid issue key");
  return value;
};
const fieldValue = (field, value) => {
  if (!Object.hasOwn(fields, field)) throw fail("Unsupported team metadata field");
  if (dateFields.includes(field)) {
    if (value === null || value === "") return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw fail(`${field} must be YYYY-MM-DD`);
  } else if (["hasOpenDecision", "pinnedGantt"].includes(field)) {
    if (typeof value !== "boolean") throw fail(`${field} must be a boolean`);
  } else if (field === "priority") {
    if (!Number.isInteger(value)) throw fail("priority must be an integer");
  } else if (field === "followUp") {
    if (value !== null && !["now", "next"].includes(value)) throw fail("followUp must be now, next or null");
  } else if (typeof value !== "string") throw fail(`${field} must be text`);
  return value;
};

export const getTeamMetadata = async ({ siteHost, issueKeys }) => {
  const db = getTeamPool();
  const host = normalizeTeamSiteHost(siteHost);
  const keys = [...new Set((Array.isArray(issueKeys) ? issueKeys : []).map(issueKey))];
  if (!keys.length) return {};
  try {
    const { rows } = await db.query(`SELECT issue_key, ${selectMetadata}, updated_at AS "updatedAt", updated_by AS "updatedBy" FROM team_issue_metadata WHERE site_host = $1 AND issue_key = ANY($2::text[])`, [host, keys]);
    return Object.fromEntries(rows.map(({ issue_key, ...row }) => [issue_key, row]));
  } catch (error) { throw teamDatabaseError(error); }
};

// Reused by the explicit demo migration so all imported collections commit together.
export const writeTeamMetadataEntries = async (client, { siteHost, entries, updatedBy = "" }) => {
  const host = normalizeTeamSiteHost(siteHost);
  if (!Array.isArray(entries)) throw fail("entries must be an array");
  let updated = 0;
  for (const entry of entries) {
    const key = issueKey(entry?.issueKey);
    if (!entry.patch || typeof entry.patch !== "object" || Array.isArray(entry.patch)) throw fail("A metadata patch is required");
    const values = Object.entries(entry.patch).map(([field, value]) => [field, fieldValue(field, value)]);
    if (!values.length) throw fail("A metadata field is required");
    await client.query("INSERT INTO team_issue_metadata (site_host, issue_key) VALUES ($1, $2) ON CONFLICT DO NOTHING", [host, key]);
    const { rows: [current] } = await client.query(`SELECT ${selectMetadata} FROM team_issue_metadata WHERE site_host = $1 AND issue_key = $2 FOR UPDATE`, [host, key]);
    if (entry.expected !== undefined) {
      if (!entry.expected || typeof entry.expected !== "object" || Array.isArray(entry.expected)) throw fail("expected must contain metadata fields");
      for (const [field, value] of Object.entries(entry.expected)) {
        if (current[field] !== fieldValue(field, value)) throw fail("Team metadata changed; refresh and review before saving", 409, "TEAM_METADATA_CONFLICT");
      }
    }
    const assignments = values.map(([field], index) => `${fields[field]} = $${index + 3}`);
    await client.query(`UPDATE team_issue_metadata SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP, updated_by = $${values.length + 3} WHERE site_host = $1 AND issue_key = $2`, [host, key, ...values.map(([, value]) => value), String(updatedBy || "")]);
    updated += 1;
  }
  return { updated };
};

export const writeTeamMetadata = async (input) => {
  let client;
  try {
    client = await getTeamPool().connect();
    await client.query("BEGIN");
    const result = await writeTeamMetadataEntries(client, input);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    throw teamDatabaseError(error);
  } finally { client?.release(); }
};

export const bulkGetTeamPriorities = async (issueKeys, siteHost) => {
  const rows = await getTeamMetadata({ siteHost, issueKeys });
  return Object.fromEntries(Object.entries(rows).filter(([, row]) => row.priority > 0).map(([key, row]) => [key, { priority: row.priority, updatedAt: row.updatedAt, updatedBy: row.updatedBy }]));
};
export const listAllTeamPriorities = async (siteHost) => {
  try {
    const { rows } = await getTeamPool().query('SELECT issue_key AS "issueKey", priority, updated_at AS "updatedAt", updated_by AS "updatedBy" FROM team_issue_metadata WHERE site_host = $1 AND priority > 0 ORDER BY issue_key', [normalizeTeamSiteHost(siteHost)]);
    return rows;
  } catch (error) { throw teamDatabaseError(error); }
};
export const putTeamPriority = async ({ siteHost, issueKey: key, priority, updatedBy }) => {
  const next = clampIssuePriority(priority);
  await writeTeamMetadata({ siteHost, entries: [{ issueKey: key, patch: { priority: next } }], updatedBy });
  const row = (await getTeamMetadata({ siteHost, issueKeys: [key] }))[issueKey(key)];
  return { ok: true, deleted: next === 0, issueKey: issueKey(key), priority: next, updatedAt: row.updatedAt, updatedBy: row.updatedBy };
};
export const bulkPutTeamPriorities = async (entries, updatedBy = "csv-import", siteHost) => {
  const patches = entries.map((entry) => ({ issueKey: entry.issueKey, patch: { priority: clampIssuePriority(entry.priority) } }));
  await writeTeamMetadata({ siteHost, entries: patches, updatedBy });
  const deleted = patches.filter(({ patch }) => patch.priority === 0).length;
  return { updated: patches.length - deleted, deleted };
};
export const bulkGetTeamDates = async (issueKeys, siteHost) => {
  const rows = await getTeamMetadata({ siteHost, issueKeys });
  return Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, {
    ...Object.fromEntries(trackingFields.map((field) => [field, row[field] ?? ""])), updatedAt: row.updatedAt, updatedBy: row.updatedBy,
  }]));
};
export const putTeamDate = async ({ siteHost, issueKey: key, updatedBy, ...input }) => {
  const patch = Object.fromEntries(Object.entries(input).filter(([field, value]) => trackingFields.includes(field) && value !== undefined));
  await writeTeamMetadata({ siteHost, entries: [{ issueKey: key, patch }], updatedBy });
  const row = (await getTeamMetadata({ siteHost, issueKeys: [key] }))[issueKey(key)];
  return { ok: true, deleted: false, issueKey: issueKey(key), ...patch, updatedAt: row.updatedAt, updatedBy: row.updatedBy };
};
export const deleteTeamDate = async ({ siteHost, issueKey: key, updatedBy }) => {
  await writeTeamMetadata({ siteHost, entries: [{ issueKey: key, patch: { startDate: null, completeDate: null, plannedStart: null, plannedFinish: null, pmOverride: "" } }], updatedBy });
  return { ok: true, deleted: true, issueKey: issueKey(key) };
};
export const listSharedPrograms = async (siteHost) => {
  try {
    const { rows } = await getTeamPool().query(`SELECT p.slug, p.display_name AS "displayName", p.enabled, array_agg(e.issue_key ORDER BY e.issue_key) AS "epicRoots" FROM shared_programs p JOIN shared_program_epics e ON e.program_slug = p.slug WHERE p.enabled = true AND e.site_host = $1 GROUP BY p.slug ORDER BY p.slug`, [normalizeTeamSiteHost(siteHost)]);
    return rows;
  } catch (error) { throw teamDatabaseError(error); }
};
// No seed program definitions exist; retain the compatibility endpoint without inventing data.
export const seedSharedPrograms = async (siteHost) => listSharedPrograms(siteHost);
