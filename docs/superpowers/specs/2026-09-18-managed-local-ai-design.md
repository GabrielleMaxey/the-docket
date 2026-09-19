# Managed vs Local AI (design)

**Date:** 2026-09-18  
**Status:** Approved for planning (pending user review of this file)  
**Scope:** Standardize company AI as the default chat/report path while keeping full Local/BYO flexibility  
**Related:** `server/lib/llmClient.mjs`, chat routes, report routes, Settings → Chat assistant

---

## Goal

Give every company install a **consistent default AI** (Managed / Company AI) for chat and report generation, without removing the ability to use local or bring-your-own providers. Less technical users should not need to edit `.env` to use the company path.

## Decisions

| Topic | Choice |
|--------|--------|
| Approach | Parallel `MANAGED_AI_*` credentials + mode resolver above existing LLM client |
| Managed protocol (v1) | OpenAI-compatible only (covers Databricks, Azure OpenAI, GitHub Models) |
| Managed targets (v1) | One company endpoint; room later for multiple managed profiles |
| Local | Full current stack: `anthropic` \| `openai` \| `ollama` \| `rovo` via existing env |
| Default | Always Managed when Managed is ready; user must manually switch to Local |
| Preference scope | Per browser/user; one preference for **chat and reports** |
| Host override | Optional `AI_MODE=managed\|local` wins over user preference |
| UI switch | Settings → Chat assistant only |
| Chat / report pages | Status label only (“Using Company AI” / “Using Local”); link to Settings |
| Reports when Managed | Same path as chat; Local-only `REPORT_*` / `REPORT_PROVIDER` ignored while Managed is active |
| Rovo | Local only |

## Non-goals (v1)

- New Local setup UI (still `.env` for BYO)
- Multiple company profiles in the UI (Databricks vs Azure vs GitHub as separate managed choices)
- Changing prompt content, tools, or Rovo OAuth flows
- Silently falling over from Managed failures to Local
- Renaming or removing existing `CHAT_PROVIDER` / provider env vars

## Config surface

### Managed

| Var | Role |
|-----|------|
| `MANAGED_AI_BASE_URL` | Company OpenAI-compatible gateway base URL |
| `MANAGED_AI_API_KEY` | Token for that gateway |
| `MANAGED_AI_MODEL` | Pinned company model id |
| `AI_MODE` (optional) | Force `managed` or `local` for this host |

Managed is **ready** when base URL, API key, and model are all set.

### Local

Unchanged: `CHAT_PROVIDER`, `ANTHROPIC_*`, `OPENAI_*`, `OLLAMA_*`, Rovo OAuth vars, and existing `REPORT_*` overrides.

Local is **ready** when today’s chat/report readiness checks pass.

No `LOCAL_AI_ENDPOINT` in v1 — Local is the existing provider stack.

## Who wins (resolution)

1. If ops sets `AI_MODE`, that path wins (when ready).
2. Else if **both** Managed and Local are ready → user’s Settings choice (default **Company AI**; Local only after explicit switch).
3. Else if Managed is ready → Company AI.
4. Else if Local is ready → Local.
5. Else → disabled (same as today).
6. Chat and reports share the same active path.

## UI

### Settings → Chat assistant

- Show **Company AI / Local** switch when both paths are ready.
- If only one path is ready, show status only (no switch).
- Keep existing custom instructions and connection status; extend status to reflect Managed vs Local.

### Chat and report screens

- Short status only (e.g. “Using Company AI”).
- Link to Settings to change the path.
- No duplicate mode switch on those pages.

## Under the hood

- Thin resolver above `llmClient` selects Managed vs Local credentials/provider.
- Managed calls reuse the existing OpenAI-compatible client with `MANAGED_AI_*`.
- Local keeps current provider routing unchanged.
- Chat status (and any report status the UI already uses) exposes: managedReady, localReady, activePath, whether the switch is allowed, and a display label.
- User preference stored in the browser (`localStorage`). Chat and report API calls include the preferred path so the proxy uses the same choice for both. Host `AI_MODE` still overrides.

## Error handling

| Situation | Behavior |
|-----------|----------|
| Managed not configured | Use Local if ready; else not configured |
| User selects Local but Local not ready | Do not silently pretend Local works; keep Managed or show a clear not-ready message |
| Managed credentials fail at call time | Surface the error; do **not** auto-switch to Local |
| `AI_MODE` forces a path that isn’t ready | Clear configuration error |

## Testing (manual)

- [ ] Only Managed configured → Company AI used for chat and reports; no switch
- [ ] Only Local configured → Local used; no switch
- [ ] Both configured → defaults to Company AI; Settings can switch to Local; Chat/report status updates; both features follow the choice
- [ ] `AI_MODE=local` / `managed` overrides the Settings preference
- [ ] `REPORT_*` applies only while Local is active
- [ ] Rovo only reachable on Local
- [ ] Failed Managed call does not flip to Local

## Future (out of scope now)

- Multiple managed profiles (e.g. Databricks / Azure / GitHub as labeled company options)
- Optional `LOCAL_AI_*` alias naming if docs need symmetry later
- Persisting preference server-side for multi-device users

## Feasibility

**Feasible with low–medium effort.** Managed is the same protocol the app already supports via `OPENAI_BASE_URL`. Main work is config + resolver + Settings UI + status wiring — not a new LLM integration.
