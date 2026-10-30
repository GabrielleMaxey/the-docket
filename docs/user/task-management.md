# Task Management — daily driver

[← User Guide index](../END_USER_GUIDE.md)

This is the main screen for managing your open work.

```
┌──────────────────────────────────────┐
│  Header: jokes · date · to do       │
├──────────────────────────────────────┤
│  🗂️ The Docket  [collapsible]        │
│    [Create Issue]                    │
│    JQL inputs + Run JQL              │
├──────────────────────────────────────┤
│  📊 My Metrics  [collapsible]        │
│    Per-query summary + AI report     │
├──────────────────────────────────────┤
│  🗓️ Help me plan my week [collapsible]│
│    questions → plan for YOUR issues  │
├──────────────────────────────────────┤
│  Results table                       │
└──────────────────────────────────────┘
```


## Header

- **Header banners** (optional) — at the top of Task Management, toggle **Joke ticker** and/or **My upcoming due dates**. The due-date banner lists **only your** assigned issues (matched by your Jira display name) from the latest Metrics snapshot's upcoming due-date window. Refresh Metrics after changing due-date filters or if the banner is empty when you expect tasks. Same toggles in **Settings → Task Management header**.
- **Date & calendar** — shows today; useful when planning.
- **To Do** — supports up to 15 active to-dos. Each to-do has a text field, a priority (P1–P5), a due date, and a done checkbox. Active to-dos are sorted automatically by priority then due date — changing a priority immediately re-orders the list. A **Clear completed** button appears below the list whenever any to-dos are checked done; clicking it removes all completed items at once. To-dos are saved to your local database and are never sent to Jira.
- **Hide calendar & to do / Show calendar & to do** — click the link under the date to collapse or expand the calendar, to do, and week-plan panel together; that state is remembered too.


## The Docket card

1. **JQL count** — choose 1–5 query slots. Each has a label (your name for it) and a JQL box.
2. **Max results** — first page size per query. The app can load **all** matching issues (up to a safe cap) — see Results table below.
3. **Notes on run** — choose how row notes are filled when you **Run JQL** or refresh:
   - **Keep local notes** (default) — notes come from your local database for issues in the result set.
   - **Pull most recent Jira comment** — overwrites each row's **Notes** text with that issue's latest Jira comment. Attached files are not changed. Use **Clear** to reset to **Keep local notes**.
4. **Run JQL** — loads fresh results from Jira, merges local (or shared-program) priorities, and saves results locally. Shortcut: **Ctrl+Enter** (Windows/Linux) or **⌘+Enter** (Mac).
5. **Reset Saved Queries** — clears JQL text, labels, and the cached table. Does *not* delete your notes, priorities, or reminders in the local database.
6. **Create Issue** — opens a modal to create a new Jira issue in your Jira project. See [Create Issue](create-issue.md#create-issue) below for parent selection and issue rules. In short: pick a preset or parent, enter a title, then click **✦ AI Draft** (blue button next to the Description label) to generate a description and, for Stories, a suggested sub-task list:
   - **Story**: AI rewrites the title into Job Story format ("When… I want… so I can…") if it isn't already, and generates a description that expands on the situation, motivation, and desired outcome. 2–5 suggested sub-tasks appear as editable checkboxes; uncheck any you don't want before clicking Create.
   - **Bug**: AI generates a structured description covering what is broken, steps to reproduce, expected vs actual, environment, and any known workaround. A suggested priority (Low / Medium / High / Critical) appears based on project severity definitions.
   - **Task**: AI generates a plain description.
   - **Titles under a bracketed parent**: when the parent's title starts with a label such as `[Project Name - Area]`, new titles are formatted `[Project Name - Area] short ask`. The short ask is a few words (under 12), not the full job story — the job story stays in the description.
   - **Possible existing issues**: before **Create** or **✦ AI Draft** does anything, the app looks for open issues that may already cover the same work. See [Possible existing issues](create-issue.md#create-issue).
   - The **Create** button label updates to show "Create + N subtasks" when Story sub-tasks are selected. Sub-tasks are created as **Task** type with the new story as parent (linked in the Task → Story → Epic chain); the success message lists each with its issue key and a link to open the new issue in Jira.


## My Metrics

Appears after you Run JQL and get results. Shows:
- Issue count chips (total, open, overdue, in progress) per query
- A **📄 Project Report** section inside each query — click to expand, choose a **report scope**, a **report type**, then **Generate Report**:
  - **Report scope** — what data the report is built from: **Current query results** (this slot, as loaded), **All my assigned work** (past 3/6/12 months — includes an issue if it had a status change, a reassignment, a note added in this app, or a comment added directly in Jira within that window; not just any Jira field update, and not limited to activity made through this app), or any other configured query slot on this page. Choosing a scope other than "Current query results" runs its own fresh Jira search rather than reusing what's already loaded.
  - **Status Report** *(default)* — AI-written summary *from your perspective as the assignee*: how the project is tracking, what needs attention, next steps. Reads the scope's label and JQL to frame the report correctly — a closed-work scope gets a completed-work recap instead of being asked about "what needs attention"
  - **1:1 Prep** — talking points for discussing your work with management (direct, skip-level, or otherwise) in a weekly or biweekly 1:1: workload, consistency, completion rate, potential blockers, and items to discuss now vs. coming up. Upward-facing, not a personal daily-standup recap
  - **PWB Review** — first-person self-assessment prose for a quarterly, mid-year, or yearly PWB review (choose the period once selected)
  - For 1:1 Prep and PWB Review, you can optionally add **your goals** and/or your **company/team goals** — the report will note where your work supports them, and honestly flag anything that seems disconnected. All three report types can reference your organization's cultural behaviors where the work genuinely demonstrates one, never as a forced checklist. Goals you enter are saved automatically (on this machine) so you don't have to retype them next time — each field shows a **Clear** button once it has text, for removing a saved value.
  - **Status hygiene check:** all three report types check whether any of your top-priority Backlog items have a Jira comment within the last 14 days — a sign real work is happening even though the status was never updated. When that happens, the report names the item and suggests updating its status, so workload snapshots and self-assessments (this one and future ones) read accurately at a glance.
- **Writing style:** generated reports (Status Report, 1:1 Prep, PWB Review and the Metrics audience reports) follow fixed style rules: exact figures instead of "about 12", no vague verbs such as "worked on", every activity paired with its outcome or current status, no filler phrases, and no details that are not in the data. If a report reads vaguely, the data behind it is probably thin. The writing rules are adapted from the ATS jira-comment standards in the [ATS AI Toolkit](https://github.com/LumenTech-Prod/service-assurance-ip-ats-agents-specs-prompts).
- When a report is showing, use **Clear report** in the report header to remove it from this page only (does not delete copies in **Past Reports**)

> The badge in the **📊 My Metrics** header shows your total open issue count at a glance.


## Results table

Each row is one Jira issue. What you can do per row:

| Action | How |
|--------|-----|
| Change **status** in Jira | Dropdown → **Update Status** |
| Change **assignee** in Jira | Type a **display name, email, or username** in the Assignee box — suggestions appear as you type from Jira user search and assignees already in the table. Press **Enter** or click **Update Assignee** |
| Change **Due date** or **MRD** in Jira | Date picker in the **Dates** column → **Update**. Each field pushes to Jira independently — editing Due date doesn't touch MRD and vice versa. Clear a date and click Update to unset it in Jira |
| Set a **Start date** (local) | Date picker in the **Dates** column, third row — saves automatically, no Update button. Not a Jira field; used for Gantt-chart views. On shared projects linked to a shared program, this syncs the same way priority does — see [Shared projects](shared-projects.md#shared-projects--notes-and-priority-pms-and-managers) below |
| Set personal **priority** (P1–P20) | Priority dropdown — P1 = most urgent, P20 = least. A **Jira** badge means priority was set from the latest comment on **Run JQL** |
| Write a **note** (local) | Type in the Notes box — text saves automatically. Supports **markdown**: `**bold**`, `*italic*`, `` `code` ``, `[links](url)`, `-` bullet lists, `1.` numbered lists, `#` headings — all render properly once pushed to Jira, not as literal asterisks/hashes |
| **Pop out** the notes box | Click the **⤢** button in the corner of the Notes cell to open a larger editor (720×600, not squeezed into the table cell). Typing there is the same draft as the inline box — either one updates the other live. Close with **Done**, the backdrop, or **Esc** |
| Add **files** to a note | **Add file** button, paste while the notes area is focused (images only), or drag-and-drop onto the notes cell. Up to **5** files per note; **5 MB** each — images (PNG, JPEG, GIF, WebP) plus TXT, PDF, DOC/DOCX, XLSX, and CSV |
| **Keep on this machine** (attachments) | Optional checkbox below the notes box. Off by default — attachments stay until you **Push note** or close/refresh the tab. Turn on to keep draft files on this machine across reloads |
| Push note to Jira as a **comment** | Check the row checkbox → **Push note** (or **Push Selected** for multiple). Sends note text and attachments inline in the Jira comment (same as images for documents); local copies are cleared after a successful push |
| **Attach files** to the Jira issue | Click **Attach files** on an open issue's row (next to **Save to local DB**). Drop or pick screenshots, screen recordings (.mov, .mp4), or documents — up to 10 per upload, 250 MB each by default. The dialog lists what is already on the issue and shows upload progress. Unlike note attachments, these go straight onto the issue's **Attachments**, not into a comment. |
| Filter visible rows | **Filter by key**, **Status**, or **Assignee** above the table; **Clear filters** resets all three |
| Page through results | **First / Prev / Next / Last** below the table (30 rows per page) |
| Load more issues | When the status line shows **Loaded X of Y** and Y is larger than X, click **Load remaining** |

**Load status:** After **Run JQL**, the line above the table shows **Loaded X of Y matched** (how many rows are in the table vs how many Jira matched). If your query returns more than the first batch, click **Load remaining** to fetch the rest (up to a documented safe cap).

**Deep links from Metrics:** Opening Task Management from Metrics (`?key=PROJ-123` or `?assignee=Name`) applies table filters automatically.

- **Issue key** — the app fetches that issue from Jira and opens a green **Drill-down: PROJ-123** tab (first tab), even if the issue also appears in your saved JQL results.
- **Assignee name** — if that person is not already in your saved JQL results, the app runs `assignee = "Name"` in Jira and opens a **Drill-down: Name** tab with their tasks. If their issues are already loaded in a JQL tab, that tab is selected and filtered by assignee instead.

A green banner confirms the active drill-down. Use **Clear filter** to remove the Metrics filter from the URL while keeping any drill-down tabs you opened in this browser session. Use the small **x** on an individual green drill-down tab to remove only that tab.

**Dates column:** One column stacks three date fields per row — **Due** (Jira's standard due date), **MRD** (hover for "Most Recent Done Date," the same field mapping used by Metrics — `customfield_10009` by default), and **Start** (local-only, see the table above). When a row's own Due date is empty, a small hint shows the inherited value used for overdue calculations elsewhere in the app (**My Metrics**, Chat context): the task's own MRD if set, otherwise the first ancestor's MRD found by walking the **parent chain** (for example Story → Epic). Editing Due or MRD here writes directly to Jira; it doesn't change that inheritance behavior for other rows.

**Parent column:** Sits right after **Key** — links to the issue's parent (Story or Epic) when Jira reports one.

On **shared projects**, link a Task Management slot to a **Shared program** (when **Use team DB** is on and PostgreSQL is connected) so priorities sync across machines. Otherwise use local priority + the priority tracker CSV import — see [Shared projects — notes and priority](shared-projects.md#shared-projects--notes-and-priority-pms-and-managers) below.

**Closed/resolved issues are read-only** — you can read them but not edit them.

**Priority colors:** rows glow warmer colors for higher priorities (P1–P3) and cooler/neutral for lower ones. P0 = no color, just unranked.

---

[← User Guide index](../END_USER_GUIDE.md)
