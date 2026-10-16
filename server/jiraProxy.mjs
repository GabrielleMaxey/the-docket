import { openCombinedWorkStore, createCombinedWorkOperations } from "./lib/combinedWorkStore.mjs";
import { createSiteOperationState } from "./lib/siteOperationState.mjs";
import express from "express";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { initDatabase } from "./db/schema.mjs";
import { openTodoDatabase, migratePersonalTodos, listTodoSources } from "./db/todoDatabase.mjs";
import { registerAppConfigRoutes } from "./routes/appConfigRoutes.mjs";
import { registerDashboardRoutes } from "./routes/dashboardRoutes.mjs";
import { registerReportRoutes } from "./routes/reportRoutes.mjs";
import { registerChatRoutes } from "./routes/chatRoutes.mjs";
import { registerJiraCoreRoutes } from "./routes/jiraCoreRoutes.mjs";
import { registerJiraInstanceRoutes } from "./routes/jiraInstanceRoutes.mjs";
import { registerJiraIssueRoutes } from "./routes/jiraIssueRoutes.mjs";
import { registerIssueMetadataRoutes } from "./routes/issueMetadataRoutes.mjs";
import { registerEpicWorkloadRoutes } from "./routes/epicWorkloadRoutes.mjs";
import { registerCapacityPlanningRoutes } from "./routes/capacityPlanningRoutes.mjs";
import { initializeTeamPrioritySettings } from "./lib/teamPriorityPostgres.mjs";
import { registerTeamPriorityRoutes } from "./routes/teamPriorityRoutes.mjs";
import { registerPmAsksRoutes } from "./routes/pmAsksRoutes.mjs";
import { registerTaskExportRoutes } from "./routes/taskExportRoutes.mjs";
import { registerCombinedOpenWorkRoutes } from "./routes/combinedOpenWorkRoutes.mjs";
import { registerTodoRoutes } from "./routes/todoRoutes.mjs";
import { registerAttachmentRoutes } from "./routes/attachmentRoutes.mjs";
import { createLogger } from "./lib/logger.mjs";
import { createJiraRouteContext } from "./lib/jiraRouteContext.mjs";
import { createSavedSiteOperations } from "./lib/savedSiteOperations.mjs";
import {
  openInstancesMetaDb,
  initInstancesSchema,
  seedInstancesFromEnv,
  seedInstanceAppDbFromLegacyIfNeeded,
  resolveJiraCredentials,
  legacyAppDbPath,
  appDbPathForInstance,
  noteImagesDirFor,
  setActiveInstanceId,
  MAX_JIRA_INSTANCES,
} from "./lib/jiraInstances.mjs";

import { localRequestPolicy } from "./lib/localRequestPolicy.mjs";

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

app.use(localRequestPolicy({
  apiPort: port,
  allowedOrigins: [
    "http://localhost:5173", "http://127.0.0.1:5173",
    `http://localhost:${port}`, `http://127.0.0.1:${port}`,
    ...String(process.env.DOCKET_ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean),
  ],
}));

app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'", "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' blob: data:", "media-src 'self' blob: data:",
    "connect-src 'self' https://icanhazdadjoke.com https://v2.jokeapi.dev",
    "frame-src 'self' blob:", "object-src 'none'", "base-uri 'none'",
    "form-action 'self'", "frame-ancestors 'none'",
  ].join("; "));
  next();
});

app.use(express.json({ limit: "5mb" }));

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

// ─── Database ─────────────────────────────────────────────────────────────────

const userDataRoot = String(process.env.TASK_MANAGER_USER_DATA || "").trim();
const dbDir = userDataRoot
  ? path.join(userDataRoot, "data")
  : path.resolve(projectRoot, "data");
fs.mkdirSync(dbDir, { recursive: true });

const metaDb = openInstancesMetaDb(path.join(dbDir, "instances-meta.sqlite"));
initInstancesSchema(metaDb);
initializeTeamPrioritySettings(metaDb);

// Only auto-seed when an explicit multi-instance env var is present. Bare legacy
// JIRA_BASE_URL/EMAIL/API_TOKEN alone must keep the registry empty so existing
// installs keep resolving to "legacy" mode and the pre-existing workweek.sqlite.
const hasExplicitInstanceEnv = Array.from({ length: MAX_JIRA_INSTANCES }, (_, i) => i + 1).some(
  (n) => String(process.env[`JIRA_INSTANCE_${n}_BASE_URL`] || "").trim()
);
if (hasExplicitInstanceEnv) {
  seedInstancesFromEnv(metaDb, process.env);
}

const todoDb = openTodoDatabase(dbDir);
const combinedWorkDb = openCombinedWorkStore(dbDir);
let todoMigrationStatus = { unresolved: [] };

const runtime = {
  db: null,
  noteImagesDir: null,
  dbPath: null,
};

const openAppDbForCurrent = () => {
  const creds = resolveJiraCredentials(metaDb, process.env);
  if (creds.mode === "instance" && creds.instanceId) {
    const seed = seedInstanceAppDbFromLegacyIfNeeded(metaDb, dbDir, creds.instanceId);
    if (seed.seeded) {
      log.info(`Seeded instance DB from legacy workweek.sqlite for ${creds.instanceId}`);
    }
  }
  const nextPath =
    creds.mode === "instance" && creds.instanceId
      ? appDbPathForInstance(dbDir, creds.instanceId)
      : legacyAppDbPath(dbDir);

  try {
    if (runtime.db) {
      try {
        runtime.db.pragma("wal_checkpoint(TRUNCATE)");
      } catch {
        /* ignore */
      }
      try {
        runtime.db.close();
      } catch {
        /* ignore */
      }
    }
    runtime.credentials = Object.freeze({ ...creds });
    runtime.dbPath = nextPath;
    runtime.db = new Database(nextPath);
    runtime.db.pragma("journal_mode = WAL");
    // Inspect the original schema before initDatabase can erase reminder-conversion evidence.
    todoMigrationStatus = migratePersonalTodos(todoDb, listTodoSources(metaDb, dbDir));
    initDatabase(runtime.db);
    runtime.noteImagesDir = noteImagesDirFor(dbDir, creds.mode === "instance" ? creds.instanceId : null);
    fs.mkdirSync(runtime.noteImagesDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Failed to open SQLite database at " + nextPath);
    log.error(message);
    if (message.includes("NODE_MODULE_VERSION")) {
      log.error("better-sqlite3 must match your Node version. Run: npm rebuild better-sqlite3");
      log.error("Or start the API via: npm run dev:api (rebuilds automatically)");
    }
    process.exit(1);
  }
};

openAppDbForCurrent();

const siteOperations = createSiteOperationState({
  snapshot: runtime,
  activate: (id) => {
    setActiveInstanceId(metaDb, id);
    openAppDbForCurrent();
    return runtime;
  },
});
const getDb = () => siteOperations.getSnapshot().db;

// ─── Shared helpers (passed into route modules) ───────────────────────────────

const getCredentials = () => siteOperations.getSnapshot().credentials;

const activeRouteContext = createJiraRouteContext({ getCredentials, getDb,
  getNoteImagesDir: () => siteOperations.getSnapshot().noteImagesDir,
  getSiteContext: siteOperations.getSiteContext,
});
const { getMissingEnv } = activeRouteContext;
const savedSiteOperations = createSavedSiteOperations({ metaDb, dataDir: dbDir,
  withSiteOperation: siteOperations.withSiteOperation,
});
const combinedWorkOperations = createCombinedWorkOperations({ getCombinedWorkDb: () => combinedWorkDb,
  withSiteOperation: savedSiteOperations.withSavedSiteOperation, metaDb,
});
app.use(combinedWorkOperations.rejectUnsupportedCombinedWorkOperation);
// Explicit saved headers must never reach an unrelated endpoint using the active site.
app.use(savedSiteOperations.rejectUnsupportedSavedSiteOperation);

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  const missing = getMissingEnv();
  const c = getCredentials();
  res.json({
    ok: missing.length === 0,
    service: "jira-proxy",
    version: PROXY_VERSION,
    jiraBaseUrl: c.baseUrl || "",
    jiraInstanceId: c.instanceId,
    siteContext: siteOperations.getSiteContext(),
    jiraInstanceName: c.displayName || "",
    legacyMode: c.mode === "legacy",
    searchEndpoint: JIRA_SEARCH_JQL_PATH,
    missingEnv: missing,
  });
});

// ─── Mount all route modules ──────────────────────────────────────────────────

const routeCtx = {
  ...activeRouteContext,
  ...siteOperations,
  dataDir: dbDir,
  metaDb,
  getCombinedWorkDb: () => combinedWorkDb,
  withSiteOperation: combinedWorkOperations.withCombinedWorkOperation,
};

registerTaskExportRoutes(app, routeCtx);
registerCombinedOpenWorkRoutes(app, routeCtx);
registerJiraInstanceRoutes(app, routeCtx);
registerJiraCoreRoutes(app, routeCtx);
registerJiraIssueRoutes(app, routeCtx);
registerIssueMetadataRoutes(app, routeCtx);
registerEpicWorkloadRoutes(app, routeCtx);
registerCapacityPlanningRoutes(app, routeCtx);
registerTeamPriorityRoutes(app, routeCtx);
registerPmAsksRoutes(app, routeCtx);
registerTodoRoutes(app, { getDb: () => todoDb, getMigrationStatus: () => todoMigrationStatus });
registerAttachmentRoutes(app, routeCtx);
registerAppConfigRoutes(app, routeCtx);
registerDashboardRoutes(app, routeCtx);
registerReportRoutes(app, routeCtx);
registerChatRoutes(app, routeCtx);

// ─── Static (production packaged build) ──────────────────────────────────────

const distDir = path.resolve(projectRoot, "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res) => {
    // Never mask missing API routes with the SPA shell — that looks like an empty success to clients.
    if (String(req.path || "").startsWith("/api/")) {
      return res.status(404).json({
        error: "API route not found",
        path: req.path,
        method: req.method,
      });
    }
    return res.sendFile(path.join(distDir, "index.html"));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(port, "127.0.0.1", () => {
  log.info(`Jira proxy listening on http://127.0.0.1:${port}`);
  log.info(`Database: ${runtime.dbPath}`);
  const missing = getMissingEnv();
  if (missing.length > 0) {
    log.warn(`Missing env vars: ${missing.join(", ")} — Jira calls will fail`);
  } else {
    log.info(`Jira base URL: ${getCredentials().baseUrl}`);
  }
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    log.error(`Port ${port} is already in use. Stop the other process, then retry.`);
    log.error(`Hint: lsof -nP -iTCP:${port} -sTCP:LISTEN`);
    process.exit(1);
  }
  log.error("Server failed to start", error instanceof Error ? error.message : error);
  process.exit(1);
});
