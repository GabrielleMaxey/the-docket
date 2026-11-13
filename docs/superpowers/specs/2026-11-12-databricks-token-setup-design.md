# The Docket: Guided Databricks Setup (Workspace Address, Model Endpoint, Token) — Design Spec

Status: Draft for review (revision 3: adds guidance for the workspace address and model endpoint, not only the token)
Date: 2026-11-12
Supersedes: the OAuth-first draft and revision 1 (Electron `safeStorage`). OAuth U2M with PKCE is a **future feature** (section 9).

## 1. Purpose and success criteria

**Purpose.** Until The Docket completes its organization's AI governance and security review, each end user connects to Databricks with their **own personal access token (PAT)**. Chat needs three values in `.env`: the workspace address (`DATABRICKS_HOST`), the model endpoint name (`DATABRICKS_ENDPOINT`) and the token (`DATABRICKS_TOKEN`). Today users hand-edit `.env` and have to work out for themselves what each value is and where to find it. This feature gives them guidance for **all three** and a guided setup that works the same way on macOS and Windows.

**Success criteria.**
1. **Cross-platform:** setup works on macOS and Windows (and Linux on a best-effort basis), in both run modes the project supports (browser mode `npm run dev:all` and Electron `npm run desktop:dev`). Nothing depends on Electron, an OS-specific tool, or bash-only syntax.
2. A user with the right Databricks access can find each of the three values from on-screen guidance (section 5.10), run one command, and get a clear pass/fail result before anything is saved. The token is pasted masked.
3. The token never appears in logs, console output, error messages or API responses.
4. Every failure (malformed workspace address or endpoint name, wrong token, expired token, missing API access, unreachable host, no access to the model endpoint) gets a specific, plain-language message with the next step.
5. Existing `.env`-based setups keep working unchanged, and the setup preserves every other line in the user's `.env`.
6. Settings → Chat assistant shows whether Databricks is configured and offers **Test connection**.

## 2. Scope and non-goals

**In scope:** a setup script, a shared connection-check module, two read/test endpoints, a Settings panel, error messages, docs.

**Out of scope:** OAuth/PKCE (section 9), pulling credentials from a central secrets manager (for example HashiCorp Vault), Jira token handling, accepting tokens through the UI or any HTTP route, encryption at rest (see section 10).

## 3. User prerequisites

- The user must be **assigned as a developer in Databricks** to use the API. Without it, token creation or API calls can fail with a permission error, and the tools tell the user to ask their Databricks admin for that assignment.
- The workspace must allow personal access tokens, and its maximum token lifetime must be at least 364 days (otherwise the user picks the longest allowed value; see Phase 0).
- **Token lifetime: 364 days.** The setup guide tells users to set the lifetime to 364 days and use the comment "The Docket".

## 4. Current state (verified in the repo)

- **Distribution:** packaged installers (Mac DMG, Windows NSIS) are unsupported (`docs/unsigned-installs.md`). Users run from a project checkout with Node 22+ using `npm run dev:all` (browser mode) or `npm run desktop:dev` (Electron). Where device policy blocks Electron, they use browser mode. So the API process (plain Node) is the only component present in every mode; Electron cannot be relied on.
- **Config:** everything comes from the project `.env` (gitignored via `.env` and `.env.*`; `.env.example` is tracked). `server/jiraProxy.mjs` loads it once at startup with `dotenv`.
- **Token use:** `DATABRICKS_TOKEN` is used by the Databricks provider in `server/lib/llmClient.mjs` (readiness check and credentials). `DATABRICKS_HOST` and `DATABRICKS_ENDPOINT` are also required.
- **Existing rule:** the app rejects tokens submitted over HTTP (Jira routes: "submitted tokens are not accepted"). This design keeps that rule.
- **Script conventions:** `scripts/*.mjs` are ESM Node scripts; `seed-epic-presets.mjs` already uses `readline/promises` and `dotenv`.
- **UI:** Settings → Chat assistant (`src/Pages/Settings/components/ChatAssistantSection.jsx`) already has "AI path" and "Connection status" sections.
- **Tests:** `node --test tests/**/*.test.mjs`; `tests/databricksProvider.test.mjs` covers the provider.

## 5. Design

### 5.1 User flow

1. In Settings → Chat assistant, the Databricks panel shows which of the three values are set and the guidance in 5.10, or the user starts from the docs.
2. The user finds the **workspace address** and the **model endpoint name** (guidance in 5.10; the real values come from their team).
3. In Databricks, the user generates a personal access token with a **364-day** lifetime and the comment "The Docket" (guide gives the link built from the workspace address).
4. In the project folder, the user runs `npm run setup:databricks` (same command in PowerShell, cmd, Git Bash, Terminal).
5. The script walks through the address, the token (masked) and the endpoint, verifies them, and only then writes `.env`.
6. The user restarts The Docket (the script prints the right command), then clicks **Test connection** in Settings to confirm.

To change any value, run the script again; existing non-secret values are shown and Enter keeps them. To remove the token, delete the `DATABRICKS_TOKEN` line from `.env`.

### 5.2 Setup script: `scripts/setup-databricks.mjs` (`npm run setup:databricks`)

Behavior, in order:
1. **Locate `.env`** in the project root. If it doesn't exist, create it from `.env.example`.
2. **Workspace address:** if `DATABRICKS_HOST` is set, show it and let Enter keep it; otherwise print the host guidance (5.10) and prompt. The answer is cleaned and validated (5.10) and re-asked on failure.
3. **Token:** print the access-tokens link (built from the address), the 364-day/comment instructions and the developer-role requirement, then prompt. Masked input when stdin is a TTY (raw mode; works in Terminal, PowerShell, cmd, Windows Terminal). If stdin is not a TTY (for example Git Bash/mintty or a pipe), read one line from stdin and print a warning that input may be visible.
4. **Verify identity** with the shared check module (5.4) **before writing anything**. A failure aborts with the mapped message and changes nothing.
5. **Model endpoint:** if `DATABRICKS_ENDPOINT` is set, show it and let Enter keep it. Otherwise, using the now-verified token, try to list the endpoints the user can see (5.4). If names come back, show a numbered list plus "type a different name"; if listing fails or is empty, print the endpoint guidance (5.10) and prompt. The name is validated (5.10). Then run the model check; a failure is a warning, and the script asks before saving anyway.
6. **Provider:** ask whether to set `CHAT_PROVIDER=databricks`; default **no** if `CHAT_PROVIDER` is already set to something else, so a user's existing provider is never silently replaced.
7. **Write `.env`** (5.3), then print which **keys** changed (never values) and the restart command.

### 5.3 `.env` writer

- Update-or-append `KEY=value` for the keys above; keep all other lines, comments and ordering; never create a duplicate key.
- Preserve the file's line endings (detect LF vs CRLF; Windows-edited files are often CRLF).
- Write atomically: temp file in the same folder, then rename over `.env`.
- POSIX: set mode `0600` (best effort). Windows: `chmod` has no effect, so the script does not attempt it and instead notes that `.env` inherits the checkout folder's permissions (keep the checkout under the user's profile).
- The token is written unquoted unless it contains characters `dotenv` would misread; the writer test covers `#`, spaces and quotes.

### 5.4 Shared check module: `server/lib/databricksCheck.mjs`

`checkDatabricksAccess({ host, token, endpoint, fetchImpl = fetch })` returns a structured result and never includes the token in it:
1. **Identity:** `GET {host}/api/2.0/preview/scim/v2/Me`. Success returns the user's name.
2. **Model access:** one minimal chat completion through the **same request path chat uses** in `llmClient.mjs`, so it tests what the user actually needs. Failure is a **warning**, not a failed connection.

Used by both the setup script and the test endpoint, so the two always agree.

The module also offers **endpoint discovery**, `listServingEndpoints({ host, token, fetchImpl })`: `GET {host}/api/2.0/serving-endpoints`, returning endpoint names the user can see. It is a convenience only: any failure (403, 404, timeout, unexpected body) returns an empty list and the script falls back to typed entry, because the list may not match the path chat uses (Phase 0).

### 5.5 Server endpoints (Express, no tokens in or out)

Route names follow `server/routes/appConfigRoutes.mjs` conventions; proposed paths:
- `GET /api/databricks/status` → `{ tokenSet, hostConfigured, endpointConfigured }` (booleans only).
- `POST /api/databricks/test` → runs `checkDatabricksAccess` using the server's own env and returns `{ ok, user?, checks, message }`.

### 5.6 Settings panel (read-only)

In `ChatAssistantSection.jsx`: shows Token set / Host set / Endpoint set, a **Test connection** button with the result and mapped message, and the setup guide with the command to run. There is **no token field**, no IPC and no Electron-specific code, so it behaves identically in browser mode and `desktop:dev`.

### 5.7 Error handling

| Situation | Message and behavior |
|---|---|
| Workspace address malformed (not a hostname, or not https after cleaning) | "That doesn't look like a Databricks workspace address. Copy it from your browser's address bar, for example `https://<workspace-host>`." Re-prompt; nothing is written. |
| Endpoint name malformed (empty, spaces, slashes) | "Endpoint names have no spaces or slashes. Copy the Name from the Serving page." Re-prompt; nothing is written. |
| 401 on identity check | "Databricks rejected this token (expired, revoked or mistyped). Create a new one." Script writes nothing. |
| 403 on identity check | "Your Databricks account may not have API access. Ask your Databricks admin to assign you as a developer." Script writes nothing. |
| 403/404 on model check | Warning: "Token works, but the model endpoint `<name>` isn't available to you." |
| Host unreachable / DNS / proxy failure | "Cannot reach `<host>`. Check the host value and your network/VPN." Script writes nothing. |
| `DATABRICKS_HOST` / `DATABRICKS_ENDPOINT` missing (panel) | Names the missing variable and points to `npm run setup:databricks`. |
| Token set but server started before the script ran | Test fails with 401 or "not set"; panel hint: "Restart The Docket after running setup." |
| `.env` cannot be written (permissions, locked) | Names the path and reason; nothing is partially written (atomic rename). |

### 5.10 Guidance for the three values

One set of copy, defined once in a shared module and used by the script, the Settings panel and the docs. All examples are placeholders; real values come from the user's team, outside the repo.

| Value | Where to find it | Rules applied | Placeholder example |
|---|---|---|---|
| Workspace address (`DATABRICKS_HOST`) | Open the Databricks workspace in a browser and copy the address up to the end of the domain. Leave off the path and anything after `?`. | Accepts a bare hostname or full URL; adds `https://`; strips path, query (for example `?o=…`), fragment and trailing slash; strips a `/serving-endpoints` or API-path suffix; rejects non-https and anything that is not a hostname. | `https://<workspace-host>` |
| Model endpoint (`DATABRICKS_ENDPOINT`) | In the workspace sidebar open **Serving**, find the endpoint your team named, and copy its **Name** (not a display title). If unsure which one, ask your team. | Non-empty, no spaces, no slashes. The model check then confirms the user can call it. | `<serving-endpoint-name>` |
| Token (`DATABRICKS_TOKEN`) | User settings → Developer → Access tokens → Generate new token; lifetime **364 days**, comment "The Docket". Requires developer assignment. | Trimmed; surrounding quotes and a leading `Bearer ` removed; never echoed. | `<databricks-personal-access-token>` |

`REPORT_DATABRICKS_ENDPOINT` (optional, separate model for reports) is not prompted for; the guide mentions it and points to `.env.example`.

### 5.8 Security

- The token is never logged, printed, echoed or returned; the script prints key names only. Errors and logs redact it, and tests assert this.
- Masked prompt; the token is held in memory only long enough to verify and write.
- No HTTP route or IPC channel accepts a token, so the existing "no submitted tokens" rule stays intact.
- `.env` stays gitignored; POSIX mode `0600`.
- **This repository is public.** Everything committed (docs, `.env.example`, tests, this spec, the PR write-up) uses placeholders and obviously fake values only: no real workspace hostnames, endpoint names, tokens, account details or organization-specific internals. Real values reach users from their team, outside the repo.

### 5.9 Platform notes

- **Windows:** the npm script is plain `node scripts/setup-databricks.mjs` (no shell syntax); all paths use `path`; CRLF is preserved; `chmod` is skipped; masked input uses raw mode and falls back to a visible prompt with a warning where raw mode is unavailable (for example Git Bash).
- **macOS/Linux:** same script; `.env` set to `0600`.
- **Corporate proxy/VPN:** the check module uses the same `fetch` as chat, so behavior matches existing chat calls on every OS.

## 6. Assumptions to verify (Phase 0, no code)

1. **Databricks side:** developer assignment is what grants API/token access; PAT creation is enabled; the maximum token lifetime allows 364 days; the exact Access tokens page path for the deep link.
2. **Starting values:** how new users receive the real `DATABRICKS_HOST` and `DATABRICKS_ENDPOINT` values (from their team, outside the repo). `.env.example` holds placeholders only.
2a. **Guidance accuracy:** confirm the exact sidebar label and field name for the endpoint (Serving → Name), the address-bar format for the workspace address, and whether `GET /api/2.0/serving-endpoints` returns the endpoints chat actually uses (or whether chat's gateway path lists differently). If it does not match, drop endpoint discovery and keep typed entry.
3. **Windows terminals:** run the script in PowerShell, cmd and Git Bash on a corporate-managed Windows machine to confirm masked input and the fallback.
4. **Proxy/VPN:** identity and model calls behave like existing chat calls from Windows and macOS.

## 7. Testing

Match the repo setup: `node --test`.
- **Unit (`.env` writer):** replaces an existing key, appends a missing key, no duplicates, keeps comments and order, preserves LF and CRLF, handles values with `#`, spaces and quotes, never writes on failure, never logs values.
- **Unit (check module):** mapping for 200, 401, 403, 404, network failure with mocked `fetch`; the token never appears in results or errors.
- **Unit (prompt logic):** TTY vs non-TTY selection.
- **Integration:** status/test endpoints against a fake Databricks HTTP server.
- **Manual checklist (macOS and Windows):** fresh checkout with no `.env`; existing `.env` with other keys intact; wrong token; admin-restricted user (403); host unreachable; replace token; restart and Test connection; both browser mode and `desktop:dev`.

## 8. Delivery phases

0. **Verify** the section 6 assumptions.
1. **Check module and endpoints:** `databricksCheck.mjs`, status/test routes, tests.
2. **Setup script and `.env` writer:** `scripts/setup-databricks.mjs`, the `npm run setup:databricks` entry, tests.
3. **Settings panel:** read-only status, Test connection, guide text.
4. **Docs and PR write-up:** `docs/setup/chat-and-ai.md`, `docs/user/reports-and-chat.md`, README quick start, `.env.example`; PR write-up under `docs/PR_WriteUps/` per the repo rules.
5. **Optional hardening (only if the security review requires encryption at rest):** section 10.

A detailed task-by-task implementation plan follows once this spec is approved.

## 9. Future feature: OAuth U2M with PKCE (not part of this build)

When the governance and security review approves The Docket and a Databricks admin registers an OAuth app connection, replace "paste a token" with a **Connect Databricks** flow:
- Authorization code flow with **PKCE (S256)** and a `state` check; the system browser opens the Databricks authorize URL, and a one-shot listener on `127.0.0.1` receives the redirect.
- Code exchange yields short-lived access and refresh tokens; refresh is silent and single-flight, and `invalid_grant` marks the connection expired.
- The shared check module, the Test endpoint and the Settings panel carry over; the token is obtained and refreshed by the flow instead of pasted. This would run in the API process, so it also works in every mode on every OS.
- Needs: an OAuth app registration (client ID and an allowed loopback redirect port), scopes for model serving plus `offline_access`, and confirmation of token lifetimes.

## 10. Optional later: encryption at rest

This build stores the token in `.env`, the same way the app already stores `JIRA_API_TOKEN` and every other credential. If the security review requires encryption at rest, the cross-platform option is the OS credential store (macOS Keychain, Windows Credential Manager) accessed from the **API process** through a prebuilt N-API module, with the setup script writing there instead of `.env`. It must be verified on corporate-managed macOS and Windows machines before committing to it. Electron's `safeStorage` is deliberately not used because it only exists in Electron, which is not present in browser mode.
