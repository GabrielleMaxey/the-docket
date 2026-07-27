# Note Images + PWA Manifest — Design Spec

**Date:** 2026-07-27  
**Status:** Approved for planning (pending user review of this file)  
**Scope:** Attach images to Work Week notes (local draft + inline Jira comment on push); add a PWA web manifest so browser “Install app” shows Task Manager name/icon.

---

## Goals

1. Users can add images to a Work Week note via **file picker**, **clipboard paste**, and **drag-and-drop**.
2. Images persist **locally** with the note draft (this machine’s SQLite / disk).
3. **Push note** posts a Jira comment with note text and images **inline** in the comment body.
4. Browser install (Chrome/Edge) uses **Task Manager** name and app icon instead of “localhost”.

## Non-goals (v1)

- Downloading images from pulled Jira comments back into the Notes cell.
- Editing images (crop/annotate).
- Syncing note images across machines.
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
- The notes cell (textarea + strip) is a drop target for image files.
- Paste (`Ctrl/Cmd+V`) while the notes area is focused adds clipboard image(s) when present.
- Each thumbnail: preview on click; remove via ×.
- Empty note text + images only is allowed for local save; **Push** requires at least text **or** at least one image (prefer requiring text if product wants parity with today’s “enter a note” rule — see Open questions). Default for this spec: **Push allowed if text and/or images are present**; if only images, comment body is images only.

### A.2 Limits

| Rule | Value |
|------|--------|
| MIME types | `image/png`, `image/jpeg`, `image/gif`, `image/webp` |
| Max images per note | 5 |
| Max size per image | 5 MB |
| Reject | Other types, oversize, over count — show inline error on the notes cell |

### A.3 Local storage

**Prefer files on disk + metadata in SQLite** (avoids huge BLOB rows and keeps DB backups smaller).

New table `issue_note_images`:

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER PK | Auto-increment |
| `issue_key` | TEXT NOT NULL | FK-like to issue key |
| `sort_order` | INTEGER NOT NULL | Display / push order |
| `mime_type` | TEXT NOT NULL | |
| `filename` | TEXT NOT NULL | Original or generated name |
| `storage_path` | TEXT NOT NULL | Relative path under `data/note-images/` |
| `byte_size` | INTEGER NOT NULL | |
| `created_at` | TEXT | Default `CURRENT_TIMESTAMP` |

Index on `issue_key`.

Files: `data/note-images/{issueKey}/{id}.{ext}` (sanitize issue key for filesystem).

`localStorage` (`workWeekTasksJiraNotes`) continues to cache **text only**. Image lists load from the API when the Work Week table loads metadata.

### A.4 API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/jira/issue-metadata/:issueKey/images` | List image metadata for an issue |
| `GET` | `/api/jira/issue-metadata/:issueKey/images/:imageId` | Serve image bytes (`Content-Type` from DB) |
| `POST` | `/api/jira/issue-metadata/:issueKey/images` | Multipart upload; enforce limits |
| `DELETE` | `/api/jira/issue-metadata/:issueKey/images/:imageId` | Delete row + file |
| `POST` | `/api/jira/issues/:issueKey/comment` | Extended: push text + inline images (see A.5) |

Bulk Work Week load: either extend `POST /api/jira/issue-metadata/bulk` to return `imageCount` / light metadata per key, or issue a companion bulk images summary. Prefer extending bulk with `{ issueKey, note, priority, images: [{ id, mimeType, filename, byteSize }] }` (no bytes in bulk).

### A.5 Push to Jira (inline comment)

On **Push note**:

1. Load local note text + ordered images for the issue.
2. For each image, upload as a Jira **issue attachment** via  
   `POST /rest/api/3/issue/{issueKey}/attachments`  
   (`multipart/form-data`, header `X-Atlassian-Token: no-check`).
3. Build ADF comment:
   - Paragraph(s) for note text (split on newlines as today / minimal paragraphs).
   - For each uploaded attachment, a `mediaSingle` → `media` node referencing the attachment id (Jira Cloud ADF media pattern for attachments).
4. `POST /rest/api/3/issue/{issueKey}/comment` with that ADF body.
5. On full success, update client “last pushed” snapshot to include a fingerprint of text + image ids (so re-push stays disabled until text or image set changes).
6. On failure after partial attachment uploads: surface error; leave local draft intact. Do not delete already-uploaded Jira attachments in v1 (document as known limitation).

Push UI: disable button while uploading; show progress or “Pushing note…” state.

### A.6 Pull latest comment

Unchanged in v1: pull overwrites **note text** only. Local images are not cleared by pull unless product later opts in. Document: after pull, local images may no longer match the Jira comment.

### A.7 Client wiring

- Extend notes UI in `JiraResultsTable` (or wire `NotesCell` if extracting).
- `useTaskManagerJira`: handlers for add/remove image; include image fingerprint in push-dirty check; load image metadata with issue metadata bulk.
- `jiraClient.js`: multipart helpers for image upload; extend `pushJiraIssueNote` to request server-side compose (server reads images from disk by issue key — client need only send `{ note }` and optionally `includeImages: true`).

**Preferred push contract:** client sends `{ note }` (and maybe `imageIds: number[]` for explicit order). Server loads those local images, uploads to Jira, builds ADF. Keeps large binaries off a second client→server hop during push if already stored.

### A.8 Security / hygiene

- Validate MIME from magic bytes / sharp-or-file-type check where practical; do not trust client `Content-Type` alone.
- Cap request body size for image POST.
- Never log image bytes.
- Paths confined under `data/note-images/`.

---

## Part B — PWA manifest

### B.1 Files

- Add `public/manifest.webmanifest`:
  - `name`: `Task Manager`
  - `short_name`: `Task Manager`
  - `start_url`: `/`
  - `display`: `standalone`
  - `background_color` / `theme_color`: match app chrome (neutral dark/light consistent with existing UI; pick one solid theme color from current header)
  - `icons`: SVG and/or PNG derived from `public/task-manager-favicon.svg` (Chrome install prefers PNG 192 + 512; generate PNGs at build time or commit static PNGs under `public/icons/`)
- Update `index.html`:
  - `<link rel="manifest" href="/manifest.webmanifest" />`
  - `<meta name="theme-color" content="..." />`
  - `<meta name="application-name" content="Task Manager" />`

### B.2 Out of scope

- Service worker.
- Offline shell.
- Changing Electron `desktop:dev` / packaging.

### B.3 User expectation

Install-as-app still requires `npm run dev:all` (or a hosted static build) for API; the window is a browser app shell, not a replacement for Electron when Electron is blocked.

---

## Testing (manual)

**Notes + images**

1. Add image via picker, paste, and drag-drop; confirm thumbnails and local persist after reload.
2. Hit type/size/count limits; confirm clear errors.
3. Remove image; confirm file + DB row gone.
4. Push note with text + images; confirm Jira comment shows text and inline images.
5. Push with images only (if allowed); confirm comment renders.
6. Edit text or images after push; confirm Push re-enables.
7. Pull latest comment; confirm text updates and local images behavior matches A.6.

**PWA**

1. Chrome/Edge → Install app from `http://localhost:5173`.
2. Confirm name **Task Manager** and favicon/icon, opens standalone window.

---

## Implementation order

1. Schema + image CRUD API + disk storage.
2. Notes UI (picker / paste / drop / thumbnails).
3. Extend push comment to attachments + inline ADF.
4. Dirty/fingerprint + bulk metadata.
5. PWA manifest + icons + `index.html` links.
6. Docs touch (`DEVELOPER_GUIDE` notes/push section) if kept in sync.

---

## Open questions (defaults chosen)

| Question | Default in this spec |
|----------|----------------------|
| Push with images but empty text? | Allowed |
| Clear local images when pulling Jira comment? | No |
| Cleanup orphaned Jira attachments on failed push? | No (v1) |

---

## Success criteria

- User can attach up to 5 images to a note via picker, paste, or drop; they survive reload on the same machine.
- Push produces one Jira comment with text and inline images.
- Chrome/Edge “Install app” shows **Task Manager** with the project icon, not “localhost”.
