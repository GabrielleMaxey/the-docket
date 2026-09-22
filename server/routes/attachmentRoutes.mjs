import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { createLogger } from "../lib/logger.mjs";
import {
  listIssueAttachments,
  removeTempFiles,
  uploadAttachmentsToIssue,
} from "../lib/jiraAttachments.mjs";
import {
  ATTACHMENT_BAD_TYPE_MESSAGE,
  ATTACHMENT_DEFAULT_MAX_MB,
  ATTACHMENT_MAX_COUNT,
  attachmentMaxBytes,
  attachmentTooLargeMessage,
  attachmentTooManyMessage,
  isAllowedAttachmentName,
} from "../../shared/attachmentLimits.mjs";

const log = createLogger("attachments");

const ISSUE_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/i;

const resolveMaxMb = () => {
  const value = Number(process.env.ATTACHMENT_MAX_MB);
  return Number.isFinite(value) && value > 0 ? value : ATTACHMENT_DEFAULT_MAX_MB;
};

export const registerAttachmentRoutes = (app, { jiraRequest, jiraMultipartRequest, ensureEnvOrRespond }) => {
  const maxMb = resolveMaxMb();
  const uploadDir = path.join(os.tmpdir(), "taskmanager-attachments");
  mkdirSync(uploadDir, { recursive: true });

  // Disk storage: screen recordings can be hundreds of MB, far past what should sit in memory.
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, _file, cb) => cb(null, randomUUID()),
    }),
    limits: { fileSize: attachmentMaxBytes(maxMb), files: ATTACHMENT_MAX_COUNT },
    fileFilter: (_req, file, cb) => {
      if (!isAllowedAttachmentName(file.originalname)) {
        return cb(new Error(`${file.originalname}: ${ATTACHMENT_BAD_TYPE_MESSAGE}`));
      }
      cb(null, true);
    },
  });

  const handleUploadError = (err, req, res, next) => {
    if (!err) {
      return next();
    }
    void removeTempFiles(req.files);
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: attachmentTooLargeMessage(maxMb) });
      }
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ error: attachmentTooManyMessage() });
      }
      return res.status(400).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message || ATTACHMENT_BAD_TYPE_MESSAGE });
  };

  app.get("/api/jira/attachment-limits", (_req, res) => {
    res.json({ maxMb, maxCount: ATTACHMENT_MAX_COUNT });
  });

  app.get("/api/jira/issues/:issueKey/attachments", async (req, res) => {
    if (!ensureEnvOrRespond(res)) return;
    const issueKey = String(req.params.issueKey || "").trim();
    if (!ISSUE_KEY_RE.test(issueKey)) {
      return res.status(400).json({ error: "Invalid issue key" });
    }
    try {
      const result = await listIssueAttachments({ issueKey, jiraRequest });
      if (!result.ok) {
        return res.status(result.status).json({ error: "Could not load attachments from Jira" });
      }
      return res.json({ issueKey, attachments: result.attachments });
    } catch (error) {
      log.error("list attachments failed", error instanceof Error ? error.message : error);
      return res.status(500).json({ error: "Could not load attachments from Jira" });
    }
  });

  app.post(
    "/api/jira/issues/:issueKey/attachments",
    upload.array("files", ATTACHMENT_MAX_COUNT),
    handleUploadError,
    async (req, res) => {
      const files = req.files || [];
      try {
        if (!ensureEnvOrRespond(res)) return;
        const issueKey = String(req.params.issueKey || "").trim();
        if (!ISSUE_KEY_RE.test(issueKey)) {
          return res.status(400).json({ error: "Invalid issue key" });
        }
        if (files.length === 0) {
          return res.status(400).json({ error: "Choose at least one file to attach." });
        }

        log.info(`uploading ${files.length} attachment(s) to ${issueKey}`);
        const { uploaded, failed } = await uploadAttachmentsToIssue({
          issueKey,
          files,
          jiraMultipartRequest,
        });

        if (uploaded.length === 0) {
          return res.status(502).json({
            error: failed.map((item) => item.error).join(" ") || "No files were uploaded.",
            uploaded,
            failed,
          });
        }
        // 207-style partial success is reported in the body; the request itself succeeded.
        return res.json({ issueKey, uploaded, failed });
      } catch (error) {
        log.error("upload attachments failed", error instanceof Error ? error.message : error);
        return res.status(500).json({ error: "Attachment upload failed" });
      } finally {
        await removeTempFiles(files);
      }
    }
  );
};
