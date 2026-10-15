import { getLocalMetadata, writeLocalMetadata } from "../lib/issueMetadataStore.mjs";
import { finished } from "node:stream/promises";
// Issue mutations (comment, status, assignee) and SQLite note/priority metadata.

import fs from "fs";
import multer from "multer";
import { fetchLatestCommentTextBulk } from "../lib/jiraCommentText.mjs";
import {
  normalizeImportIssueKey,
  parseIssueMetadataCsv,
  planIssueMetadataImport,
} from "../lib/issueMetadataImport.mjs";
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
import { clampIssuePriority } from "../../shared/issuePriority.mjs";
import { buildFieldMappingsMap } from "../lib/epicFilterJql.mjs";
import { resolveMappedFieldId } from "../../shared/odiFieldIds.mjs";
const log = createLogger("metadata");

const uploadNoteImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: NOTE_IMAGE_MAX_BYTES, files: NOTE_IMAGE_MAX_COUNT },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedNoteImageMime(file.mimetype, file.originalname)) {
      return cb(new Error(NOTE_IMAGE_BAD_MIME_MESSAGE));
    }
    cb(null, true);
  },
});

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

const setKeepNoteImages = (db, payload) =>
  db
    .prepare(`
    INSERT INTO issue_metadata (issue_key, keep_note_images, updated_at)
    VALUES (@issueKey, @keepNoteImages, CURRENT_TIMESTAMP)
    ON CONFLICT(issue_key) DO UPDATE SET
      keep_note_images = excluded.keep_note_images,
      updated_at = CURRENT_TIMESTAMP
  `)
    .run(payload);

export const registerIssueMetadataRoutes = (
  app,
  { withSiteOperation = (handler) => handler, getDb, jiraRequest, jiraMultipartRequest, resolveJiraAttachmentMediaId, ensureEnvOrRespond, resolveJiraUser, getNoteImagesDir }
) => {
  const isUnassignAssigneeRequest = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "unassigned" || normalized === "__unassigned__";
  };

  app.post(
    "/api/jira/issues/:issueKey/comment",
    uploadNoteImages.array("images", NOTE_IMAGE_MAX_COUNT),
    handleNoteImageUploadError,
    withSiteOperation(async (req, res) => {
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
          resolveAttachmentMediaId: resolveJiraAttachmentMediaId,
        });

        if (!result.ok) {
          return res.status(result.status).json(result.data);
        }

        if (images.length > 0) {
          const db = getDb();
          deleteAllNoteImages(db, getNoteImagesDir(), issueKey);
          setKeepNoteImages(db, { issueKey, keepNoteImages: 0 });
        }

        log.info(`comment pushed to ${issueKey}${images.length ? ` with ${images.length} image(s)` : ""}`);
        return res.json(result.data);
      } catch (error) {
        log.error(`comment push failed for ${issueKey}`, error instanceof Error ? error.message : error);
        return res.status(500).json({
          error: "Failed to push comment to Jira",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    })
  );

  app.post("/api/jira/issues/:issueKey/status", withSiteOperation(async (req, res) => {
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
  }));

  app.post("/api/jira/issues/:issueKey/assignee", withSiteOperation(async (req, res) => {
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

      const resolved = await resolveJiraUser({ query: assigneeRaw, jiraRequest });
      const accountId = resolved?.accountId || "";
      const resolvedAssignee = resolved?.displayName || assigneeRaw;

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
  }));

  app.post("/api/jira/issues/comments/latest/bulk", withSiteOperation(async (req, res) => {
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
  }));

  app.post("/api/jira/issue-metadata/bulk", withSiteOperation((req, res) => {
    const issueKeys = Array.isArray(req.body?.issueKeys)
      ? req.body.issueKeys
          .map((key) => String(key || "").trim())
          .filter((key) => key.length > 0)
      : [];

    if (issueKeys.length === 0) {
      return res.json({ items: {} });
    }

    const items = getLocalMetadata(getDb(), issueKeys);

    return res.json({ items });
  }));

  app.get("/api/jira/issue-metadata/recent-notes", withSiteOperation((req, res) => {
    const since = String(req.query?.since || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
      return res.status(400).json({ error: "Query param 'since' must be a YYYY-MM-DD date." });
    }

    const rows = getDb()
      .prepare(
        `SELECT issue_key FROM issue_metadata
         WHERE trim(note) != '' AND updated_at >= ?
         ORDER BY updated_at DESC`
      )
      .all(`${since} 00:00:00`);

    return res.json({ issueKeys: rows.map((row) => row.issue_key) });
  }));

  app.patch("/api/jira/issue-metadata/:issueKey/pin-gantt", withSiteOperation((req, res) => {
    const issueKey = String(req.params.issueKey || "").trim().toUpperCase();
    if (!issueKey) return res.status(400).json({ error: "Missing issue key" });
    const pinned = Boolean(req.body?.pinned);
    getDb().prepare(`
      INSERT INTO issue_metadata (issue_key, pinned_gantt, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(issue_key) DO UPDATE SET
        pinned_gantt = excluded.pinned_gantt,
        updated_at = CURRENT_TIMESTAMP
    `).run(issueKey, pinned ? 1 : 0);
    return res.json({ ok: true, pinnedGantt: pinned });
  }));

  app.post("/api/jira/issue-metadata/import", withSiteOperation((req, res) => {
    const csvText = String(req.body?.csvText || "");
    if (!csvText.trim()) {
      return res.status(400).json({ error: "Missing csvText" });
    }

    const parsed = parseIssueMetadataCsv(csvText);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error || "Invalid CSV" });
    }

    try {
      const db = getDb();
      const issueKeys = [
        ...new Set(
          parsed.rows
            .map((row) => normalizeImportIssueKey(row.odi))
            .filter((key) => key.length > 0)
        ),
      ];

      const existingByKey = getLocalMetadata(db, issueKeys.filter((key) => /^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(key)));
      const plan = planIssueMetadataImport(parsed.rows, existingByKey);
      writeLocalMetadata(db, plan.upserts);
      const items = getLocalMetadata(db, plan.upserts.map((item) => item.issueKey));

      return res.json({
        ok: true,
        updatedPriorities: plan.updatedPriorities,
        filledNotes: plan.filledNotes,
        skipped: plan.skipped,
        errors: plan.errors,
        items,
      });
    } catch (error) {
      log.error("issue metadata import failed", error instanceof Error ? error.message : error);
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Failed to import issue metadata",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }));

  app.get("/api/jira/issue-metadata/:issueKey/images/:id", withSiteOperation(async (req, res) => {
    const issueKey = String(req.params.issueKey || "").trim();
    const id = Number(req.params.id);

    if (!issueKey || !Number.isInteger(id)) {
      return res.status(400).json({ error: "Missing issue key or image id" });
    }

    const image = getNoteImageFile(getDb(), issueKey, id);
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
    res.once("close", () => stream.destroy());
    stream.pipe(res);
    await finished(stream).catch((error) => {
      if (error.code !== "ERR_STREAM_PREMATURE_CLOSE" && error.code !== "ENOENT") throw error;
    });
  }));

  app.post(
    "/api/jira/issue-metadata/:issueKey/images",
    uploadNoteImages.array("images", NOTE_IMAGE_MAX_COUNT),
    handleNoteImageUploadError,
    withSiteOperation((req, res) => {
      const issueKey = String(req.params.issueKey || "").trim();
      if (!issueKey) {
        return res.status(400).json({ error: "Missing issue key" });
      }

      const files = req.files || [];
      const db = getDb();
      const images = replaceNoteImages(
        db,
        getNoteImagesDir(),
        issueKey,
        files.map((file) => ({
          buffer: file.buffer,
          mimeType: file.mimetype,
          filename: file.originalname,
        }))
      );
      setKeepNoteImages(db, { issueKey, keepNoteImages: images.length > 0 ? 1 : 0 });

      log.info(`kept ${images.length} note image(s) on this machine for ${issueKey}`);
      return res.json({ ok: true, issueKey, images });
    })
  );

  app.delete("/api/jira/issue-metadata/:issueKey/images", withSiteOperation((req, res) => {
    const issueKey = String(req.params.issueKey || "").trim();
    if (!issueKey) {
      return res.status(400).json({ error: "Missing issue key" });
    }

    const db = getDb();
    deleteAllNoteImages(db, getNoteImagesDir(), issueKey);
    setKeepNoteImages(db, { issueKey, keepNoteImages: 0 });

    log.info(`deleted kept note images for ${issueKey}`);
    return res.json({ ok: true, issueKey });
  }));

  app.put("/api/jira/issue-metadata/:issueKey", withSiteOperation((req, res) => {
    const issueKey = String(req.params.issueKey || "").trim();
    if (!issueKey) {
      return res.status(400).json({ error: "Missing issue key" });
    }

    const db = getDb();
    const patch = { ...req.body };
    if (Object.hasOwn(patch, "priority")) patch.priority = clampIssuePriority(patch.priority);
    for (const field of ["startDate", "completeDate", "plannedStart", "plannedFinish", "pmOverride", "requestor"]) {
      if (typeof patch[field] === "string") patch[field] = patch[field].trim();
    }
    try {
      writeLocalMetadata(db, [{ issueKey, patch }]);
      return res.json({ ok: true, issueKey, ...getLocalMetadata(db, [issueKey])[issueKey.toUpperCase()] });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      throw error;
    }
  }));

  // Pushes a date-valued Jira field (Due date or MRD) directly to Jira — respects
  // Settings → field mappings so a remapped MRD field ID is honored, not hardcoded.
  app.post("/api/jira/issues/:issueKey/date-field", withSiteOperation(async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const issueKey = String(req.params.issueKey || "").trim();
    const role = String(req.body?.role || "").trim();
    const rawValue = req.body?.value;
    const value = rawValue === null || rawValue === undefined ? "" : String(rawValue).trim();

    if (!issueKey) {
      return res.status(400).json({ error: "Missing issue key" });
    }
    if (role !== "due_date" && role !== "most_recent_done_date" && role !== "initial_done_date") {
      return res.status(400).json({ error: "role must be 'due_date', 'initial_done_date', or 'most_recent_done_date'" });
    }
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return res.status(400).json({ error: "value must be YYYY-MM-DD or empty" });
    }

    const mappingsByRole = buildFieldMappingsMap(
      getDb().prepare("SELECT role, field_id, field_name FROM jira_field_mappings").all()
    );
    const fieldId = resolveMappedFieldId(mappingsByRole, role);

    if (!fieldId) {
      return res.status(422).json({ error: `No Jira field mapped for ${role}. Set it in Settings.` });
    }

    try {
      const result = await jiraRequest({
        method: "PUT",
        pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
        body: { fields: { [fieldId]: value || null } },
      });

      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }

      log.info(`${role} updated ${issueKey} → ${value || "(cleared)"}`);
      return res.json({ ok: true, issueKey, role, fieldId, value });
    } catch (error) {
      log.error(`${role} update failed for ${issueKey}`, error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: `Failed to update ${role === "due_date" ? "Due date" : "MRD"}`,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }));
};
