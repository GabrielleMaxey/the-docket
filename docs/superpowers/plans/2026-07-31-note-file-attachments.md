# Note File Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Work Week notes to attach `.txt`, `.pdf`, `.doc`, `.docx`, `.xlsx`, and `.csv` alongside images, with the same Keep-on-machine and Push-to-Jira flows.

**Architecture:** Extend the existing note-attachment pipeline. Widen shared MIME/extension validation in `shared/noteImageLimits.mjs`, update `NoteImagesStrip` to show file chips for non-images, keep multer + push paths unchanged except they reuse the new allowlist. No new DB tables; API field name stays `images`.

**Tech Stack:** React (Vite), Express + multer, shared ESM validators, Node test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-07-31-note-file-attachments-design.md`

## Global Constraints

- Max **5** files total (images + docs share the pool); **5 MB** each
- Allowed additions: txt, pdf, doc, docx, xlsx, csv (+ existing png/jpeg/gif/webp)
- Accept by allowed MIME **or** extension when MIME is empty/`application/octet-stream`
- Push uses existing attachment upload + media UUID ADF path
- No in-app PDF/Word preview; no new SQLite tables; keep internal names (`noteImages*`, `images` form field) unless a label must change for users
- Minimal diffs; match existing style; no new dependencies

## File map

| File | Responsibility |
|------|----------------|
| `shared/noteImageLimits.mjs` | Allowlist, size/count limits, validate + partition helpers |
| `tests/noteImageLimits.test.mjs` | Unit tests for allowlist / rejection / messages |
| `server/routes/issueMetadataRoutes.mjs` | Multer filter already calls shared helper — verify messages |
| `src/Pages/components/NoteImagesStrip.jsx` | Accept list, Add file label, image thumb vs file chip |
| `src/Pages/workWeekTaskElements.css` | Styles for file chip |
| `docs/END_USER_GUIDE.md` | One short note that notes accept documents too |

Push (`jiraNoteComment.mjs`) needs **no logic change** if buffers already carry filename + mimeType.

---

### Task 1: Widen shared allowlist + tests

**Files:**
- Modify: `shared/noteImageLimits.mjs`
- Modify: `tests/noteImageLimits.test.mjs`

**Interfaces:**
- Consumes: existing `validateNoteImageFile(file, currentCount)`, `partitionNoteImageFiles(existingCount, files)`
- Produces: `isAllowedNoteAttachment(file)` (or extend `isAllowedNoteImageMime` to check MIME + extension); updated error strings referring to **files**; same export names callers already use (`isAllowedNoteImageMime` may become a thin wrapper or be renamed carefully — prefer keeping export name and broadening behavior to avoid churn, OR export `isAllowedNoteAttachment` and alias `isAllowedNoteImageMime` to it)

- [ ] **Step 1: Update failing expectations in tests**

Replace/extend `tests/noteImageLimits.test.mjs` so PDF is accepted, unknown types rejected, extension fallback works, and messages say “files”:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_IMAGE_MAX_COUNT,
  partitionNoteImageFiles,
  validateNoteImageFile,
} from "../shared/noteImageLimits.mjs";

describe("validateNoteImageFile", () => {
  it("rejects when at max count", () => {
    const result = validateNoteImageFile(
      { type: "image/png", size: 100, name: "a.png" },
      NOTE_IMAGE_MAX_COUNT
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /up to 5 files/i);
  });

  it("rejects unsupported type", () => {
    const result = validateNoteImageFile(
      { type: "application/zip", size: 100, name: "a.zip" },
      0
    );
    assert.equal(result.ok, false);
  });

  it("accepts png under size limit", () => {
    const result = validateNoteImageFile(
      { type: "image/png", size: 1024, name: "a.png" },
      0
    );
    assert.equal(result.ok, true);
  });

  it("accepts pdf by mime", () => {
    const result = validateNoteImageFile(
      { type: "application/pdf", size: 1024, name: "a.pdf" },
      0
    );
    assert.equal(result.ok, true);
  });

  it("accepts docx by extension when mime is octet-stream", () => {
    const result = validateNoteImageFile(
      {
        type: "application/octet-stream",
        size: 1024,
        name: "spec.docx",
      },
      0
    );
    assert.equal(result.ok, true);
  });

  it("accepts csv and xlsx", () => {
    assert.equal(
      validateNoteImageFile({ type: "text/csv", size: 10, name: "a.csv" }, 0).ok,
      true
    );
    assert.equal(
      validateNoteImageFile(
        {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size: 10,
          name: "a.xlsx",
        },
        0
      ).ok,
      true
    );
  });
});

describe("partitionNoteImageFiles", () => {
  const png = () => ({ type: "image/png", size: 100, name: "a.png" });

  it("caps sequential batches at max count", () => {
    let count = 0;
    const first = partitionNoteImageFiles(count, [png(), png(), png()]);
    count += first.accepted.length;
    assert.equal(first.accepted.length, 3);

    const second = partitionNoteImageFiles(count, [png(), png(), png()]);
    assert.equal(second.accepted.length, 2);
    assert.match(second.error, /up to 5 files/i);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test tests/noteImageLimits.test.mjs`  
Expected: FAIL (PDF rejected / message still says “images”)

- [ ] **Step 3: Implement allowlist in `shared/noteImageLimits.mjs`**

Replace file contents with logic equivalent to:

```js
export const NOTE_IMAGE_MAX_COUNT = 5;
export const NOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/vnd.ms-excel",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
  ".pdf",
  ".doc",
  ".docx",
  ".xlsx",
  ".csv",
]);

const fileExtension = (name) => {
  const raw = String(name || "");
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return "";
  return raw.slice(idx).toLowerCase();
};

export const isAllowedNoteImageMime = (mime, filename = "") => {
  const normalized = String(mime || "").trim().toLowerCase();
  if (ALLOWED_MIMES.has(normalized)) {
    return true;
  }
  if (!normalized || normalized === "application/octet-stream") {
    return ALLOWED_EXTENSIONS.has(fileExtension(filename));
  }
  return false;
};

export const NOTE_IMAGE_TOO_MANY_MESSAGE = `You can add up to ${NOTE_IMAGE_MAX_COUNT} files.`;
export const NOTE_IMAGE_BAD_MIME_MESSAGE =
  "Choose a PNG, JPEG, GIF, WebP, TXT, PDF, DOC, DOCX, XLSX, or CSV file.";
export const NOTE_IMAGE_TOO_LARGE_MESSAGE = `Each file must be ${
  NOTE_IMAGE_MAX_BYTES / (1024 * 1024)
} MB or smaller.`;

export const validateNoteImageFile = (file, currentCount) => {
  if (currentCount >= NOTE_IMAGE_MAX_COUNT) {
    return { ok: false, error: NOTE_IMAGE_TOO_MANY_MESSAGE };
  }

  if (!isAllowedNoteImageMime(file?.type, file?.name || file?.originalname)) {
    return { ok: false, error: NOTE_IMAGE_BAD_MIME_MESSAGE };
  }

  if (file.size > NOTE_IMAGE_MAX_BYTES) {
    return { ok: false, error: NOTE_IMAGE_TOO_LARGE_MESSAGE };
  }

  return { ok: true };
};

export const partitionNoteImageFiles = (existingCount, files) => {
  const accepted = [];
  let error = "";

  for (const file of files || []) {
    const result = validateNoteImageFile(file, existingCount + accepted.length);
    if (!result.ok) {
      error = result.error;
      continue;
    }
    accepted.push(file);
  }

  return { accepted, error };
};
```

- [ ] **Step 4: Update multer filter to pass filename**

In `server/routes/issueMetadataRoutes.mjs`, change the fileFilter from `isAllowedNoteImageMime(file.mimetype)` to `isAllowedNoteImageMime(file.mimetype, file.originalname)`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `node --test tests/noteImageLimits.test.mjs`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add shared/noteImageLimits.mjs tests/noteImageLimits.test.mjs server/routes/issueMetadataRoutes.mjs
git commit -m "Allow document types on note attachments with shared validation."
```

---

### Task 2: UI — Add file + file chips

**Files:**
- Modify: `src/Pages/components/NoteImagesStrip.jsx`
- Modify: `src/Pages/workWeekTaskElements.css` (file chip styles near existing `.ww-note-image-*` rules ~1714+)

**Interfaces:**
- Consumes: attachment objects with `localId`, `filename`, `byteSize`, `previewUrl`, `mimeType` (or `type`) already used by `handleNoteImagesAdd`
- Produces: UI that thumbnails images and chips other types; `accept` includes document extensions

- [ ] **Step 1: Confirm attachment object shape in `useTaskManagerJira.js`**

When adding files, ensure each draft entry stores `mimeType` (from `file.type`) if not already present — required for chip vs thumb. If only `previewUrl` + `filename` exist today, add `mimeType: file.type` (and keep `filename`) in the object created inside `handleNoteImagesAdd`.

- [ ] **Step 2: Update `NoteImagesStrip.jsx`**

- Change `IMAGE_TYPES` to a broader `ACCEPT_TYPES` string including  
  `image/png,image/jpeg,image/gif,image/webp,.txt,.pdf,.doc,.docx,.xlsx,.csv,text/plain,application/pdf,...`
- Button text: **Add file**
- For each item: if mime starts with `image/`, keep `<img>` thumb; else render a chip:

```jsx
<a
  className="ww-note-file-chip"
  href={image.previewUrl}
  target="_blank"
  rel="noreferrer"
  title={image.filename}
>
  <span className="ww-note-file-chip-name">{image.filename}</span>
  <span>{formatByteSize(image.byteSize)}</span>
</a>
```

Keep remove button behavior.

- [ ] **Step 3: Add CSS for `.ww-note-file-chip` / `.ww-note-file-chip-name`**

Match existing note strip spacing; truncate long filenames; no card-heavy chrome.

- [ ] **Step 4: Manual smoke (dev)**

Run app, attach a PNG and a PDF to one note, confirm thumb + chip, remove works.

- [ ] **Step 5: Commit**

```bash
git add src/Pages/components/NoteImagesStrip.jsx src/Pages/workWeekTaskElements.css src/Pages/hooks/useTaskManagerJira.js
git commit -m "Show file chips for non-image note attachments."
```

---

### Task 3: Docs + verification

**Files:**
- Modify: `docs/END_USER_GUIDE.md` (Work Week notes / push note section — one or two sentences)
- Optional touch: `docs/DEVELOPER_GUIDE.md` only if it still says “images only”

**Interfaces:** none

- [ ] **Step 1: Update END_USER_GUIDE**

Where notes/images are described, state that notes also accept TXT, PDF, DOC/DOCX, XLSX, CSV (up to 5 files, 5 MB each), and Push note uploads them to Jira like images.

- [ ] **Step 2: Run full unit suite for touched areas**

Run: `node --test tests/noteImageLimits.test.mjs tests/jiraNoteComment.test.mjs tests/issueMetadataRoutes.test.mjs`  
Expected: all PASS

- [ ] **Step 3: Manual checklist**

1. Add PDF + PNG on one issue note  
2. Enable Keep on this machine → reload Work Week → both still present  
3. Push note → Jira comment shows text + both attachments  
4. Reject a `.zip` with clear error  

- [ ] **Step 4: Commit**

```bash
git add docs/END_USER_GUIDE.md docs/DEVELOPER_GUIDE.md
git commit -m "Document note file attachment types for end users."
```

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| New formats + MIME/extension validation | Task 1 |
| 5 files / 5 MB, updated messages | Task 1 |
| Add file UI + chips vs thumbs | Task 2 |
| Keep + Push unchanged path | Task 1–2 (no push code change) |
| END_USER_GUIDE | Task 3 |
| Unit + manual tests | Tasks 1 & 3 |

## Out of scope (do not implement)

- In-app PDF/Word viewers  
- Larger limits  
- Renaming DB table / API field `images`  
- Separate documents control
