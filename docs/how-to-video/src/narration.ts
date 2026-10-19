// Voiceover script, one entry per scene. Keys match SCENES in HowToVideo.tsx.
// Audio lives at public/voiceover/<key>.mp3 (see README for regeneration).
export const NARRATION = {
  intro:
    "Welcome to The Docket — your Jira work, organized, measured, and reported, all in one local workspace.",
  why: "If your day means juggling a dozen Jira tabs, hand-built spreadsheets, and weekly status emails, The Docket pulls it together: daily task management, live project health, and AI-written reports — running right on your own machine.",
  personas:
    "It's built for every seat at the table. Developers get one focused view of their work, and update Jira without leaving it. Project managers see the health of every epic, plus capacity and risk flags. And executives get the answer, not the ticket list — clear summaries, and questions in plain English.",
  install:
    "Setup takes about five minutes, one time. You'll need Node twenty-two and a copy of the project. Open a terminal in that folder and run four commands: n-v-m use, npm install, copy the example settings file to dot E-N-V, and npm run dev all. Not technical? Ask a developer to sit with you for this step.",
  credentials:
    "Next, connect to Jira. Create an API token from your Atlassian account's security page. Then open the dot E-N-V file in the project folder, right next to package.json. Keep the leading dot, and make sure it isn't saved as a text file. Fill in three values: your Jira site address, with no slash at the end; your work email; and that token. Keep this file private. Never commit it, and don't share your token, even with support. Any time you change it, stop and restart the app.",
  envOptions:
    "Everything else in dot E-N-V is optional. Work across more than one Jira site? Add up to five, each with a name, address, and email. They all share your one API token. For Chat and AI reports, use your company's approved model: fill in the three Managed AI values for your company's AI gateway. A personal provider, through the chat provider setting, is only for setups your policy allows. Leave AI unset, and the rest of the app still works. You can also change the API port and log level, or connect a shared team database for priorities.",
  openApp:
    "Now open localhost, five-one-seven-three, in Chrome or Edge. For a cleaner experience, use the browser menu to install it as an app, so it gets its own icon in your Dock or taskbar. Just keep that terminal running while you work.",
  settings:
    "Start in Settings. Click the gear, then Test Jira Connection, and look for the green Connected badge. Next, add your Epic and JQL presets. These are named, saved searches — like My Work — and they power every page in the app. Add teammates under Contributor Metrics to track workload, and use Export team pack to share your presets with everyone.",
  finishSetup:
    "Two last setup steps. Back in Settings, open Jira field mapping, click Refresh from Jira, and save. That's how deadlines and overdue work get tracked. To confirm the server is healthy, visit localhost eight-seven-eight-seven, slash api, slash health. You should see ok: true. If something's off: when the connection test fails, confirm the file is named dot E-N-V and sits in the folder you launched from, check your VPN and the three Jira values, then restart. Missing package errors mean it's time to run npm install. If a port is busy, change the API port setting. A native module error? Run npm rebuild better-sqlite3. And if Chat says it's not ready, check your Company AI settings.",
  dataSecurity:
    "A word on data security. When you use Chat, reports, or AI Draft, your Jira data is sent to the AI model you've configured — so use only your company's approved, governed models. With the Managed AI values set, The Docket uses Company AI by default, and Settings shows which model is active. Never paste passwords, tokens, or customer personal data into chat or notes. Your credentials, notes, priorities, and reports stay on your machine. Status changes and pushed notes go to Jira. Always review AI answers before you act on them or share them. And for policy questions, check your AI Governance page, or contact the governance team.",
  navigate:
    "Everything lives in one top bar. Task Management is your daily driver. Metrics shows project health. Project Managers handles capacity and timelines. Past Reports keeps everything you've generated. Chat answers questions in plain English. And Settings holds your setup.",
  taskManagement:
    "Task Management is where you'll spend most of your day. Pick a saved preset and click Run JQL — or press Command or Control plus Enter. Change a status, assignee, or date right in the table, and it saves straight to Jira. Rank work with your own priority, from P1 to P20, and jot notes as you go. When you're ready, tick the row and push the note. It's posted to Jira as a comment. Up to five queries each get their own tab.",
  combinedWork:
    "Work across several Jira sites? In Task Management, open the Combined Open Work tab. Pick the saved sites you want, and click Load open work. You'll get every open issue assigned to you in one editable table, with a site column, so similar issue keys never get mixed up. Switch to List for a compact view. Check each site's load status: a partial or failed site means the list isn't complete. Then rank your work with Docket priority, and flag items Now or Next. Those are planning signals for you, and they don't change Jira.",
  createIssue:
    "Need a new ticket? Click Create Issue and choose the parent epic or story. Type a rough idea, then click AI Draft. You'll get a clear title, a structured description, and suggested sub-tasks — all editable. Click Create, and the story and its sub-tasks land in Jira together.",
  planAndReport:
    "Help me plan my week asks four quick questions, then builds a Monday-to-Friday plan from your real issues. Project Report writes a status update, talking points for your one-on-one, or a self-review draft. Every report is saved automatically to Past Reports.",
  workbook:
    "Need a spreadsheet for a meeting? Below the results, click Download tasks. Choose your saved Jira sites, the projects or presets for each, and optional filters like completed work, priority, or Now and Next. Click Review snapshot to preview it, then Download workbook. Each site gets its own sheet, with your local notes kept separate from the latest Jira comment. The file is a snapshot, not a live sync, so share it through your company's approved process, like SharePoint.",
  metrics:
    "For the big picture, open Metrics. Choose your projects and click Refresh status. You'll see what's resolved, in progress, in backlog, and overdue — for each project. Click any name or issue key to jump straight to that work. And on the Reports tab, generate an Executive, Project Manager, or Developer summary in one click.",
  projectManagers:
    "The Project Managers tab compares each person's open work to a capacity target, and flags overdue, blocked, and stale tickets before they slip. The Gantt tab lays out timelines by status or story. Export to Markdown or CSV, or save the view to Past Reports.",
  asks:
    "Project managers juggle requests from executives and product owners. The Asks tab keeps them in one place. Add a title, who asked, and a note. When an ask is ready to become real work, click Create a task. Create Issue opens with the details filled in, and once the issue is created, the ask is marked done and linked to the new Jira key. You can also mark an ask done, or cancel it if plans change, and reopen it any time. Asks stay on your machine, and you can download them as a CSV to share.",
  chat: "Chat lets anyone ask questions in plain English — like, what's at risk for the November launch? Answers draw on the data you've already loaded, and it tells you when it doesn't know. Save a useful answer to Past Reports with one click.",
  pastReports:
    "Past Reports keeps every report, week plan, and saved answer on your machine. Open one to read, copy, or download it to share.",
  recap:
    "Here's where to start. Developers: run your My Work query each morning, and push notes instead of writing status emails. Project managers: save a preset per project, and refresh Metrics weekly. Executives: ask your PM for the Executive Summary — or ask Chat what's at risk this month.",
  outro:
    "That's it — you're ready. Connect, save your presets, and run your first query. The full user guide is in the docs folder.",
} as const;

export type SceneKey = keyof typeof NARRATION;
