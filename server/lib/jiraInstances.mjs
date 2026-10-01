import crypto from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

export const MAX_JIRA_INSTANCES = 5;

const ACTIVE_INSTANCE_KEY = "active_instance_id";

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
  return trimOrEmpty(url).replace(/\/$/, "");
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
  const row = metaDb
    .prepare("SELECT value FROM jira_instance_meta WHERE key = ?")
    .get(ACTIVE_INSTANCE_KEY);
  return row?.value ?? null;
}

export function setActiveInstanceId(metaDb, id) {
  if (id == null) {
    metaDb.prepare("DELETE FROM jira_instance_meta WHERE key = ?").run(ACTIVE_INSTANCE_KEY);
    return;
  }
  metaDb
    .prepare(
      `INSERT INTO jira_instance_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(ACTIVE_INSTANCE_KEY, id);
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
