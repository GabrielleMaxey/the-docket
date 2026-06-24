# Weekly Work Plan — Gabrielle Maxey
**Week Capacity: 25 hours | Focus: Balanced Distribution Across Active Projects**

---

## 📅 Monday — *Kickoff & In-Progress Momentum* (~5 hrs)

| # | Issue Key | Task | Est. |
|---|-----------|------|------|
| 1 | **ODI-25136** | [Maint-72 Hr OLT] Advance Itential workflow development — pull required data; document current state & next steps | 2.0 hrs |
| 2 | **ODI-24756** | [Maint-PSX Coredump] Review and add additional commands for SIPE ONLY cores; test in dev environment | 2.0 hrs |
| 3 | **ODI-25789** | [NORA] Scope the ticket notes logging requirement; define where in the workflow the customer close request should be captured | 1.0 hr |

---

## 📅 Tuesday — *Verification Items & Backlog Triage* (~5 hrs)

| # | Issue Key | Task | Est. |
|---|-----------|------|------|
| 1 | **ODI-25336** | [Swigert] Perform verification testing — confirm outage photo email delivery works end-to-end; document results | 2.0 hrs |
| 2 | **ODI-25183** | [Ribbon SBC Switchover] Execute verification steps for SBC5K failure fix; confirm resolution and prepare sign-off notes | 2.0 hrs |
| 3 | **ODI-24802** | [Maint-72 Hr OLT] Begin scoping the GCR list schedule pull task; identify data sources and scheduling mechanism | 1.0 hr |

> 💡 **Tuesday Goal:** Clear both *Ready for Verification* items so they don't linger into next week.

---

## 📅 Wednesday — *Core Development Day* (~5 hrs)

| # | Issue Key | Task | Est. |
|---|-----------|------|------|
| 1 | **ODI-23903** | [vCD_PSX_VAPP_Build] Active IAP workflow build — continue development session; target one workflow component complete | 2.5 hrs |
| 2 | **ODI-22086** | [Voice_ERR_Billing] IAP workflow build — continue development; sync with any dependent teams if blocked | 2.0 hrs |
| 3 | **ODI-25789** | [NORA] Begin implementation of ticket notes logging based on Monday's scope | 0.5 hr |

---

## 📅 Thursday — *Frontend Work & SPID Investigation* (~5 hrs)

| # | Issue Key | Task | Est. |
|---|-----------|------|------|
| 1 | **ODI-25127** | [IP_Switch_Acceptance] Build out RaAD front-end to kick off workflow — focus on UI wiring and input validation | 2.5 hrs |
| 2 | **ODI-24779** | [Maint-SPID Migration] Investigate production failure on final restart step; reproduce issue and identify root cause | 2.0 hrs |
| 3 | **ODI-24802** | [Maint-72 Hr OLT] Continue GCR list schedule pull development based on Wednesday's scoping | 0.5 hr |

---

## 📅 Friday — *Wrap-Up, Notes & Next-Week Prep* (~5 hrs)

| # | Issue Key | Task | Est. |
|---|-----------|------|------|
| 1 | **ODI-25136** | [Maint-72 Hr OLT] Continue Itential workflow — aim to reach a testable state by EOD | 2.0 hrs |
| 2 | **ODI-24779** | [Maint-SPID Migration] Document findings from Thursday's investigation; propose fix or escalate if systemic | 1.5 hrs |
| 3 | **ODI-25789** | [NORA] Complete/test notes logging feature; update ticket status | 1.0 hr |
| 4 | **ODI-23903** | [vCD_PSX_VAPP_Build] Brief progress update — add comments to ticket, flag any blockers for next sprint | 0.5 hr |

---

## ⚠️ Key Risks

| Risk | Details |
|------|---------|
| **ODI-24779 — SPID Migration** | Production restarts are actively failing. Though not flagged overdue, this is a live production issue and should be escalated quickly if root cause isn't identified by Thursday. |
| **ODI-25336 & ODI-25183** | Both are *Ready for Verification* — they risk aging out if verification is delayed. Prioritized Tuesday to close them out. |
| **ODI-22086 & ODI-23903** | Both are long-running *In Progress* IAP builds. Without dedicated time blocks, they risk stalling. Wednesday is reserved to maintain momentum. |
| **Unassigned NORA items** | ODI-25726, ODI-25421, ODI-25743 are unassigned backlog items — not your direct risk this week, but worth flagging to the team lead if they need owners. |

---

## 🎯 Recommended Focus

> **Drive both *Ready for Verification* items (ODI-25336, ODI-25183) to closure on Tuesday, and maintain steady progress on the three active IAP workflow builds (ODI-25136, ODI-23903, ODI-22086) to prevent them from stalling across the sprint.**