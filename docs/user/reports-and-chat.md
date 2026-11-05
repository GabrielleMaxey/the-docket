# Past Reports and Chat

[← User Guide index](../END_USER_GUIDE.md)

## Past Reports — saved outputs

**Past Reports** lists every report the app has archived on this machine. Open it from the top nav.

| Tab | Contents |
|-----|----------|
| **Task Management** | Project reports and week plans (saved automatically when you click Generate). Also includes a **Completed To Dos** section showing completed to-dos with date range filter chips: **Last 30 days**, **Last 90 days**, **All time** (default is last 90 days). |
| **Combined Work** | Reports generated from Combined Open Work, separate from the active site archive |
| **Metrics** | Executive / PM / Developer audience reports (saved automatically on Generate), plus Flow Report and Gantt Plan health snapshots saved with **Save to archive** (reopened in full) |
| **Ad-hoc** | Chat assistant replies you explicitly saved with **Save to Past Reports** |
| **Files** | Live list of CoWork `weekly-plan-*.md` files in the data folder (read from disk; optional **Save to archive**) |

For each tab: pick a row → **View** → expand the report to read, copy, or download. Dashboard archived reports may include the status chart that was shown at generation time.

**Deleting:** Task Management, Combined Work, Metrics, and Ad-hoc each have a **Delete** button per row and a **Delete all** button for the whole tab (both ask for confirmation first — this cannot be undone). **Files** never deletes the actual file on disk; instead, a file that's already been **Save to archive**d shows a **Remove from archive** button (and a **Remove all from archive** button appears once at least one file has an archived copy) that removes just the saved database copy — the file itself is untouched. Files with no archived copy show neither button, since there's nothing to remove; use **Save to archive** first if you want a removable copy.

**CoWork weekly plans:** When Claude CoWork writes `weekly-plan-<date>.md` into the app's `data/` folder, those files show under **Files**. Content is read live from disk until you click **Save to archive**, which copies it into the local Past Reports database as a week plan (so it remains after the file is moved or deleted).

**How reports display:** the report viewer shows markdown tables as tables (wide ones scroll sideways) and collapsible sections that open on click. Week plans end with a collapsible **How the score works** section, see [Help me plan my week](week-plan.md). Underscores inside names such as `config__value__here` are shown as written, not turned into italics.

**Clear report** on Task Management or Metrics removes the on-page copy and browser cache only — it does **not** delete items already listed here.

---


## Chat — ask Jira questions

Chat lets you ask natural-language questions about your Jira data. Each message sends:

- **Epic filter selection** — same presets as Metrics (scopes live Jira searches)
- **Task Management JQL results** — cached from the last time you ran JQL (labels, counts, top open issues; past due vs upcoming tagged separately)
- **Metrics snapshot** — data from the last **Refresh status** (refreshed when you send a Chat message)
- **Generated reports and plans** — project reports, Metrics reports, and week plans you generated in this browser (last 8)

### How to use it

1. Go to **Chat**
2. Select presets in the filter panel (optional but helps scope Jira searches)
3. Type a question and press Enter or click **Send**
4. On any assistant reply, click **Save to Past Reports** to archive it under **Past Reports → Ad-hoc** (optional — Chat does not auto-save replies)

For the best experience, run JQL on Task Management, refresh Metrics, or generate a report/plan **before** asking Chat to summarize or reference that work.

**Example questions:**
- "Which epics are past due?"
- "How many upcoming vs past due tasks are in my metrics snapshot?"
- "Summarize open work for the selected epics"
- "Who has the most overdue tasks in my My Work query?"
- "What's the status of PROJ-1234?"
- "What did my week plan say about Tuesday?"
- "Summarize the executive report I generated on Metrics"

The assistant uses session context first when you ask about reports or queries you already ran. For anything outside that context, it searches Jira directly and will say when it does not have data rather than guessing.

### Provider setup (developers)

| Setup | What you need |
|-------|----------------|
| **Anthropic** | `CHAT_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` in `.env` on the proxy host |
| **OpenAI** | `CHAT_PROVIDER=openai` + `OPENAI_API_KEY` (+ optional `OPENAI_BASE_URL`) |
| **Databricks Model Serving** | `CHAT_PROVIDER=databricks` + `DATABRICKS_HOST` + `DATABRICKS_TOKEN` + `DATABRICKS_ENDPOINT` (serving endpoint name) |
| **Ollama (local)** | `CHAT_PROVIDER=ollama` + `OLLAMA_BASE_URL` |
| **Any OpenAI-compatible API** | `CHAT_PROVIDER=openai` + `OPENAI_API_KEY` + `OPENAI_BASE_URL` |
| **Rovo (opt-in)** | `CHAT_PROVIDER=rovo` + OAuth vars — see [Chat, reports and AI providers](../setup/chat-and-ai.md) |
| **Disabled / not configured** | `CHAT_PROVIDER=disabled` or leave unset |

Check readiness: `GET /api/chat/status` returns `provider`, `ready`, and for Rovo also `oauthConfigured` and `oauthConnected`.

### Rovo sign-in (when `CHAT_PROVIDER=rovo`)

1. In Chat, click **Sign in with Atlassian** (calls `GET /api/chat/auth/start?format=json` and opens the authorize URL).
2. Approve the requested scopes (`read:jira-work`, `write:jira-work`, `offline_access`, `search:rovo:mcp`, `read:me`).
3. Return to Chat after the callback page confirms sign-in.

**Re-sign-in:** Use **Sign out** in Chat (`POST /api/chat/auth/signout`), then sign in again — needed after scope changes, token expiry issues, or switching Atlassian accounts.

**Fallback:** If Rovo MCP is unavailable or you are not signed in, chat still works when an LLM key is configured on the proxy. The reply may include a short note that the answer came from the LLM fallback instead of Rovo.

**Note:** If Chat shows a warning and `ready` is false, set `CHAT_PROVIDER` and the matching API key in `.env`, or complete Atlassian sign-in for Rovo.

---

[← User Guide index](../END_USER_GUIDE.md)
