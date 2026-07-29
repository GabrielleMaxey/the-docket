# PR: Note images + PWA install-as-app

**Branch:** `gmaxey_notes`  
**Base:** `gmaxey_bugs`  
**Date:** 2026-07-27

## Summary

- Work Week notes can attach images (file picker, paste, drag-drop), ephemeral by default, with optional **Keep on this machine**.
- **Push note** uploads images to Jira and posts an inline comment (text + media).
- PWA manifest so Chrome/Edge **Install app** shows **Task Manager** (not “localhost”).
- End-user docs for browser-as-app when Electron is blocked, note images, and unsigned installer guidance.

## Why

Electron/desktop builds can be removed by work Mac security. Notes also needed screenshots/images without permanently duplicating every file. Ephemeral drafts + optional Keep, with Jira as the durable copy after push, matches how people actually work.

## What changed

| Area | Change |
|------|--------|
| Notes UI | `NoteImagesStrip` under Notes: add / paste / drop / thumbnails / Keep toggle |
| Limits | PNG/JPEG/GIF/WebP, max 5 images, 5 MB each (`shared/noteImageLimits.mjs`) |
| Push | Multipart comment route → Jira attachments + ADF inline media |
| Keep | SQLite `issue_note_images` + `data/note-images/`; cleared after successful image push |
| PWA | `public/manifest.webmanifest`, icons, `index.html` links |
| Docs | `END_USER_GUIDE` browser-as-app + note images; `docs/unsigned-installs.md`; this write-up |

## Spec / plan

- [Design](../superpowers/specs/2026-07-27-note-images-pwa-design.md)
- [Plan](../superpowers/plans/2026-07-27-note-images-pwa.md)

## Test plan

- [ ] Add images via picker, paste, and drag-drop; hit limits (type/size/count)
- [ ] Keep **off**: reload clears images; text remains
- [ ] Keep **on**: reload restores images; edits stay in sync
- [ ] Push with text + images → Jira comment shows inline images; local copies clear
- [ ] Text-only push with Keep on → kept images are **not** deleted
- [ ] Push button disabled during push; strip locked while pushing
- [ ] Chrome/Edge Install app → name **Task Manager** + icon
- [ ] `npm test` (115+ passing)

## Out of scope / follow-ups

- Pulling images from Jira comments back into Notes
- Live smoke of Jira ADF media attrs on a scratch issue (recommended once)
- Magic-byte MIME sniffing (server currently uses declared Content-Type + allowlist)
