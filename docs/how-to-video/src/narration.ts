// Voiceover script, one entry per scene. Keys match SCENES in timing.ts.
// "E N V" is written with spaces so the voice reads the letters one by one.
// Audio lives at public/voiceover/<key>.mp3 (see README for regeneration).
export const NARRATION = {
  intro:
    "Welcome to The Docket — your Jira work, organized, measured, and reported, across every Jira space you use, in one local workspace.",
  contents:
    "Here's what we'll cover. Use the chapter list on screen, or the time stamps in the video description, to jump straight to the part you need.",
  overview:
    "The Docket is for engineers and project managers who live in Jira. It runs on your own computer, and connects to Jira through a small local server. Run a saved search, and your issues appear in one editable table. Change a status, an assignee, or a due date, and it saves straight to Jira. Add your own priorities and notes. Then let the app write the reports for you: status updates, one-on-one prep, and weekly plans.",
  multiSpace:
    "Here's the big idea. The Docket manages your tasks and projects across multiple Jira spaces. Register up to five Jira sites. Each one keeps its own saved searches, notes, and reports, and you switch between them from the top bar. Or open Combined Open Work, to see everything assigned to you, from every site, in one table. One person, one token, every Jira space.",
  install:
    "Setup takes about five minutes, one time. You'll need Node twenty-two and a copy of the project. Open a terminal in that folder and run four commands: n-v-m use, npm install, copy the example settings file to dot E N V, and npm run dev all. Not technical? Ask a developer to sit with you for this step.",
  credentials:
    "Next, connect to Jira. Create an API token from your Atlassian account's security page. Then open the dot E N V file in the project folder, right next to package dot json. Keep the leading dot, and make sure it isn't saved as a text file. Fill in three values: your Jira site address, with no slash at the end; your work email; and that token. Keep this file private. Never commit it, and never share your token. Any time you change the E N V file, stop and restart the app.",
  envOptions:
    "Everything else in the E N V file is optional. To work across more than one Jira site, add up to five numbered sites, each with a name, an address, and an email. They all share your one API token. For Chat and AI reports, fill in the three Managed AI values for your company's approved AI gateway. Leave AI unset, and the rest of the app still works. You can also change the API port and log level, or connect a shared team database.",
  openApp:
    "Now open localhost, five-one-seven-three, in Chrome or Edge. For a cleaner experience, use the browser menu to install it as an app, so it gets its own icon in your Dock or taskbar. Just keep that terminal running while you work.",
  settings:
    "Start in Settings. Click the gear, then Test Jira Connection, and look for the green Connected badge. Under Jira sites, add each additional Jira space with a name, an address, and an email, and test it. Then add your Epic and J Q L presets: named, saved searches that power every page in the app. Use Export team pack to share your presets with the whole team.",
  navigate:
    "Everything lives in one top bar. Task Management is your daily driver. Metrics shows project health. Project Managers handles capacity and timelines. Past Reports keeps everything you've generated. Chat answers questions in plain English. And Settings holds your setup.",
  taskManagement:
    "Task Management is where you'll spend most of your day. Pick a saved preset and click Run J Q L — or press Command or Control plus Enter. Change a status, assignee, or date right in the table, and it saves straight to Jira. Rank work with your own priority, from P1 to P20, and jot notes as you go. When you're ready, tick the row and push the note. It's posted to Jira as a comment. Up to five queries each get their own tab.",
  combinedWork:
    "Work across several Jira sites? In Task Management, open the Combined Open Work tab. Pick the saved sites you want, and click Load open work. You'll get every open issue assigned to you in one editable table, with a site column, so similar issue keys never get mixed up. Switch to List for a compact view. Check each site's load status: a partial or failed site means the list isn't complete. Then rank your work with Docket priority, and flag items Now or Next. Those are planning signals for you, and they don't change Jira.",
  createIssue:
    "Need a new ticket? Click Create Issue and pick the parent epic. Type a rough idea, then click AI Draft. Before it drafts, The Docket checks for possible existing issues, so you don't create a duplicate. You get a short title that starts with the parent's label in brackets, a structured description, and suggested sub-tasks, all editable. Click Create, and the story and its sub-tasks land in Jira together.",
  weekPlan:
    "Help me plan my week asks a few quick questions, then builds a plan from your open issues, and only the ones assigned to you. Tasks are ordered by a suggested-order score, built from priority, status, staleness, due date, and blockers, plus your own P1 to P20 priorities. A collapsible section at the end, called How the score works, explains every point.",
  reports:
    "Reports are where The Docket saves you the most time. In My Metrics, generate a Status Report, one-on-one prep, or a P W B review, written from your real issues. On Metrics, create Executive, Project Manager, and Developer summaries in one click. Combined Open Work has its own report across every Jira site. Everything you generate is saved to Past Reports, where you can read, copy, or download it. You can also download a task workbook, with one sheet per Jira site.",
  pmAsks:
    "Project managers get two more tools. The Project Managers tab compares each person's open work to a capacity target, flags overdue, blocked, and stale tickets, and lays out a Gantt timeline. The Asks tab keeps requests from executives in one place, and turns an ask into a Jira issue when it's ready.",
  chat:
    "Chat lets anyone ask questions in plain English — like, what's at risk for the November launch? Answers draw on the data you've already loaded, and it tells you when it doesn't know. Save a useful answer to Past Reports with one click.",
  dataSecurity:
    "A word on data security. When you use Chat, reports, or AI Draft, your Jira data is sent to the AI model you've configured — so use only your company's approved, governed models. With the Managed AI values set, The Docket uses Company AI by default, and Settings shows which model is active. Never paste passwords, tokens, or customer personal data into chat or notes. Your credentials, notes, priorities, and reports stay on your machine. Status changes and pushed notes go to Jira. Always review AI answers before you act on them or share them. And for policy questions, check your AI Governance page, or contact the governance team.",
  recap:
    "Here's where to start. Developers: run your My Work query each morning, and push notes instead of writing status emails. Project managers: save a preset per project, and refresh Metrics weekly. Executives: ask your PM for the Executive Summary — or ask Chat what's at risk this month.",
  outro:
    "That's it — you're ready. Connect your Jira sites, save your presets, and run your first query. The full user guide is in the docs folder.",
} as const;

export type SceneKey = keyof typeof NARRATION;
