# ODI mixed-team roadmap

Short product roadmap for teams with **individual contributors (ICs)**, **PMs**, and **managers** working shared **ODI** epics in Task Manager.

**Audience:** PMs, managers, and developers planning the next releases.

**Related docs:** [END_USER_GUIDE.md](./END_USER_GUIDE.md) (daily use), [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) (implementation), [pilot-presets.md](./pilot-presets.md) (preset seeding).

---

## Operating model (target)

| Role | Primary pages | Job to be done |
|------|----------------|----------------|
| **IC** | Work Week | Run JQL, update status/assignee, read PM priority, execute |
| **PM** | Dashboard + Work Week | Refresh epic health, set team priority on shared-program slots, watch contributors |
| **Manager** | Dashboard + Chat + reports | Executive/PO summaries, overdue/upcoming risk, briefings without deep Jira digging |

**Shared priority today:**

1. **Local SQLite** — each laptop stores P1–P20 in `issue_metadata` (personal slots).
2. **Atlas demo** — slots linked to a shared program read/write MongoDB Atlas (`TEAM_PRIORITY_MONGODB_URI`).
3. **NORA CSV import** — Settings → Import team priorities (local and/or Atlas seed).

Jira `PRIORITY P#` comment parsing was removed. **Target:** Shared MySQL for designated programs. Spec → [specs/team-priority-sync.md](./specs/team-priority-sync.md).

---

## Top build priorities

### Step 1 — Auto-apply `PRIORITY P#` from Jira comments

| | |
|--|--|
| **Effort** | Large |
| **Status** | **Retired** — comment parsing removed; use shared-program slots + CSV/Atlas instead |
| **Who benefits** | — |
| **Problem** | Was interim until shared DB. |
| **Build** | Removed `shared/priorityFromComment.mjs` and Jira badge flow. |
| **Next** | Step 6 (MySQL) replaces Atlas demo for production. |

---

### Step 6 — Shared DB for group / program priorities

| | |
|--|--|
| **Effort** | Large |
| **Who benefits** | PM, Manager, IC on NORA / Ask Greg / other designated programs |
| **Problem** | Priorities stay per-laptop (SQLite + comments + CSV). No live team ranking across machines. |
| **Build** | Use team **MySQL** (preferred: `jiraProxy` connects directly). Tables for programs, epic roots, and `team_issue_priority` (P1–P20). Work Week slots opt into a **shared program**; other slots stay personal. Local SQLite cache + banner when DB is down. CSV import optional bootstrap. Full plan: [specs/team-priority-sync.md](./specs/team-priority-sync.md). |
| **Success** | PM sets P3 on NORA in team slot; IC on another machine sees P3 after Run JQL — without comments or re-importing CSV. |

---

### Step 2 — Full JQL result loading

| | |
|--|--|
| **Effort** | Medium |
| **Status** | Complete |
| **Who benefits** | Everyone on large ODI queries |
| **Problem** | **Max results** caps one Jira page; with sort order, issues visible in Jira may be missing from the table. |
| **Build** | Proxy paginates Jira search until all matches are loaded (or a documented safe cap). UI: “Loaded 847 of 847” or “Loaded 200 of 847 — Load rest” with progress. |
| **Success** | Work Week table matches Jira for the same JQL; PMs trust audits and ICs trust their queue. |

---

### Step 3 — Dashboard → Work Week drill-down

| | |
|--|--|
| **Effort** | Medium |
| **Status** | Complete |
| **Who benefits** | PM, Manager |
| **Problem** | Dashboard shows risk and counts; leaders still hunt issue keys in Jira or ask ICs. |
| **Build** | Click epic card, due-date row, or contributor metric → open **Work Week** with that issue key or assignee filter. Drill-down tabs persist for the browser session and can be cleared one at a time. Keep **Open in Jira** on rows where applicable. |
| **Success** | One click from “what’s red on Dashboard” to “act on it in Work Week”. |

---

### Step 4 — Team preset & config pack

| | |
|--|--|
| **Effort** | Small–medium |
| **Who benefits** | PM (owner), IC/Manager (consumers) |
| **Problem** | Epic/JQL presets live in local SQLite; each person repeats ODI setup in Settings. |
| **Build** | Export/import presets (JSON) in Settings — “ODI team pack”. Document one canonical preset set; align with `npm run seed:presets` for admins. |
| **Success** | New team members import one pack; Dashboard and Work Week use the same epic/JQL definitions. |

---

### Step 5 — Leader digest (on-demand weekly summary)

| | |
|--|--|
| **Effort** | Medium |
| **Who benefits** | Manager, PM |
| **Problem** | Executive/PO reports are strong but manual — generate, copy, share each time. |
| **Build** | **Weekly digest** action: last Dashboard snapshot + top overdue/upcoming + contributor overload → one markdown block (copy / download). Reuse existing metrics and report prompts where possible. |
| **Success** | Manager-ready stand-up or staff-meeting brief in one click after **Refresh status**. |

---

## Adopt now (no code)

1. **PM-owned preset list** — one set of ODI epic keys and JQL slots in Settings (program, my work, blocked, etc.).
2. **Shared-program slots** — link NORA / Ask Greg Work Week slots to a shared program; change priority in-app (Atlas demo).
3. **Weekly rhythm** — PM **Refresh status** Monday; ICs **Run JQL** on shared-program slots; Manager runs **Executive Summary** from the same snapshot before staff meeting.
4. **Chat** — refresh Dashboard, then ask scoped questions (“what’s overdue across selected epics?”).
5. **Stakeholders** — copy report markdown to Confluence/email for people who do not run the app.

---

## Suggested sequence

| Phase | Focus | Outcome |
|-------|--------|---------|
| **Retired** | Step 1 — parse priority from comments | Replaced by shared-program slots |
| **Complete** | Step 2 — full JQL pagination | Table matches Jira at scale |
| **Complete** | Step 3 — Dashboard drill-down | Leaders drive ICs from metrics |
| **Shipped (bridge)** | NORA CSV priority import | Seed local / Atlas priorities from Excel |
| **Demo** | Atlas team priority | Multi-machine ranking for linked slots |
| **Next** | **Step 6 — shared DB (MySQL)** | Production multi-user ranking for designated programs |
| **Also next** | Steps 4–5 — team pack + digest | Faster onboarding and manager briefings |

---

## Second wave (after shared DB + steps 4–5)

| Item | Effort | Note |
|------|--------|------|
| Bulk status/assignee on selected rows | Medium | PM backlog cleanup |
| Map priority to Jira custom field (if ODI has one) | Medium | Optional alternative once shared DB is stable |
| Scheduled Dashboard refresh | Small | Reduces stale snapshots |
| Outlook read-only in week planner | Large | IC planning; lower priority for ODI prioritization |

---

## Out of scope (for this team)

- Replacing Jira as system of record for status, boards, or sprints  
- Full calendar/Outlook integration before shared priority and complete JQL results  
- Rovo until the Jira instance supports OAuth/MCP (LLM + snapshot context is sufficient meanwhile)
