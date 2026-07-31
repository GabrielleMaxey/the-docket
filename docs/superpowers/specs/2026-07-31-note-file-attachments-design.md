# Note file attachments (design)

**Date:** 2026-07-31  
**Status:** Approved for planning  
**Scope:** Extend Work Week note attachments beyond images to common document types  
**Related:** Note images + Push note (`shared/noteImageLimits.mjs`, `NoteImagesStrip.jsx`, `jiraNoteComment.mjs`)

---

## Goal

Allow users to attach **txt, PDF, Word, and spreadsheet** files to issue notes the same way they attach images today — local draft, optional Keep-on-this-machine, and **Push note** to Jira (upload + embed in the comment).

## Decisions (from product discussion)

| Topic | Choice |
|--------|--------|
| Formats | Existing images **plus** `.txt`, `.pdf`, `.doc`, `.docx`, `.xlsx`, `.csv` |
| Push to Jira | Same as images: issue attachment + media node in comment ADF (Jira-like drop behavior) |
| Limits | **5 files** total (images + docs share the pool), **5 MB** each |
| Approach | Extend existing note-attachment pipeline (not a separate documents UI) |

## Non-goals

- In-app preview/rendering of PDF/Word/Excel
- Raising count or size limits
- New SQLite tables (reuse `issue_note_images` / existing disk store)
- Changing Atlas/team-priority behavior

## Architecture

```
Note UI (Add file / paste / drop)
        ↓
shared validation (MIME + extension fallback)
        ↓
React draft state (+ optional Keep on this machine → SQLite/disk)
        ↓
Push note → upload each file as Jira attachment
        ↓
resolve Media Services UUID → ADF mediaSingle in comment
```

No change to the media-UUID resolution path already used for images.

## Allowed types

Keep current image MIME allowlist. Add:

| Kind | Extensions | Typical MIME(s) |
|------|------------|-----------------|
| Text | `.txt` | `text/plain` |
| PDF | `.pdf` | `application/pdf` |
| Word | `.doc`, `.docx` | `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Excel | `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| CSV | `.csv` | `text/csv`, `application/vnd.ms-excel` (some browsers) |

**Validation:** accept if MIME is allowed **or** (when MIME is empty/octet-stream) extension is allowed. Reject everything else with a clear message listing supported types.

## Limits & copy

- Max count: 5 (shared across images and documents)
- Max size: 5 MB per file
- Error strings updated to say **files** / list supported kinds (not “images only”)
- Button label: **Add file** (accept attribute includes images + new types)

## UI

- Images: keep thumbnail preview (current behavior)
- Non-images: compact **file chip** (filename, size, remove); open via blob URL in a new tab when the browser can
- Paste/drop: unchanged entry points; validation filters unsupported types
- “Keep on this machine” applies to the whole attachment list (unchanged semantics)

## Server / push

- Multer `fileFilter` uses the same shared allowlist helper
- Field name can remain `images` for API compatibility (internal); docs may still say attachments
- `pushNoteCommentWithImages` uploads any allowed buffer the same way; ADF still uses media UUID nodes (works for non-image files as Jira file cards)

## Testing

- Unit: allowlist accepts new types / rejects others; extension fallback when MIME blank
- Unit: existing note-comment push still resolves media id (mock)
- Manual: attach PDF + PNG on one note → Keep → reload → Push → Jira comment shows both

## Success criteria

1. User can add txt/pdf/doc/docx/xlsx/csv alongside images under the same 5×5MB rules  
2. Keep-on-machine and Push note work for mixed lists  
3. Unsupported types are rejected with a clear message  
4. No regression for image-only notes
