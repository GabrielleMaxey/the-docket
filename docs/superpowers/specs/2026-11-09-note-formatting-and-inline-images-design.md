# Note formatting and inline images — design

Status: proposed (future enhancement). Date: 2026-11-09.

## Purpose

People who do not know markdown should be able to format task notes, and paste screenshots into them, without learning syntax. Notes stay stored as markdown text and still push to Jira as comments. Nothing in this spec is built yet.

## Current behavior (what exists today)

- The Notes box is `src/Components/NoteFormattedField.jsx`: a plain textarea that renders a formatted preview (`src/utils/noteMarkdown.js`) when not focused. It is used in the results table cell and the pop-out editor (`src/Pages/components/JiraResultsTable.jsx`).
- Supported markdown subset: `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `[links](https://…)`, `-` and `1.` lists, `>` quotes, `#` headings, fenced code, `---`.
- Files and images are separate attachments (`src/Pages/components/NoteImagesStrip.jsx`): paste, drag-and-drop or **Add file**; at most 5 files, 5 MB each (`shared/noteImageLimits.mjs`). Draft files can be kept on this machine (`issue_note_images`, `server/lib/noteImageStore.mjs`).
- On **Push note**, `server/lib/jiraNoteComment.mjs` converts the text to ADF (`shared/markdownToAdf.mjs`), uploads attachments, resolves their media IDs, and appends one image block per attachment **after** the text.
- `src/utils/notePushFingerprint.js` decides whether a note changed since the last push, using the text and the attached files.

## Goals

1. Formatting without markdown knowledge: toolbar, shortcuts, list continuation, smart paste, help.
2. Make pasting images discoverable.
3. Optional: place a pasted image at the cursor, so it appears in that position in the Jira comment.
4. No change to how notes are stored or how existing notes render. Phase 1 must not change anything sent to Jira.

Non-goals: a WYSIWYG editor, storing notes as ADF/rich text, new file types, changing the 5-file / 5 MB limits, editing notes pulled from Jira in a different format.

## Phase 1 — formatting (shippable alone)

### Units

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/utils/noteFormatting.js` | Pure text-edit functions. Each takes `{ value, selectionStart, selectionEnd }` and returns `{ value, selectionStart, selectionEnd }`: `toggleWrap` (bold, italic, code, strike), `toggleLinePrefix` (bullet, numbered, quote), `setHeading`, `insertLink`, `continueList` (Enter handling), `pastedUrlOverSelection`. | none |
| `src/utils/noteClipboard.js` | Pure: converts pasted HTML to the markdown subset above (bold, italic, links, lists, headings; everything else becomes plain text). | none |
| `src/Components/NoteToolbar.jsx` | Buttons and shortcut hints. Props: `onAction(name)`, `compact`. | `noteFormatting` names only |
| `src/Components/NoteFormattedField.jsx` (changed) | Owns the textarea ref, applies actions via `noteFormatting`, handles Enter, Cmd/Ctrl+B/I/K and paste, renders the toolbar. | the three above |
| `src/Components/NoteFormattingHelp.jsx` | Cheat-sheet popover: what to type, what it looks like. | none |

### Behavior

- **Toolbar placement:** compact icon row above the box while the note is being edited in the table cell; full toolbar (icons with labels) always shown in the pop-out editor. The toolbar must not shift table row height when the note is not being edited.
- **Actions:** Bold, Italic, Code, Strikethrough, Heading, Bullet list, Numbered list, Quote, Link, and Help. With no selection, wrapping actions insert the markers and place the cursor between them.
- **Shortcuts:** Cmd/Ctrl+B, Cmd/Ctrl+I, Cmd/Ctrl+K (link). Shortcuts are scoped to the note textarea only.
- **Lists:** Enter at the end of a list line starts the next item (numbers increment); Enter on an empty item ends the list.
- **Smart paste:** rich text (Word, Outlook, Jira, web) converts to the markdown subset; plain text pastes unchanged; a URL pasted over selected text becomes `[selected](url)`. Image/file clipboard data keeps going to `NoteImagesStrip`'s existing handler (files take precedence over text).
- **Discoverability:** the placeholder reads "Add notes here. Select text and use the toolbar, or paste a screenshot." A **Paste image** hint appears next to **Add file**.
- **Accessibility:** buttons are keyboard reachable, have accessible names, and a toolbar action never moves focus out of the textarea.

### Not changed in Phase 1

Stored note text format, the ADF builder, the push fingerprint, attachments, reports and exports.

## Phase 2 — inline images

### Representation

A pasted **image** inserts a marker at the cursor: `![filename](img:<id>)`, where `<id>` is the content-hash ID described in item 5 below. Only images (PNG, JPEG, GIF, WebP) get markers; other files stay as attachments appended at the end, as today. The marker is ordinary markdown text, so notes still read sensibly as plain text.

### Behavior

1. **Preview:** `noteMarkdownToHtml` renders a marker whose ID matches a draft attachment as that thumbnail. An unmatched marker renders as the text `[image removed]`.
2. **Push:** `buildNoteCommentAdf` splits the text at markers and emits, in order, text nodes and a `mediaSingle` block per marker, using the media ID of the matching uploaded attachment. Attachments not referenced by any marker are appended at the end (today's behavior), so nothing is lost. An image referenced twice is uploaded once and its block repeated.
3. **Failures:** a marker with no matching attachment is dropped from the ADF and recorded in the push result as a warning; an upload failure aborts the push as it does now, before any comment is posted.
4. **Keeping strip and text in sync:** removing a thumbnail removes its marker; deleting the marker text leaves the attachment in the strip (it then goes at the end on push).
5. **Reload:** `localId` is a fresh `crypto.randomUUID()` each time drafts load (`src/Pages/hooks/useTaskManagerJira.js`), so it cannot be the marker ID. The marker ID is instead the first 12 hex characters of the SHA-256 of the file's bytes, computed when the file is added. It is stable across reloads with no schema change, and two copies of the same screenshot share one ID (so "the same image used twice" is one upload).
6. **Consumers of note text:** the push fingerprint needs no change (marker text is part of the note); exports and reports replace markers with `[image: filename]`; the Jira comment pull never produces markers (pulled images remain attachments).

### Rollout

Feature-flagged (off by default) until verified against a real Jira site, including a note with images before, between and after text, and one with an unreferenced attachment.

## Error handling

- Formatting helpers are pure and total: invalid selection ranges clamp to the text; no action throws.
- Smart paste falls back to plain text if conversion fails or yields empty output.
- Phase 2 builder never produces an ADF block for an unknown ID.

## Testing

Test-first for every unit.

- `noteFormatting`: each action with empty, partial, multi-line and already-formatted selections (toggle off), list continuation edge cases.
- `noteClipboard`: representative HTML from Word, Outlook, Jira and browsers; unsupported tags degrade to text; scripts and attributes are never carried over.
- `NoteToolbar` / `NoteFormattedField`: compile and render checks; manual checks in the table cell and pop-out.
- `jiraNoteComment`: marker split — images before, between, after text; repeated marker; unmatched marker; unreferenced attachment; no markers (must equal today's output exactly).
- `noteMarkdown`: marker rendering and the removed-image placeholder; existing rendering unchanged.
- Manual pass on a real Jira site for Phase 2 before enabling the flag.

## Documentation

Update `docs/user/task-management.md` (notes row, toolbar, shortcuts, paste behavior, inline images) and refresh any mockup showing the Notes box, as each phase ships.

## Risks

- Phase 2 changes the ADF sent to Jira; mitigated by test-first on the builder, the "no markers equals today's output" test, and the feature flag.
- Smart-paste conversion can surprise users on complex pasted content; mitigated by limiting output to the supported subset and falling back to plain text.
- Narrow table cell: the compact toolbar must not change row height when not editing.

## Open questions

None blocking. Candidate follow-ups, deliberately out of scope: note templates/snippets, drag-reordering images in text, inline placement for non-image files.
