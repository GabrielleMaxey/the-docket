# Managed vs Local AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a company Managed AI path (`MANAGED_AI_*`) as the default for chat and reports, with an explicit Local opt-in that keeps today’s full provider stack.

**Architecture:** New `server/lib/aiPath.mjs` resolves Managed vs Local from env + optional request preference. Managed reuses the existing OpenAI-compatible client with separate credentials. UI: Settings switch + status-only labels on Chat/report pages; preference in `localStorage`, sent as `aiPath` on API calls.

**Tech Stack:** Node (Express proxy), existing `llmClient.mjs` / chat + report routes, React Settings/Chat/report panels, `node --test`

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-18-managed-local-ai-design.md`
- Managed protocol: OpenAI-compatible only (`MANAGED_AI_BASE_URL`, `MANAGED_AI_API_KEY`, `MANAGED_AI_MODEL`)
- Default: Managed whenever ready; Local only after explicit user switch (or `AI_MODE=local`)
- One preference for chat **and** reports; host `AI_MODE` overrides preference
- Switch lives only in Settings → Chat assistant; Chat/report pages show status + link to Settings
- No silent failover from Managed errors to Local
- `REPORT_*` / `REPORT_PROVIDER` apply only when active path is Local
- Rovo remains Local-only
- Do not invent `LOCAL_AI_*` env vars in v1
- Do not commit unless the user asks
- Prefer editing existing functions; keep new surface area minimal
- No new npm dependencies

## File map

| File | Responsibility |
|------|----------------|
| `server/lib/aiPath.mjs` | Ready checks, path resolution, managed credentials, display labels |
| `tests/aiPath.test.mjs` | Unit tests for resolution rules |
| `server/lib/llmClient.mjs` | Accept resolved path / managed credentials for completions |
| `server/lib/chatProviders.mjs` | Route chat through resolved path |
| `server/routes/chatRoutes.mjs` | Status payload + honor `aiPath` on POST |
| `server/routes/reportRoutes.mjs` | Honor `aiPath` on report generation |
| `server/routes/jiraIssueRoutes.mjs` | Any LLM issue helpers that call report provider (same path) |
| `.env.example` | Document Managed vars |
| `docs/JIRA_SETUP.md` | Short Managed vs Local section |
| `src/services/aiPathPreference.js` | `localStorage` get/set for preferred path |
| `src/services/jiraClient.js` | Send `aiPath` on chat/report calls; consume extended status |
| `src/Pages/Settings/components/ChatAssistantSection.jsx` | Company AI / Local switch |
| `src/Pages/Chat.jsx` | Status label + Settings link |
| Report UI panels that call generate APIs | Status label + Settings link |

---

### Task 1: `aiPath` resolver (pure logic + tests)

**Files:**
- Create: `server/lib/aiPath.mjs`
- Create: `tests/aiPath.test.mjs`

**Interfaces:**
- Produces:
  - `AI_PATH_MANAGED = "managed"`
  - `AI_PATH_LOCAL = "local"`
  - `isManagedAiReady(env?: NodeJS.ProcessEnv): boolean`
  - `getManagedAiCredentials(env?: NodeJS.ProcessEnv): { apiKey: string, baseUrl: string, model: string }` — throws if not ready
  - `getHostAiMode(env?: NodeJS.ProcessEnv): "managed" | "local" | null`
  - `resolveAiPath({ preferredPath, managedReady, localReady, hostMode }): { path: "managed" | "local" | "disabled", switchAllowed: boolean, displayLabel: string, lockedByHost: boolean }`
- Consumes: nothing from other new modules

- [ ] **Step 1: Write failing tests**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AI_PATH_MANAGED,
  AI_PATH_LOCAL,
  isManagedAiReady,
  getHostAiMode,
  resolveAiPath,
  getManagedAiCredentials,
} from "../server/lib/aiPath.mjs";

describe("isManagedAiReady", () => {
  it("requires base URL, API key, and model", () => {
    assert.equal(isManagedAiReady({}), false);
    assert.equal(
      isManagedAiReady({
        MANAGED_AI_BASE_URL: "https://example/v1",
        MANAGED_AI_API_KEY: "tok",
        MANAGED_AI_MODEL: "model-a",
      }),
      true
    );
  });
});

describe("resolveAiPath", () => {
  it("defaults to managed when both ready and no preference", () => {
    const r = resolveAiPath({
      preferredPath: null,
      managedReady: true,
      localReady: true,
      hostMode: null,
    });
    assert.equal(r.path, AI_PATH_MANAGED);
    assert.equal(r.switchAllowed, true);
    assert.equal(r.displayLabel, "Company AI");
  });

  it("honors preferred local when both ready", () => {
    const r = resolveAiPath({
      preferredPath: AI_PATH_LOCAL,
      managedReady: true,
      localReady: true,
      hostMode: null,
    });
    assert.equal(r.path, AI_PATH_LOCAL);
    assert.equal(r.displayLabel, "Local");
  });

  it("host AI_MODE overrides preference", () => {
    const r = resolveAiPath({
      preferredPath: AI_PATH_LOCAL,
      managedReady: true,
      localReady: true,
      hostMode: AI_PATH_MANAGED,
    });
    assert.equal(r.path, AI_PATH_MANAGED);
    assert.equal(r.lockedByHost, true);
    assert.equal(r.switchAllowed, false);
  });

  it("uses only available path when the other is not ready", () => {
    assert.equal(
      resolveAiPath({
        preferredPath: AI_PATH_LOCAL,
        managedReady: true,
        localReady: false,
        hostMode: null,
      }).path,
      AI_PATH_MANAGED
    );
    assert.equal(
      resolveAiPath({
        preferredPath: AI_PATH_MANAGED,
        managedReady: false,
        localReady: true,
        hostMode: null,
      }).path,
      AI_PATH_LOCAL
    );
  });

  it("returns disabled when nothing is ready", () => {
    assert.equal(
      resolveAiPath({
        preferredPath: null,
        managedReady: false,
        localReady: false,
        hostMode: null,
      }).path,
      "disabled"
    );
  });

  it("host mode pointing at unready path yields disabled", () => {
    assert.equal(
      resolveAiPath({
        preferredPath: null,
        managedReady: false,
        localReady: true,
        hostMode: AI_PATH_MANAGED,
      }).path,
      "disabled"
    );
  });
});

describe("getManagedAiCredentials", () => {
  it("returns trimmed credentials when ready", () => {
    const creds = getManagedAiCredentials({
      MANAGED_AI_BASE_URL: "https://example/v1/",
      MANAGED_AI_API_KEY: " tok ",
      MANAGED_AI_MODEL: " model-a ",
    });
    assert.deepEqual(creds, {
      apiKey: "tok",
      baseUrl: "https://example/v1",
      model: "model-a",
    });
  });
});

describe("getHostAiMode", () => {
  it("parses managed|local and ignores other values", () => {
    assert.equal(getHostAiMode({ AI_MODE: "managed" }), AI_PATH_MANAGED);
    assert.equal(getHostAiMode({ AI_MODE: "LOCAL" }), AI_PATH_LOCAL);
    assert.equal(getHostAiMode({ AI_MODE: "nope" }), null);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test tests/aiPath.test.mjs`  
Expected: FAIL (module missing / exports missing)

- [ ] **Step 3: Implement `server/lib/aiPath.mjs`**

Implement exactly to satisfy the tests above. Resolution order:

1. If `hostMode` is set → that path if ready, else `disabled`
2. Else if both ready → `preferredPath` if `managed|local`, else default `managed`
3. Else if managed ready → `managed`
4. Else if local ready → `local`
5. Else → `disabled`

`switchAllowed` = both ready AND `hostMode` is null.  
`displayLabel` = `"Company AI"` | `"Local"` | `"Not configured"`.  
`lockedByHost` = Boolean(hostMode).

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test tests/aiPath.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit only if user asked**

---

### Task 2: Wire Managed into `llmClient` completions

**Files:**
- Modify: `server/lib/llmClient.mjs`
- Test: extend `tests/aiPath.test.mjs` only if you extract a tiny helper; otherwise manual + existing chat/report smoke later

**Interfaces:**
- Consumes: `getManagedAiCredentials`, `AI_PATH_MANAGED`, `AI_PATH_LOCAL` from `aiPath.mjs`
- Produces:
  - `isLocalChatReady({ oauthConnected }): boolean` — today’s chat readiness for configured local provider (move/wrap existing checks; do not change semantics)
  - `isLocalReportReady(): boolean` — today’s `resolveFirstReadyReportProvider() !== "disabled"`
  - `completeLlmText` / `completeLlmWithJiraTools` accept optional `aiPath: "managed" | "local"`
  - When `aiPath === "managed"`: call OpenAI-compatible path with **managed** credentials only; ignore `REPORT_*` even if `forReports: true`
  - When `aiPath === "local"` or omitted: existing behavior

- [ ] **Step 1: Add local readiness helpers** that reuse `getConfiguredChatProvider` / `isChatProviderReady` and `resolveFirstReadyReportProvider` without changing their internal logic.

- [ ] **Step 2: Thread managed credentials into OpenAI callers**

Minimal pattern inside `completeOpenAiText` / tool loop: if a `credentials` override object `{ apiKey, baseUrl, model }` is passed, use it instead of `getOpenAiCredentials`. Managed path supplies that override from `getManagedAiCredentials()`.

```js
// conceptual — keep real edits minimal and match file style
if (aiPath === AI_PATH_MANAGED) {
  const credentials = getManagedAiCredentials();
  return completeOpenAiText({
    systemPrompt,
    userMessage: userContent,
    maxTokens,
    forReports: false, // never REPORT_* on managed
    credentials,
  });
}
```

Same for `completeLlmWithJiraTools`.

- [ ] **Step 3: Smoke mentally / quick node assert** that missing managed env throws a clear error mentioning `MANAGED_AI_*`.

- [ ] **Step 4: Commit only if user asked**

---

### Task 3: Chat status + chat POST honor `aiPath`

**Files:**
- Modify: `server/routes/chatRoutes.mjs`
- Modify: `server/lib/chatProviders.mjs`

**Interfaces:**
- Consumes: `resolveAiPath`, `getHostAiMode`, `isManagedAiReady`, `AI_PATH_*`; `isLocalChatReady` from llmClient
- Produces status JSON shape:

```js
{
  provider,              // local configured provider (existing) OR "managed" when active path is managed
  ready,                 // active path is usable
  oauthConfigured,       // unchanged (rovo/local)
  oauthConnected,        // unchanged
  managedReady: boolean,
  localReady: boolean,
  activePath: "managed" | "local" | "disabled",
  switchAllowed: boolean,
  displayLabel: string,
  lockedByHost: boolean,
}
```

- Chat POST body may include `aiPath: "managed" | "local"` (optional). Resolve path server-side; if result is `disabled`, 503 with clear hint.

- [ ] **Step 1: Extend `GET /api/chat/status`** to compute `managedReady`, `localReady`, resolve with `preferredPath: null` for **default** display fields (`activePath` default / host lock), and still include local `provider` for Local details. When documenting for UI: Settings will re-resolve client-side preference against `managedReady`/`localReady`/`lockedByHost`, OR status accepts `?aiPath=` query — prefer **query** `?aiPath=managed|local` so status matches preference without duplicating rules:

```js
const preferred = String(req.query.aiPath || "").trim().toLowerCase() || null;
const resolved = resolveAiPath({
  preferredPath: preferred === "managed" || preferred === "local" ? preferred : null,
  managedReady: isManagedAiReady(),
  localReady: isLocalChatReady({ oauthConnected }),
  hostMode: getHostAiMode(),
});
```

- [ ] **Step 2: Update `POST /api/chat`** to read `req.body.aiPath`, resolve, then:
  - managed → `sendChatWithProvider` / complete with managed OpenAI path (not Rovo)
  - local → existing `sendChatMessage` flow
  - disabled → 503

- [ ] **Step 3: Update `sendChatMessage` in `chatProviders.mjs`** to accept `aiPath` and branch accordingly (keep Rovo only on local).

- [ ] **Step 4: Manual check** — with only local env, status shows Local; with managed env vars set in a throwaway shell, status shows Company AI.

- [ ] **Step 5: Commit only if user asked**

---

### Task 4: Reports honor the same `aiPath`

**Files:**
- Modify: `server/routes/reportRoutes.mjs` (`callLLMForReport` and each POST that calls it)
- Modify: `server/routes/jiraIssueRoutes.mjs` if it calls `completeLlmText` / report provider independently

**Interfaces:**
- Consumes: same `resolveAiPath` + readiness helpers
- Produces: report generation uses Managed credentials when resolved path is managed; Local uses `resolveFirstReadyReportProvider` + `forReports: true` as today

- [ ] **Step 1: Change `callLLMForReport` signature**

```js
const callLLMForReport = async ({ systemPrompt, context, label = "report", aiPath = null }) => {
  const localReady = isLocalReportReady();
  const managedReady = isManagedAiReady();
  const resolved = resolveAiPath({
    preferredPath: aiPath === "managed" || aiPath === "local" ? aiPath : null,
    managedReady,
    localReady,
    hostMode: getHostAiMode(),
  });
  if (resolved.path === "disabled") {
    throw new Error("No AI provider configured. Set MANAGED_AI_* or CHAT_PROVIDER / REPORT_PROVIDER in .env.");
  }
  if (resolved.path === AI_PATH_MANAGED) {
    return completeLlmText({
      systemPrompt,
      userMessage: context,
      maxTokens: REPORT_MAX_TOKENS,
      aiPath: AI_PATH_MANAGED,
      forReports: true, // ignored for credentials when managed
    });
  }
  const provider = resolveFirstReadyReportProvider();
  // existing local path...
};
```

- [ ] **Step 2: Pass `req.body.aiPath` from each report POST** into `callLLMForReport`.

- [ ] **Step 3: Same for `jiraIssueRoutes.mjs` LLM helper** if present (read `req.body.aiPath`).

- [ ] **Step 4: Commit only if user asked**

---

### Task 5: Frontend preference helper + client API wiring

**Files:**
- Create: `src/services/aiPathPreference.js`
- Modify: `src/services/jiraClient.js`

**Interfaces:**
- Produces:
  - `AI_PATH_STORAGE_KEY = "taskManagerAiPath"`
  - `getPreferredAiPath(): "managed" | "local" | null`
  - `setPreferredAiPath(path: "managed" | "local"): void`
  - `fetchChatStatus` includes preferred path as query: `/api/chat/status?aiPath=...` when set
  - `sendChatMessage`, `generateReport`, and other LLM report helpers send `aiPath` in JSON body when preference is set (and when resolved client default is managed — always send explicit `managed` or `local` once preference helper returns a concrete value; if null and managedReady unknown, omit and let server default)

- [ ] **Step 1: Implement preference module**

```js
const KEY = "taskManagerAiPath";

export const getPreferredAiPath = () => {
  const v = String(localStorage.getItem(KEY) || "").trim().toLowerCase();
  return v === "managed" || v === "local" ? v : null;
};

export const setPreferredAiPath = (path) => {
  const v = String(path || "").trim().toLowerCase();
  if (v !== "managed" && v !== "local") return;
  localStorage.setItem(KEY, v);
};
```

Default UX: if null, treat as managed in UI when `managedReady` (do not write until user toggles, OR write `managed` on first Settings visit — prefer **do not write until user toggles**; server already defaults).

- [ ] **Step 2: Update `jiraClient` chat/report callers** to attach `aiPath: getPreferredAiPath() || undefined` and status query when preference set.

- [ ] **Step 3: Commit only if user asked**

---

### Task 6: Settings switch + Chat/report status labels

**Files:**
- Modify: `src/Pages/Settings/components/ChatAssistantSection.jsx`
- Modify: `src/Pages/Chat.jsx`
- Modify: report panels that trigger LLM generation (at least `src/Pages/components/ProjectReportPanel.jsx` and Dashboard report entry points that call `generateReport`) — status only

**Interfaces:**
- Consumes: chat status fields + `getPreferredAiPath` / `setPreferredAiPath`
- Produces: Settings radio/dropdown **Company AI** / **Local** when `switchAllowed`; disabled/hidden with explanation when locked or only one path ready

- [ ] **Step 1: Settings UI**

When `chatStatus.switchAllowed`:
- Show control bound to preference (default display Managed if preference null)
- On change: `setPreferredAiPath`, refresh status with query param, flash “AI path updated.”

When not switchAllowed: show `displayLabel` + short reason (only one configured, or locked by host).

Update connection status copy to mention Managed vars when relevant (do not remove Local `.env` guidance).

- [ ] **Step 2: Chat page**

Replace or extend provider line with: `Using {displayLabel}` and a text link/button to Settings (existing app route for Settings).

- [ ] **Step 3: Report UIs**

Same short status near generate controls; no switch.

- [ ] **Step 4: Manual checklist** from the spec Testing section.

- [ ] **Step 5: Commit only if user asked**

---

### Task 7: Docs

**Files:**
- Modify: `.env.example`
- Modify: `docs/JIRA_SETUP.md` (chat/LLM section)

- [ ] **Step 1: Add Managed block to `.env.example`** above or beside existing chat providers:

```bash
# ── Managed / Company AI (default when set) ─────────────────────────────────
# OpenAI-compatible company gateway (Databricks, Azure OpenAI, GitHub Models, …)
# MANAGED_AI_BASE_URL=https://<company-gateway>/v1
# MANAGED_AI_API_KEY=
# MANAGED_AI_MODEL=
# Optional host lock: AI_MODE=managed | local
```

- [ ] **Step 2: Document** Managed vs Local, Settings switch, no silent failover, `REPORT_*` Local-only — in `docs/JIRA_SETUP.md` near existing chat provider tables.

- [ ] **Step 3: Commit only if user asked**

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| `MANAGED_AI_*` + optional `AI_MODE` | 1, 7 |
| Resolution / default Managed / host lock | 1, 3, 4 |
| Managed OpenAI-compatible client | 2 |
| Chat + reports same path | 3, 4, 5 |
| Settings switch only | 6 |
| Status on Chat/reports | 6 |
| No silent Managed→Local failover | 1 (errors), 2–4 (no fallback branch) |
| `REPORT_*` Local-only | 2, 4 |
| Rovo Local-only | 3 |
| Docs | 7 |
| Future multi-profile | out of scope (not scheduled) |

## Execution

After this plan is accepted, implement task-by-task without expanding scope.
