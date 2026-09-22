# PR: File attachments for Task Management rows and Create Issue

> **Stacked on #25** (Create Issue fixes). Merge that first and delete its branch; GitHub then retargets this PR to `pilot` automatically.

## Summary

Lets engineers attach screenshots, screen recordings (.mov/.mp4), and documents to Jira issues without leaving the app — from any open issue's row in Task Management, or while creating an issue.

## Problem

| Symptom | Root cause |
|---------|------------|
| Bug repros (screenshots, screen recordings) had to be added in the Jira UI after filing | No attachment support on issues — only inline images on pushed note comments |
| Note-image upload can't carry recordings | It buffers in memory with a 5 MB cap, sized for small inline comment images |

## Changes

- **Task Management** — new **Attach files** button on each open issue row (next to Save to local DB). The dialog shows files already on the issue, a drop zone with image thumbnails, and real upload progress.
- **Create Issue** — new **Attachments** field. Files upload to the new issue right after it's created; a failed upload is reported per file and never undoes the created issue.
- **Server** — `GET /api/jira/attachment-limits`, `GET|POST /api/jira/issues/:issueKey/attachments`. Uploads use multer **disk** storage and stream to Jira via `fs.openAsBlob`, so a large recording is never fully buffered; temp files are removed in a `finally`. Each file uploads separately so one Jira rejection (e.g. 413) doesn't fail the batch.
- **Validation** — shared allowlist and size checks in `shared/attachmentLimits.mjs`, used by both browser and server: images, video, PDF/Office/text, logs/data (LOG, JSON, XML, YAML, HAR), archives. Default 10 files × 250 MB, configurable via `ATTACHMENT_MAX_MB`. Jira's site limit still applies and is surfaced clearly.
- **Client** — `uploadIssueAttachments` uses `XMLHttpRequest` for upload progress (`fetch` can't report it).

## Test plan

- [ ] Task row → **Attach files** → add a PNG and a `.mov` → both appear on the issue in Jira and in "Already on this issue"
- [ ] Progress percentage advances on a large recording; Close is disabled mid-upload
- [ ] Drop a `.sh` / oversized file → rejected in the picker with a specific message
- [ ] Create Issue with attachments → new issue has them; success message says "Attached N files"
- [ ] With `ATTACHMENT_MAX_MB=1`, a 2 MB upload returns a 413 with a clear message
- [ ] `npm test` — `tests/jiraAttachments.test.mjs` passes

## Files touched

| Path | Change |
|------|--------|
| `server/routes/attachmentRoutes.mjs` | New — list/upload/limits routes, disk-backed multer |
| `server/lib/jiraAttachments.mjs` | New — per-file streaming upload, attachment listing, temp cleanup |
| `server/jiraProxy.mjs` | Register attachment routes |
| `shared/attachmentLimits.mjs` | New — allowlist, size/count validation, messages |
| `src/Pages/components/AttachmentPicker.jsx` | New — drop zone + file list with thumbnails and progress |
| `src/Pages/components/AttachFilesModal.jsx` | New — task-row dialog; `useAttachmentLimits` hook |
| `src/Pages/components/JiraResultsTable.jsx` | Attach files button + modal |
| `src/Pages/components/CreateIssueModal.jsx` | Attachments field; upload after create |
| `src/services/jiraClient.js` | Attachment API client with upload progress |
| `tests/jiraAttachments.test.mjs` | New tests |
| `docs/*`, `README.md` | End-user, developer, and env-var docs |
