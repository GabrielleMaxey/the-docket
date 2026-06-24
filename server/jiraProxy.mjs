import express from "express";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { initDatabase } from "./db/schema.mjs";
import { registerAppConfigRoutes } from "./routes/appConfigRoutes.mjs";
import { registerDashboardRoutes } from "./routes/dashboardRoutes.mjs";
import { registerReportRoutes } from "./routes/reportRoutes.mjs";
import { registerChatRoutes } from "./routes/chatRoutes.mjs";
import { registerJiraCoreRoutes } from "./routes/jiraCoreRoutes.mjs";
import { registerJiraIssueRoutes } from "./routes/jiraIssueRoutes.mjs";
import { registerIssueMetadataRoutes } from "./routes/issueMetadataRoutes.mjs";
import { resolveJiraUser } from "./lib/jiraSearchHelpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const port = Number(process.env.API_PORT || 8787);

app.use(express.json());

const PROXY_VERSION = "2026-06-23-modular";
const JIRA_SEARCH_JQL_PATH = "/rest/api/3/search/jql";
const requiredEnv = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"];

// ─── Database ─────────────────────────────────────────────────────────────────

const dbDir = path.resolve(__dirname, "../data");
fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.resolve(dbDir, "workweek.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
initDatabase(db);

// ─── Shared helpers (passed into route modules) ───────────────────────────────

const getMissingEnv = () =>
  requiredEnv.filter((n) => !process.env[n] || !String(process.env[n]).trim());

const ensureEnvOrRespond = (res) => {
  const missing = getMissingEnv();
  if (missing.length > 0) {
    res.status(500).json({ error: "Missing required Jira environment variables", missing });
    return false;
  }
  return true;
};

const getAuthHeader = () => {
  const basic = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
  return `Basic ${basic}`;
};

const jiraRequest = async ({ method = "GET", pathWithQuery, body }) => {
  const target = `${process.env.JIRA_BASE_URL}${pathWithQuery}`;
  const response = await fetch(target, {
    method,
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      Authorization: getAuthHeader(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 500) }; }

  if (!response.ok) {
    console.error(`[jira] ${method} ${target} → ${response.status}`);
    return { ok: false, status: response.status, data: data || {} };
  }
  return { ok: true, status: response.status, data };
};

// Shared JQL search (used by route modules).
// Supports both call styles currently present in the codebase:
// 1) runJiraSearchRequest({ jql, maxResults, fields, nextPageToken, res })
// 2) runJiraSearchRequest(jql, { maxResults, fields, nextPageToken })
const runJiraSearchRequest = async (input, legacyOptions = {}) => {
  const payload =
    typeof input === "string"
      ? { jql: input, ...(legacyOptions || {}) }
      : (input || {});

  const {
    jql,
    maxResults = 200,
    fields,
    nextPageToken,
    res,
  } = payload;

  if (res && !ensureEnvOrRespond(res)) {
    return null;
  }

  const requestBody = {
    jql,
    maxResults,
    fields: fields || ["summary", "issuetype", "status", "assignee", "updated"],
    ...(nextPageToken ? { nextPageToken } : {}),
  };

  const result = await jiraRequest({
    method: "POST",
    pathWithQuery: JIRA_SEARCH_JQL_PATH,
    body: requestBody,
  });

  // Legacy inline handlers expect auto-response behavior and plain data.
  if (res) {
    if (!result.ok) {
      res.status(result.status).json(result.data);
      return null;
    }
    return result.data;
  }

  // Route modules and helpers expect a normalized { ok, status, data } object.
  return result;
};

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  const missing = getMissingEnv();
  res.json({
    ok: missing.length === 0,
    service: "jira-proxy",
    version: PROXY_VERSION,
    jiraBaseUrl: process.env.JIRA_BASE_URL || "",
    searchEndpoint: JIRA_SEARCH_JQL_PATH,
    missingEnv: missing,
  });
});

// ─── Legacy inline routes (issue metadata + basic search) ────────────────────

const clampDbPriority = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0;
};

const selectMetaStmt = db.prepare("SELECT issue_key, note, priority FROM issue_metadata WHERE issue_key = ?");
const upsertMetaStmt = db.prepare(`
  INSERT INTO issue_metadata (issue_key, note, priority, updated_at)
  VALUES (@issueKey, @note, @priority, CURRENT_TIMESTAMP)
  ON CONFLICT(issue_key) DO UPDATE SET
    note = excluded.note, priority = excluded.priority, updated_at = CURRENT_TIMESTAMP
`);

app.post("/api/jira/issue-metadata/bulk", (req, res) => {
  const keys = Array.isArray(req.body?.issueKeys)
    ? req.body.issueKeys.map((k) => String(k || "").trim()).filter(Boolean)
    : [];
  if (!keys.length) return res.json({ items: {} });
  const placeholders = keys.map(() => "?").join(",");
  const rows = db.prepare(`SELECT issue_key, note, priority FROM issue_metadata WHERE issue_key IN (${placeholders})`).all(...keys);
  const items = rows.reduce((acc, row) => {
    acc[row.issue_key] = { note: String(row.note || ""), priority: clampDbPriority(row.priority) };
    return acc;
  }, {});
  return res.json({ items });
});

app.put("/api/jira/issue-metadata/:issueKey", (req, res) => {
  const issueKey = String(req.params.issueKey || "").trim();
  if (!issueKey) return res.status(400).json({ error: "Missing issue key" });
  const current = selectMetaStmt.get(issueKey) || {};
  const hasNote = typeof req.body?.note === "string";
  const hasPriority = req.body?.priority !== undefined;
  if (!hasNote && !hasPriority) return res.status(400).json({ error: "Provide note or priority" });
  const note = hasNote ? String(req.body.note) : String(current.note || "");
  const priority = hasPriority ? clampDbPriority(req.body.priority) : clampDbPriority(current.priority);
  upsertMetaStmt.run({ issueKey, note, priority });
  return res.json({ ok: true, issueKey, note, priority });
});

app.post("/api/jira/search", async (req, res) => {
  const jql = String(req.body?.jql || "").trim();
  const maxResults = Number(req.body?.maxResults || 200);
  if (!jql) return res.status(400).json({ error: "Missing jql" });
  const data = await runJiraSearchRequest({ jql, maxResults, res });
  if (data) res.json(data);
});

app.get("/api/jira/search", async (req, res) => {
  const jql = String(req.query.jql || "").trim();
  const maxResults = Number(req.query.maxResults || 10);
  if (!jql) return res.status(400).json({ error: "Missing jql" });
  const data = await runJiraSearchRequest({ jql, maxResults, res });
  if (data) res.json(data);
});

// ─── Mount all route modules ──────────────────────────────────────────────────

const routeCtx = {
  db,
  jiraRequest,
  ensureEnvOrRespond,
  runJiraSearchRequest,
  resolveJiraUser,
};

registerJiraCoreRoutes(app, routeCtx);
registerJiraIssueRoutes(app, routeCtx);
registerIssueMetadataRoutes(app, routeCtx);
registerAppConfigRoutes(app, routeCtx);
registerDashboardRoutes(app, routeCtx);
registerReportRoutes(app, routeCtx);
registerChatRoutes(app, routeCtx);

// ─── Static (production packaged build) ──────────────────────────────────────

const distDir = path.resolve(__dirname, "../dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`Jira proxy listening on http://localhost:${port}`);
});
