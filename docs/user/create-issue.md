# Create Issue

[← User Guide index](../END_USER_GUIDE.md)

Use **Create Issue** on Task Management when you want a new Story, Task, or Bug in your Jira project without leaving the app.

**1. Choose a starting point (Epic preset dropdown)**

| Option | What it does |
|--------|----------------|
| **Epic preset** | Loads that epic and its stories as parent choices. Story/Bug parents default to the epic; Task parents pick a story under the epic. |
| **Saved query (JQL preset)** | Runs the preset's JQL (e.g. Dev Team, My Current Issues), lists matching issues, and derives parent chains (Task → Story → Epic). Pick an issue from the query, an epic/story parent, or enter a parent key manually. |
| **Enter issue key manually** | Type a Jira key: Epic for Story/Bug, Story for Task. The app validates the key before unlocking the form. |

The modal pre-selects a preset when you open it from an active Task Management JQL tab that matches a saved preset.

**2. Parent rules**

| Issue type | Required parent |
|------------|-----------------|
| Story | Epic (including types like **Epic (Feature)**) |
| Bug | Epic only |
| Task | Story |

**3. Fill in details**

- **Use AI helper** — optional checkbox above the Title. Ticking it opens a guided form so you can answer the standard prompts in your own words instead of writing a title from scratch:
  - **Story** — *As a*, *I want*, *So that* are required; goal/why now, success criteria, in/out of scope, constraints, systems affected, and open questions are optional.
  - **Bug** — what is broken, expected, and actual behavior are required; steps, environment, impact, and workaround are optional.
  - **Task** — what needs doing and why it matters are required; definition of done, constraints, and components touched are optional.

  Only the basic ask is required — leave any optional prompt blank and the AI omits that section rather than guessing. Blank prompts are listed back to you as a reminder to finish them on the Jira issue after it is created. With the helper on, **Title** becomes optional: click **✦ AI Draft** and the AI writes the title (Job Story format for Stories) and description from your answers. Everything it produces stays editable before you create.
- **ODI standards** — the required fields and rules for Stories, Tasks and Bugs come from the **Jira Standards** page (ODI Project Space Standards) in the ODI Confluence space.
- **Title** — required unless the AI helper is on. Stories should use Job Story format; AI Draft can rewrite and ask 2–3 clarification questions if the ask/goal is unclear.
- **Components**, **Vertical Components** — choose from the dropdown. **Components** must already exist on your Jira project (free-text names are rejected).
- **BUG Tracking** (Bug only) — optional. Options load from your project's `BUG Tracking-…` components and are added to the issue alongside any regular Component. Click **×** on any Components, Vertical Components, or BUG Tracking dropdown to clear it.
- **AI Draft errors** — if AI Draft reports it ran out of room, shorten the guided answers and try again. If it times out (about 2 minutes), the spinner clears and **Create** becomes available again so you can write the description yourself.
- **Attachments** — optional. Click **Add files** or drop screenshots, screen recordings (.mov, .mp4), or documents onto the box. They upload to the new issue right after it is created; if one fails, the issue is still created and you can retry from **Attach files** on its row.
- **Description** — use **✦ AI Draft** or write your own. Description and goal validation errors (including “story not fully defined”) appear **below the Description field**, not at the top of the modal.
- **Priority** (Bug only) — required on create.
- **Assignee** — optional for Task/Bug. Stories stay unassigned; when AI Draft suggests sub-tasks, a **Subtask assignee** field appears and applies to all checked sub-tasks.

**Possible existing issues (duplicate check)**

When you click **Create** or **✦ AI Draft**, the app first searches the Jira site you are working in (the active site only) for open issues in the same project that look like what you are about to create:

- It compares your title and, with the AI helper on, your **I want** answer. A leading `[label]` is ignored, and word endings are normalised (so "reporting" matches "reports").
- It looks at each issue's **summary** and the **first 500 characters of its description**, and ignores Done issues.
- If it finds likely matches, a **Possible existing issues** panel appears **above the Close and Create buttons**, so you never have to scroll up for it. It lists up to 5 issues, each with its key (a link to open it in Jira), summary and status, and a note when the match was in the description rather than the summary.
- To carry on anyway, click **Create anyway** (or **Draft anyway** for AI Draft). The app will not ask again for the same text. **Dismiss** only hides the panel; clicking **Create** again runs the check again.
- If the search fails, the app lets you continue without the check. It never blocks creation.

The duplicate-check approach comes from the [ATS AI Toolkit](https://github.com/LumenTech-Prod/service-assurance-ip-ats-agents-specs-prompts). The check is a prompt to look, not a verdict. Matches are ranked by shared words, so a hit can be unrelated and a real duplicate worded very differently can be missed.

**4. After create**

On success, use **Add more detail in Jira** to open the new issue in your browser. Story sub-tasks you left checked are created under the new story (parent-linked as Task → Story → Epic) and listed in the success message.

**If create fails:** fix errors shown in the modal — parent/title issues at the top; description/goal issues under Description — then click **Create** again. The button stays available after validation errors once a valid parent and title are set.

> **Background work:** Metrics refresh, report generation, week plan, project report, and **Run JQL** keep running if you switch pages. A yellow status pill in the top nav shows what's in progress. Return to the page when it finishes — results are saved automatically.

> **Tip:** Click the **🗂️ The Docket** header to collapse/expand the whole section once your queries are saved.

---

[← User Guide index](../END_USER_GUIDE.md)
