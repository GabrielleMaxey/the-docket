import { mapEpicPresetRow, mapWatchedAssigneeRow } from "../db/schema.mjs";
import { createLogger } from "../lib/logger.mjs";
const log = createLogger("config");

import {
  buildFieldMappingsMap,
  buildPastDueJql,
  resolvePresetJql,
  splitTrailingOrderBy,
} from "../lib/epicFilterJql.mjs";
import { computePastDueFloorDate } from "../../shared/dashboardMetrics.mjs";
import { buildDirectReportsJql, normalizeMemberNames } from "../../shared/directReportsJql.mjs";
import {
  DEFAULT_OVERDUE_DATE_BASIS,
  OVERDUE_DATE_BASES,
  normalizeOverdueDateBasis,
} from "../../shared/overdueDateBasis.mjs";

const EPIC_PAST_DUE_MODES = new Set(["most_recent_done_date", "project_end_date", "either"]);
const WATCH_TYPES = new Set(["person", "jql", "direct_reports"]);
const PRESET_TYPES = new Set(["epic", "jql"]);
const JQL_PRESET_KEY = "JQL";
const REMINDER_SLOT_COUNT = 4;
const REMINDER_TEXT_MAX_LENGTH = 500;

export const registerAppConfigRoutes = (app, { db, jiraRequest, ensureEnvOrRespond, runJiraSearchRequest }) => {
  const listEpicPresetsStmt = db.prepare(
    "SELECT * FROM epic_presets ORDER BY sort_order ASC, id ASC"
  );
  const getEpicPresetStmt = db.prepare("SELECT * FROM epic_presets WHERE id = ?");
  const insertEpicPresetStmt = db.prepare(`
    INSERT INTO epic_presets (epic_key, epic_name, jira_filter_id, jql, preset_type, sort_order, updated_at)
    VALUES (@epicKey, @epicName, @jiraFilterId, @jql, @presetType, @sortOrder, CURRENT_TIMESTAMP)
  `);
  const updateEpicPresetStmt = db.prepare(`
    UPDATE epic_presets SET
      epic_key = @epicKey,
      epic_name = @epicName,
      jira_filter_id = @jiraFilterId,
      jql = @jql,
      preset_type = @presetType,
      sort_order = @sortOrder,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  const deleteEpicPresetStmt = db.prepare("DELETE FROM epic_presets WHERE id = ?");

  const listFieldMappingsStmt = db.prepare(
    "SELECT role, field_id, field_name, updated_at FROM jira_field_mappings ORDER BY role ASC"
  );
  const upsertFieldMappingStmt = db.prepare(`
    INSERT INTO jira_field_mappings (role, field_id, field_name, updated_at)
    VALUES (@role, @fieldId, @fieldName, CURRENT_TIMESTAMP)
    ON CONFLICT(role) DO UPDATE SET
      field_id = excluded.field_id,
      field_name = excluded.field_name,
      updated_at = CURRENT_TIMESTAMP
  `);

  const listSettingsStmt = db.prepare("SELECT key, value FROM app_settings");
  const upsertSettingStmt = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (@key, @value, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);

  const listRemindersStmt = db.prepare(
    "SELECT slot_index, text, done FROM reminders ORDER BY slot_index ASC"
  );
  const upsertReminderStmt = db.prepare(`
    INSERT INTO reminders (slot_index, text, done, updated_at)
    VALUES (@slotIndex, @text, @done, CURRENT_TIMESTAMP)
    ON CONFLICT(slot_index) DO UPDATE SET
      text = excluded.text,
      done = excluded.done,
      updated_at = CURRENT_TIMESTAMP
  `);
  const saveRemindersTxn = db.transaction((rows) => {
    for (const row of rows) {
      upsertReminderStmt.run(row);
    }
  });

  const readReminders = () => {
    const bySlot = new Map(listRemindersStmt.all().map((row) => [row.slot_index, row]));
    return Array.from({ length: REMINDER_SLOT_COUNT }, (_, index) => ({
      text: String(bySlot.get(index)?.text || ""),
      done: Boolean(bySlot.get(index)?.done),
    }));
  };

  const listWatchedAssigneesStmt = db.prepare(
    "SELECT * FROM watched_assignees ORDER BY sort_order ASC, id ASC"
  );
  const getWatchedAssigneeStmt = db.prepare("SELECT * FROM watched_assignees WHERE id = ?");
  const insertWatchedAssigneeStmt = db.prepare(`
    INSERT INTO watched_assignees (display_name, resolved_account_id, watch_type, jql, member_names_json, sort_order, capacity, overdue_date_basis)
    VALUES (@displayName, @resolvedAccountId, @watchType, @jql, @memberNamesJson, @sortOrder, @capacity, @overdueDateBasis)
  `);
  const updateWatchedAssigneeStmt = db.prepare(`
    UPDATE watched_assignees SET
      display_name = @displayName,
      resolved_account_id = @resolvedAccountId,
      watch_type = @watchType,
      jql = @jql,
      member_names_json = @memberNamesJson,
      sort_order = @sortOrder,
      capacity = @capacity,
      overdue_date_basis = @overdueDateBasis
    WHERE id = @id
  `);
  const deleteWatchedAssigneeStmt = db.prepare("DELETE FROM watched_assignees WHERE id = ?");

  const readSettingsMap = () => {
    const rows = listSettingsStmt.all();
    return rows.reduce((acc, row) => {
      acc[row.key] = String(row.value ?? "");
      return acc;
    }, {});
  };

  const normalizeEpicPresetPayload = (body, existing = null) => {
    const presetType = String(body?.presetType ?? existing?.preset_type ?? "epic").trim();
    const epicName = String(body?.epicName ?? existing?.epic_name ?? "").trim();
    const jql = String(body?.jql ?? existing?.jql ?? "").trim();
    const jiraFilterId = String(body?.jiraFilterId ?? existing?.jira_filter_id ?? "").trim();

    if (!PRESET_TYPES.has(presetType)) {
      return { error: "Invalid presetType", allowed: [...PRESET_TYPES] };
    }

    if (!epicName) {
      return { error: "epicName is required" };
    }

    if (presetType === "jql") {
      if (!jql) {
        return { error: "jql is required for JQL presets" };
      }

      return {
        presetType,
        epicKey: JQL_PRESET_KEY,
        epicName,
        jql,
        jiraFilterId: "",
        sortOrder: Number(body?.sortOrder ?? existing?.sort_order ?? 0),
      };
    }

    const epicKey = String(body?.epicKey ?? existing?.epic_key ?? "").trim();
    if (!epicKey) {
      return { error: "epicKey is required for epic presets" };
    }

    return {
      presetType,
      epicKey,
      epicName,
      jql,
      jiraFilterId,
      sortOrder: Number(body?.sortOrder ?? existing?.sort_order ?? 0),
    };
  };

  const normalizeWatchedPayload = (body, existing = null) => {
    const displayName = String(body?.displayName ?? existing?.display_name ?? "").trim();
    const watchType = String(body?.watchType ?? existing?.watch_type ?? "person").trim();
    const jql = String(body?.jql ?? existing?.jql ?? "").trim();

    if (!displayName) {
      return { error: "displayName is required" };
    }

    if (!WATCH_TYPES.has(watchType)) {
      return { error: "Invalid watchType", allowed: [...WATCH_TYPES] };
    }

    if (watchType === "jql" && !jql) {
      return { error: "jql is required when watchType is jql" };
    }

    const existingNames = (() => {
      try {
        const parsed = JSON.parse(existing?.member_names_json || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    const memberNames = normalizeMemberNames(
      body?.memberNames !== undefined ? body.memberNames : existingNames
    );

    if (watchType === "direct_reports" && memberNames.length === 0) {
      return { error: "Add at least one contributor name" };
    }

    // better-sqlite3 needs null, not undefined; ""/null in the request clears the target.
    const rawCapacity = body?.capacity !== undefined ? body.capacity : existing?.capacity;
    const capacity =
      rawCapacity === null || rawCapacity === "" || rawCapacity === undefined
        ? null
        : Math.max(0, Math.round(Number(rawCapacity)) || 0);

    if (body?.overdueDateBasis !== undefined && body?.overdueDateBasis !== null && String(body.overdueDateBasis).trim() !== "") {
      const requestedBasis = String(body.overdueDateBasis).trim();
      if (!OVERDUE_DATE_BASES.includes(requestedBasis)) {
        return { error: "Invalid overdueDateBasis", allowed: [...OVERDUE_DATE_BASES] };
      }
    }

    const overdueDateBasis = normalizeOverdueDateBasis(
      body?.overdueDateBasis !== undefined ? body.overdueDateBasis : existing?.overdue_date_basis ?? DEFAULT_OVERDUE_DATE_BASIS
    );

    return {
      displayName,
      watchType,
      jql: watchType === "direct_reports" ? buildDirectReportsJql(memberNames) : watchType === "jql" ? jql : "",
      memberNamesJson: watchType === "direct_reports" ? JSON.stringify(memberNames) : "[]",
      resolvedAccountId: String(body?.resolvedAccountId ?? existing?.resolved_account_id ?? "").trim(),
      sortOrder: Number(body?.sortOrder ?? existing?.sort_order ?? 0),
      capacity,
      overdueDateBasis,
    };
  };

  app.get("/api/epic-presets", (_req, res) => {
    const items = listEpicPresetsStmt.all().map(mapEpicPresetRow);
    return res.json({ items });
  });

  app.post("/api/epic-presets", (req, res) => {
    const payload = normalizeEpicPresetPayload(req.body);
    if (payload.error) {
      return res.status(400).json(payload);
    }

    const result = insertEpicPresetStmt.run(payload);
    const row = getEpicPresetStmt.get(result.lastInsertRowid);
    log.info(`created epic preset ${row.id} "${payload.epicName}" (${payload.presetType})`);
    return res.status(201).json(mapEpicPresetRow(row));
  });

  app.put("/api/epic-presets/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = getEpicPresetStmt.get(id);
    if (!existing) {
      return res.status(404).json({ error: "Epic preset not found" });
    }

    const payload = normalizeEpicPresetPayload(req.body, existing);
    if (payload.error) {
      return res.status(400).json(payload);
    }

    updateEpicPresetStmt.run({ id, ...payload });
    log.info(`updated epic preset ${id} "${payload.epicName}"`);
    return res.json(mapEpicPresetRow(getEpicPresetStmt.get(id)));
  });

  app.get("/api/epic-presets/:id/scope-jql", async (req, res) => {
    const id = Number(req.params.id);
    const row = getEpicPresetStmt.get(id);
    if (!row) {
      return res.status(404).json({ error: "Epic preset not found" });
    }

    try {
      const preset = mapEpicPresetRow(row);
      const rawJql = await resolvePresetJql({ preset, jiraRequest });
      if (!rawJql) {
        return res.status(422).json({ error: "No JQL configured for this epic preset." });
      }
      const { scope: scopeJql } = splitTrailingOrderBy(rawJql);
      return res.json({ scopeJql });
    } catch (error) {
      log.error(`scope-jql for preset ${id} failed`, error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: "Failed to resolve preset JQL",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.delete("/api/epic-presets/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = getEpicPresetStmt.get(id);
    if (!existing) {
      return res.status(404).json({ error: "Epic preset not found" });
    }

    deleteEpicPresetStmt.run(id);
    log.info(`deleted epic preset ${id}`);
    return res.json({ ok: true, id });
  });

  app.get("/api/epic-presets/export", (_req, res) => {
    const items = listEpicPresetsStmt.all().map(mapEpicPresetRow);
    return res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      presets: items.map((preset) => ({
        presetType: preset.presetType,
        epicKey: preset.epicKey,
        epicName: preset.epicName,
        label: preset.label,
        jiraFilterId: preset.jiraFilterId,
        jql: preset.jql,
        sortOrder: preset.sortOrder,
      })),
    });
  });

  app.post("/api/epic-presets/import", (req, res) => {
    const incoming = Array.isArray(req.body?.presets) ? req.body.presets : [];
    const mode = req.body?.mode === "replace" ? "replace" : "merge";

    if (incoming.length === 0) {
      return res.status(400).json({ error: "No presets provided" });
    }

    if (mode === "replace") {
      db.prepare("DELETE FROM epic_presets").run();
    }

    const presetFingerprint = (preset) =>
      [
        String(preset.presetType || "").trim(),
        String(preset.epicKey || "").trim(),
        String(preset.jql || "").trim(),
        String(preset.epicName || preset.label || "").trim(),
      ].join("|");

    const existingFingerprints = new Set(
      mode === "merge"
        ? listEpicPresetsStmt.all().map((row) => presetFingerprint(mapEpicPresetRow(row)))
        : []
    );

    let imported = 0;
    let skipped = 0;

    for (const raw of incoming) {
      const payload = normalizeEpicPresetPayload({
        presetType: raw?.presetType,
        epicKey: raw?.epicKey,
        epicName: raw?.epicName || raw?.label,
        jiraFilterId: raw?.jiraFilterId,
        jql: raw?.jql,
        sortOrder: raw?.sortOrder,
      });

      if (payload.error) {
        skipped += 1;
        continue;
      }

      const fp = presetFingerprint(payload);
      if (mode === "merge" && existingFingerprints.has(fp)) {
        skipped += 1;
        continue;
      }

      insertEpicPresetStmt.run(payload);
      existingFingerprints.add(fp);
      imported += 1;
    }

    log.info(`preset import: ${imported} imported, ${skipped} skipped (mode=${mode})`);
    return res.json({
      ok: true,
      imported,
      skipped,
      items: listEpicPresetsStmt.all().map(mapEpicPresetRow),
    });
  });

  app.get("/api/jira/filters/favourite", async (_req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      const result = await jiraRequest({ pathWithQuery: "/rest/api/3/filter/favourite" });
      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }

      const filters = Array.isArray(result.data) ? result.data : [];
      return res.json({
        items: filters.map((filter) => ({
          id: String(filter.id || ""),
          name: String(filter.name || "").trim(),
          jql: String(filter.jql || "").trim(),
          owner: filter.owner?.displayName || filter.owner?.name || "",
        })),
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to list favourite Jira filters",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/jira/filters/:id", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const filterId = String(req.params.id || "").trim();
    if (!filterId) {
      return res.status(400).json({ error: "Filter id is required" });
    }

    try {
      const result = await jiraRequest({
        pathWithQuery: `/rest/api/3/filter/${encodeURIComponent(filterId)}`,
      });
      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }

      const filter = result.data || {};
      return res.json({
        id: String(filter.id || filterId),
        name: String(filter.name || "").trim(),
        jql: String(filter.jql || "").trim(),
        owner: filter.owner?.displayName || filter.owner?.name || "",
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to load Jira filter",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/epic-filters/run", async (req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    const epicPresetIds = Array.isArray(req.body?.epicPresetIds)
      ? req.body.epicPresetIds.map((value) => Number(value)).filter((value) => value > 0)
      : [];
    const includePastDue = Boolean(req.body?.includePastDue);
    const maxResults = Math.min(1000, Math.max(1, Number(req.body?.maxResults || 200)));

    if (epicPresetIds.length === 0 && !includePastDue) {
      return res.status(400).json({
        error: "Select at least one epic preset or Past Due Projects",
      });
    }

    const settings = readSettingsMap();
    const epicPastDueMode = EPIC_PAST_DUE_MODES.has(settings.epic_past_due_mode)
      ? settings.epic_past_due_mode
      : "either";
    const mappingsByRole = buildFieldMappingsMap(listFieldMappingsStmt.all());

    const selectedPresets = epicPresetIds
      .map((id) => getEpicPresetStmt.get(id))
      .filter(Boolean)
      .map(mapEpicPresetRow);

    const runs = [];
    let runIndex = 0;

    for (const preset of selectedPresets) {
      let jql = "";
      let resolveError = null;

      try {
        jql = await resolvePresetJql({ preset, jiraRequest });
      } catch (error) {
        resolveError =
          error instanceof Error ? error.message : "Failed to resolve preset JQL";
      }

      if (!jql) {
        runs.push({
          index: runIndex,
          label: preset.label,
          presetId: preset.id,
          jql: "",
          issues: [],
          total: 0,
          error: resolveError || "No JQL configured for this epic preset.",
        });
        runIndex += 1;
        continue;
      }

      try {
        const searchResult = await runJiraSearchRequest(jql, maxResults);
        if (!searchResult.ok) {
          const message =
            searchResult.data?.errorMessages?.join(" ") ||
            searchResult.data?.error ||
            searchResult.data?.message ||
            "Failed to run query";
          runs.push({
            index: runIndex,
            label: preset.label,
            presetId: preset.id,
            jql,
            issues: [],
            total: 0,
            error: message,
          });
        } else {
          runs.push({
            index: runIndex,
            label: preset.label,
            presetId: preset.id,
            jql,
            issues: searchResult.data?.issues || [],
            total: Number(
              searchResult.data?.total ?? searchResult.data?.issues?.length ?? 0
            ),
            error: null,
          });
        }
      } catch (error) {
        runs.push({
          index: runIndex,
          label: preset.label,
          presetId: preset.id,
          jql,
          issues: [],
          total: 0,
          error: error instanceof Error ? error.message : "Failed to run query",
        });
      }

      runIndex += 1;
    }

    if (includePastDue) {
      const epicKeys = selectedPresets.map((preset) => preset.epicKey).filter(Boolean);
      const jql = buildPastDueJql({
        mappingsByRole,
        epicPastDueMode,
        epicKeys,
        pastDueFloorDate: computePastDueFloorDate(1),
      });

      try {
        const searchResult = await runJiraSearchRequest(jql, maxResults);
        if (!searchResult.ok) {
          const message =
            searchResult.data?.errorMessages?.join(" ") ||
            searchResult.data?.error ||
            searchResult.data?.message ||
            "Failed to run past-due query";
          runs.push({
            index: runIndex,
            label: "Past Due Projects",
            presetId: null,
            jql,
            issues: [],
            total: 0,
            error: message,
          });
        } else {
          runs.push({
            index: runIndex,
            label: "Past Due Projects",
            presetId: null,
            jql,
            issues: searchResult.data?.issues || [],
            total: Number(
              searchResult.data?.total ?? searchResult.data?.issues?.length ?? 0
            ),
            error: null,
          });
        }
      } catch (error) {
        runs.push({
          index: runIndex,
          label: "Past Due Projects",
          presetId: null,
          jql,
          issues: [],
          total: 0,
          error: error instanceof Error ? error.message : "Failed to run past-due query",
        });
      }
    }

    return res.json({ runs });
  });

  app.get("/api/jira/field-mappings", (_req, res) => {
    const items = listFieldMappingsStmt.all().map((row) => ({
      role: row.role,
      fieldId: String(row.field_id || "").trim(),
      fieldName: String(row.field_name || "").trim(),
      updatedAt: row.updated_at,
    }));
    return res.json({ items });
  });

  app.put("/api/jira/field-mappings", (req, res) => {
    const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
    if (mappings.length === 0) {
      return res.status(400).json({ error: "Provide mappings array" });
    }

    for (const item of mappings) {
      const role = String(item?.role || "").trim();
      const fieldName = String(item?.fieldName || "").trim();
      if (!role || !fieldName) {
        return res.status(400).json({ error: "Each mapping needs role and fieldName" });
      }

      upsertFieldMappingStmt.run({
        role,
        fieldId: String(item?.fieldId || "").trim(),
        fieldName,
      });
    }

    const items = listFieldMappingsStmt.all().map((row) => ({
      role: row.role,
      fieldId: String(row.field_id || "").trim(),
      fieldName: String(row.field_name || "").trim(),
      updatedAt: row.updated_at,
    }));
    return res.json({ items });
  });

  app.post("/api/jira/field-mappings/sync", async (_req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      const result = await jiraRequest({ pathWithQuery: "/rest/api/3/field" });
      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }

      const fields = Array.isArray(result.data) ? result.data : [];
      const byName = new Map(
        fields.map((field) => [String(field.name || "").trim().toLowerCase(), field])
      );

      const current = listFieldMappingsStmt.all();
      for (const row of current) {
        const match = byName.get(String(row.field_name || "").trim().toLowerCase());
        if (match?.id) {
          upsertFieldMappingStmt.run({
            role: row.role,
            fieldId: String(match.id),
            fieldName: String(match.name || row.field_name),
          });
        }
      }

      const items = listFieldMappingsStmt.all().map((mapping) => ({
        role: mapping.role,
        fieldId: String(mapping.field_id || "").trim(),
        fieldName: String(mapping.field_name || "").trim(),
        updatedAt: mapping.updated_at,
      }));

      return res.json({ items, synced: true });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to sync Jira fields",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/jira/fields", async (_req, res) => {
    if (!ensureEnvOrRespond(res)) {
      return;
    }

    try {
      const result = await jiraRequest({ pathWithQuery: "/rest/api/3/field" });
      if (!result.ok) {
        return res.status(result.status).json(result.data);
      }

      const fields = Array.isArray(result.data) ? result.data : [];
      return res.json({
        items: fields.map((field) => ({
          id: field.id,
          name: field.name,
          custom: Boolean(field.custom),
        })),
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to list Jira fields",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/settings", (_req, res) => {
    return res.json({ settings: readSettingsMap() });
  });

  app.put("/api/settings", (req, res) => {
    const settings = req.body?.settings;
    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "Provide settings object" });
    }

    for (const [key, value] of Object.entries(settings)) {
      const normalizedKey = String(key).trim();
      if (!normalizedKey) {
        continue;
      }

      if (normalizedKey === "epic_past_due_mode") {
        const mode = String(value || "").trim();
        if (!EPIC_PAST_DUE_MODES.has(mode)) {
          return res.status(400).json({
            error: "Invalid epic_past_due_mode",
            allowed: [...EPIC_PAST_DUE_MODES],
          });
        }
      }

      upsertSettingStmt.run({
        key: normalizedKey,
        value: String(value ?? ""),
      });
    }

    return res.json({ settings: readSettingsMap() });
  });

  app.get("/api/reminders", (_req, res) => {
    return res.json({ items: readReminders() });
  });

  app.put("/api/reminders", (req, res) => {
    const incoming = Array.isArray(req.body?.reminders) ? req.body.reminders : [];
    const rows = Array.from({ length: REMINDER_SLOT_COUNT }, (_, index) => ({
      slotIndex: index,
      text: String(incoming[index]?.text || "").slice(0, REMINDER_TEXT_MAX_LENGTH),
      done: incoming[index]?.done ? 1 : 0,
    }));

    saveRemindersTxn(rows);
    return res.json({ items: readReminders() });
  });

  app.get("/api/watched-assignees", (_req, res) => {
    const items = listWatchedAssigneesStmt.all().map(mapWatchedAssigneeRow);
    return res.json({ items });
  });

  app.post("/api/watched-assignees", (req, res) => {
    const payload = normalizeWatchedPayload(req.body);
    if (payload.error) {
      return res.status(400).json(payload);
    }

    const result = insertWatchedAssigneeStmt.run(payload);
    const row = getWatchedAssigneeStmt.get(result.lastInsertRowid);
    return res.status(201).json(mapWatchedAssigneeRow(row));
  });

  app.put("/api/watched-assignees/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = getWatchedAssigneeStmt.get(id);
    if (!existing) {
      return res.status(404).json({ error: "Watched assignee not found" });
    }

    const payload = normalizeWatchedPayload(req.body, existing);
    if (payload.error) {
      return res.status(400).json(payload);
    }

    updateWatchedAssigneeStmt.run({ id, ...payload });
    return res.json(mapWatchedAssigneeRow(getWatchedAssigneeStmt.get(id)));
  });

  app.delete("/api/watched-assignees/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = getWatchedAssigneeStmt.get(id);
    if (!existing) {
      return res.status(404).json({ error: "Watched assignee not found" });
    }

    deleteWatchedAssigneeStmt.run(id);
    return res.json({ ok: true, id });
  });
};
