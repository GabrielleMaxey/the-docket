// Issue mutations (comment, status, assignee) and SQLite note/priority metadata.

import { fetchLatestCommentTextBulk } from "../lib/jiraCommentText.mjs";
import {
  normalizeImportIssueKey,
  parseIssueMetadataCsv,
  planIssueMetadataImport,
} from "../lib/issueMetadataImport.mjs";
import { createLogger } from "../lib/logger.mjs";
const log = createLogger("metadata");

export const registerIssueMetadataRoutes = (
  app,
  { db, jiraRequest, ensureEnvOrRespond, resolveJiraUser }
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

  app.post("/api/jira/issues/:issueKey/comment", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const issueKey = String(req.params.issueKey || "").trim();
    const note = String(req.body?.note || "").trim();

    if (!issueKey) {
      return res.status(400).json({ error: "Missing issue key" });
    }

    if (!note) {
      return res.status(400).json({ error: "Missing note" });
    }

    const body = {
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: note,
              },
            ],
          },
        ],
      },
    };

    try {
      const result = await jiraRequest({
        method: "POST",
        pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
        body,
      });

      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }

      log.info(`comment pushed to ${issueKey}`);
      return res.json(result.data);
    } catch (error) {
      log.error(`comment push failed for ${issueKey}`, error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to push comment to Jira",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

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
        `SELECT issue_key, note, priority FROM issue_metadata WHERE issue_key IN (${placeholders})`
      )
      .all(...issueKeys);

    const items = rows.reduce((acc, row) => {
      acc[row.issue_key] = {
        note: String(row.note || ""),
        priority: clampDbPriority(row.priority),
      };
      return acc;
    }, {});

    return res.json({ items });
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

  app.post("/api/jira/issue-metadata/import", (req, res) => {
    const csvText = String(req.body?.csvText || "");
    if (!csvText.trim()) {
      return res.status(400).json({ error: "Missing csvText" });
    }

    const parsed = parseIssueMetadataCsv(csvText);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error || "Invalid CSV" });
    }

    try {
      const issueKeys = [
        ...new Set(
          parsed.rows
            .map((row) => normalizeImportIssueKey(row.odi))
            .filter((key) => key.length > 0)
        ),
      ];

      const existingByKey = {};
      if (issueKeys.length > 0) {
        const placeholders = issueKeys.map(() => "?").join(",");
        const existingRows = db
          .prepare(
            `SELECT issue_key, note, priority FROM issue_metadata WHERE issue_key IN (${placeholders})`
          )
          .all(...issueKeys);
        for (const row of existingRows) {
          existingByKey[row.issue_key] = {
            note: String(row.note || ""),
            priority: clampDbPriority(row.priority),
          };
        }
      }

      const plan = planIssueMetadataImport(parsed.rows, existingByKey);
      const apply = db.transaction((upserts) => {
        for (const item of upserts) {
          upsertIssueMetadataStmt.run({
            issueKey: item.issueKey,
            note: item.note,
            priority: item.priority,
          });
        }
      });
      apply(plan.upserts);

      const items = {};
      for (const item of plan.upserts) {
        items[item.issueKey] = { priority: item.priority, note: item.note };
      }

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
      return res.status(500).json({
        error: "Failed to import issue metadata",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
