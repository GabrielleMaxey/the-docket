# Note Images + PWA Manifest — Design Spec

**Date:** 2026-07-27  
**Last updated:** 2026-07-27 (ephemeral images + Keep toggle)  
**Status:** Approved direction — storage model revised; pending user review of this file  
**Scope:** Attach images to Work Week notes (ephemeral draft by default, optional keep-on-machine; inline Jira comment on push); add a PWA web manifest so browser “Install app” shows Task Manager name/icon.

---

## Goals

1. Users can add images to a Work Week note via **file picker**, **clipboard paste**, and **drag-and-drop**.
2. By default, images are **ephemeral drafts** (in memory for the session) so we do **not** permanently duplicate files the user already has on disk.
3. Optional **Keep on this machine** persists those draft images locally across reloads for multi-day drafts.
4. **Push note** posts a Jira comment with note text and images **inline** in the comment body.
5. Browser install (Chrome/Edge) uses **Task Manager** name and app icon instead of “localhost”.

## Non-goals (v1)

- Downloading images from pulled Jira comments back into the Notes cell.
- Editing images (crop/annotate).
- Syncing note images across machines.
- Linking to original filesystem paths (unavailable in browser/PWA; fragile for paste).
- Service worker / offline caching beyond install-as-app metadata.
- Changing Electron packaging or code signing.

---

## Current behavior (baseline)

| Concern | Today |
|---------|--------|
| Notes UI | Plain `<textarea>` in Work Week results table |
| Local persist | `issue_metadata.note` (SQLite) + `localStorage` text cache |
| Push | `POST /api/jira/issues/:issueKey/comment` with text-only ADF |
| Pull | Optional overwrite of note **text** from latest Jira comment |
| PWA | `index.html` title/favicon only; no `manifest.webmanifest` |

---

## Part A — Note images

### A.1 User experience

- Notes column keeps the existing textarea for text.
- Below the textarea:
  - Thumbnail strip for attached images (order = add order).
  - **Add image** button (file picker; `accept` image types below).
  - **Keep on this machine** toggle (per note / per issue). Off by default.
- The notes cell (textarea + strip) is a drop target for image files.
- Paste (`Ctrl/Cmd+V`) while the notes area is focused adds clipboard image(s) when present.
- Each thumbnail: preview on click; remove via ×.
- Hint when Keep is off: images stay until Push or until the tab is closed/refreshed.
- **Push** allowed if text and/or images are present; if only images, comment body is images only.

### A.2 Limits

| Rule | Value |
|------|--------|
| MIME types | `image/png`, `image/jpeg`, `image/gif`, `image/webp` |
| Max images per note | 5 |
| Max size per image | 5 MB |
| Reject | Other types, oversize, over count — show inline error on the notes cell |

### A.3 Storage model (revised)

**Default (Keep off) — ephemeral**

- Images live in **React state** as `Blob` / `File` (+ object-URL thumbnails).
- Not written to SQLite or `data/note-images/`.
- Lost on full page reload / tab close (text note still autosaves as today).
- On successful **Push**, clear ephemeral images for that issue (Jira is the durable copy).

**Keep on this machine — on**

- Persist images to disk + SQLite (same schema as below) so drafts survive reload.
- Toggle **off → on**: write current ephemeral images to disk/DB.
- Toggle **on → off**: delete persisted files/rows for that issue; keep current images in memory only for the rest of the session.
- On successful **Push**: clear ephemeral state; **also delete** kept local copies for that issue (avoid long-term duplication after Jira has them). Optional later: “keep after push” — out of scope for v1.

**Why not path-link originals?**

- Browser/PWA cannot retain arbitrary filesystem paths.
- Clipboard paste has no path.
- Path links break when the user moves/deletes the screenshot.

New table `issue_note_images` (used only when Keep is on, or briefly during push if server needs a temp staging — prefer client multipart on push for ephemeral):

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER PK | Auto-increment |
| `issue_key` | TEXT NOT NULL | |
| `sort_order` | INTEGER NOT NULL | |
| `mime_type` | TEXT NOT NULL | |
| `filename` | TEXT NOT NULL | |
| `storage_path` | TEXT NOT NULL | Under `data/note-images/` |
| `byte_size` | INTEGER NOT NULL | |
| `created_at` | TEXT | Default `CURRENT_TIMESTAMP` |

Also store Keep preference: either `issue_metadata.keep_note_images INTEGER NOT NULL DEFAULT 0` or a small settings key per issue. Prefer column on `issue_metadata` for bulk load.

Index on `issue_key`.

`localStorage` continues to cache **text only**.

### A.4 API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/jira/issue-metadata/:issueKey/images` | List kept images (empty if Keep off / none) |
| `GET` | `/api/jira/issue-metadata/:issueKey/images/:imageId` | Serve kept image bytes |
| `POST` | `/api/jira/issue-metadata/:issueKey/images` | Persist image when Keep is on |
| `DELETE` | `/api/jira/issue-metadata/:issueKey/images/:imageId` | Delete kept image |
| `PUT` | `/api/jira/issue-metadata/:issueKey` | Extended: `keepNoteImages` boolean + note/priority |
| `POST` | `/api/jira/issues/:issueKey/comment` | Push text + inline images (see A.5) |

Bulk metadata: `{ issueKey, note, priority, keepNoteImages, images: [{ id, mimeType, filename, byteSize }] }` (images only when kept).

### A.5 Push to Jira (inline comment)

On **Push note**:

1. Collect note text + ordered images (from memory and/or kept disk files).
2. For each image, upload as a Jira **issue attachment** via  
   `POST /rest/api/3/issue/{issueKey}/attachments`  
   (`multipart/form-data`, header `X-Atlassian-Token: no-check`).
3. Build ADF comment: text paragraph(s) + `mediaSingle` → `media` nodes for each attachment.
4. `POST /rest/api/3/issue/{issueKey}/comment` with that ADF body.
5. On full success:
   - Update “last pushed” fingerprint (text + image identity).
   - Clear ephemeral images.
   - Delete any **kept** local images for that issue (v1).
6. On failure after partial attachment uploads: surface error; leave local draft (ephemeral and/or kept) intact. Do not delete already-uploaded Jira attachments in v1.

**Push transport:**

- **Ephemeral images:** client sends multipart (note text + image files) to the comment endpoint (or a dedicated push route). Server uploads to Jira and builds ADF — no requirement to persist first.
- **Kept images:** client may send `{ note, imageIds }` and server reads from disk; or same multipart for one code path. Prefer **one multipart push path** for both to reduce branching.

Push UI: disable while uploading; show “Pushing note…”.

### A.6 Pull latest comment

Unchanged in v1: pull overwrites **note text** only. Does not clear ephemeral or kept images unless we later add that option.

### A.7 Client wiring

- Notes UI in `JiraResultsTable` / `NotesCell`: picker, paste, drop, thumbnails, Keep toggle.
- `useTaskManagerJira`: ephemeral image map by issue key; Keep toggle handlers; push fingerprint includes image set; after push clear images (+ server deletes kept).
- `jiraClient.js`: multipart push; optional CRUD for kept images.

### A.8 Security / hygiene

- Validate MIME; do not trust client `Content-Type` alone.
- Cap multipart body size.
- Never log image bytes.
- Kept paths confined under `data/note-images/`.

---

## Part B — PWA manifest

### B.1 Files

- Add `public/manifest.webmanifest`:
  - `name` / `short_name`: `Task Manager`
  - `start_url`: `/`
  - `display`: `standalone`
  - `background_color` / `theme_color`: match app chrome
  - `icons`: PNG 192 + 512 from `task-manager-favicon.svg` under `public/icons/`
- Update `index.html`:
  - `<link rel="manifest" href="/manifest.webmanifest" />`
  - `<meta name="theme-color" …>`
  - `<meta name="application-name" content="Task Manager" />`

### B.2 Out of scope

- Service worker, offline shell, Electron packaging changes.

### B.3 User expectation

Install-as-app still needs `npm run dev:all` (or hosted API) for data; it replaces Electron UI chrome, not the backend.

---

## Testing (manual)

**Notes + images**

1. Keep **off**: add via picker, paste, drop; thumbnails work; reload clears images; text remains.
2. Keep **on**: add images; reload restores thumbnails from disk.
3. Toggle Keep off: persisted copies removed; session thumbnails remain until reload.
4. Limits: type/size/count errors.
5. Push with text + images (ephemeral): Jira inline comment; local images cleared.
6. Push with Keep on: Jira comment; local kept files deleted after success.
7. Push re-enables after text/image changes.
8. Pull comment: text updates; images behavior matches A.6.

**PWA**

1. Install from localhost; name **Task Manager** + icon; standalone window.

---

## Implementation order

1. Notes UI + ephemeral image state (picker / paste / drop / thumbnails).
2. Multipart push → Jira attachments + inline ADF; clear ephemeral on success.
3. Keep toggle + schema/disk CRUD; bulk metadata; clear kept on successful push.
4. PWA manifest + icons + `index.html`.
5. Docs touch if needed.

---

## Open questions (defaults chosen)

| Question | Default in this spec |
|----------|----------------------|
| Push with images but empty text? | Allowed |
| Clear local images when pulling Jira comment? | No |
| Cleanup orphaned Jira attachments on failed push? | No (v1) |
| Delete kept local images after successful push? | **Yes** (avoid duplication) |
| Keep toggle default | **Off** |

---

## Success criteria

- Users can attach up to 5 images via picker, paste, or drop without permanently duplicating files by default.
- Keep on this machine opts into durable local drafts; successful push still lands inline images in Jira and clears local image copies.
- Chrome/Edge “Install app” shows **Task Manager** with the project icon, not “localhost”.
