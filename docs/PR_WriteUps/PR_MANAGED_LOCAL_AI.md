# PR: Managed vs Local AI

## Summary

Adds a company **Managed AI** path (`MANAGED_AI_*`) as the default for chat and reports when configured, with an explicit **Local** opt-in that keeps today’s full provider stack. Settings holds the switch; Chat and report screens show status only.

## Problem

| Symptom | Root cause |
|---------|------------|
| Every install configured chat differently | Only per-provider env (`CHAT_PROVIDER` / keys / URLs) — no blessed company default |
| Less technical users shouldn’t edit `.env` to use company AI | No Managed vs Local product concept or UI |

## Changes

### Config / resolver
- `MANAGED_AI_BASE_URL`, `MANAGED_AI_API_KEY`, `MANAGED_AI_MODEL` (+ optional `AI_MODE` host lock)
- `server/lib/aiPath.mjs` resolves Managed vs Local (default Managed when ready)
- Managed reuses OpenAI-compatible client; Local unchanged (`anthropic` / `openai` / `ollama` / `rovo`)
- `REPORT_*` applies only on Local

### API / UI
- Chat status exposes managed/local readiness and active path; requests send `aiPath`
- Reports honor the same path preference
- Settings → Chat assistant: Company AI / Local switch when both ready
- Chat + report UIs: “Using …” status + link to Settings

### Docs / tests
- `.env.example`, `JIRA_SETUP.md`, design/plan under `docs/superpowers/`
- `tests/aiPath.test.mjs`

## Test plan

- [ ] Only Managed configured → Company AI for chat and reports; no switch
- [ ] Only Local configured → Local; no switch
- [ ] Both configured → defaults to Company AI; Settings can switch to Local; chat and reports follow
- [ ] `AI_MODE=local` / `managed` overrides preference
- [ ] Failed Managed call does not silently flip to Local
- [ ] Rovo only on Local
- [ ] `node --test tests/aiPath.test.mjs` passes

## Files touched

| Area | Paths |
|------|--------|
| Resolver | `server/lib/aiPath.mjs`, `llmClient.mjs`, `chatProviders.mjs` |
| Routes | `chatRoutes.mjs`, `reportRoutes.mjs`, `jiraIssueRoutes.mjs` |
| UI | `ChatAssistantSection.jsx`, `Chat.jsx`, report panels, `jiraClient.js`, `aiPathPreference.js` |
| Docs/tests | `.env.example`, `JIRA_SETUP.md`, `docs/superpowers/*`, `tests/aiPath.test.mjs` |
