# PR: Guided Databricks setup (workspace address, model endpoint, token)

## Summary
Adds `npm run setup:databricks`, a cross-platform guided setup that collects the Databricks workspace address, model endpoint name and personal access token, verifies them before saving, and updates `.env` safely. Settings > Chat assistant gains a read-only status panel with **Test connection**. This is an interim approach until the app clears AI governance and security review; OAuth (PKCE) sign-in is a planned future feature.

## Problem
| Symptom | Root cause |
|---------|-----------|
| Users hand-edit `.env` and cannot tell what each Databricks value is or where to find it | No guidance for the workspace address, endpoint name or token |
| A wrong value only shows up later as a failed chat | Nothing verified the values before they were saved |
| Setup instructions differed by OS and shell | Manual `.env` editing, no single command |

## Changes
### Shared check and guidance
- `server/lib/databricksCheck.mjs`: identity check, model check (same request path chat uses), and optional endpoint discovery; results never contain the token.
- `shared/databricksSetupGuide.mjs`: one copy of the guidance (where to find each value, 364-day token with the comment "The Docket", developer-assignment requirement), used by the script, the panel and the docs.

### Setup script
- `scripts/setup-databricks.mjs` (`npm run setup:databricks`): prompts for address, masked token and endpoint, verifies before writing, asks before replacing an existing `CHAT_PROVIDER`.
- `.env` writer keeps other lines, comments, ordering and LF/CRLF line endings, writes atomically, and prints key names only.

### API and UI
- `GET /api/databricks/status` (booleans only) and `POST /api/databricks/test`; no route accepts a token.
- Settings > Chat assistant: token/host/endpoint status, **Test connection**, setup command.

### Docs
- `docs/setup/chat-and-ai.md`, `docs/user/reports-and-chat.md`, `README.md` and `.env.example` describe the guided flow with placeholders only. Real host and endpoint values come from the team, not this repository.

## Test plan
- [x] Automated: `node --test` over the Databricks tests (check module, routes, provider, `.env` writer, prompts, setup script) passes in the agent sandbox.
- [x] Token never appears in results, errors or logs (asserted in tests).
- [x] Every relative link added in the docs resolves to an existing file.
- [x] Changed files scanned for real-looking hostnames and tokens; only placeholders found.

### Verification still to do
**Phase 0 (Databricks side, needs the admin)**
- [ ] Developer assignment grants token creation and API access.
- [ ] Personal access tokens are enabled for the workspace.
- [ ] Maximum token lifetime is at least 364 days.
- [ ] Confirm the real Access tokens page path (`ACCESS_TOKENS_PATH` in `shared/databricksSetupGuide.mjs` is provisional).
- [ ] Confirm the endpoint wording "Serving > Name".
- [ ] Confirm `GET /api/2.0/serving-endpoints` lists the endpoints chat actually uses; if not, drop `listServingEndpoints` and keep typed entry.
- [ ] Decide how teammates receive the real host and endpoint values.

**On the Mac**
- [ ] `npm run build` (could not run in the sandbox).
- [ ] `npm test` (the sandbox could only run `node --test` directly).
- [ ] Settings > Chat assistant panel in browser mode (`npm run dev:all`), before and after running the setup script.
- [ ] Same check in Electron (`npm run desktop:dev`).

**On Windows (PowerShell, cmd, Git Bash)**
- [ ] Run `npm run setup:databricks` with a real token in each shell.
- [ ] Masked input works where supported; the visible-input warning appears where not.
- [ ] The script actually runs when invoked via npm (its direct-run detection compares file URLs and has only been exercised on POSIX).
- [ ] Works behind the corporate proxy/VPN.

**Failure cases with a real workspace**
- [ ] Wrong token (401).
- [ ] User without developer assignment (403).
- [ ] Unreachable host.
- [ ] Replacing an existing token.
- [ ] `.env` with other keys and CRLF line endings stays intact.

### Known limitations
- In non-TTY terminals (Git Bash), fully piped multi-line input can lose lines because each prompt opens its own readline.
- Arrow keys typed during the masked prompt become part of the entered text; verification then fails and nothing is saved.

## Files touched
| Area | Path |
|------|------|
| Check module | `server/lib/databricksCheck.mjs` |
| Shared guidance | `shared/databricksSetupGuide.mjs` |
| Setup script | `scripts/setup-databricks.mjs` |
| UI | `src/Pages/Settings/components/ChatAssistantSection.jsx` |
| Docs | `docs/setup/chat-and-ai.md`, `docs/user/reports-and-chat.md`, `README.md`, `.env.example` |
| Spec | `docs/superpowers/specs/2026-11-12-databricks-token-setup-design.md` |
