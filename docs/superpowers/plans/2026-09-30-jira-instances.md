# Multi Jira Instance Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users toggle among up to 5 Jira Cloud instances with Settings CRUD, a header switcher, and per-instance SQLite data — while keeping legacy single-`JIRA_*` env working forever when the registry is empty.

**Architecture:** Meta SQLite (`instances-meta.sqlite`) stores instances + `active_instance_id`. The proxy resolves Jira credentials from the active instance or legacy env. App DB path is `workweek-<instanceId>.sqlite` when an instance is active, else legacy `workweek.sqlite`. Route modules receive `getDb()` (not a frozen `db` reference) so activate can rebind without restart.

**Tech Stack:** Node/Express (`jiraProxy.mjs`), better-sqlite3, existing `initDatabase`, React Settings + `AppRouter` nav, `node --test`

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-30-jira-instances-design.md`
- Branch: `gmaxey_jira_instances`
- Max **5** instance rows total
- Tokens **never** returned in API JSON or logs
- Legacy forever: registry empty → `JIRA_BASE_URL` + `JIRA_EMAIL` + `JIRA_API_TOKEN`
- Env can seed; Settings manages afterward
- Per-instance local data via separate SQLite files (same schema via `initDatabase`)
- Header switcher + Settings configure; soft reload on activate
- No new npm dependencies
- Do not commit unless the user asks
- Prefer editing existing functions; keep new surface area minimal

## File map

| File | Responsibility |
|------|----------------|
| `server/lib/jiraInstances.mjs` | Meta DB schema, CRUD, seed, credential resolve, paths |
| `tests/jiraInstances.test.mjs` | Unit tests for registry logic |
| `server/jiraProxy.mjs` | Open meta + app DB; credential-aware `jiraRequest`; `getDb` in `routeCtx`; health fields |
| `server/routes/*.mjs` (db consumers) | Destructure `getDb` instead of `db`; call `getDb()` inside handlers |
| `server/routes/jiraInstanceRoutes.mjs` | REST CRUD / activate / test |
| `src/services/jiraClient.js` | Client helpers for instance APIs |
| `src/Pages/Settings/components/JiraInstancesSection.jsx` | Settings UI |
| `src/Pages/Settings/index.jsx` | Mount section |
| `src/Components/JiraInstanceSwitcher.jsx` | Header dropdown |
| `src/AppRouter.jsx` + `AppRouter.css` | Place switcher |
| `.env.example`, `docs/JIRA_SETUP.md`, `docs/END_USER_GUIDE.md` | Docs |

---

### Task 1: Meta registry + credential resolution

**Files:**
- Create: `server/lib/jiraInstances.mjs`
- Create: `tests/jiraInstances.test.mjs`

**Interfaces:**
- Produces:
  - `MAX_JIRA_INSTANCES = 5`
  - `normalizeBaseUrl(url: string): string`
  - `legacyAppDbPath(dataDir: string): string` → `…/workweek.sqlite`
  - `appDbPathForInstance(dataDir, instanceId): string` → `…/workweek-<id>.sqlite`
  - `noteImagesDirFor(dataDir, instanceId | null): string` → `note-images` or `note-images-<id>`
  - `openInstancesMetaDb(metaPath): Database` + `initInstancesSchema(metaDb)`
  - `toPublicInstance(row): { id, displayName, baseUrl, email, hasToken, enabled, createdAt, updatedAt }`
  - `listInstances(metaDb): PublicInstance[]`
  - `getActiveInstanceId(metaDb): string | null`
  - `setActiveInstanceId(metaDb, id: string | null): void`
  - `resolveJiraCredentials(metaDb, env): { mode: "legacy"|"instance", instanceId, displayName, baseUrl, email, apiToken }`
  - `createInstance(metaDb, input): PublicInstance` — throws `{ code: "MAX_INSTANCES" }` at 5
  - `updateInstance(metaDb, id, patch): PublicInstance` — empty/omitted `apiToken` keeps existing
  - `deleteInstance(metaDb, id): { activeInstanceId: string | null }`
  - `seedInstancesFromEnv(metaDb, env): { seeded: number }` — only when registry empty

- [ ] **Step 1: Write failing tests**

```js
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
  getActiveInstanceId,
} from "../server/lib/jiraInstances.mjs";

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
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test tests/jiraInstances.test.mjs`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `server/lib/jiraInstances.mjs`**

Schema:

```sql
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
```

Use `crypto.randomUUID()` for ids.  
`seedInstancesFromEnv`: if `listInstances` non-empty, return `{ seeded: 0 }`. Else read `JIRA_INSTANCE_N_BASE_URL` / `_EMAIL` / `_API_TOKEN` / `_NAME` for N=1..5; if none, fall back to legacy `JIRA_*` as one row named `JIRA_INSTANCE_1_NAME` or `"Jira"`. Insert rows, set active to first.  
`resolveJiraCredentials`: if `getActiveInstanceId` points at a row, return that; else legacy env (normalize base URL). Empty missing fields → empty strings (caller checks readiness).  
Throw `Object.assign(new Error("Maximum of 5 Jira instances"), { code: "MAX_INSTANCES" })` on overflow.

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test tests/jiraInstances.test.mjs`  
Expected: PASS

---

### Task 2: Rebindable `getDb` + credential-aware Jira client

**Files:**
- Modify: `server/jiraProxy.mjs`
- Modify every route module that destructures `db` (and `noteImagesDir` where applicable) at register time:
  - `server/routes/appConfigRoutes.mjs`
  - `server/routes/dashboardRoutes.mjs`
  - `server/routes/reportRoutes.mjs`
  - `server/routes/chatRoutes.mjs`
  - `server/routes/jiraCoreRoutes.mjs`
  - `server/routes/jiraIssueRoutes.mjs`
  - `server/routes/issueMetadataRoutes.mjs` (also `noteImagesDir` → read via getter / `getNoteImagesDir`)
  - `server/routes/epicWorkloadRoutes.mjs`
  - `server/routes/capacityPlanningRoutes.mjs`
  - `server/routes/teamPriorityRoutes.mjs`
  - `server/routes/pmAsksRoutes.mjs`
  - `server/routes/todoRoutes.mjs`

**Pattern (apply everywhere `db` was closed over at register time):**

```js
// Before
export const registerTodoRoutes = (app, { db }) => {
  app.get("/api/todos", (_req, res) => {
    const rows = db.prepare("SELECT ...").all();
    res.json(rows);
  });
};

// After
export const registerTodoRoutes = (app, { getDb }) => {
  app.get("/api/todos", (_req, res) => {
    const db = getDb();
    const rows = db.prepare("SELECT ...").all();
    res.json(rows);
  });
};
```

Also update helpers that take `db` from route closures — call `getDb()` at the start of each request handler (not once at module register).

**`jiraProxy.mjs` startup sketch:**

```js
import {
  openInstancesMetaDb,
  initInstancesSchema,
  seedInstancesFromEnv,
  resolveJiraCredentials,
  legacyAppDbPath,
  appDbPathForInstance,
  noteImagesDirFor,
  getActiveInstanceId,
} from "./lib/jiraInstances.mjs";
import { initDatabase } from "./db/schema.mjs";

const metaPath = path.join(dbDir, "instances-meta.sqlite");
const metaDb = openInstancesMetaDb(metaPath);
initInstancesSchema(metaDb);
seedInstancesFromEnv(metaDb, process.env);

const runtime = {
  db: null,
  noteImagesDir: null,
  dbPath: null,
};

const openAppDbForCurrent = () => {
  const creds = resolveJiraCredentials(metaDb, process.env);
  const nextPath =
    creds.mode === "instance" && creds.instanceId
      ? appDbPathForInstance(dbDir, creds.instanceId)
      : legacyAppDbPath(dbDir);
  if (runtime.db) {
    try {
      runtime.db.close();
    } catch {
      /* ignore */
    }
  }
  runtime.dbPath = nextPath;
  runtime.db = new Database(nextPath);
  runtime.db.pragma("journal_mode = WAL");
  initDatabase(runtime.db);
  runtime.noteImagesDir = noteImagesDirFor(
    dbDir,
    creds.mode === "instance" ? creds.instanceId : null
  );
  fs.mkdirSync(runtime.noteImagesDir, { recursive: true });
};

openAppDbForCurrent();

const getCredentials = () => resolveJiraCredentials(metaDb, process.env);

const getMissingEnv = () => {
  const c = getCredentials();
  const missing = [];
  if (!c.baseUrl) missing.push(c.mode === "legacy" ? "JIRA_BASE_URL" : "instance.baseUrl");
  if (!c.email) missing.push(c.mode === "legacy" ? "JIRA_EMAIL" : "instance.email");
  if (!c.apiToken) missing.push(c.mode === "legacy" ? "JIRA_API_TOKEN" : "instance.apiToken");
  return missing;
};

const getAuthHeader = () => {
  const c = getCredentials();
  return `Basic ${Buffer.from(`${c.email}:${c.apiToken}`).toString("base64")}`;
};

const jiraRequest = async ({ method = "GET", pathWithQuery, body }) => {
  const c = getCredentials();
  const target = `${c.baseUrl}${pathWithQuery}`;
  // ... same fetch as today, using getAuthHeader()
};

const activateInstance = (id) => {
  setActiveInstanceId(metaDb, id);
  openAppDbForCurrent();
  return getCredentials();
};

const routeCtx = {
  getDb: () => runtime.db,
  get noteImagesDir() {
    return runtime.noteImagesDir;
  },
  dataDir: dbDir,
  metaDb,
  activateInstance,
  getCredentials,
  jiraRequest,
  // ...rest unchanged
};
```

Health:

```js
app.get("/api/health", (_req, res) => {
  const missing = getMissingEnv();
  const c = getCredentials();
  res.json({
    ok: missing.length === 0,
    service: "jira-proxy",
    version: PROXY_VERSION,
    jiraBaseUrl: c.baseUrl || "",
    jiraInstanceId: c.instanceId,
    jiraInstanceName: c.displayName || "",
    legacyMode: c.mode === "legacy",
    searchEndpoint: JIRA_SEARCH_JQL_PATH,
    missingEnv: missing,
  });
});
```

**v1 data note:** Existing `workweek.sqlite` remains the legacy-mode DB. Activating a registry instance opens a **new** `workweek-<id>.sqlite` (empty until used). Do not auto-copy in v1.

- [ ] **Step 1: Convert route modules to `getDb()`** (mechanical; keep behavior identical)  
- [ ] **Step 2: Wire meta DB + `openAppDbForCurrent` + credential-aware `jiraRequest` in `jiraProxy.mjs`**  
- [ ] **Step 3: Manual smoke** — start with only legacy `JIRA_*`; `GET /api/health` shows `legacyMode: true` and correct `jiraBaseUrl`; presets/settings still load  

---

### Task 3: Instance REST routes

**Files:**
- Create: `server/routes/jiraInstanceRoutes.mjs`
- Modify: `server/jiraProxy.mjs` — register routes

**Interfaces:**
- Consumes: `metaDb`, `activateInstance`, `getCredentials`, `jiraRequest` (for test optional separate fetch)
- Routes:

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/jira/instances` | `{ instances, activeInstanceId, legacyMode }` — public fields only |
| POST | `/api/jira/instances` | body `{ displayName, baseUrl, email, apiToken }` — 400 on validation / MAX_INSTANCES |
| PATCH | `/api/jira/instances/:id` | partial update; blank token ignored |
| DELETE | `/api/jira/instances/:id` | delete; if was active, activate another or clear to legacy; reopen app DB |
| POST | `/api/jira/instances/:id/activate` | `activateInstance(id)`; return `{ ok, activeInstanceId, jiraBaseUrl, displayName, legacyMode }` |
| POST | `/api/jira/instances/:id/test` | optional body overrides for unsaved form; `GET /rest/api/3/myself`; do not change active |

```js
// server/routes/jiraInstanceRoutes.mjs (core activate handler)
app.post("/api/jira/instances/:id/activate", (req, res) => {
  try {
    const creds = activateInstance(req.params.id);
    res.json({
      ok: true,
      activeInstanceId: creds.instanceId,
      jiraBaseUrl: creds.baseUrl,
      displayName: creds.displayName,
      legacyMode: creds.mode === "legacy",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});
```

Never include `apiToken` in any response. Never `console.log` tokens.

- [ ] **Step 1: Implement and register `jiraInstanceRoutes.mjs`**  
- [ ] **Step 2: Smoke with curl** — create → list (no token keys) → activate → health `jiraBaseUrl` changes; 6th create → 400  
- [ ] **Step 3: Test connection** — bad token returns error body; active unchanged  

---

### Task 4: Settings UI + client helpers

**Files:**
- Modify: `src/services/jiraClient.js`
- Create: `src/Pages/Settings/components/JiraInstancesSection.jsx`
- Modify: `src/Pages/Settings/index.jsx`

**Client helpers** (add near other exports in `jiraClient.js`):

```js
export const fetchJiraInstances = async () => requestJson("/api/jira/instances");

export const createJiraInstance = async (body) =>
  requestJson("/api/jira/instances", { method: "POST", body: JSON.stringify(body) });

export const updateJiraInstance = async (id, body) =>
  requestJson(`/api/jira/instances/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteJiraInstance = async (id) =>
  requestJson(`/api/jira/instances/${encodeURIComponent(id)}`, { method: "DELETE" });

export const activateJiraInstance = async (id) =>
  requestJson(`/api/jira/instances/${encodeURIComponent(id)}/activate`, {
    method: "POST",
    body: "{}",
  });

export const testJiraInstance = async (id, body = {}) =>
  requestJson(`/api/jira/instances/${encodeURIComponent(id)}/test`, {
    method: "POST",
    body: JSON.stringify(body),
  });
```

**UI:** New `SettingsSection` titled “Jira sites” — table of name / URL / Active badge; Add disabled at 5; Edit modal with write-only token; Set active → `activateJiraInstance` then `window.location.reload()`; Remove with confirm.

Mount near the top of Settings (before or after Chat assistant):

```jsx
import JiraInstancesSection from "./components/JiraInstancesSection";
// in render:
<JiraInstancesSection />
```

Copy note in section description: local notes/presets are per site; switching reloads the app.

- [ ] **Step 1: Add client helpers**  
- [ ] **Step 2: Build `JiraInstancesSection.jsx`** using Semantic UI like other sections  
- [ ] **Step 3: Manual** — add second instance, activate, confirm reload and isolated presets  

---

### Task 5: Header switcher

**Files:**
- Create: `src/Components/JiraInstanceSwitcher.jsx`
- Modify: `src/AppRouter.jsx`
- Modify: `src/AppRouter.css`

```jsx
// JiraInstanceSwitcher.jsx — compact select in nav
import React from "react";
import { activateJiraInstance, fetchJiraInstances } from "../services/jiraClient.js";

const JiraInstanceSwitcher = () => {
  const [state, setState] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchJiraInstances()
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const { instances = [], activeInstanceId, legacyMode } = state;
  if (legacyMode && instances.length === 0) {
    return (
      <span className="app-nav-jira-switcher app-nav-jira-switcher--legacy" title="Configure more sites in Settings">
        Jira
      </span>
    );
  }

  const onChange = async (event) => {
    const id = event.target.value;
    if (!id || id === activeInstanceId) return;
    setBusy(true);
    try {
      await activateJiraInstance(id);
      window.location.reload();
    } catch {
      setBusy(false);
    }
  };

  return (
    <label className="app-nav-jira-switcher">
      <span className="app-nav-jira-switcher-label">Site</span>
      <select
        value={activeInstanceId || ""}
        onChange={onChange}
        disabled={busy || instances.length < 2}
        aria-label="Active Jira site"
      >
        {instances.map((inst) => (
          <option key={inst.id} value={inst.id}>
            {inst.displayName}
          </option>
        ))}
      </select>
    </label>
  );
};

export default JiraInstanceSwitcher;
```

In `AppLayout` nav, place switcher before the links list (or after `BackgroundJobIndicator`):

```jsx
import JiraInstanceSwitcher from "./Components/JiraInstanceSwitcher.jsx";
// ...
<BackgroundJobIndicator />
<JiraInstanceSwitcher />
<ul className="app-nav-links">
```

CSS: compact select matching nav height/colors (no purple theme; follow existing `.app-nav` tokens).

- [ ] **Step 1: Component + CSS**  
- [ ] **Step 2: Wire into `AppRouter.jsx`**  
- [ ] **Step 3: Manual** — switch from header; health/name updates; site A presets absent on B  

---

### Task 6: Docs + env example

**Files:**
- Modify: `.env.example`
- Modify: `docs/JIRA_SETUP.md`
- Modify: `docs/END_USER_GUIDE.md`

**.env.example additions:**

```bash
# Optional: multiple Jira sites (max 5). If unset, single JIRA_* above is used (legacy).
# When instances are managed in Settings, active instance credentials win.
# JIRA_INSTANCE_1_NAME=Primary
# JIRA_INSTANCE_1_BASE_URL=https://your-domain.atlassian.net
# JIRA_INSTANCE_1_EMAIL=you@example.com
# JIRA_INSTANCE_1_API_TOKEN=
# JIRA_INSTANCE_2_NAME=Other
# JIRA_INSTANCE_2_BASE_URL=
# JIRA_INSTANCE_2_EMAIL=
# JIRA_INSTANCE_2_API_TOKEN=
```

Document Settings + header switcher in JIRA_SETUP and a short END_USER_GUIDE subsection “Switching Jira sites”.

- [ ] **Step 1: Update the three doc files**  
- [ ] **Step 2: Run the design-spec manual checklist**  
- [ ] **Step 3: Commit only if the user asks**

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Registry + max 5 | 1, 3 |
| Credential resolve + legacy forever | 1, 2 |
| Env seed | 1 |
| Per-instance SQLite + note-images | 2, 3 |
| REST + no tokens | 3 |
| Settings CRUD + test connection | 3, 4 |
| Header switcher + reload | 5 |
| Health extension | 2 |
| Docs | 6 |

## Risks

- **Stale `db` closures:** Task 2 must convert all `register*Routes` that close over `db` to `getDb()`. Grep for `register.*Routes` and `{ db` after Task 2 to confirm zero leftover frozen handles.
- **`runJiraSearchRequest` / helpers** in `jiraProxy.mjs` that call `getJiraSearchFields(db)` must use `getDb()` / `runtime.db`.
- AI path stays host-level (non-goal).

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-30-jira-instances.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — execute in this session with checkpoints  

Which approach?
