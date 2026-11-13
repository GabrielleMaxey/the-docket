# Databricks Personal-Token Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each end user guidance and a guided, cross-platform setup for all three Databricks values (workspace address, model endpoint name, personal access token), verified before anything is saved.

**Architecture:** A shared check module (`server/lib/databricksCheck.mjs`) verifies identity and model access. Two Express endpoints and a read-only Settings panel expose status and a Test button. A cross-platform Node script (`npm run setup:databricks`) prompts for values, verifies with the same check module, and writes `.env` atomically. No token ever crosses an HTTP route.

**Tech Stack:** Node 22 ESM (`.mjs`), Express, `dotenv`, `node:test`, React 18 + Semantic UI React, Vite.

**Spec:** `docs/superpowers/specs/2026-11-12-databricks-token-setup-design.md`

## Global Constraints

- Node `>=22`; new server and script code is ESM `.mjs`; tests run with `node --test tests/**/*.test.mjs`.
- Setup works on macOS and Windows (Linux best effort) in browser mode (`npm run dev:all`) and Electron mode (`npm run desktop:dev`). No Electron dependency, no OS-specific tool, no bash-only syntax in npm scripts; paths via `path`.
- Token lifetime guidance is **364 days**, token comment is **"The Docket"**; users must be **assigned as a developer in Databricks**.
- The token never appears in logs, console output, error messages, API responses or IPC. No HTTP route or IPC channel accepts a token.
- `.env` writer: update-or-append only, keep all other lines/comments/order, no duplicate keys, preserve LF/CRLF, atomic write (temp file then rename), POSIX mode `0600` (skipped on Windows).
- Masked token prompt when stdin is a TTY; visible-input fallback with a warning otherwise.
- **This repository is public:** docs, `.env.example`, tests and the PR write-up use placeholders and obviously fake values only (spec 5.8).
- Repo rules (`.cursor/rules/project_rules.mdc`): no speculative abstractions or convenience wrappers; never log sensitive values; add a PR write-up under `docs/PR_WriteUps/`.

## Review Focus

1. Pasted token with whitespace, newline, surrounding quotes or a `Bearer ` prefix is cleaned, not rejected or saved dirty (Task 6).
2. `.env` copied from `.env.example` has only commented placeholders; re-running replaces instead of duplicating; BOM + CRLF files keep working (Task 4).
3. Host pasted from the browser address bar works: bare hostname, trailing slash, `/serving-endpoints` suffix, path, or a `?o=<id>` query; a non-hostname or `http://` is re-prompted with guidance, not saved (Tasks 2, 6). A malformed endpoint name (spaces, slashes) is re-prompted (Tasks 2, 6).
4. A proxy/SSO page answering 200 HTML, a 302, or a hung connection is reported as a failure, never as success (Task 2).
5. A locked or read-only `.env` (Windows `EPERM`) leaves the original untouched and names the path (Tasks 4, 6).

---

### Task 0: Phase 0 confirmations (no code)

**Files:** none. Record answers in the PR write-up (Task 8).

- [ ] **Step 1:** Confirm with your Databricks admin: developer assignment is what grants token creation and API access; personal access tokens are enabled; the maximum token lifetime is at least 364 days.
- [ ] **Step 2:** In Databricks, open your user settings → Developer → Access tokens and copy the page's URL path. If it differs from `/settings/user/developer/access-tokens`, use it for `ACCESS_TOKENS_PATH` in Task 2.
- [ ] **Step 3:** Decide how teammates receive their real host and endpoint values (outside the repo) and write one sentence for the docs.
- [ ] **Step 3a:** Confirm the guidance copy against the real workspace: the sidebar label and field for the endpoint name (Serving → Name), what the address bar shows for the workspace address, and whether `GET /api/2.0/serving-endpoints` lists the endpoints chat uses. If it does not, drop `listServingEndpoints` in Tasks 2 and 6 and keep typed entry.
- [ ] **Step 4:** `git switch pilot && git switch -c gmaxey_databricks_token_setup`, then commit the spec and this plan.

### Task 1: Export Databricks credential builders

**Files:**
- Modify: `server/lib/llmClient.mjs` (`normalizeDatabricksHost` ~line 268, `getDatabricksCredentials` ~line 294)
- Test: `tests/databricksProvider.test.mjs`

**Interfaces:**
- Produces: `normalizeDatabricksHost(value: unknown): string` (exported, behavior unchanged); `buildDatabricksCredentials({ host, token, endpoint }): { apiKey: string, baseUrl: string, model: string }`.

- [ ] **Step 1: Failing tests** in a new `describe("databricks credential builders")`:
  - `normalizeDatabricksHost` maps `example.cloud.databricks.com`, `https://example.cloud.databricks.com/`, `https://example.cloud.databricks.com/serving-endpoints` and `https://example.cloud.databricks.com/ai-gateway/mlflow/v1/` all to `https://example.cloud.databricks.com`; empty input to `""`.
  - `buildDatabricksCredentials({ host: "example.cloud.databricks.com/", token: "dapi-test", endpoint: "chat-endpoint" })` deep-equals `{ apiKey: "dapi-test", baseUrl: "https://example.cloud.databricks.com/ai-gateway/mlflow/v1", model: "chat-endpoint" }` (with `DATABRICKS_API_PATH` unset).
- [ ] **Step 2:** Run `node --test tests/databricksProvider.test.mjs`. Expected: FAIL (exports missing).
- [ ] **Step 3:** Export `normalizeDatabricksHost`; add `buildDatabricksCredentials` composing `baseUrl` from `normalizeDatabricksHost` and `getDatabricksApiPath()`; make `getDatabricksCredentials` keep its existing "not configured on the proxy host" errors and delegate to the builder.
- [ ] **Step 4:** Run the same file. Expected: all PASS, including the existing provider tests.
- [ ] **Step 5:** Commit `refactor: export Databricks credential builders`.

### Task 2: Shared guide constants and the connection-check module

**Files:**
- Create: `shared/databricksSetupGuide.mjs`, `server/lib/databricksCheck.mjs`
- Test: `tests/databricksCheck.test.mjs`

**Interfaces:**
- Consumes: `normalizeDatabricksHost`, `buildDatabricksCredentials` (Task 1).
- Produces:
  - Constants: `TOKEN_LIFETIME_DAYS = 364`, `TOKEN_COMMENT = "The Docket"`, `SETUP_COMMAND = "npm run setup:databricks"`, `ACCESS_TOKENS_PATH = "/settings/user/developer/access-tokens"` (use the Task 0 result), `DEVELOPER_ROLE_MESSAGE = "Your Databricks account may not have API access. Ask your Databricks admin to assign you as a developer."`
  - Guidance copy (spec 5.10, placeholders only): `HOST_GUIDE`, `ENDPOINT_GUIDE`, `TOKEN_GUIDE` (strings); `HOST_INVALID_MESSAGE = "That doesn't look like a Databricks workspace address. Copy it from your browser's address bar, for example https://<workspace-host>."`; `ENDPOINT_INVALID_MESSAGE = "Endpoint names have no spaces or slashes. Copy the Name from the Serving page."`
  - `cleanHostInput(raw: string): { ok: true, host: string } | { ok: false, message: string }` (adds `https://`, strips path/query/fragment/trailing slash and a `/serving-endpoints` or API-path suffix, rejects `http://` and non-hostnames; builds on `normalizeDatabricksHost`); `cleanEndpointInput(raw: string): { ok: true, endpoint: string } | { ok: false, message: string }`; `cleanTokenInput(raw: string): string` (trim, strip surrounding quotes and a leading `Bearer `).
  - `listServingEndpoints({ host, token, fetchImpl = fetch, timeoutMs = 15000 }): Promise<string[]>` → `GET {host}/api/2.0/serving-endpoints` with `redirect: "manual"`; returns endpoint names, or `[]` on any failure (never throws, never includes the token).
  - `redactToken(text: string, token: string): string` replaces every occurrence of a non-empty token with `<redacted>`.
  - `checkDatabricksAccess({ host, token, endpoint, fetchImpl = fetch, timeoutMs = 15000, retryDelaysMs = [1000, 2000], sleep = delay }): Promise<CheckResult>` where `CheckResult = { ok: boolean, user: string | null, code: string | null, message: string, checks: Array<{ name: "identity" | "model", status: "ok" | "failed" | "warning" | "skipped", code: string | null, message: string }> }`. `ok` is true when the identity check passes (a model warning keeps `ok` true). Codes: `host_missing`, `token_missing`, `endpoint_missing`, `token_rejected`, `no_api_access`, `unreachable`, `timeout`, `redirected`, `unexpected_response`, `model_unavailable`, `model_failed`.

- [ ] **Step 1: Failing tests** (fake `fetchImpl` returning `Response` objects; `retryDelaysMs: [0, 0]`). Each assertion uses the spec's exact copy:
  - `identity ok`: 200 `{ "displayName": "Test User", "userName": "t@example.com" }`; model 200 → `ok: true`, `user: "Test User"`, both checks `ok`. Identity request is `GET https://example.cloud.databricks.com/api/2.0/preview/scim/v2/Me` with `Authorization: Bearer <token>` and `redirect: "manual"`; model request is `POST <baseUrl>/chat/completions` with `max_tokens: 1`.
  - `401` → `ok: false`, `code: "token_rejected"`, message `Databricks rejected this token (expired, revoked or mistyped). Create a new one.`; model check `skipped`.
  - `403` → `code: "no_api_access"`, message equals `DEVELOPER_ROLE_MESSAGE`.
  - model `403` and `404` → `ok: true`, model `warning` `model_unavailable`, message ``Token works, but the model endpoint `chat-endpoint` isn't available to you.``
  - fetch rejects with `TypeError` → `code: "unreachable"`, message ``Cannot reach `https://example.cloud.databricks.com`. Check the host value and your network/VPN.``
  - **Review Focus 4:** 200 with an HTML body → `unexpected_response`; 302 → `redirected` and no second request is made (token not forwarded); a fetch that never resolves with `timeoutMs: 20` → `timeout`.
  - 503 then 200 retries per `retryDelaysMs` and succeeds; 503 three times → `unexpected_response` naming the HTTP status.
  - Missing host/token → `host_missing`/`token_missing` with no fetch call; missing endpoint → identity runs, model `skipped` with `endpoint_missing`.
  - Redaction: a response body or thrown error containing the token never appears in any returned `message` (`redactToken`).
  - **Review Focus 3:** `cleanHostInput` maps `example.cloud.databricks.com`, `https://example.cloud.databricks.com/`, `https://example.cloud.databricks.com/serving-endpoints`, `https://example.cloud.databricks.com/?o=123` and `https://example.cloud.databricks.com/ml/endpoints` to `https://example.cloud.databricks.com`; rejects `http://example.cloud.databricks.com`, `not a host`, `` (empty) with `HOST_INVALID_MESSAGE`. `cleanEndpointInput` accepts `chat-endpoint`, trims whitespace, rejects `chat endpoint`, `a/b`, `` with `ENDPOINT_INVALID_MESSAGE`. `cleanTokenInput("  \"Bearer dapi-test\"\n")` returns `dapi-test`.
  - `listServingEndpoints`: 200 `{ "endpoints": [{ "name": "chat-endpoint" }, { "name": "other-endpoint" }] }` → `["chat-endpoint", "other-endpoint"]`; 403, 404, 302, HTML body, rejected fetch and timeout each → `[]`; the Authorization header is `Bearer <token>` and no returned value contains the token.
- [ ] **Step 2:** Run `node --test tests/databricksCheck.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement both files. Use `AbortController` for `timeoutMs`; retry only HTTP 429/5xx; build the model URL from `buildDatabricksCredentials`.
- [ ] **Step 4:** Re-run. Expected: all PASS.
- [ ] **Step 5:** Commit `feat: add Databricks connection check module`.

### Task 3: Status and test endpoints plus client helpers

**Files:**
- Create: `server/routes/databricksRoutes.mjs`
- Modify: `server/jiraProxy.mjs` (import and register next to the other `register*Routes(app, routeCtx)` calls, ~line 284); `src/services/jiraClient.js` (next to `fetchChatStatus`, ~line 731)
- Test: `tests/databricksRoutes.test.mjs`

**Interfaces:**
- Consumes: `checkDatabricksAccess` (Task 2).
- Produces: `registerDatabricksRoutes(app, { withSiteOperation = (h) => h, check = checkDatabricksAccess } = {}): void`; `GET /api/databricks/status` → `{ tokenSet: boolean, hostConfigured: boolean, endpointConfigured: boolean }`; `POST /api/databricks/test` → `CheckResult` (HTTP 200 even when `ok` is false); `fetchDatabricksStatus(): Promise<{...}>` and `testDatabricksConnection(): Promise<CheckResult>` in `jiraClient.js`.

- [ ] **Step 1: Failing tests** (Express app on port 0, global `fetch`, env saved/restored like `databricksProvider.test.mjs`):
  - status returns booleans only and the response body never contains the token value;
  - with env set, `POST /api/databricks/test` calls the injected `check` with `{ host, token, endpoint }` from `process.env` and returns its result unchanged;
  - with nothing set, status is all `false` and test returns `ok: false`, `code: "host_missing"`.
- [ ] **Step 2:** Run `node --test tests/databricksRoutes.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement the routes (trim env values), register them, add the two client helpers (`requestJson` / `postJson` as used by neighbors).
- [ ] **Step 4:** Run the test file, then `npm run check:jira-client-exports`. Expected: PASS and no export errors.
- [ ] **Step 5:** Commit `feat: add Databricks status and test endpoints`.

### Task 4: `.env` writer

**Files:**
- Create: `scripts/lib/envFile.mjs`
- Test: `tests/envFile.test.mjs`

**Interfaces:**
- Produces: `updateEnvText(text: string, updates: Record<string, string>): { text: string, changedKeys: string[] }`; `writeEnvFile(envPath: string, updates: Record<string, string>, opts?: { platform?: string, fsImpl?: typeof fs }): { changedKeys: string[] }` (missing file is treated as empty).

- [ ] **Step 1: Failing tests** (pure tests on `updateEnvText`; temp-dir tests on `writeEnvFile`):
  - replaces an active `KEY=old` in place and keeps comments, blank lines and order; appends a missing key once; a second identical update returns `changedKeys: []` and identical text.
  - **Review Focus 2:** a commented `# DATABRICKS_TOKEN=<placeholder>` line is left alone and one active line is appended; every active duplicate of a key is updated; leading BOM and CRLF are preserved and the first key on a BOM file is still matched.
  - values with `#`, spaces and quotes round-trip: `dotenv.parse(result.text)[key] === value`.
  - `writeEnvFile` writes via a temp file in the same folder, then renames; mode is `0o600` unless `platform === "win32"`.
  - **Review Focus 5:** when `fsImpl.renameSync` throws `EPERM`, the original file bytes are unchanged, the temp file is removed, and the thrown error message includes the path and `EPERM`.
- [ ] **Step 2:** Run `node --test tests/envFile.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement. Match active lines with `^\s*(export\s+)?KEY\s*=`; detect EOL from the first line break; quote a value only when `dotenv` would misread it.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: add atomic cross-platform .env writer`.

### Task 5: Masked and plain prompts

**Files:**
- Create: `scripts/lib/prompts.mjs`
- Test: `tests/setupPrompts.test.mjs`

**Interfaces:**
- Produces: `isMaskedInputAvailable(stdin): boolean` (true when `stdin.isTTY === true` and `stdin.setRawMode` is a function); `readMaskedLine({ stdin, stdout, prompt }): Promise<string>`; `askLine({ stdin, stdout, prompt }): Promise<string>` (via `readline/promises`).

- [ ] **Step 1: Failing tests** with a fake TTY (`EventEmitter` with `isTTY`, `setRawMode`, `resume`, `pause`) and a `PassThrough` stdout:
  - typing `a`, `b`, Backspace (`\x7f`), `c`, Enter returns `"ac"`; stdout contains only `*` characters for input and never the secret; one pasted chunk `dapi-test\r` returns `"dapi-test"`.
  - Ctrl-C (`\x03`) rejects with an `Error` whose message is `Cancelled`; `setRawMode(false)` is called on success and on cancel.
  - non-TTY: stdout gets a warning containing `visible`, and a piped line `tok\n` returns `"tok"`.
- [ ] **Step 2:** Run `node --test tests/setupPrompts.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement with raw mode for TTY and `readline` otherwise; always restore raw mode and pause stdin.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: add masked prompt helpers for setup script`.

### Task 6: Setup script and npm entry

**Files:**
- Create: `scripts/setup-databricks.mjs`
- Modify: `package.json` (`"setup:databricks": "node scripts/setup-databricks.mjs"`, `"presetup:databricks": "npm run check:node"`)
- Test: `tests/setupDatabricks.test.mjs`

**Interfaces:**
- Consumes: `checkDatabricksAccess`, `listServingEndpoints`, guide copy and the `clean*Input` helpers (Task 2), `writeEnvFile` (Task 4), prompts (Task 5).
- Produces: `runSetup({ projectRoot, stdin, stdout, platform = process.platform, fetchImpl = fetch, prompts = { askLine, readMaskedLine } }): Promise<{ status: "saved" | "aborted" | "failed", changedKeys: string[] }>`. Run directly, the script exits `0` on `saved`, `1` otherwise (direct-run detection compares `fileURLToPath(import.meta.url)` with `path.resolve(process.argv[1])` so it works on Windows).

- [ ] **Step 1: Failing tests** (temp project folder, scripted `prompts`, fake `fetchImpl`, captured stdout; hosts like `example.cloud.databricks.com`, tokens like `dapi-test-token`):
  - no `.env`: created from `.env.example`; stdout shows `HOST_GUIDE` before the address prompt, `TOKEN_GUIDE` before the token prompt and `ENDPOINT_GUIDE` before the endpoint prompt (when listing returns nothing); `DATABRICKS_HOST` (normalized `https://…`), `DATABRICKS_ENDPOINT` and `DATABRICKS_TOKEN` are written; result `saved`; stdout lists key names only and **never contains the token**.
  - prompt order is address → token → identity check → endpoint → model check; no endpoint prompt happens before the token is verified.
  - malformed address (`http://example.cloud.databricks.com`, then `https://example.cloud.databricks.com/?o=1`) shows `HOST_INVALID_MESSAGE` once, re-asks, then saves the cleaned address; a malformed endpoint (`chat endpoint`, then `chat-endpoint`) behaves the same with `ENDPOINT_INVALID_MESSAGE`.
  - endpoint discovery: when `listServingEndpoints` returns two names, stdout shows a numbered list and answering `2` saves the second; typing a name not in the list is accepted; when the list is empty the script falls back to `ENDPOINT_GUIDE` and typed entry; an existing `DATABRICKS_ENDPOINT` or `DATABRICKS_HOST` is shown and Enter keeps it (no listing call is made for a kept endpoint).
  - identity `401`: result `failed`, `.env` bytes unchanged, stdout shows the mapped message.
  - model warning: asks to save anyway; answering yes saves, no gives `aborted` with nothing written.
  - **Review Focus 1:** a pasted value `  "Bearer dapi-test-token"\n` is saved as `dapi-test-token`; an empty entry gives `aborted` with `No token entered.`
  - **Review Focus 3:** host answers `example.cloud.databricks.com`, `https://example.cloud.databricks.com/`, `https://example.cloud.databricks.com/serving-endpoints` and `https://example.cloud.databricks.com/?o=123` all save `https://example.cloud.databricks.com`.
  - existing `CHAT_PROVIDER=anthropic` is not replaced unless the user answers yes (default no); unset or `databricks` defaults to yes.
  - existing `.env` lines, CRLF and BOM survive; on `platform: "win32"` stdout includes the note that `.env` inherits the folder's permissions.
  - **Review Focus 5:** a `.env` write failure (`EPERM`) returns `failed` and prints the path.
- [ ] **Step 2:** Run `node --test tests/setupDatabricks.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement the flow in spec 5.2 order: locate/create `.env`; address (show existing or print `HOST_GUIDE`, clean and re-ask on failure); token guide (access-tokens link from the address plus `ACCESS_TOKENS_PATH`, `TOKEN_LIFETIME_DAYS`, `TOKEN_COMMENT`, `DEVELOPER_ROLE_MESSAGE`) and masked prompt via `cleanTokenInput`; identity check before writing; endpoint (show existing, else `listServingEndpoints` pick list, else `ENDPOINT_GUIDE` and typed entry); model check; provider question; write; print changed key names and both restart commands (`npm run dev:all`, `npm run desktop:dev`).
- [ ] **Step 4:** Re-run the file. Then run `npm run setup:databricks` in a scratch copy of the project with a fake token and confirm it aborts at verification without touching `.env`.
- [ ] **Step 5:** Commit `feat: add cross-platform Databricks setup script`.

### Task 7: Read-only Settings panel

**Files:**
- Create: `src/Pages/Settings/components/DatabricksConnectionPanel.jsx`
- Modify: `src/Pages/Settings/components/ChatAssistantSection.jsx` (render under the "Connection status" message, ~line 125)

**Interfaces:**
- Consumes: `fetchDatabricksStatus`, `testDatabricksConnection` (Task 3); `SETUP_COMMAND`, `TOKEN_LIFETIME_DAYS`, `TOKEN_COMMENT`, `ACCESS_TOKENS_PATH`, `DEVELOPER_ROLE_MESSAGE` (Task 2).
- Produces: default-exported `DatabricksConnectionPanel()` (no props).

- [ ] **Step 1:** Implement the panel: Host / Endpoint / Token rows (✓ or ✗ naming `DATABRICKS_HOST`, `DATABRICKS_ENDPOINT`, `DATABRICKS_TOKEN`), where each ✗ row shows its guidance (`HOST_GUIDE`, `ENDPOINT_GUIDE`, `TOKEN_GUIDE`); a **Test connection** button showing each check's status and message; the numbered setup guide with `SETUP_COMMAND`; for `token_missing` or `token_rejected` the hint "Restart The Docket after running setup." There is **no token input**.
- [ ] **Step 2:** Run `npm run build`. Expected: Vite build succeeds. Run `grep -n "password" src/Pages/Settings/components/DatabricksConnectionPanel.jsx`. Expected: no matches.
- [ ] **Step 3:** Manual check in browser mode (`npm run dev:all`) and Electron (`npm run desktop:dev`): with nothing configured the panel names the missing variables; after running the setup script and restarting, **Test connection** shows identity ✓.
- [ ] **Step 4:** Commit `feat: add Databricks connection panel to Settings`.

### Task 8: Docs and PR write-up

**Files:**
- Modify: `.env.example` (comment above the Databricks block pointing to `npm run setup:databricks`; placeholders unchanged), `docs/setup/chat-and-ai.md` (Databricks Model Serving section), `docs/user/reports-and-chat.md`, `README.md` (quick start line)
- Create: `docs/PR_WriteUps/gmaxey_databricks_token_setup.md` (template: `docs/dev/contributing.md` § PR write-ups)

- [ ] **Step 1:** Replace the manual instructions with the guided flow: a "Where to find each value" table (workspace address, endpoint name, token, per spec 5.10 with placeholders), then create a **364-day** token with comment **"The Docket"**, the developer-role requirement, `npm run setup:databricks` (same command on macOS, Windows PowerShell/cmd/Git Bash), restart, then **Test connection**. Include the Task 0 sentence on how to get real host/endpoint values. Placeholders only.
- [ ] **Step 2:** Write the PR write-up with the Task 0 answers and the Task 9 results. No secrets, hostnames or tokens.
- [ ] **Step 3:** Run `npm test`. Expected: all PASS.
- [ ] **Step 4:** Commit `docs: document guided Databricks token setup`.

### Task 9: Cross-platform verification

**Files:** none (results go in the PR write-up).

- [ ] **Step 1:** On macOS and on Windows, in both browser mode and `desktop:dev`: fresh checkout with no `.env` → run `npm run setup:databricks` → restart → Test connection passes.
- [ ] **Step 2:** On Windows, run the script in PowerShell, cmd and Git Bash; confirm masked input where supported and the visible-input warning where not.
- [ ] **Step 3:** Failure cases: wrong token (401), a user without developer assignment (403), unreachable host, replacing a token, `.env` with other keys and CRLF intact.
- [ ] **Step 4:** Record pass/fail per row in the PR write-up. Expected: every row passes or has a filed follow-up.

### Task 10: Apply the public-repo rule to existing docs

Runs after Tasks 0–9, per your instruction.

**Files:**
- Create: `tests/publicRepoPlaceholders.test.mjs`
- Modify: any existing doc the test flags

**Interfaces:**
- Produces: a guard test that scans `README.md`, `.env.example`, `docs/**/*.md`, and `tests/**` for (a) Databricks token shapes `/\bdapi[0-9a-f]{16,}\b/i`, (b) workspace hostnames `<name>.cloud.databricks.com`, `<name>.azuredatabricks.net`, `<name>.gcp.databricks.com` where `<name>` is not `example`, `your-workspace` or `workspace`.

- [ ] **Step 1:** Write the guard test; run `node --test tests/publicRepoPlaceholders.test.mjs`. Expected: FAIL if any existing doc contains real values (list each file and line).
- [ ] **Step 2:** Read every file under `docs/` and the repo root docs by hand for other organization-specific internals (internal hostnames, tenant names, account details, people) and list findings for your decision before changing anything not covered by the test.
- [ ] **Step 3:** Replace flagged values with placeholders; re-run the guard test. Expected: PASS.
- [ ] **Step 4:** Commit `docs: apply public-repo placeholder rule`.
