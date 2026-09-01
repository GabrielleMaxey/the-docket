import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import { initDatabase } from "../server/db/schema.mjs";
import { JQL_PRESET_TEMPLATES } from "../src/utils/jqlPresetTemplates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const DEFAULT_PRESETS_FILE = path.join(projectRoot, "presets", "pilot-presets.json");
const JQL_PRESET_KEY = "JQL";

dotenv.config({ path: path.join(projectRoot, ".env") });

const normalizeJql = (value) => String(value || "").replace(/\s+/g, " ").trim();

const loadPresetCatalog = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const presets = Array.isArray(parsed?.presets) ? parsed.presets : [];

  return presets.map((preset, index) => {
    const presetType = String(preset.presetType || "jql").trim();
    const label = String(preset.label || preset.epicName || "").trim();
    const jql = normalizeJql(preset.jql);
    const epicKey = presetType === "jql" ? JQL_PRESET_KEY : String(preset.epicKey || "").trim();
    const sortOrder = Number(preset.sortOrder ?? index + 1);

    return {
      presetType,
      label,
      epicName: label,
      epicKey,
      jql,
      jiraFilterId: String(preset.jiraFilterId || "").trim(),
      sortOrder,
    };
  });
};

const loadDefaultUserJqlPresets = () =>
  JQL_PRESET_TEMPLATES.map((template, index) => ({
    presetType: "jql",
    label: String(template.label || "").trim(),
    epicName: String(template.label || "").trim(),
    epicKey: JQL_PRESET_KEY,
    jql: normalizeJql(template.jql),
    jiraFilterId: "",
    sortOrder: index + 1,
  }));

const loadFullCatalog = (filePath) => {
  const defaults = loadDefaultUserJqlPresets();
  const fromFile = loadPresetCatalog(filePath).map((preset, index) => ({
    ...preset,
    sortOrder: defaults.length + index + 1,
  }));
  return [...defaults, ...fromFile];
};

const parseArgs = (argv) => {
  const options = {
    all: false,
    list: false,
    labels: [],
    force: false,
    via: "auto",
    file: DEFAULT_PRESETS_FILE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") {
      options.all = true;
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--via" && argv[i + 1]) {
      options.via = String(argv[++i]).trim().toLowerCase();
    } else if (arg === "--file" && argv[i + 1]) {
      options.file = path.resolve(argv[++i]);
    } else if (arg === "--labels" && argv[i + 1]) {
      options.labels = String(argv[++i])
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }

  return options;
};

const resolveDbPath = () => {
  const userDataRoot = String(process.env.TASK_MANAGER_USER_DATA || "").trim();
  const dbDir = userDataRoot
    ? path.join(userDataRoot, "data")
    : path.join(projectRoot, "data");
  fs.mkdirSync(dbDir, { recursive: true });
  return path.join(dbDir, "workweek.sqlite");
};

const openDatabase = (dbPath, { readonly = false } = {}) => {
  try {
    const db = new Database(dbPath, { readonly });
    if (!readonly) {
      initDatabase(db);
    }
    return db;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("NODE_MODULE_VERSION")) {
      throw new Error(
        "better-sqlite3 is not built for this Node version. Run `npm rebuild better-sqlite3`, start the API (`npm run dev:api`), or use `--via api`."
      );
    }
    throw error;
  }
};

const listExistingPresetsFromDb = (dbPath) => {
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  const db = openDatabase(dbPath, { readonly: true });
  try {
    return db
      .prepare("SELECT id, epic_name, jql, preset_type FROM epic_presets ORDER BY sort_order ASC, id ASC")
      .all();
  } finally {
    db.close();
  }
};

const listExistingPresetsFromApi = async (apiBase) => {
  const response = await fetch(`${apiBase}/api/epic-presets`);
  if (!response.ok) {
    throw new Error(`GET /api/epic-presets failed (${response.status})`);
  }

  const data = await response.json();
  return Array.isArray(data?.items) ? data.items : [];
};

const findExistingMatch = (existing, preset) => {
  const label = preset.label.toLowerCase();
  return existing.find((row) => {
    const rowLabel = String(row.epic_name || row.label || "").trim().toLowerCase();
    return rowLabel === label;
  });
};

const upsertPresetViaDb = ({ dbPath, preset, existing, force }) => {
  const db = openDatabase(dbPath);
  try {
    const match = findExistingMatch(existing, preset);
    if (match && !force) {
      const existingJql = normalizeJql(match.jql);
      if (existingJql === preset.jql) {
        return { action: "skipped", reason: "already exists" };
      }
      return { action: "skipped", reason: "label exists with different JQL (use --force)" };
    }

    if (match && force) {
      db.prepare(`
        UPDATE epic_presets SET
          epic_key = @epicKey,
          epic_name = @epicName,
          jira_filter_id = @jiraFilterId,
          jql = @jql,
          preset_type = @presetType,
          sort_order = @sortOrder,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `).run({
        id: match.id,
        epicKey: preset.epicKey,
        epicName: preset.epicName,
        jiraFilterId: preset.jiraFilterId,
        jql: preset.jql,
        presetType: preset.presetType,
        sortOrder: preset.sortOrder,
      });
      return { action: "updated", id: match.id };
    }

    const result = db.prepare(`
      INSERT INTO epic_presets (epic_key, epic_name, jira_filter_id, jql, preset_type, sort_order, updated_at)
      VALUES (@epicKey, @epicName, @jiraFilterId, @jql, @presetType, @sortOrder, CURRENT_TIMESTAMP)
    `).run({
      epicKey: preset.epicKey,
      epicName: preset.epicName,
      jiraFilterId: preset.jiraFilterId,
      jql: preset.jql,
      presetType: preset.presetType,
      sortOrder: preset.sortOrder,
    });

    return { action: "created", id: Number(result.lastInsertRowid) };
  } finally {
    db.close();
  }
};

const upsertPresetViaApi = async ({ apiBase, preset, existing, force }) => {
  const match = findExistingMatch(existing, preset);
  if (match && !force) {
    const existingJql = normalizeJql(match.jql);
    if (existingJql === preset.jql) {
      return { action: "skipped", reason: "already exists" };
    }
    return { action: "skipped", reason: "label exists with different JQL (use --force)" };
  }

  const body = {
    presetType: preset.presetType,
    epicName: preset.epicName,
    epicKey: preset.presetType === "jql" ? undefined : preset.epicKey,
    jql: preset.jql,
    jiraFilterId: preset.jiraFilterId,
    sortOrder: preset.sortOrder,
  };

  if (match && force) {
    const response = await fetch(`${apiBase}/api/epic-presets/${match.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Update failed for "${preset.label}" (${response.status}): ${detail}`);
    }
    return { action: "updated", id: match.id };
  }

  const response = await fetch(`${apiBase}/api/epic-presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Create failed for "${preset.label}" (${response.status}): ${detail}`);
  }

  const created = await response.json();
  return { action: "created", id: created.id };
};

const printCatalog = (presets) => {
  console.log("\nAvailable pilot presets:\n");
  for (let i = 0; i < presets.length; i += 1) {
    const preset = presets[i];
    console.log(`  ${i + 1}. ${preset.label} (${preset.presetType})`);
    console.log(`     ${preset.jql.slice(0, 120)}${preset.jql.length > 120 ? "…" : ""}`);
  }
  console.log("");
};

const pickPresetsInteractively = async (presets) => {
  printCatalog(presets);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    "Enter preset numbers to add (e.g. 1,3,5), names, or 'all': "
  );
  rl.close();

  const trimmed = String(answer || "").trim();
  if (!trimmed) {
    return [];
  }

  if (/^all$/i.test(trimmed)) {
    return presets;
  }

  const selected = new Map();
  for (const token of trimmed.split(/[,\s]+/).filter(Boolean)) {
    const asNumber = Number(token);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= presets.length) {
      selected.set(presets[asNumber - 1].label, presets[asNumber - 1]);
      continue;
    }

    const match = presets.find((preset) => preset.label.toLowerCase() === token.toLowerCase());
    if (match) {
      selected.set(match.label, match);
    }
  }

  return [...selected.values()];
};

const selectPresets = async (catalog, options) => {
  if (options.all) {
    return catalog;
  }

  if (options.labels.length > 0) {
    const wanted = new Set(options.labels.map((label) => label.toLowerCase()));
    return catalog.filter((preset) => wanted.has(preset.label.toLowerCase()));
  }

  if (process.stdin.isTTY) {
    return await pickPresetsInteractively(catalog);
  }

  console.error("No presets selected. Use --all, --labels, or run interactively in a terminal.");
  return [];
};

const resolveApiBase = () => {
  const port = String(process.env.API_PORT || "8787").trim();
  return `http://127.0.0.1:${port}`;
};

const loadExisting = async ({ via, apiBase, dbPath }) => {
  if (via === "db") {
    return { existing: listExistingPresetsFromDb(dbPath), mode: "db" };
  }

  if (via === "api") {
    return { existing: await listExistingPresetsFromApi(apiBase), mode: "api" };
  }

  try {
    const health = await fetch(`${apiBase}/api/health`);
    if (health.ok) {
      return { existing: await listExistingPresetsFromApi(apiBase), mode: "api" };
    }
  } catch {
    // Fall back to SQLite.
  }

  return { existing: listExistingPresetsFromDb(dbPath), mode: "db" };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(options.file)) {
    console.error(`Preset file not found: ${options.file}`);
    process.exit(1);
  }

  const catalog = loadFullCatalog(options.file);
  if (catalog.length === 0) {
    console.error("No presets found in catalog file.");
    process.exit(1);
  }

  if (options.list) {
    printCatalog(catalog);
    return;
  }

  const selected = await selectPresets(catalog, options);
  if (selected.length === 0) {
    process.exit(0);
  }

  const apiBase = resolveApiBase();
  const dbPath = resolveDbPath();
  const { existing, mode } = await loadExisting({
    via: options.via,
    apiBase,
    dbPath,
  });

  console.log(`Seeding ${selected.length} preset(s) via ${mode}...`);

  const results = [];
  for (const preset of selected) {
    if (preset.presetType === "jql" && !preset.jql) {
      results.push({ label: preset.label, action: "error", reason: "missing jql" });
      continue;
    }

    if (preset.presetType === "epic" && !preset.epicKey) {
      results.push({ label: preset.label, action: "error", reason: "missing epicKey" });
      continue;
    }

    try {
      const result =
        mode === "api"
          ? await upsertPresetViaApi({ apiBase, preset, existing, force: options.force })
          : upsertPresetViaDb({ dbPath, preset, existing, force: options.force });

      results.push({ label: preset.label, ...result });

      if (result.action === "created" || result.action === "updated") {
        existing.push({
          id: result.id,
          epic_name: preset.label,
          label: preset.label,
          jql: preset.jql,
        });
      }
    } catch (error) {
      results.push({
        label: preset.label,
        action: "error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const result of results) {
    if (result.action === "error") {
      console.error(`✗ ${result.label}: ${result.reason}`);
    } else if (result.action === "skipped") {
      console.log(`• ${result.label}: skipped (${result.reason})`);
    } else {
      console.log(`✓ ${result.label}: ${result.action} (id ${result.id})`);
    }
  }

  const errors = results.filter((result) => result.action === "error");
  if (errors.length > 0) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
