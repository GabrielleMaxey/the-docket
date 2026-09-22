# PR: Create Issue fixes — BUG Tracking, clearable dropdowns, AI Draft truncation

## Summary

Makes Bug creation work end to end in the Create Issue modal. BUG Tracking values are now sent to Jira as Components (which is how ODI models them), dropdowns can be cleared, and AI Draft no longer fails on longer Bug drafts.

## Problem

| Symptom | Root cause |
|---------|------------|
| Create fails with "BUG Tracking field is not available on Bugs" | ODI has no BUG Tracking field — `BUG Tracking-*` values are **Components**. The app looked for a createmeta field named "bug tracking", found none, fell back to a hardcoded list, then rejected the selection on create |
| BUG Tracking list missing Ansible and Workflow | Hardcoded fallback list was stale |
| Can't clear Components / Vertical Components / BUG Tracking once set | `ComboDropdownField` rendered without `clearable` |
| AI Draft (especially with the AI helper on a Bug) returns "AI Draft returned text that was not valid JSON" | Bug drafts need ~1,100 output tokens but were capped at 900; the model stopped mid-JSON (`stop_reason: max_tokens`, reproduced 3/3) |
| A slow AI provider could leave Create disabled indefinitely | No timeout on LLM fetches or the client request; `canSubmit` requires `!generatingDesc` |

## Changes

- **BUG Tracking as components** — `loadCreateFieldOptions` offers `BUG Tracking-*` components as BUG Tracking options when Bug createmeta has no dedicated field (and removes them from the regular Components list). `applyOdiCreateFields` merges the selection into `components` with the regular Component. Projects that publish a real BUG Tracking field keep using it.
- **Clearable dropdowns** — `clearable` on `ComboDropdownField`; the frontend now trusts Jira's BUG Tracking list instead of silently substituting the static list.
- **AI Draft token budgets** — Story 4000, Bug 3000, Task 2000.
- **Truncation detection** — `completeLlmText({ failOnTruncation })` throws `LlmTruncatedError` on Anthropic `max_tokens`, OpenAI `length`, or Ollama `length`; the route returns a clear 502 instead of an unparseable-JSON 422.
- **Tolerant JSON parse** — extracts the JSON object when the model adds text around it.
- **Timeouts** — `AbortSignal.timeout` on all LLM fetches (`LLM_TIMEOUT_MS` 180s, `OLLAMA_TIMEOUT_MS` 600s), AI Draft at `AI_DRAFT_TIMEOUT_MS` 120s, and a 150s client timeout so the spinner always clears.

## Test plan

- [ ] Create a Bug with a Component **and** a BUG Tracking value → issue shows both components in Jira
- [ ] Create a Bug with only BUG Tracking → issue has that one component
- [ ] BUG Tracking dropdown lists all five `BUG Tracking-*` components; regular Components no longer lists them
- [ ] × clears Components, Vertical Components, and BUG Tracking
- [ ] Bug + **Use AI helper** with all guided questions filled → AI Draft returns a title, description, and priority
- [ ] `npm test` — new tests in `tests/jiraCreateIssueFields.test.mjs` pass

## Files touched

| Path | Change |
|------|--------|
| `server/lib/jiraCreateIssueFields.mjs` | BUG Tracking → components fallback; `isBugTrackingComponentName` |
| `server/lib/llmClient.mjs` | Fetch timeouts, `LlmTruncatedError`, `failOnTruncation` |
| `server/routes/jiraIssueRoutes.mjs` | Token budgets, tolerant JSON parse, truncation/timeout errors |
| `shared/odiCreateIssueFields.mjs` | Complete offline BUG Tracking fallback list |
| `src/Pages/components/CreateIssueModal.jsx` | Clearable dropdowns, live BUG Tracking options, hint text |
| `src/services/jiraClient.js` | Optional request timeout; 150s for AI Draft |
| `tests/jiraCreateIssueFields.test.mjs` | BUG Tracking component tests |
| `docs/*` | End-user, developer, and env-var docs |
