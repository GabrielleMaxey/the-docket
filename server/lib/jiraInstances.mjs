import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const MAX_JIRA_INSTANCES = 5;

const ACTIVE_INSTANCE_KEY = "active_instance_id";
const legacySeedMetaKey = (instanceId) => `legacy_db_seeded:${instanceId}`;

const INSTANCES_SCHEMA = `
CREATE TABLE IF NOT EXISTS jira_instances (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  email TEXT NOT NULL,
  api_token TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jira_instance_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

function trimOrEmpty(value) {
  return String(value ?? "").trim();
}

export function normalizeBaseUrl(url) {
  const trimmed = trimOrEmpty(url).replace(/\/$/, "");
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    // Pasted browse links (…/browse/KEY) must become the site origin for API calls.
    if (/^\/browse(\/|$)/i.test(parsed.pathname || "")) {
      return parsed.origin;
    }
    return `${parsed.origin}${parsed.pathname || ""}`.replace(/\/$/, "") || parsed.origin;
  } catch {
    return trimmed;
  }
}

export function legacyAppDbPath(dataDir) {
  return path.join(dataDir, "workweek.sqlite");
}

export function appDbPathForInstance(dataDir, instanceId) {
  return path.join(dataDir, `workweek-${instanceId}.sqlite`);
}

export function noteImagesDirFor(dataDir, instanceId) {
  const name = instanceId == null ? "note-images" : `note-images-${instanceId}`;
  return path.join(dataDir, name);
}

export function openInstancesMetaDb(metaPath) {
  return new Database(metaPath);
}

export function initInstancesSchema(metaDb) {
  metaDb.exec(INSTANCES_SCHEMA);
}

function getMetaValue(metaDb, key) {
  const row = metaDb.prepare("SELECT value FROM jira_instance_meta WHERE key = ?").get(key);
  return row?.value ?? null;
}

function setMetaValue(metaDb, key, value) {
  metaDb
    .prepare(
      `INSERT INTO jira_instance_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

function countTableRows(dbPath, tableName) {
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true });
  try {
    const hasTable = db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName);
    if (!hasTable) return 0;
    return Number(db.prepare(`SELECT COUNT(*) AS c FROM ${tableName}`).get()?.c || 0);
  } finally {
    db.close();
  }
}

function copySqliteDatabase(srcPath, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  for (const suffix of ["-wal", "-shm"]) {
    const srcSide = `${srcPath}${suffix}`;
    const destSide = `${destPath}${suffix}`;
    if (fs.existsSync(srcSide)) {
      fs.copyFileSync(srcSide, destSide);
    } else if (fs.existsSync(destSide)) {
      fs.unlinkSync(destSide);
    }
  }
}

/**
 * One-time: when an instance app DB is missing or empty of presets/notes, copy
 * legacy workweek.sqlite (and note-images) so existing single-site data survives
 * the first activate. Flagged in meta so we never overwrite intentional empties.
 */
export function seedInstanceAppDbFromLegacyIfNeeded(metaDb, dataDir, instanceId) {
  const id = trimOrEmpty(instanceId);
  if (!id) return { seeded: false, reason: "no-instance" };

  const flagKey = legacySeedMetaKey(id);
  if (getMetaValue(metaDb, flagKey) === "1") {
    return { seeded: false, reason: "already-seeded" };
  }

  const legacyPath = legacyAppDbPath(dataDir);
  const destPath = appDbPathForInstance(dataDir, id);
  if (!fs.existsSync(legacyPath)) {
    setMetaValue(metaDb, flagKey, "1");
    return { seeded: false, reason: "no-legacy" };
  }

  const legacyPresets = countTableRows(legacyPath, "epic_presets");
  const legacyNotes = countTableRows(legacyPath, "issue_metadata");
  if (legacyPresets === 0 && legacyNotes === 0) {
    setMetaValue(metaDb, flagKey, "1");
    return { seeded: false, reason: "legacy-empty" };
  }

  const destExists = fs.existsSync(destPath);
  const destPresets = destExists ? countTableRows(destPath, "epic_presets") : 0;
  const destNotes = destExists ? countTableRows(destPath, "issue_metadata") : 0;
  if (destExists && (destPresets > 0 || destNotes > 0)) {
    setMetaValue(metaDb, flagKey, "1");
    return { seeded: false, reason: "dest-has-data" };
  }

  copySqliteDatabase(legacyPath, destPath);

  const legacyImages = noteImagesDirFor(dataDir, null);
  const destImages = noteImagesDirFor(dataDir, id);
  if (fs.existsSync(legacyImages) && !fs.existsSync(destImages)) {
    fs.cpSync(legacyImages, destImages, { recursive: true });
  }

  setMetaValue(metaDb, flagKey, "1");
  return { seeded: true, reason: "copied-legacy" };
}

export function toPublicInstance(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    baseUrl: row.base_url,
    email: row.email,
    hasToken: Boolean(trimOrEmpty(row.api_token)),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getInstanceRow(metaDb, id) {
  return metaDb.prepare("SELECT * FROM jira_instances WHERE id = ?").get(id);
}

/** Server-side only — never expose via list/public APIs. */
export function getInstanceCredentials(metaDb, id) {
  const row = getInstanceRow(metaDb, id);
  if (!row) return null;
  return {
    baseUrl: row.base_url,
    email: row.email,
    apiToken: row.api_token,
  };
}

export function listInstances(metaDb) {
  const rows = metaDb
    .prepare("SELECT * FROM jira_instances ORDER BY created_at ASC")
    .all();
  return rows.map(toPublicInstance);
}

export function getActiveInstanceId(metaDb) {
  return getMetaValue(metaDb, ACTIVE_INSTANCE_KEY);
}

export function setActiveInstanceId(metaDb, id) {
  if (id == null) {
    metaDb.prepare("DELETE FROM jira_instance_meta WHERE key = ?").run(ACTIVE_INSTANCE_KEY);
    return;
  }
  setMetaValue(metaDb, ACTIVE_INSTANCE_KEY, id);
}

export function resolveJiraCredentials(metaDb, env = {}) {
  const activeId = getActiveInstanceId(metaDb);
  if (activeId) {
    const row = getInstanceRow(metaDb, activeId);
    if (row) {
      return {
        mode: "instance",
        instanceId: row.id,
        displayName: row.display_name,
        baseUrl: row.base_url,
        email: row.email,
        apiToken: row.api_token,
      };
    }
  }

  return {
    mode: "legacy",
    instanceId: null,
    displayName: "",
    baseUrl: normalizeBaseUrl(env.JIRA_BASE_URL),
    email: trimOrEmpty(env.JIRA_EMAIL),
    apiToken: trimOrEmpty(env.JIRA_API_TOKEN),
  };
}

export function createInstance(metaDb, input) {
  const count = metaDb.prepare("SELECT COUNT(*) AS c FROM jira_instances").get().c;
  if (count >= MAX_JIRA_INSTANCES) {
    throw Object.assign(new Error("Maximum of 5 Jira instances"), { code: "MAX_INSTANCES" });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  metaDb
    .prepare(
      `INSERT INTO jira_instances
       (id, display_name, base_url, email, api_token, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      id,
      trimOrEmpty(input.displayName),
      normalizeBaseUrl(input.baseUrl),
      trimOrEmpty(input.email),
      trimOrEmpty(input.apiToken),
      now,
      now
    );

  return toPublicInstance(getInstanceRow(metaDb, id));
}

export function updateInstance(metaDb, id, patch) {
  const row = getInstanceRow(metaDb, id);
  if (!row) {
    throw new Error(`Jira instance not found: ${id}`);
  }

  const displayName =
    patch.displayName !== undefined ? trimOrEmpty(patch.displayName) : row.display_name;
  const baseUrl = patch.baseUrl !== undefined ? normalizeBaseUrl(patch.baseUrl) : row.base_url;
  const email = patch.email !== undefined ? trimOrEmpty(patch.email) : row.email;
  let apiToken = row.api_token;
  if (patch.apiToken !== undefined && trimOrEmpty(patch.apiToken) !== "") {
    apiToken = trimOrEmpty(patch.apiToken);
  }
  const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : row.enabled;
  const now = new Date().toISOString();

  metaDb
    .prepare(
      `UPDATE jira_instances
       SET display_name = ?, base_url = ?, email = ?, api_token = ?, enabled = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(displayName, baseUrl, email, apiToken, enabled, now, id);

  return toPublicInstance(getInstanceRow(metaDb, id));
}

export function deleteInstance(metaDb, id) {
  metaDb.prepare("DELETE FROM jira_instances WHERE id = ?").run(id);

  let activeInstanceId = getActiveInstanceId(metaDb);
  if (activeInstanceId === id) {
    const remaining = listInstances(metaDb);
    activeInstanceId = remaining.length > 0 ? remaining[0].id : null;
    setActiveInstanceId(metaDb, activeInstanceId);
  }

  return { activeInstanceId };
}

export function seedInstancesFromEnv(metaDb, env = {}) {
  if (listInstances(metaDb).length > 0) {
    return { seeded: 0 };
  }

  const toCreate = [];

  for (let n = 1; n <= MAX_JIRA_INSTANCES; n++) {
    const baseUrl = trimOrEmpty(env[`JIRA_INSTANCE_${n}_BASE_URL`]);
    const email = trimOrEmpty(env[`JIRA_INSTANCE_${n}_EMAIL`]);
    const apiToken = trimOrEmpty(env[`JIRA_INSTANCE_${n}_API_TOKEN`]);
    if (!baseUrl || !email || !apiToken) continue;
    const displayName = trimOrEmpty(env[`JIRA_INSTANCE_${n}_NAME`]) || `Instance ${n}`;
    toCreate.push({ displayName, baseUrl, email, apiToken });
  }

  if (toCreate.length === 0) {
    const baseUrl = trimOrEmpty(env.JIRA_BASE_URL);
    const email = trimOrEmpty(env.JIRA_EMAIL);
    const apiToken = trimOrEmpty(env.JIRA_API_TOKEN);
    if (baseUrl && email && apiToken) {
      const displayName = trimOrEmpty(env.JIRA_INSTANCE_1_NAME) || "Jira";
      toCreate.push({ displayName, baseUrl, email, apiToken });
    }
  }

  for (const input of toCreate) {
    createInstance(metaDb, input);
  }

  if (toCreate.length > 0) {
    setActiveInstanceId(metaDb, listInstances(metaDb)[0].id);
  }

  return { seeded: toCreate.length };
}
