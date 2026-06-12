# Task Manager — user guide

This guide is for **people who use the app**, not for programmers. You do not need to understand how the software is built.   

---

## Words you might see

| Term | In plain English |
|------|------------------|
| **Jira** | Your team’s work-tracking website (issues, statuses, assignees, comments). |
| **JQL** | A saved filter or search language Jira understands. It decides *which* issues show up in your list. Jira can give you JQL text to paste in. |
| **Issue / ticket / task** | The same thing in most teams: one row in Jira (for example `PROJ-123`). |
| **Status** | Where the work sits in your workflow (for example “In Progress,” “Done”). |
| **Assignee** | The person Jira thinks owns the issue. |
| **Comment** | Text stored **in Jira** so everyone on the issue can see it. “Push note” sends your typed text there. |
| **Browser** | Chrome, Edge, Firefox, Safari — the app may run inside a window like a normal website. |
| **Desktop app** | A separate window (Electron) that feels more like a normal program; it still talks to Jira the same way once it is set up. |
| **This computer only** | Some things are saved only on the machine you are using, not inside Jira. If you switch computers, those bits do not follow you unless you export or your team has another process. |

---

## What this app is for

You get **one screen** where you can:

- Pull in lists of Jira work using up to **four** saved searches (**JQL**).
- See those issues in a **table**: status, assignee, title, and more.
- For **open** issues: change **status** and **assignee** in Jira (using the buttons on each row).
- Set a **private priority** (P0–P10) that helps **you** sort and color rows — it is **not** the same as Jira’s built-in “Priority” field unless your team wired them together (by default it is local to this app).
- Write **notes** in the app. They can stay **only on your machine**, or you can **push** selected notes to Jira as **comments** so the team sees them.
- Use **reminders** and a **calendar** at the top for your own planning — they are not sent to Jira.

**Closed or resolved** issues still appear if your search returns them, but the app **locks** editing on those rows so you do not accidentally change finished work.

---

## Why there is a “database” on your computer

The app keeps a small **local file** (`data/workweek.sqlite`) so **your notes** and **your P0–P10 row priorities** are less likely to vanish when you close the window or restart. That file lives **on your machine** (or wherever the person who runs the app started it from). It is **not** a company-wide cloud database you log into separately.

**Jira** remains the official place for real issue data. Think of the local file as a **personal workbook** layered on top of Jira for notes and your own sorting colors.

---

## How to open the app (pick one)

You will either use it **in the browser** or as a **desktop program**.   

### Option A — In the browser (typical for development)

Someone with technical access prepares the machine once:

1. Installs **Node.js** (version 18 or newer is fine).
2. Opens a **terminal** (command window), goes to the app’s folder, and runs `npm install` once.
3. Puts Jira connection details in a file named **`.env`** in that folder (you usually do **not** edit this yourself — ask the person who set up Jira).

**Each time you want to use the app:**

1. They (or you, if you were shown how) start the app with **`npm run dev:all`** from that folder.
2. You open your browser to **`http://localhost:5173`** (like opening any website address).
3. Leave the black terminal window **running** while you work; closing it stops the app.

If the page will not load, the helper service may not be running, start **`npm run dev:all`** again or see **If something goes wrong** below.

### Option B — Desktop window (Electron)

Your team may give you a **built installer** instead. If you are starting from source:

1. Same one-time setup as above (Node, `npm install`, `.env`).
2. They run **`npm run desktop:rebuild-native`** once if needed (technical step for SQLite).
3. Then **`npm run desktop:dev`** opens a dedicated window.

The desktop build also starts the small **helper service** in the background so Jira and the database work.

**To stop the app:** close the window, and if a terminal was used to start it, press **Ctrl+C** in that terminal (Mac included).

---

## Quick confidence check

Inside the app, click **Test Jira Connection**. If it succeeds, your Jira login settings on this machine are working.

One screen to run **Jira JQL** (saved filters), then update **status**, **assignee**, local **priority** (P0–P10), and **notes** (save locally and optionally **push** to Jira as a comment). Closed/resolved issues are 
read-only in the table.
If someone asks you to “check the API,” they may mean opening **`http://localhost:8787/api/health`** in the browser — that is a simple “is the helper service alive?” page. You do not need to understand what “API” means day to day.

---

## Top of the screen (header)

- **Joke ticker** — light rotating text; sometimes it calls the internet for a new joke, sometimes it uses built-in ones. It refreshes on a slow timer (about every ten minutes). If jokes stop updating, the rest of the app still works.
- **Today** and the **small calendar** — shows the current date and highlights **today**. Useful when planning your week.
- **Reminders** — up to **four** short lines under **Today** (on a wide screen the **calendar** sits to the right). These are **only for you** on this browser or this computer:
  - Type a reminder, then you can tick the **checkbox** to mark it **done** (grey text with a line through it).
  - Done stays until you **uncheck**, **clear the line**, or **edit the text** (editing clears “done” so you can reuse the line for something new).
  - Reminders are **not** stored in Jira and **not** in the SQLite file — they live in **browser storage** (like sticky notes for this app only).

---

## Middle section — your Jira searches (“Task Manager” card)

1. **Test Jira Connection** — use this first if lists are empty or errors mention connection.
2. **JQL count** — choose **1 to 4** lists side by side. Each list has its own **label** (a name you recognize) and **JQL** box (the filter text from Jira).
3. **Max results** — caps how many issues load per list so the table stays fast. If you expect more work than the cap, raise it or narrow your JQL.
4. **Run JQL** — loads or refreshes the table. Keyboard shortcut: hold **Ctrl** (Windows/Linux) or **⌘** (Mac) and press **Enter** — same as clicking **Run JQL**.
5. **Showing saved results** — if you closed the app earlier, you might see a banner saying the table was **restored from last time**. That is normal. Run **Run JQL** again when you want **fresh** data from Jira.
6. **Reset Saved Queries** — clears your saved JQL text, labels, the **cached table**, and “I already pushed this note” memory for the session. It does **not** delete your **notes and priorities** inside the SQLite file on disk.

If need help creating a JQL query, please see <a href="https://support.atlassian.com/jira-service-management-cloud/docs/use-advanced-search-with-jira-query-language-jql/">.  You can also copy a filter from Jira’s **Advanced issue search** in your instance of JIRA. Provided is a basic query task that you own: assignee = currentUser() ORDER BY updated DESC

---

## The results table (what each part does)

Work **one row at a time** unless you use batch actions at the bottom.

| What you want | What to do |
|----------------|------------|
| Change **status** in Jira | Choose from the dropdown, then click **Update Status** on that row. |
| Change **assignee** in Jira | Pick or type the person, then **Update Assignee**. |
| Set **your own** urgency for sorting / colors | Use **P0–P10**. **P1** means “most urgent for me” in this app; **P10** is least. **P0** is neutral (no strong color). |
| Keep a **private note** | Type in the **Notes** area. The app saves it on your machine as you type (and you can click **Save to DB** if you want a clear “saved” confirmation on that row). |
| Put the same text into **Jira as a comment** | Tick the row’s checkbox (or use batch select), then **Push note** (or **Push Selected**). After a successful push, the note box may look **greyed out** until you **change the text** — that prevents sending the exact same comment twice by mistake. |
| Save without posting to Jira | Notes and priority already save in the background; **Save to DB** is an extra explicit save with a visible “saved” style message on the row. |

**Colors:** rows and the priority dropdown use a heat style (warmer for more urgent **P** values, cooler for lower). The project’s stylesheet (`workWeekTimerElements.css`); see the short technical list in the older internal docs if needed.

---

## Where your information is stored (simple view)

| Kind of information | Where it lives | Travels with you? |
|----------------------|----------------|-------------------|
| JQL text, labels, how many lists, last table snapshot, reminders | In the **browser’s storage** on this device | **No** — other browsers or PCs start clean unless you set things up again. |
| Your **notes** and **P0–P10** values per issue key | File **`data/workweek.sqlite`** next to the app when the helper service runs | **Only this machine** (or copy of that file). |
| Status, assignee, real Jira fields, **comments you pushed** | **Inside Jira** | **Yes** — anyone with permission sees them in Jira. |

---

## Sharing your notes and priorities with someone else

| Data | Where |
|------|--------|
| JQL text, labels, count, last table snapshot, reminders | Browser **localStorage** on this device |
| Per-issue note + priority (autosave on change; **Save to DB** for explicit confirmation) | Local file **`data/workweek.sqlite`** (created when the API runs) |

- A **backup file** of the database (`workweek-share.sqlite`), and/or  
- A **spreadsheet** export (`issue_metadata_export.csv`)

They create these from the app folder using tools they already use; exact steps are in **`DEVELOPER_GUIDE.md`** for them.

---

## If something goes wrong

| Symptom | What it usually means | What to try |
|---------|------------------------|--------------|
| “Cannot connect” / Test fails | Jira settings wrong, network, or helper not running | Click **Test Jira Connection** again; confirm Wi‑Fi or VPN; check your **`.env`** and **`JIRA_SETUP.md`**. |
| Blank page in browser | UI server not started | Run **`npm run dev:all`** (or start the desktop app properly). |
| Table empty after Run JQL | JQL returned no issues, or max results too low | Widen **Max results**; check JQL in Jira’s own search. |
| Notes or priorities disappeared on **another** computer | Expected — they were never in Jira | Use one machine, or export/import files. |
| Notes vanish on **same** computer | Helper or database problem | Restart the app and confirm **`data/workweek.sqlite`** exists and the API logs show no errors. |
| “Port already in use” | Another program grabbed the same network slot free port **5173** or update the port.  |

- **Jira / connection** — `.env`, **Test Jira Connection**, and `JIRA_SETUP.md`.
- **Notes or priority don’t stick** — API must be running; check `data/workweek.sqlite` and API logs.
- **Ports in use** — e.g. `lsof -nP -iTCP:5173 -sTCP:LISTEN`.

For **installing Jira credentials** and technical setup, your team should use **`JIRA_SETUP.md`**. For architecture and code locations, contributors use **`DEVELOPER_GUIDE.md`**.
