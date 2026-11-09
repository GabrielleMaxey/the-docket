# Note formatting and inline images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people format task notes without knowing markdown, and (Phase 2, flagged) place pasted images at the cursor so they appear in that position in the Jira comment.

**Architecture:** Pure text-edit and clipboard helpers (Node-testable) drive a toolbar added to `NoteFormattedField`. Notes stay markdown. Phase 2 adds an image marker `![name](img:<id>)` where `<id>` is the first 12 hex chars of the SHA-256 of the file bytes; the server computes the same ID from uploaded buffers, so no request-format change is needed.

**Tech Stack:** React 18, Vite, Node `node:test` (`tests/*.test.mjs`), Express. No new dependencies. JSX is verified by compiling with esbuild (`npx esbuild <file> --loader:.jsx=jsx --log-level=error`) and a manual pass; logic lives in `.js`/`.mjs` files so it is unit-tested.

**Spec:** `docs/superpowers/specs/2026-11-09-note-formatting-and-inline-images-design.md`

## Global Constraints

- Notes are stored as markdown text; Phase 1 changes nothing stored or sent to Jira.
- Markdown subset: `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `[text](https://url)`, `-` and `1.` lists, `>` quotes, `#` headings.
- Attachment limits unchanged: 5 files, 5 MB each (`shared/noteImageLimits.mjs`).
- Shortcuts: Cmd/Ctrl+B, Cmd/Ctrl+I, Cmd/Ctrl+K, scoped to the note textarea.
- Table-cell toolbar is compact and visible only while editing; pop-out (`modal` prop) always shows the full toolbar. It must not change row height when not editing.
- Placeholder text: `Add notes here. Select text and use the toolbar, or paste a screenshot.`
- Phase 2 is behind a flag, off by default. A note with no markers must produce exactly today's ADF.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01B4eMs83Fex4mfpZejBYz4P`.

## Review Focus

Most likely first:
1. A list or wrap action on a selection that spans several lines, or on already-formatted text (must toggle off, not nest).
2. Pasted HTML containing scripts, styles, event attributes, or unsupported tags (must never carry over; falls back to plain text).
3. A hand-typed or stale marker whose ID matches no attachment (must not reach Jira as a block).
4. An image removed while its marker is still in the note, and the reverse.
5. A note that is only markers (no text), and notes with Windows `\r\n` line endings.

---

## Phase 1 — formatting

### Task 1: Text-edit helpers

**Files:**
- Create: `src/utils/noteFormatting.js`
- Test: `tests/noteFormatting.test.mjs`

**Interfaces:**
- Produces: `type Edit = { value: string, selectionStart: number, selectionEnd: number }` and these functions, each `(edit: Edit, ...) => Edit`:
  `toggleWrap(edit, marker: "**" | "*" | "`" | "~~")`, `toggleLinePrefix(edit, kind: "bullet" | "numbered" | "quote")`, `setHeading(edit, level: 0 | 1 | 2 | 3)` (0 removes), `insertLink(edit, url: string)`, `continueList(edit) => Edit | null` (null when Enter should behave normally), `linkOverSelection(edit, pastedText: string) => Edit | null` (null unless the paste is a single `http(s)` URL and there is a selection).

- [ ] **Step 1: Write failing tests** covering, with exact expected `value` and cursor positions: wrap with no selection puts the cursor between markers; wrap with selection; wrapping an already-wrapped selection removes the markers; bullet on a three-line selection prefixes every line, and toggling again removes them; numbered renumbers 1..n; heading replaces an existing `#` prefix; `insertLink` with selection gives `[sel](url)` and with none gives `[](url)` cursor inside the brackets; `continueList` on `- a` at end returns `- a\n- ` and on `1. a` returns `1. a\n2. `, on an empty `- ` item removes the marker and ends the list, on a non-list line returns null; out-of-range selection values clamp rather than throw; `\r\n` text is handled.
- [ ] **Step 2: Run** `node --test tests/noteFormatting.test.mjs` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the functions in `src/utils/noteFormatting.js` as pure code operating on line boundaries derived from the selection.
- [ ] **Step 4: Run** the test — expect all PASS.
- [ ] **Step 5: Commit** `Add note formatting helpers`.

### Task 2: Smart-paste converter

**Files:**
- Create: `src/utils/noteClipboard.js`
- Test: `tests/noteClipboard.test.mjs`

**Interfaces:**
- Produces: `htmlToNoteMarkdown(html: string): string` — DOM-free (small tokenizer, so it runs under Node). Returns `""` when nothing usable remains.

- [ ] **Step 1: Write failing tests**: `<b>`/`<strong>` → `**x**`; `<i>`/`<em>` → `*x*`; `<a href="https://e.test">t</a>` → `[t](https://e.test)`; non-`http(s)` hrefs (`javascript:`) drop to plain text; `<ul><li>` → `- ` lines; `<ol>` → `1.` lines; `<h1>`–`<h3>` → `#`/`##`/`###`; `<p>`/`<br>` → line breaks; `<script>alert(1)</script>` and `<style>` content never appear in output; attributes such as `onclick` never appear; Word-style `<span style="…">` unwraps to its text; HTML entities decode; unsupported tags (`<table>`, `<div>`) keep their text only.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `htmlToNoteMarkdown` with a regex tokenizer and a stack; drop `script`/`style` subtrees entirely.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `Add smart-paste HTML to markdown converter`.

### Task 3: Toolbar and help components

**Files:**
- Create: `src/Components/NoteToolbar.jsx`, `src/Components/NoteFormattingHelp.jsx`
- Modify: the stylesheet that already styles `.ww-note-formatted-preview` (find with `grep -rn "ww-note-formatted-preview" src --include=*.css`)

**Interfaces:**
- Produces: `<NoteToolbar compact onAction={(name) => void} disabled />` where `name` is one of `bold|italic|code|strike|heading|bullet|numbered|quote|link`; `<NoteFormattingHelp />` (popover cheat sheet: what to type → how it looks, for each supported format, plus the three shortcuts and "paste a screenshot to attach it").
- Buttons use `onMouseDown={(e) => e.preventDefault()}` so the textarea keeps focus; each has an `aria-label` and `title` showing its shortcut.

- [ ] **Step 1: Implement** both components; icon row in compact mode, icons plus labels otherwise.
- [ ] **Step 2: Verify** `npx esbuild src/Components/NoteToolbar.jsx --loader:.jsx=jsx --log-level=error` and the same for the help component — expect no output.
- [ ] **Step 3: Commit** `Add note toolbar and formatting help`.

### Task 4: Wire into the notes field, document Phase 1

**Files:**
- Modify: `src/Components/NoteFormattedField.jsx`, `docs/user/task-management.md` (the "Write a **note**" row)
- Test: manual checklist below

**Interfaces:**
- Consumes: Task 1 functions, `htmlToNoteMarkdown` from Task 2, `NoteToolbar`/`NoteFormattingHelp` from Task 3.
- Produces: unchanged props of `NoteFormattedField`; internally an `applyEdit(fn)` that reads the textarea's value and selection, calls an Task 1 function, calls `onChange(result.value)` and restores the selection after render.

- [ ] **Step 1: Implement** toolbar rendering (compact while `editing`, full when `modal`), `onKeyDown` for Enter (via `continueList`) and Cmd/Ctrl+B/I/K, and `onPaste`: if the clipboard has files, do nothing (the existing strip handler takes them); else if `linkOverSelection` returns an edit use it; else if `text/html` is present and `htmlToNoteMarkdown` returns non-empty text insert that at the selection; otherwise let the browser paste plain text. Change the placeholder to the Global Constraints text.
- [ ] **Step 2: Verify** compile: `npx esbuild src/Components/NoteFormattedField.jsx --loader:.jsx=jsx --log-level=error`.
- [ ] **Step 3: Manual check** in the table cell and the pop-out: each button on empty and selected text; shortcuts; Enter in a list; paste from Word/Outlook; paste a URL over selected text; paste a screenshot still attaches; row height unchanged when not editing; the push still sends identical markdown.
- [ ] **Step 4: Document** the toolbar, shortcuts and paste behavior in `docs/user/task-management.md`.
- [ ] **Step 5: Run** `node --test tests/noteFormatting.test.mjs tests/noteClipboard.test.mjs tests/jiraNoteComment.test.mjs` — expect PASS. **Commit** `Add formatting toolbar and smart paste to notes`.

---

## Phase 2 — inline images (flagged)

### Task 5: Marker format and image IDs

**Files:**
- Create: `shared/noteImageMarkers.mjs`
- Test: `tests/noteImageMarkers.test.mjs`

**Interfaces:**
- Produces: `noteImageId(bytes: Uint8Array) => Promise<string>` (first 12 hex chars of SHA-256, via `globalThis.crypto.subtle`), `formatNoteImageMarker(filename: string, id: string) => string` (`![filename](img:id)`, with `[`/`]` removed from the filename), `splitNoteOnImageMarkers(text: string) => Array<{ type: "text", text: string } | { type: "image", id: string, filename: string }>` (CRLF-normalized; ids match `/^[0-9a-f]{12}$/`, anything else stays text), `replaceNoteImageMarkers(text: string, replacer: (m: { id: string, filename: string }) => string) => string`.

- [ ] **Step 1: Write failing tests**: same bytes give the same ID and different bytes differ; marker round-trips through `splitNoteOnImageMarkers`; a marker mid-line splits text before and after; two markers in a row; `![x](img:nothex)` and `![x](https://e.test/a.png)` stay text; only-markers input yields only image parts; `\r\n` input is normalized.
- [ ] **Step 2: Run** `node --test tests/noteImageMarkers.test.mjs` — expect FAIL.
- [ ] **Step 3: Implement** the four exports.
- [ ] **Step 4: Run** — expect PASS. **Step 5: Commit** `Add inline image marker utilities`.

### Task 6: Place images at markers in the Jira comment

**Files:**
- Modify: `server/lib/jiraNoteComment.mjs`
- Test: `tests/jiraNoteComment.test.mjs`

**Interfaces:**
- Consumes: `splitNoteOnImageMarkers` (Task 5), `markdownTextToAdfNodes` (existing).
- Produces: `buildNoteCommentAdf({ noteText, mediaIds, mediaByMarkerId })` where `mediaByMarkerId` is an optional `Map<string, string>` (marker ID → Jira media UUID). With no map or no markers the output equals today's. With a map: text parts become ADF nodes in place, each matched marker becomes a `mediaSingle` block, unmatched markers are dropped, and every media ID in `mediaIds` not placed by a marker is appended at the end in the original order. `pushNoteCommentWithImages` computes each image's marker ID from its buffer (SHA-256 prefix, same algorithm as Task 5), de-duplicates identical buffers (one upload, one media ID), builds the map, and passes it through.

- [ ] **Step 1: Write failing tests**: no markers → deep-equal to the current output (keep existing tests untouched and passing); image before, between and after text lands in that order; the same marker twice yields two blocks, one media ID; unmatched marker yields no block and no stray text; a media ID not referenced by any marker is appended last; a note of only markers produces blocks and no empty text nodes; two identical files upload once (assert `jiraMultipartRequest` call count).
- [ ] **Step 2: Run** `node --test tests/jiraNoteComment.test.mjs` — expect new tests FAIL, old PASS.
- [ ] **Step 3: Implement** the builder and the push changes.
- [ ] **Step 4: Run** the whole file — expect all PASS. **Step 5: Commit** `Place note images at their markers in Jira comments`.

### Task 7: Insert, preview and keep markers in sync (flagged)

**Files:**
- Create: `src/utils/noteInlineImagesFlag.js` (`isInlineNoteImagesEnabled(): boolean`, reads `localStorage` key `docket-inline-note-images` === `"1"`, false on any error)
- Modify: `src/utils/noteMarkdown.js` (`noteMarkdownToHtml(markdown, { imagesById } = {})`), `src/Pages/hooks/useTaskManagerJira.js` (`handleNoteImagesAdd`, `handleNoteImageRemove`, kept-image rehydrate at ~line 742), `src/Components/NoteFormattedField.jsx`, `src/Pages/components/JiraResultsTable.jsx` (pass the image map)
- Test: `tests/noteMarkdown.test.mjs` (add cases)

**Interfaces:**
- Consumes: Task 5 helpers; images in state carry `{ localId, previewUrl, filename, ... }`, to which this task adds `markerId: string`, computed with `noteImageId` when a file is added or rehydrated.
- Produces: `NoteFormattedField` prop `imagesById: Record<string, { previewUrl: string, filename: string }>` and `onImagePasted(markerText: string)`-style insertion through the existing `onChange`.

- [ ] **Step 1: Write failing tests** for `noteMarkdownToHtml`: a marker with a matching `imagesById` entry renders an `<img>` with that `previewUrl` and an escaped `alt`; an unmatched marker renders `[image removed]`; text without markers renders exactly as before; a `previewUrl` that is not `blob:` is never emitted.
- [ ] **Step 2: Run** `node --test tests/noteMarkdown.test.mjs` — expect new tests FAIL.
- [ ] **Step 3: Implement** the renderer change, then the hook changes: compute `markerId` on add and on rehydrate; on remove, also strip that marker from the note text (`replaceNoteImageMarkers` with an empty replacer); when the flag is on and an image file is pasted at the cursor, insert `formatNoteImageMarker(...)` there.
- [ ] **Step 4: Run** the node tests, then esbuild-compile each changed `.jsx`/hook file — expect clean.
- [ ] **Step 5: Manual check** with the flag on: paste mid-text, preview shows the thumbnail in place, remove the thumbnail (marker disappears), delete the marker text (attachment stays in the strip), reload with **Keep on this machine** on (marker still resolves).
- [ ] **Step 6: Commit** `Insert and preview inline note images behind a flag`.

### Task 8: Exports, reports, docs and release verification

**Files:**
- Modify: `server/lib/taskExport.mjs`, any report/context builder that includes note text (find with `grep -rn "note" server/lib/*.mjs | grep -i "text\|markdown"`), `docs/user/task-management.md`
- Test: `tests/taskExport.test.mjs` (add a case)

**Interfaces:**
- Consumes: `replaceNoteImageMarkers` (Task 5).
- Produces: exported and report note text where each marker reads `[image: <filename>]`.

- [ ] **Step 1: Write failing test**: a note `a ![shot.png](img:0123456789ab) b` exports as `a [image: shot.png] b`; a note without markers is unchanged.
- [ ] **Step 2: Run** `node --test tests/taskExport.test.mjs` — expect FAIL.
- [ ] **Step 3: Implement** the replacement where note text is assembled for export and report context.
- [ ] **Step 4: Verify** `node --test tests/notePushFingerprint.test.mjs tests/jiraNoteComment.test.mjs tests/noteMarkdown.test.mjs tests/noteImageMarkers.test.mjs tests/taskExport.test.mjs` — expect PASS; also run the full `npm test` and `npm run build`.
- [ ] **Step 5: Real-Jira verification** (flag on): push notes with an image before, between and after text, an unreferenced attachment, a repeated marker, and a stale marker; confirm each comment in Jira. Record results in the PR description.
- [ ] **Step 6: Document** inline images and the flag in `docs/user/task-management.md`. **Commit** `Handle inline image markers in exports and document them`.
