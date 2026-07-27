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
import { getJiraSearchFields } from "./lib/jiraSearchFields.mjs";
import { createLogger } from "./lib/logger.mjs";
import {
  hasOnlyWorkfrontJiraErrors,
  sanitizeJiraErrorData,
} from "../shared/jiraErrorUtils.mjs";

const log = createLogger("server");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const loadEnvFiles = () => {
  const userDataRoot = String(process.env.TASK_MANAGER_USER_DATA || "").trim();
  dotenv.config({ path: path.join(projectRoot, ".env") });

  if (userDataRoot) {
    dotenv.config({ path: path.join(userDataRoot, ".env"), override: true });
  }
};

loadEnvFiles();

const app = express();
const port = Number(process.env.API_PORT || 8787);

// Electron dev loads the UI from localhost:5173 while the API runs on :8787 — allow that cross-origin traffic.
app.use((req, res, next) => {
  const origin = String(req.headers.origin || "").trim();
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

// Request logger — records method, path, and response status/duration.
const reqLog = createLogger("http");

const HTTP_DEBUG_ONLY_PATHS = new Set(["/api/jira/users/search"]);

const truncateForLog = (value, max = 80) => {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};

const formatHttpLogMessage = (req, statusCode, ms) => {
  if (req.path === "/api/jira/search" || req.path === "/api/jira/search/all") {
    const jql = truncateForLog(req.body?.jql || req.query?.jql);
    if (jql) {
      return `JQL search → ${statusCode} (${ms}ms) — ${jql}`;
    }
  }

  if (req.path === "/api/epic-filters/run") {
    const presetCount = Array.isArray(req.body?.epicPresetIds) ? req.body.epicPresetIds.length : 0;
    const pastDue = req.body?.includePastDue ? " + past due" : "";
    return `epic filter run → ${statusCode} (${ms}ms) — ${presetCount} preset${presetCount === 1 ? "" : "s"}${pastDue}`;
  }

  return `${req.method} ${req.path} → ${statusCode} (${ms}ms)`;
};

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const statusCode = res.statusCode;
    let level = "info";
    if (statusCode >= 500) {
      level = "error";
    } else if (statusCode >= 400) {
      level = "warn";
    } else if (HTTP_DEBUG_ONLY_PATHS.has(req.path)) {
      level = "debug";
    }

    reqLog[level](formatHttpLogMessage(req, statusCode, ms));
  });
  next();
});

const PROXY_VERSION = "2026-06-23-modular";
const JIRA_SEARCH_JQL_PATH = "/rest/api/3/search/jql";
const requiredEnv = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"];

// ─── Database ─────────────────────────────────────────────────────────────────

const userDataRoot = String(process.env.TASK_MANAGER_USER_DATA || "").trim();
const dbDir = userDataRoot
  ? path.join(userDataRoot, "data")
  : path.resolve(projectRoot, "data");
fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.resolve(dbDir, "workweek.sqlite");

let db;
try {
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  initDatabase(db);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  log.error("Failed to open SQLite database at " + dbPath);
  log.error(message);
  if (message.includes("NODE_MODULE_VERSION")) {
    log.error("better-sqlite3 must match your Node version. Run: npm rebuild better-sqlite3");
    log.error("Or start the API via: npm run dev:api (rebuilds automatically)");
  }
  process.exit(1);
}

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
    const sanitized = sanitizeJiraErrorData(data);
    if (hasOnlyWorkfrontJiraErrors(data)) {
      log.warn(`${method} ${target} → ${response.status} (Workfront sync error suppressed)`);
      return { ok: true, status: response.status, data: sanitized || {}, workfrontSuppressed: true };
    }

    const detail = sanitized?.errors || sanitized?.errorMessages || sanitized?.message;
    log.error(`${method} ${target} → ${response.status}`, detail ? JSON.stringify(detail) : "");
    return { ok: false, status: response.status, data: sanitized || {} };
  }
  log.debug(`${method} ${target} → ${response.status}`);
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
    fields: fields || getJiraSearchFields(db),
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

// ─── Mount all route modules ──────────────────────────────────────────────────

const routeCtx = {
  db,
  dataDir: dbDir,
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

const distDir = path.resolve(projectRoot, "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  log.info(`Jira proxy listening on http://localhost:${port}`);
  log.info(`Database: ${dbPath}`);
  const missing = getMissingEnv();
  if (missing.length > 0) {
    log.warn(`Missing env vars: ${missing.join(", ")} — Jira calls will fail`);
  } else {
    log.info(`Jira base URL: ${process.env.JIRA_BASE_URL}`);
  }
});
