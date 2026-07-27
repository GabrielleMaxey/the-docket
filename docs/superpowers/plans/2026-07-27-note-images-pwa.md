# Note Images + PWA Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Work Week notes attach images (picker / paste / drop), push them inline to Jira comments, optionally Keep on this machine; ship a PWA manifest and end-user docs for browser-as-app when Electron is unavailable.

**Architecture:** Images are ephemeral Blobs in React state by default. Keep-on-machine persists to `data/note-images/` + SQLite. Push uses one multipart API that uploads Jira attachments then posts ADF with text + `mediaSingle` nodes. PWA is static `manifest.webmanifest` + icons linked from `index.html`.

**Tech Stack:** React 18, Express multipart (`multer` or raw `busboy` — prefer existing deps if any; otherwise add `multer` only if approved), better-sqlite3, Jira REST API v3, Vite public assets.

**Spec:** `docs/superpowers/specs/2026-07-27-note-images-pwa-design.md`

## Global Constraints

- Image MIME: `image/png`, `image/jpeg`, `image/gif`, `image/webp` only
- Max 5 images per note; max 5 MB each
- Keep toggle default **off**; after successful push, clear ephemeral **and** delete kept local copies
- No filesystem path-linking; no service worker; no pull-images-from-Jira in v1
- No new dependencies without explicit approval — prefer Node built-ins + existing packages; if multipart parsing needs a library, ask before adding
- Match existing naming (`jiraNotes`, `handlePushNote`, `issue_metadata`)
- Do not modify unrelated working code

---

## File map

| File | Responsibility |
|------|----------------|
| `shared/noteImageLimits.mjs` | MIME allowlist, size/count helpers (shared client/server) |
| `server/lib/noteImageStore.mjs` | Disk paths + SQLite CRUD for kept images |
| `server/lib/jiraNoteComment.mjs` | Build ADF; upload attachments; post comment |
| `server/db/schema.mjs` | `issue_note_images` table; `keep_note_images` on `issue_metadata` |
| `server/routes/issueMetadataRoutes.mjs` | Image CRUD + multipart push |
| `src/services/jiraClient.js` | Client API for images + multipart push |
| `src/Pages/hooks/useTaskManagerJira.js` | Ephemeral image state, Keep, push fingerprint |
| `src/Pages/components/NoteImagesStrip.jsx` | Thumbnails, add, paste/drop target helpers |
| `src/Pages/components/JiraResultsTable.jsx` | Wire strip + Keep into Notes cell |
| `public/manifest.webmanifest`, `public/icons/*`, `index.html` | PWA |
| `docs/END_USER_GUIDE.md` | Browser-as-app + note images UX |

---

### Task 1: PWA manifest + browser-as-app user docs

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png` (from `public/task-manager-favicon.svg` via `icon-gen` or a one-off script)
- Modify: `index.html`
- Modify: `docs/END_USER_GUIDE.md` (section already drafted — verify completeness; add note-images subsection under Work Week table actions when Task 2–4 land)

**Interfaces:**
- Produces: installable manifest at `/manifest.webmanifest`

- [ ] **Step 1: Add manifest**

```json
{
  "name": "Task Manager",
  "short_name": "Task Manager",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1b1c1d",
  "theme_color": "#1b1c1d",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Link from `index.html`**

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#1b1c1d" />
<meta name="application-name" content="Task Manager" />
```

- [ ] **Step 3: Generate PNG icons** into `public/icons/` from the existing SVG (reuse `icon-gen` already in `package.json` or a small node script).

- [ ] **Step 4: Confirm `docs/END_USER_GUIDE.md` has “Using Task Manager in the browser…” with Chrome / Edge / Safari steps and the `npm run dev:all` requirement.

- [ ] **Step 5: Manual check** — `npm run dev:all`, open localhost, Chrome → Install app shows **Task Manager**.

- [ ] **Step 6: Commit**

```bash
git add public/manifest.webmanifest public/icons index.html docs/END_USER_GUIDE.md
git commit -m "Add PWA manifest and browser-as-app user docs."
```

---

### Task 2: Shared limits + ephemeral note images UI

**Files:**
- Create: `shared/noteImageLimits.mjs`
- Create: `tests/noteImageLimits.test.mjs`
- Create: `src/Pages/components/NoteImagesStrip.jsx`
- Modify: `src/Pages/hooks/useTaskManagerJira.js`
- Modify: `src/Pages/components/JiraResultsTable.jsx`
- Modify: Work Week CSS (existing stylesheet for `ww-note-*`)

**Interfaces:**
- Produces:
  - `NOTE_IMAGE_MAX_COUNT = 5`, `NOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024`
  - `isAllowedNoteImageMime(mime)`, `validateNoteImageFile(file, currentCount) → { ok, error? }`
  - Hook state: `noteImagesByKey: Record<issueKey, Array<{ localId, file, previewUrl, mimeType, filename, byteSize }>>`
  - `handleNoteImagesAdd(issueKey, File[])`, `handleNoteImageRemove(issueKey, localId)`
- Consumes: existing `jiraNotes`, `handleNoteChange`

- [ ] **Step 1: Write failing tests for limits**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_IMAGE_MAX_COUNT,
  validateNoteImageFile,
} from "../shared/noteImageLimits.mjs";

describe("validateNoteImageFile", () => {
  it("rejects when at max count", () => {
    const result = validateNoteImageFile(
      { type: "image/png", size: 100 },
      NOTE_IMAGE_MAX_COUNT
    );
    assert.equal(result.ok, false);
  });

  it("rejects non-image mime", () => {
    const result = validateNoteImageFile({ type: "application/pdf", size: 100 }, 0);
    assert.equal(result.ok, false);
  });

  it("accepts png under size limit", () => {
    const result = validateNoteImageFile({ type: "image/png", size: 1024 }, 0);
    assert.equal(result.ok, true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `node --test tests/noteImageLimits.test.mjs`

- [ ] **Step 3: Implement `shared/noteImageLimits.mjs`** to pass tests.

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Add ephemeral state in `useTaskManagerJira`**

- Map `issueKey → images[]` with `URL.createObjectURL`; revoke URLs on remove/clear.
- Add/remove handlers; surface per-issue error string for limit failures.
- Extend push-disabled fingerprint later in Task 3; for now UI-only.

- [ ] **Step 6: Build `NoteImagesStrip`**

- Thumbnails, × remove, hidden file input + “Add image”, `onPaste` / `onDrop` / `onDragOver` on wrapper.
- Props: `images`, `disabled`, `error`, `onAddFiles`, `onRemove`, optional `keepOnMachine`, `onKeepChange` (wire Keep in Task 4; can accept props now as no-ops).

- [ ] **Step 7: Wire strip under Notes textarea in `JiraResultsTable`** for non-closed rows.

- [ ] **Step 8: Manual check** — picker, paste screenshot, drag file; reload clears images; text still autosaves.

- [ ] **Step 9: Commit**

```bash
git add shared/noteImageLimits.mjs tests/noteImageLimits.test.mjs \
  src/Pages/components/NoteImagesStrip.jsx \
  src/Pages/hooks/useTaskManagerJira.js \
  src/Pages/components/JiraResultsTable.jsx
git commit -m "Add ephemeral note images UI with picker, paste, and drop."
```

---

### Task 3: Multipart push — Jira attachments + inline ADF

**Files:**
- Create: `server/lib/jiraNoteComment.mjs`
- Create: `tests/jiraNoteComment.test.mjs` (ADF builder unit tests; mock upload optional)
- Modify: `server/routes/issueMetadataRoutes.mjs` — accept multipart OR JSON
- Modify: `src/services/jiraClient.js` — `pushJiraIssueNote` sends FormData when images present
- Modify: `useTaskManagerJira.js` — clear ephemeral images on success; fingerprint includes image localIds/names/sizes

**Interfaces:**
- Produces:
  - `buildNoteCommentAdf({ noteText, attachmentIds: string[] }) → ADF doc`
  - `pushNoteCommentWithImages({ issueKey, noteText, imageBuffers, jiraRequest }) → { ok, status, data, error? }`
- Push route: `POST /api/jira/issues/:issueKey/comment`  
  - JSON `{ note }` (existing)  
  - OR multipart fields: `note` + `images` (0–5 files)

- [ ] **Step 1: Failing test for ADF shape**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildNoteCommentAdf } from "../server/lib/jiraNoteComment.mjs";

describe("buildNoteCommentAdf", () => {
  it("includes text paragraph and mediaSingle per attachment", () => {
    const doc = buildNoteCommentAdf({
      noteText: "Hello",
      attachmentIds: ["10001", "10002"],
    });
    assert.equal(doc.type, "doc");
    const types = doc.content.map((n) => n.type);
    assert.ok(types.includes("paragraph"));
    assert.equal(types.filter((t) => t === "mediaSingle").length, 2);
  });

  it("allows images-only comment", () => {
    const doc = buildNoteCommentAdf({ noteText: "", attachmentIds: ["1"] });
    assert.equal(doc.content.some((n) => n.type === "mediaSingle"), true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL; implement ADF builder; run — expect PASS**

Use Jira Cloud ADF media pattern for attachments (`media` attrs `id`, `type: "file"`, `collection: ""` as required by current Jira Cloud docs — verify against a live dry-run if attrs differ).

- [ ] **Step 3: Implement upload + comment in `jiraNoteComment.mjs`**

For each image: `POST /rest/api/3/issue/{key}/attachments` with `X-Atlassian-Token: no-check` and multipart file. Collect attachment ids. Then post comment ADF.

- [ ] **Step 4: Extend comment route** to parse multipart without a new dependency if possible (`Busboy` is often transitive via Express — check; otherwise use `req` raw + manual boundary only if safe). Prefer asking to add `multer` if parsing is non-trivial.

Reject push when `!note && imageCount === 0`.

- [ ] **Step 5: Update `pushJiraIssueNote` client** to append `File`s when present.

- [ ] **Step 6: On success** clear `noteImagesByKey[issueKey]` and revoke object URLs; update last-pushed fingerprint to include image fingerprint string.

- [ ] **Step 7: Manual check** — push text + image; confirm Jira comment shows inline image; local thumbnails clear.

- [ ] **Step 8: Commit**

```bash
git commit -m "Push note images to Jira as inline comment media."
```

---

### Task 4: Keep on this machine (disk + SQLite)

**Files:**
- Modify: `server/db/schema.mjs` — `keep_note_images`, `issue_note_images`
- Create: `server/lib/noteImageStore.mjs`
- Modify: `issueMetadataRoutes.mjs` — CRUD + bulk fields
- Modify: client + hook — Keep toggle; hydrate kept images on load; delete kept after successful push

**Interfaces:**
- Produces:
  - `listNoteImages(db, issueKey)`, `saveNoteImage(...)`, `deleteNoteImage(...)`, `deleteAllNoteImages(issueKey)`
  - Bulk metadata includes `keepNoteImages` + `images: [{ id, mimeType, filename, byteSize }]`
  - `GET .../images/:id` streams file

- [ ] **Step 1: Schema migration in `initDatabase`**

```sql
ALTER TABLE issue_metadata ADD COLUMN keep_note_images INTEGER NOT NULL DEFAULT 0;
-- wrap in try/exists pattern used elsewhere in schema.mjs

CREATE TABLE IF NOT EXISTS issue_note_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_issue_note_images_issue_key ON issue_note_images(issue_key);
```

- [ ] **Step 2: Implement `noteImageStore.mjs`** with path sanitization under `data/note-images/`.

- [ ] **Step 3: Routes** for list/get/post/delete; enforce limits server-side.

- [ ] **Step 4: UI Keep toggle** — off→on uploads current ephemeral files to API; on→off deletes server copies but keeps session Blobs; load kept images as blob URLs (or `<img src=api>`) when bulk metadata says Keep on.

- [ ] **Step 5: After successful push** call `deleteAllNoteImages` on server (from push handler) and clear client state.

- [ ] **Step 6: Manual check** — Keep on → reload restores; Keep off → files gone; push with Keep on → Jira has images, local gone.

- [ ] **Step 7: Commit**

```bash
git commit -m "Add Keep on this machine for note image drafts."
```

---

### Task 5: End-user docs for note images + final polish

**Files:**
- Modify: `docs/END_USER_GUIDE.md` — Work Week table actions: Add image, Keep toggle, push clears local images
- Modify: `docs/DEVELOPER_GUIDE.md` — short notes/push + PWA pointer (only if needed for accuracy)
- Modify: `docs/superpowers/specs/2026-07-27-note-images-pwa-design.md` — status → Implemented when done

- [ ] **Step 1: Document** under Work Week table:

  - Add images via button, paste, or drag-drop (limits).
  - Keep on this machine (optional).
  - Push note sends text + images to Jira; local image copies cleared after success.
  - Pull latest comment still updates text only.

- [ ] **Step 2: Cross-check** browser-as-app section still accurate after manifest.

- [ ] **Step 3: Commit**

```bash
git commit -m "Document note images and refresh browser-as-app guide."
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Picker / paste / drop | 2 |
| Ephemeral default | 2 |
| Keep toggle + disk/SQLite | 4 |
| Limits 5 / 5MB / MIME | 2, 3, 4 |
| Inline Jira push | 3 |
| Clear local after push | 3, 4 |
| Pull text-only | unchanged (doc in 5) |
| PWA manifest | 1 |
| END_USER_GUIDE browser-as-app | 1 (done early) + 5 |
| Note images user docs | 5 |

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-note-images-pwa.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
