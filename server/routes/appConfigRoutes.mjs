import { mapEpicPresetRow, mapWatchedAssigneeRow } from "../db/schema.mjs";
import {
  buildFieldMappingsMap,
  buildPastDueJql,
  resolvePresetJql,
} from "../lib/epicFilterJql.mjs";

const EPIC_PAST_DUE_MODES = new Set(["most_recent_done_date", "project_end_date", "either"]);
const WATCH_TYPES = new Set(["person", "jql"]);
const PRESET_TYPES = new Set(["epic", "jql"]);
const JQL_PRESET_KEY = "JQL";

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

  const listWatchedAssigneesStmt = db.prepare(
    "SELECT * FROM watched_assignees ORDER BY sort_order ASC, id ASC"
  );
  const getWatchedAssigneeStmt = db.prepare("SELECT * FROM watched_assignees WHERE id = ?");
  const insertWatchedAssigneeStmt = db.prepare(`
    INSERT INTO watched_assignees (display_name, resolved_account_id, watch_type, jql, sort_order)
    VALUES (@displayName, @resolvedAccountId, @watchType, @jql, @sortOrder)
  `);
  const updateWatchedAssigneeStmt = db.prepare(`
    UPDATE watched_assignees SET
      display_name = @displayName,
      resolved_account_id = @resolvedAccountId,
      watch_type = @watchType,
      jql = @jql,
      sort_order = @sortOrder
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

    return {
      displayName,
      watchType,
      jql: watchType === "jql" ? jql : "",
      resolvedAccountId: String(body?.resolvedAccountId ?? existing?.resolved_account_id ?? "").trim(),
      sortOrder: Number(body?.sortOrder ?? existing?.sort_order ?? 0),
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
    return res.json(mapEpicPresetRow(getEpicPresetStmt.get(id)));
  });

  app.delete("/api/epic-presets/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = getEpicPresetStmt.get(id);
    if (!existing) {
      return res.status(404).json({ error: "Epic preset not found" });
    }

    deleteEpicPresetStmt.run(id);
    return res.json({ ok: true, id });
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
