# Shared projects — notes and priority (PMs and managers)

[← User Guide index](../END_USER_GUIDE.md)

Some teams used a shared Excel tracker so everyone sees the same ranking. In The Docket:

| What | Shared across the team? |
|------|-------------------------|
| Status and assignee changes | Yes — in Jira |
| Notes you **push** as Jira comments | Yes — visible on the issue in Jira (text and inline attachments) |
| Local **Notes** box (before push) | No — your machine only |
| Note **attachments** (before push) | No — **Keep on this machine** retains a local copy |
| **Priority** on a personal Task Management slot | No — local SQLite on this machine |
| **Priority** on a slot linked to a **Shared program** | Yes — PostgreSQL team database (Team badge) |
| **Start date** on a personal Task Management slot | No — local SQLite on this machine |
| **Start date** on a slot linked to a **Shared program** | Yes — same PostgreSQL team database as Priority |
| **Due date** and **MRD** | Always — real Jira fields, editing them writes straight to Jira regardless of slot type |

## Shared-program slots (recommended for team ranking)

1. Ask your database owner to configure PostgreSQL, run the migrations, and restart the API. Local use requires no company database.
2. In **Settings → Team data**, enable **Use team DB** and check the connection. Use **Import metadata** to review a CSV and **Save to team**, or explicitly **Save local priorities to team**.
3. On Task Management, set the slot’s **Shared program**.
4. Change **Priority** as usual — it saves to the shared store immediately. Rows show a **Team** badge when priority comes from that store.
5. **Run JQL** on that slot loads priorities from the shared store (not from Jira comments).

Personal slots (Shared program = None) keep local ownership for priorities. In **Combined Open Work**, planning offers explicit **Local** and **Team** destinations; ordinary slots follow shared-program ownership. When Team is off, shared-program ownership is inactive; existing Team drafts are retained and explicit Team actions are blocked.

## Notes vs priority

Push notes as Jira comments when the team needs the text in Jira. Priority is **not** parsed from comment text anymore — use a shared-program slot (or local/CSV import) for ranking.

## Bootstrap from the priority tracker

PMs can keep rankings in the priority tracker spreadsheet and share a **CSV** export:

1. In Excel: **File → Save As → CSV UTF-8** (columns: `Priority`, `Issue Key`, `Developer`, `Jira Status`, `notes`).
2. In The Docket: **Settings → Import metadata → Preview CSV**. The comparison starts with local values for the displayed Jira site; nothing is saved.
3. Edit values, add supported columns or remove columns, and uncheck rows to exclude them. Existing notes remain protected unless **Replace saved note with this text** is checked on that row. Empty CSV cells leave saved values unchanged; clearing an edited value explicitly removes it.
4. **Now** and **Next** are checkboxes: select one, or uncheck both to leave the flag unset. This flag is shared when saved to team. Requestor, planned start/finish, actual start and decision note are also supported.
5. Select **Review changes**, fix or exclude invalid rows, then **Approve changes**. Approval writes nothing. Every edit or selection change requires another review and approval.
6. Choose **Save locally** or **Save to team**. Both are primary options for all supported fields. Team is disabled with a reason when unavailable. Choosing the other destination loads its own old/new comparison and requires approval again; team saving preserves your local metadata.
7. A concurrent change rejects the entire import; review a fresh comparison. Failed saves retain edits. If the network outcome is unknown, retry the same save to confirm completion before choosing another destination. Double submission uses the same reviewed save; recent completed saves report “Already saved.” Re-run JQL after saving.

Previews expire after 15 minutes. Restarting the API requires a new preview; browser edits are not a durable saved draft. Unknown columns are listed and ignored. The team database never becomes an automatic fallback for a local save, and team failure never silently saves locally.

**Developers:** Manual export/backup of SQLite is documented in [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) — that is for backup or handoff, not live multi-user editing.

---

[← User Guide index](../END_USER_GUIDE.md)
