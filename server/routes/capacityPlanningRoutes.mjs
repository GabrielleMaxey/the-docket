import { createLogger } from "../lib/logger.mjs";
import { fetchCapacityWorkloads } from "../lib/capacityPlanning.mjs";
import { mapWatchedAssigneeRow } from "../db/schema.mjs";
import { buildFieldMappingsMap } from "../lib/epicFilterJql.mjs";
import { listSharedPrograms, bulkGetTeamDates, isTeamPriorityMongoConfigured } from "../lib/teamPriorityMongo.mjs";
import { searchAllIssues } from "../lib/jiraSearchHelpers.mjs";
import { chunkValues } from "../../shared/jiraBatch.mjs";

const log = createLogger("capacity-planning");

export const registerCapacityPlanningRoutes = (app, { db, jiraRequest, runJiraSearchRequest, ensureEnvOrRespond }) => {
  // On-demand only (hover-triggered on the frontend) — a single-issue changelog
  // fetch, not part of the bulk Gantt load. Bulk-fetching changelogs for every
  // issue would bloat every Gantt load; this stays cheap by only firing per bar.
  app.get("/api/project-managers/gantt/status-history/:issueKey", async (req, res) => {
    if (!ensureEnvOrRespond(res)) return;

    const issueKey = String(req.params.issueKey || "").trim();
    if (!issueKey) return res.status(400).json({ error: "issueKey is required" });

    try {
      const result = await jiraRequest({
        pathWithQuery: `/rest/api/3/issue/${encodeURIComponent(issueKey)}?expand=changelog&fields=created,status`,
      });
      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }

      const created = String(result.data?.fields?.created || "").slice(0, 10);
      const currentStatus = String(result.data?.fields?.status?.name || "");
      const today = new Date().toISOString().slice(0, 10);
      const histories = Array.isArray(result.data?.changelog?.histories)
        ? result.data.changelog.histories
        : [];

      // Flatten to status-only transitions — a single history entry can bundle
      // unrelated field changes (assignee, priority, etc.) together.
      const transitions = [];
      for (const h of histories) {
        const at = String(h?.created || "").slice(0, 10);
        for (const item of h?.items || []) {
          if (item?.field === "status") {
            transitions.push({
              at,
              fromStatus: String(item.fromString || ""),
              toStatus: String(item.toString || ""),
            });
          }
        }
      }
      transitions.sort((a, b) => a.at.localeCompare(b.at));

      // Build contiguous segments from the transition log. Real issues can move
      // backward (reopened work) — render exactly what happened, chronologically,
      // never assume forward-only progression.
      const segments = [];
      if (transitions.length === 0) {
        segments.push({ status: currentStatus, from: created || today, to: today });
      } else {
        segments.push({ status: transitions[0].fromStatus, from: created, to: transitions[0].at });
        for (let i = 0; i < transitions.length; i++) {
          const from = transitions[i].at;
          const to = i + 1 < transitions.length ? transitions[i + 1].at : today;
          segments.push({ status: transitions[i].toStatus, from, to });
        }
      }

      return res.json({ issueKey, segments });
    } catch (error) {
      log.error("status history fetch failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to load status history",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/project-managers/capacity", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      let watchedRows = db
        .prepare("SELECT * FROM watched_assignees ORDER BY sort_order ASC, id ASC")
        .all()
        .map(mapWatchedAssigneeRow);

      const idsParam = String(req.query?.ids || "").trim();
      if (idsParam) {
        const requestedIds = new Set(
          idsParam
            .split(",")
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isFinite(value))
        );
        watchedRows = watchedRows.filter((row) => requestedIds.has(row.id));
      }

      const mappingsByRole = buildFieldMappingsMap(
        db.prepare("SELECT role, field_id, field_name FROM jira_field_mappings").all()
      );
      const items = await fetchCapacityWorkloads({
        watchedRows,
        jiraRequest,
        runJiraSearchRequest,
        mappingsByRole,
      });

      return res.json({ items });
    } catch (error) {
      log.error("capacity fetch failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to load capacity data",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/project-managers/gantt", async (req, res) => {
    if (!ensureEnvOrRespond(res)) return;

    const slug = String(req.query?.slug || "").trim();
    if (!slug) return res.status(400).json({ error: "slug is required" });

    try {
      let loaded = [];
      let displayName = "";

      if (slug === "__pinned__") {
        displayName = "Pinned Issues";
        const pinnedRows = db
          .prepare("SELECT issue_key FROM issue_metadata WHERE pinned_gantt = 1")
          .all();
        const pinnedKeys = pinnedRows.map((r) => r.issue_key);
        if (pinnedKeys.length === 0) {
          return res.json({ slug, displayName, issues: [] });
        }
        const keyList = pinnedKeys.join(", ");
        const jql = `key in (${keyList}) ORDER BY updated DESC`;
        ({ issues: loaded } = await searchAllIssues({ jql, runJiraSearchRequest, maxTotal: 500 }));
      } else {
        const programs = await listSharedPrograms();
        const program = programs.find((p) => p.slug === slug);
        if (!program) return res.status(404).json({ error: "Program not found" });
        displayName = program.displayName;

        const roots = (program.epicRoots || [])
          .map((k) => String(k || "").trim().toUpperCase())
          .filter(Boolean);
        if (roots.length === 0) return res.json({ slug, displayName, issues: [] });

        const rootList = roots.join(", ");
        const firstPassJql = `(parent in (${rootList}) OR key in (${rootList})) ORDER BY updated DESC`;
        const { issues: firstPass } = await searchAllIssues({
          jql: firstPassJql,
          runJiraSearchRequest,
          maxTotal: 2000,
        });

        // Second pass: subtasks of those direct children — for story-mode grouping
        // on the Gantt. Epic roots are excluded since we're after grandchildren, not
        // the epics' own direct children again.
        const rootSet = new Set(roots);
        const childKeys = firstPass.map((i) => i.key).filter((k) => !rootSet.has(k));
        const secondPassBatches = await Promise.all(
          chunkValues(childKeys).map(async (batch) => {
            const jql = `parent in (${batch.join(", ")}) ORDER BY updated DESC`;
            const { issues } = await searchAllIssues({ jql, runJiraSearchRequest, maxTotal: 2000 });
            return issues;
          })
        );

        const byKey = new Map();
        for (const issue of [...firstPass, ...secondPassBatches.flat()]) {
          byKey.set(issue.key, issue);
        }
        loaded = [...byKey.values()];
      }

      const issueKeys = loaded.map((i) => i.key);

      // MongoDB dates (if configured)
      const mongoDatesByKey =
        isTeamPriorityMongoConfigured() && issueKeys.length > 0
          ? await bulkGetTeamDates(issueKeys)
          : {};

      // SQLite metadata (dates + requestor) for all keys
      const sqliteMetaByKey = {};
      if (issueKeys.length > 0) {
        const placeholders = issueKeys.map(() => "?").join(",");
        const rows = db
          .prepare(
            `SELECT issue_key, start_date, complete_date, planned_start, planned_finish, requestor
             FROM issue_metadata WHERE issue_key IN (${placeholders})`
          )
          .all(...issueKeys);
        for (const row of rows) {
          sqliteMetaByKey[row.issue_key] = {
            startDate: String(row.start_date || ""),
            completeDate: String(row.complete_date || ""),
            plannedStart: String(row.planned_start || ""),
            plannedFinish: String(row.planned_finish || ""),
            requestor: String(row.requestor || ""),
          };
        }
      }

      const issues = loaded.map((issue) => {
        const fields = issue.fields || {};
        const mongo = mongoDatesByKey[issue.key] || {};
        const sqlite = sqliteMetaByKey[issue.key] || {};
        // Merge per-field (Mongo wins when set) rather than picking one source for
        // the whole issue — a partial Mongo save must not blank out unrelated SQLite fields.
        return {
          key: issue.key,
          parentKey: String(fields.parent?.key || ""),
          isSubtask: Boolean(fields.issuetype?.subtask),
          summary: String(fields.summary || ""),
          status: String(fields.status?.name || ""),
          statusCategory: String(fields.status?.statusCategory?.name || ""),
          assignee: String(fields.assignee?.displayName || "Unassigned"),
          dueDate: String(fields.duedate || ""),
          startDate: String(mongo.startDate || sqlite.startDate || ""),
          completeDate: String(mongo.completeDate || sqlite.completeDate || ""),
          plannedStart: String(mongo.plannedStart || sqlite.plannedStart || ""),
          plannedFinish: String(mongo.plannedFinish || sqlite.plannedFinish || ""),
          requestor: String(mongo.requestor || sqlite.requestor || ""),
        };
      });

      return res.json({ slug, displayName, issues });
    } catch (error) {
      log.error("gantt fetch failed", error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to load Gantt data",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
