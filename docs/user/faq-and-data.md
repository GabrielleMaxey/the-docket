# Your data and common questions

[← User Guide index](../END_USER_GUIDE.md)

## Where your data lives

Local files are under the launched project's `data/` directory by default. Registered Jira entries use `workweek-<instanceId>.sqlite`; legacy single-site mode uses `workweek.sqlite`. Same-hostname saved entries still have separate local stores.

| Data | Stored where | Sharing behavior |
|------|--------------|------------------|
| JQL inputs, labels, table snapshots, on-page reports | Site-scoped browser storage | Searches go to Jira; selected context can be sent to AI |
| Chat session artifacts | Site-scoped browser storage | Sent as context when you use Chat |
| Ordinary Past Reports, presets, notes, planning, metrics snapshots | Site SQLite | Local unless explicitly sent to Jira, AI, or Team |
| Combined Work goals and report archive | `data/docket-combined.sqlite` | Separate from ordinary site goals/reports; generation uses the configured AI provider |
| Personal To Dos and completed history | `data/personal-todos.sqlite` | App-wide, independent of Jira sites and Team settings |
| Saved Jira entries and Use team DB preference | `data/instances-meta.sqlite` | Server-managed configuration |
| Note images kept on this machine | `data/note-images-<instanceId>/` or legacy `data/note-images/` | Sent to Jira only when pushed |
| Team metadata | Optional PostgreSQL database | Shared through explicit Team operations when enabled and connected |
| Status, assignee, Due date, MRD, pushed comments | Jira | Visible to people with access to the Jira issue |
| Jira / AI credentials | Server environment or project `.env` | Used by the server to authenticate to the configured service |

Personal To Dos save automatically across site switches, deletion of a site, and restarts. Existing records migrate with a ledger so deleted migrated items are not recreated. Ambiguous older records stay in their original database for recovery; a notice identifies that situation. New To Dos are limited to 15 active items, without discarding existing migrated items. Completed **All time** includes items with an unknown completion date.


---


## Common questions

**The table is empty after Run JQL**
Your JQL returned no results, or filters are hiding rows. Check **Loaded X of Y** — if Y > X, click **Load remaining**. Try widening the JQL in Jira's own search first to confirm issues exist.

**I left the page while a refresh or report was running**
That's fine — work continues in the background. Look for the yellow pill in the top nav. Return to Metrics or Task Management when it finishes; refresh updates the stored snapshot, and reports/plans are saved to this browser.

**How do we share the same epic/JQL presets across the team?**
One person exports a **team pack** from Settings; others **Import team pack** (merge or replace). See [Epic & JQL presets](getting-started.md#epic--jql-presets) above.

**"Showing saved results" banner appears**
That's normal — the table was restored from the last time you ran JQL. Click **Run JQL** to get fresh data.

**My notes disappeared on another computer**
Expected. Notes are stored in a local file on the machine you started the app on. Use one machine, or ask a developer about exporting the SQLite file. For **shared ranking**, link a Task Management slot to a Shared program (or review and save a CSV to team) — see [Shared projects — notes and priority](shared-projects.md#shared-projects--notes-and-priority-pms-and-managers).

**How do we share priority on a project like we did in Excel?**
Link the Task Management slot to a **Shared program** so priority reads/writes the team store (PostgreSQL). Or **Settings → Import metadata** from a CSV (save locally or to team). See [Shared projects — notes and priority](shared-projects.md#shared-projects--notes-and-priority-pms-and-managers).

**The Push note button is greyed out**
You've already pushed that exact note (text and attachments) as a comment. Edit the note or change attached files and the button will re-enable.

**Chat gave a generic answer about my report**
Generate the report or week plan first on Task Management or Metrics, then ask Chat in the same browser. Session context is stored locally when you click Generate — it is not sent to a third-party cloud beyond your configured LLM provider.

**What's the difference between Clear report and Past Reports?**
**Clear report** removes the report from the Task Management or Metrics page (and its browser cache). **Past Reports** keeps everything saved to the local database when you generated a report/plan, or when you clicked **Save to Past Reports** on a Chat reply. Clearing on-page does not delete archived rows.

**Chat says it's not ready**
For Anthropic/OpenAI/Ollama: set `CHAT_PROVIDER` and the matching API key in `.env` on the proxy host. For Rovo: set OAuth vars, sign in with Atlassian from Chat, or configure an LLM fallback key. See [Chat, reports and AI providers](../setup/chat-and-ai.md).

**Metrics look stale**
Click **Refresh status** after changing presets, due-date options, or watched people. A banner appears when filters differ from the stored snapshot.

**I only see upcoming tasks, not past due**
Past due rows are in a separate **Past Due in lookback** card. Enable **Also include → Past Due Projects**, choose a lookback (1–3 years), refresh, and turn on **Past Due in lookback** under **Views**.

**Upcoming search works with Initial Done Date but not Most Recent Done Date**
The app prefers each task’s own Jira due date over automated done-date fields on subtasks, then falls back to the parent epic’s compare field. Refresh after changing **Compare against** so the snapshot matches.

**MRD field (in Dates) is empty on a child task**
If the task has no MRD, the app inherits from parents up to the epic — shown as a small "from parent: …" hint under the field, not filled into the input itself. **Run JQL** again (or refresh the page so saved results re-load parent dates) if you still see — after a code update or first visit.

**Test Jira Connection fails**
Check your network/VPN, then verify `.env` has correct `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`. See [JIRA_SETUP.md](../JIRA_SETUP.md).

**Create Issue says the parent must be an Epic or Story**
Match the parent to the issue type: Story/Bug → Epic; Task → Story. For saved JQL presets, pick an issue from the query (parent chain is filled in), choose a parent from the dropdown, or enter a valid issue key manually. Epic types such as **Epic (Feature)** are supported.

**Create Issue failed but I fixed the form — Create is still greyed out**
After a validation error, ensure **Title** is filled and a parent is selected. The Create button re-enables when those are set; you do not need to close the modal.

**Story sub-tasks created but not linked to epic/story**
Sub-tasks must be **Task** type with `parent` set to the story (not Jira’s separate Sub-task type). If older creates look orphaned, recreate them or set the story parent in Jira. New creates from this app link Task → Story → Epic automatically.

---

[← User Guide index](../END_USER_GUIDE.md)
