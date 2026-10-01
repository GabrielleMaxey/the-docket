import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MAX_JIRA_INSTANCES,
  normalizeBaseUrl,
  legacyAppDbPath,
  appDbPathForInstance,
  openInstancesMetaDb,
  initInstancesSchema,
  listInstances,
  resolveJiraCredentials,
  createInstance,
  updateInstance,
  deleteInstance,
  setActiveInstanceId,
  seedInstancesFromEnv,
  seedInstanceAppDbFromLegacyIfNeeded,
  getActiveInstanceId,
  getInstanceCredentials,
} from "../server/lib/jiraInstances.mjs";

import Database from "better-sqlite3";

const tmpDirs = [];

const freshMeta = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jira-inst-"));
  tmpDirs.push(dir);
  const meta = openInstancesMetaDb(path.join(dir, "instances-meta.sqlite"));
  initInstancesSchema(meta);
  return meta;
};

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
  }
});

describe("normalizeBaseUrl", () => {
  it("trims and strips trailing slash", () => {
    assert.equal(normalizeBaseUrl(" https://x.atlassian.net/ "), "https://x.atlassian.net");
  });

  it("strips /browse/... from pasted Jira links", () => {
    assert.equal(
      normalizeBaseUrl("https://lumen.atlassian.net/browse/ODI"),
      "https://lumen.atlassian.net"
    );
  });
});

describe("seedInstanceAppDbFromLegacyIfNeeded", () => {
  it("copies legacy DB into an empty instance file once", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jira-seed-"));
    tmpDirs.push(dir);
    const meta = openInstancesMetaDb(path.join(dir, "instances-meta.sqlite"));
    initInstancesSchema(meta);

    const legacyPath = legacyAppDbPath(dir);
    const legacy = new Database(legacyPath);
    legacy.exec(`
      CREATE TABLE epic_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        epic_key TEXT NOT NULL,
        epic_name TEXT NOT NULL,
        jira_filter_id TEXT,
        jql TEXT,
        preset_type TEXT NOT NULL DEFAULT 'epic',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    legacy.prepare(
      "INSERT INTO epic_presets (epic_key, epic_name, jql, preset_type) VALUES (?, ?, ?, ?)"
    ).run("EPIC", "My Open Work", "assignee = currentUser()", "jql");
    legacy.close();

    const row = createInstance(meta, {
      displayName: "Site A",
      baseUrl: "https://a.atlassian.net",
      email: "a@b.com",
      apiToken: "tok",
    });

    const first = seedInstanceAppDbFromLegacyIfNeeded(meta, dir, row.id);
    assert.equal(first.seeded, true);
    const dest = new Database(appDbPathForInstance(dir, row.id), { readonly: true });
    assert.equal(dest.prepare("SELECT COUNT(*) AS c FROM epic_presets").get().c, 1);
    dest.close();

    const second = seedInstanceAppDbFromLegacyIfNeeded(meta, dir, row.id);
    assert.equal(second.seeded, false);
    assert.equal(second.reason, "already-seeded");
  });
});

describe("paths", () => {
  it("builds legacy and instance db paths", () => {
    assert.equal(legacyAppDbPath("/data"), path.join("/data", "workweek.sqlite"));
    assert.equal(appDbPathForInstance("/data", "abc"), path.join("/data", "workweek-abc.sqlite"));
  });
});

describe("resolveJiraCredentials", () => {
  it("uses legacy env when registry empty", () => {
    const meta = freshMeta();
    const creds = resolveJiraCredentials(meta, {
      JIRA_BASE_URL: "https://legacy.atlassian.net/",
      JIRA_EMAIL: "a@b.com",
      JIRA_API_TOKEN: "tok",
    });
    assert.equal(creds.mode, "legacy");
    assert.equal(creds.baseUrl, "https://legacy.atlassian.net");
    assert.equal(creds.email, "a@b.com");
    assert.equal(creds.apiToken, "tok");
    assert.equal(creds.instanceId, null);
  });

  it("uses active instance when set", () => {
    const meta = freshMeta();
    const row = createInstance(meta, {
      displayName: "Site A",
      baseUrl: "https://a.atlassian.net",
      email: "a@b.com",
      apiToken: "secret-a",
    });
    setActiveInstanceId(meta, row.id);
    const creds = resolveJiraCredentials(meta, {
      JIRA_BASE_URL: "https://legacy.atlassian.net",
      JIRA_EMAIL: "legacy@b.com",
      JIRA_API_TOKEN: "legacy-tok",
    });
    assert.equal(creds.mode, "instance");
    assert.equal(creds.instanceId, row.id);
    assert.equal(creds.baseUrl, "https://a.atlassian.net");
    assert.equal(creds.apiToken, "secret-a");
    assert.equal(creds.displayName, "Site A");
  });
});

describe("getInstanceCredentials", () => {
  it("returns stored creds for id or null when missing", () => {
    const meta = freshMeta();
    assert.equal(getInstanceCredentials(meta, "missing"), null);
    const row = createInstance(meta, {
      displayName: "A",
      baseUrl: "https://a.atlassian.net",
      email: "a@b.com",
      apiToken: "secret",
    });
    const creds = getInstanceCredentials(meta, row.id);
    assert.equal(creds.baseUrl, "https://a.atlassian.net");
    assert.equal(creds.email, "a@b.com");
    assert.equal(creds.apiToken, "secret");
  });
});

describe("createInstance", () => {
  it("rejects a 6th instance", () => {
    const meta = freshMeta();
    for (let i = 0; i < MAX_JIRA_INSTANCES; i++) {
      createInstance(meta, {
        displayName: `S${i}`,
        baseUrl: `https://s${i}.atlassian.net`,
        email: "a@b.com",
        apiToken: `t${i}`,
      });
    }
    assert.throws(
      () =>
        createInstance(meta, {
          displayName: "S5",
          baseUrl: "https://s5.atlassian.net",
          email: "a@b.com",
          apiToken: "t5",
        }),
      (err) => err && err.code === "MAX_INSTANCES"
    );
  });

  it("listInstances never includes apiToken", () => {
    const meta = freshMeta();
    createInstance(meta, {
      displayName: "A",
      baseUrl: "https://a.atlassian.net",
      email: "a@b.com",
      apiToken: "secret",
    });
    const listed = listInstances(meta);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].hasToken, true);
    assert.equal("apiToken" in listed[0], false);
  });
});

describe("updateInstance", () => {
  it("keeps token when apiToken omitted or blank", () => {
    const meta = freshMeta();
    const row = createInstance(meta, {
      displayName: "A",
      baseUrl: "https://a.atlassian.net",
      email: "a@b.com",
      apiToken: "secret",
    });
    updateInstance(meta, row.id, { displayName: "A2", apiToken: "" });
    setActiveInstanceId(meta, row.id);
    assert.equal(resolveJiraCredentials(meta, {}).apiToken, "secret");
  });
});

describe("deleteInstance", () => {
  it("clears active when deleting the active instance and none remain", () => {
    const meta = freshMeta();
    const row = createInstance(meta, {
      displayName: "A",
      baseUrl: "https://a.atlassian.net",
      email: "a@b.com",
      apiToken: "secret",
    });
    setActiveInstanceId(meta, row.id);
    const result = deleteInstance(meta, row.id);
    assert.equal(result.activeInstanceId, null);
    assert.equal(getActiveInstanceId(meta), null);
  });
});

describe("seedInstancesFromEnv", () => {
  it("seeds legacy as instance 1 when registry empty", () => {
    const meta = freshMeta();
    const r = seedInstancesFromEnv(meta, {
      JIRA_BASE_URL: "https://legacy.atlassian.net",
      JIRA_EMAIL: "a@b.com",
      JIRA_API_TOKEN: "tok",
      JIRA_INSTANCE_1_NAME: "Primary",
    });
    assert.equal(r.seeded, 1);
    assert.equal(listInstances(meta)[0].displayName, "Primary");
    assert.ok(getActiveInstanceId(meta));
  });

  it("does not re-seed when registry has rows", () => {
    const meta = freshMeta();
    createInstance(meta, {
      displayName: "Existing",
      baseUrl: "https://e.atlassian.net",
      email: "a@b.com",
      apiToken: "t",
    });
    const r = seedInstancesFromEnv(meta, {
      JIRA_BASE_URL: "https://legacy.atlassian.net",
      JIRA_EMAIL: "a@b.com",
      JIRA_API_TOKEN: "tok",
    });
    assert.equal(r.seeded, 0);
    assert.equal(listInstances(meta).length, 1);
  });
});
