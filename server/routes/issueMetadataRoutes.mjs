// Issue mutations (comment, status, assignee) and SQLite note/priority metadata.

import fs from "fs";
import multer from "multer";
import { fetchLatestCommentTextBulk } from "../lib/jiraCommentText.mjs";
import { pushNoteCommentWithImages } from "../lib/jiraNoteComment.mjs";
import {
  listNoteImages,
  getNoteImageFile,
  replaceNoteImages,
  deleteAllNoteImages,
} from "../lib/noteImageStore.mjs";
import { createLogger } from "../lib/logger.mjs";
import {
  NOTE_IMAGE_MAX_BYTES,
  NOTE_IMAGE_MAX_COUNT,
  NOTE_IMAGE_BAD_MIME_MESSAGE,
  NOTE_IMAGE_TOO_LARGE_MESSAGE,
  NOTE_IMAGE_TOO_MANY_MESSAGE,
  isAllowedNoteImageMime,
} from "../../shared/noteImageLimits.mjs";
const log = createLogger("metadata");

const uploadNoteImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: NOTE_IMAGE_MAX_BYTES, files: NOTE_IMAGE_MAX_COUNT },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedNoteImageMime(file.mimetype)) {
      return cb(new Error(NOTE_IMAGE_BAD_MIME_MESSAGE));
    }
    cb(null, true);
  },
});

// Handles multer upload errors (oversize file, too many files, bad mime from
// fileFilter) so they return JSON 400 instead of an unhandled 500/HTML error.
const handleNoteImageUploadError = (err, _req, res, next) => {
  if (!err) {
    return next();
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: NOTE_IMAGE_TOO_LARGE_MESSAGE });
    }
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: NOTE_IMAGE_TOO_MANY_MESSAGE });
    }
    return res.status(400).json({ error: err.message });
  }

  return res.status(400).json({ error: err.message || NOTE_IMAGE_BAD_MIME_MESSAGE });
};

export const registerIssueMetadataRoutes = (
  app,
  { db, jiraRequest, jiraMultipartRequest, ensureEnvOrRespond, resolveJiraUser, noteImagesDir }
) => {
  const selectIssueMetadataStmt = db.prepare(
    "SELECT issue_key, note, priority FROM issue_metadata WHERE issue_key = ?"
  );
  const upsertIssueMetadataStmt = db.prepare(`
    INSERT INTO issue_metadata (issue_key, note, priority, updated_at)
    VALUES (@issueKey, @note, @priority, CURRENT_TIMESTAMP)
    ON CONFLICT(issue_key) DO UPDATE SET
      note = excluded.note,
      priority = excluded.priority,
      updated_at = CURRENT_TIMESTAMP
  `);
  const setKeepNoteImagesStmt = db.prepare(`
    INSERT INTO issue_metadata (issue_key, keep_note_images, updated_at)
    VALUES (@issueKey, @keepNoteImages, CURRENT_TIMESTAMP)
    ON CONFLICT(issue_key) DO UPDATE SET
      keep_note_images = excluded.keep_note_images,
      updated_at = CURRENT_TIMESTAMP
  `);

  const clampDbPriority = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }

    return Math.max(0, Math.min(10, Math.round(numeric)));
  };

  const isUnassignAssigneeRequest = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "unassigned" || normalized === "__unassigned__";
  };

  app.post(
    "/api/jira/issues/:issueKey/comment",
    uploadNoteImages.array("images", NOTE_IMAGE_MAX_COUNT),
    handleNoteImageUploadError,
    async (req, res) => {
      if (!ensureEnvOrRespond(res)) {
        return;
      }

      const issueKey = String(req.params.issueKey || "").trim();
      const note = String(req.body?.note || "").trim();
      const images = req.files || [];

      if (!issueKey) {
        return res.status(400).json({ error: "Missing issue key" });
      }

      if (!note && images.length === 0) {
        return res.status(400).json({ error: "Missing note" });
      }

      try {
        const result = await pushNoteCommentWithImages({
          issueKey,
          noteText: note,
          imageBuffers: images.map((file) => ({
            buffer: file.buffer,
            filename: file.originalname,
            mimeType: file.mimetype,
          })),
          jiraRequest,
          jiraMultipartRequest,
        });

        if (!result.ok) {
          return res.status(result.status).json(result.data);
        }

        // A successful push means Jira now holds the images inline — kept
        // local copies (if any) are no longer needed, regardless of whether
        // Keep was toggled on for this push.
        deleteAllNoteImages(db, noteImagesDir, issueKey);
        setKeepNoteImagesStmt.run({ issueKey, keepNoteImages: 0 });

        log.info(`comment pushed to ${issueKey}${images.length ? ` with ${images.length} image(s)` : ""}`);
        return res.json(result.data);
      } catch (error) {
        log.error(`comment push failed for ${issueKey}`, error instanceof Error ? error.message : error);
        return res.status(500).json({
          error: "Failed to push comment to Jira",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  app.post("/api/jira/issues/:issueKey/status", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const issueKey = String(req.params.issueKey || "").trim();
    const targetStatus = String(req.body?.targetStatus || "").trim();

    if (!issueKey) {
      return res.status(400).json({ error: "Missing issue key" });
    }

    if (!targetStatus) {
      return res.status(400).json({ error: "Missing target status" });
    }

    try {
      const transitionsResult = await jiraRequest({
        pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      });

      if (!transitionsResult.ok) {
        return res.status(transitionsResult.status).json(transitionsResult.data);
      }

      const transitions = Array.isArray(transitionsResult.data?.transitions)
        ? transitionsResult.data.transitions
        : [];

      const desired = targetStatus.toLowerCase();
      const matchingTransition = transitions.find(
        (item) => String(item?.to?.name || "").toLowerCase() === desired
      );

      if (!matchingTransition?.id) {
        const available = transitions
          .map((item) => item?.to?.name)
          .filter((name) => typeof name === "string" && name.trim().length > 0);

        return res.status(400).json({
          error: `Status '${targetStatus}' is not an available transition for ${issueKey}`,
          availableTransitions: available,
        });
      }

      const transitionResult = await jiraRequest({
        method: "POST",
        pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
        body: {
          transition: {
            id: matchingTransition.id,
          },
        },
      });

      if (!transitionResult.ok) {
        return res.status(transitionResult.status).json(transitionResult.data);
      }

      log.info(`status updated ${issueKey} → ${targetStatus}`);
      return res.json({
        ok: true,
        issueKey,
        previousStatus: null,
        newStatus: targetStatus,
        transitionId: matchingTransition.id,
      });
    } catch (error) {
      log.error(`status update failed for ${issueKey}`, error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to update Jira status",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/jira/issues/:issueKey/assignee", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const issueKey = String(req.params.issueKey || "").trim();
    const assigneeRaw = String(req.body?.assignee || "").trim();

    if (!issueKey) {
      return res.status(400).json({ error: "Missing issue key" });
    }

    if (!assigneeRaw) {
      return res.status(400).json({ error: "Missing assignee value" });
    }

    try {
      if (isUnassignAssigneeRequest(assigneeRaw)) {
        const updateResult = await jiraRequest({
          method: "PUT",
          pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`,
          body: {
            accountId: null,
          },
        });

        if (!updateResult.ok) {
          return res.status(updateResult.status).json(updateResult.data);
        }

        log.info(`assignee cleared ${issueKey}`);
        return res.json({
          ok: true,
          issueKey,
          accountId: null,
          resolvedAssignee: "Unassigned",
        });
      }

      let accountId = "";
      let resolvedAssignee = assigneeRaw;

      // Already looks like an Atlassian accountId (e.g. picked from a
      // dropdown that already resolved it) — skip the user-search round trip.
      const looksLikeAccountId = assigneeRaw.includes(":") || assigneeRaw.length > 20;
      if (looksLikeAccountId) {
        accountId = assigneeRaw;
      } else {
        const resolved = await resolveJiraUser({ query: assigneeRaw, jiraRequest });
        accountId = resolved?.accountId || "";
        resolvedAssignee = resolved?.displayName || assigneeRaw;
      }

      if (!accountId) {
        return res.status(404).json({
          error: `No Jira user found for '${assigneeRaw}'. Try a display name, email, or username.`,
        });
      }

      const updateResult = await jiraRequest({
        method: "PUT",
        pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`,
        body: {
          accountId,
        },
      });

      if (!updateResult.ok) {
        return res.status(updateResult.status).json(updateResult.data);
      }

      log.info(`assignee updated ${issueKey} → ${resolvedAssignee}`);
      return res.json({
        ok: true,
        issueKey,
        accountId,
        resolvedAssignee,
      });
    } catch (error) {
      log.error(`assignee update failed for ${issueKey}`, error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to update Jira assignee",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/jira/issues/comments/latest/bulk", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const issueKeys = Array.isArray(req.body?.issueKeys)
      ? req.body.issueKeys
          .map((key) => String(key || "").trim())
          .filter((key) => key.length > 0)
      : [];

    if (issueKeys.length === 0) {
      return res.json({ items: {} });
    }

    try {
      const { items } = await fetchLatestCommentTextBulk({ issueKeys, jiraRequest });
      return res.json({ items });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to fetch latest Jira comments",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/jira/issue-metadata/bulk", (req, res) => {
    const issueKeys = Array.isArray(req.body?.issueKeys)
      ? req.body.issueKeys
          .map((key) => String(key || "").trim())
          .filter((key) => key.length > 0)
      : [];

    if (issueKeys.length === 0) {
      return res.json({ items: {} });
    }

    const placeholders = issueKeys.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT issue_key, note, priority, keep_note_images FROM issue_metadata WHERE issue_key IN (${placeholders})`
      )
      .all(...issueKeys);

    const items = rows.reduce((acc, row) => {
      const keepNoteImages = Boolean(row.keep_note_images);
      acc[row.issue_key] = {
        note: String(row.note || ""),
        priority: clampDbPriority(row.priority),
        keepNoteImages,
        images: keepNoteImages ? listNoteImages(db, row.issue_key) : [],
      };
      return acc;
    }, {});

    return res.json({ items });
  });

  app.get("/api/jira/issue-metadata/:issueKey/images/:id", (req, res) => {
    const issueKey = String(req.params.issueKey || "").trim();
    const id = Number(req.params.id);

    if (!issueKey || !Number.isInteger(id)) {
      return res.status(400).json({ error: "Missing issue key or image id" });
    }

    const image = getNoteImageFile(db, issueKey, id);
    if (!image) {
      return res.status(404).json({ error: "Image not found" });
    }

    res.setHeader("Content-Type", image.mimeType);
    res.setHeader("Content-Length", String(image.byteSize));
    const stream = fs.createReadStream(image.storagePath);
    stream.on("error", (error) => {
      if (res.headersSent) {
        res.destroy(error);
        return;
      }

      res.removeHeader("Content-Type");
      res.removeHeader("Content-Length");
      res.status(404).json({ error: "Image not found" });
    });
    stream.pipe(res);
  });

  app.post(
    "/api/jira/issue-metadata/:issueKey/images",
    uploadNoteImages.array("images", NOTE_IMAGE_MAX_COUNT),
    handleNoteImageUploadError,
    (req, res) => {
      const issueKey = String(req.params.issueKey || "").trim();
      if (!issueKey) {
        return res.status(400).json({ error: "Missing issue key" });
      }

      const files = req.files || [];
      const images = replaceNoteImages(
        db,
        noteImagesDir,
        issueKey,
        files.map((file) => ({
          buffer: file.buffer,
          mimeType: file.mimetype,
          filename: file.originalname,
        }))
      );
      setKeepNoteImagesStmt.run({ issueKey, keepNoteImages: 1 });

      log.info(`kept ${images.length} note image(s) on this machine for ${issueKey}`);
      return res.json({ ok: true, issueKey, images });
    }
  );

  app.delete("/api/jira/issue-metadata/:issueKey/images", (req, res) => {
    const issueKey = String(req.params.issueKey || "").trim();
    if (!issueKey) {
      return res.status(400).json({ error: "Missing issue key" });
    }

    deleteAllNoteImages(db, noteImagesDir, issueKey);
    setKeepNoteImagesStmt.run({ issueKey, keepNoteImages: 0 });

    log.info(`deleted kept note images for ${issueKey}`);
    return res.json({ ok: true, issueKey });
  });

  app.put("/api/jira/issue-metadata/:issueKey", (req, res) => {
    const issueKey = String(req.params.issueKey || "").trim();
    if (!issueKey) {
      return res.status(400).json({ error: "Missing issue key" });
    }

    const current = selectIssueMetadataStmt.get(issueKey) || {};
    const hasNote = typeof req.body?.note === "string";
    const hasPriority = req.body?.priority !== undefined;

    if (!hasNote && !hasPriority) {
      return res.status(400).json({ error: "Provide note or priority" });
    }

    const nextNote = hasNote ? String(req.body.note) : String(current.note || "");
    const nextPriority = hasPriority
      ? clampDbPriority(req.body.priority)
      : clampDbPriority(current.priority);

    upsertIssueMetadataStmt.run({
      issueKey,
      note: nextNote,
      priority: nextPriority,
    });

    return res.json({
      ok: true,
      issueKey,
      note: nextNote,
      priority: nextPriority,
    });
  });
};
