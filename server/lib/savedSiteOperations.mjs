import { createHash } from "node:crypto";
import fs from "node:fs";
import Database from "better-sqlite3";
import { initDatabase } from "../db/schema.mjs";
import { appDbPathForInstance, beginInstanceOperations, getInstanceCredentials, listInstances, noteImagesDirFor } from "./jiraInstances.mjs";
import { createJiraRouteContext } from "./jiraRouteContext.mjs";

const changed = () => Object.assign(new Error("The saved Jira entry changed. Keep your drafts and reload before continuing."), {
  status: 409, code: "SAVED_SITE_CONTEXT_CHANGED",
});
const hasSavedHeaders = req => Object.hasOwn(req.headers, "x-docket-saved-site") || Object.hasOwn(req.headers, "x-docket-saved-revision");
const allowedOperations = [
  ["POST", /^\/api\/jira\/issues\/[A-Z][A-Z0-9_]*-\d+\/(status|assignee|date-field|comment)$/i],
  ["POST", /^\/api\/jira\/issues\/comments\/latest\/bulk$/],
  ["POST", /^\/api\/jira\/issue-metadata\/bulk$/],
  ["GET", /^\/api\/jira\/issue-metadata\/recent-notes$/],
  ["PUT", /^\/api\/jira\/issue-metadata\/[A-Z][A-Z0-9_]*-\d+$/i],
  ["PATCH", /^\/api\/jira\/issue-metadata\/[A-Z][A-Z0-9_]*-\d+\/pin-gantt$/i],
  ["GET", /^\/api\/jira\/issue-metadata\/[A-Z][A-Z0-9_]*-\d+\/images\/\d+$/i],
  ["POST", /^\/api\/jira\/issue-metadata\/[A-Z][A-Z0-9_]*-\d+\/images$/i],
  ["DELETE", /^\/api\/jira\/issue-metadata\/[A-Z][A-Z0-9_]*-\d+\/images$/i],
  ["GET", /^\/api\/(team-priority\/health|shared-programs)$/],
  ["POST", /^\/api\/team-priority\/(metadata\/bulk|bulk|dates\/bulk)$/],
  ["PUT", /^\/api\/team-priority\/(dates\/)?[A-Z][A-Z0-9_]*-\d+$/i],
  ["DELETE", /^\/api\/team-priority\/dates\/[A-Z][A-Z0-9_]*-\d+$/i],
  ["GET", /^\/api\/jira\/attachment-limits$/],
  ["GET", /^\/api\/jira\/issues\/[A-Z][A-Z0-9_]*-\d+\/(attachments|summary)$/i],
  ["POST", /^\/api\/jira\/issues\/[A-Z][A-Z0-9_]*-\d+\/attachments$/i],
  ["GET", /^\/api\/jira\/epics\/[A-Z][A-Z0-9_]*-\d+\/parent-options$/i],
  ["POST", /^\/api\/jira\/issues\/parent-candidates$/],
  ["GET", /^\/api\/jira\/(myself|users\/search|search|field-mappings)$/],
  ["POST", /^\/api\/jira\/(users\/resolve-bulk|search|search\/all)$/],
  ["GET", /^\/api\/settings$/],
];
const validateRequest = req => {
  const id = req.headers["x-docket-saved-site"];
  const revision = req.headers["x-docket-saved-revision"];
  if (typeof id !== "string" || !id.trim() || typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision) ||
      !allowedOperations.some(([method, pattern]) => req.method === method && pattern.test(req.path))) throw changed();
};
const rejectChanged = res => { const error = changed(); return res.status(409).json({ error: error.message, code: error.code }); };

export const getSavedSiteContext = (metaDb, instanceId, env = process.env) => {
  const entry = listInstances(metaDb).find(site => site.id === instanceId && site.enabled);
  if (!entry) throw changed();
  const credentials = getInstanceCredentials(metaDb, instanceId, env);
  return Object.freeze({ kind: "saved-site", instanceId, siteHost: new URL(credentials.baseUrl).hostname,
    baseUrl: credentials.baseUrl, displayName: entry.displayName,
    revision: createHash("sha256").update(JSON.stringify(entry)).digest("hex") });
};

export const openSavedSiteDatabase = (dataDir, instanceId) => {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(appDbPathForInstance(dataDir, instanceId));
  try {
    db.pragma("journal_mode = WAL");
    initDatabase(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
};

export const createSavedSiteOperations = ({ metaDb, dataDir, env = process.env, requestJira, withSiteOperation }) => {
  const resolveContext = instanceId => getSavedSiteContext(metaDb, instanceId, env);
  const rejectUnsupportedSavedSiteOperation = (req, res, next) => {
    if (hasSavedHeaders(req)) {
      try { validateRequest(req); } catch { return rejectChanged(res); }
    }
    return next();
  };
  const withSavedSiteOperation = handler => {
    const ordinary = withSiteOperation(handler);
    return async (req, res, next) => {
      if (!hasSavedHeaders(req)) return ordinary(req, res, next);
      let context;
      let credentials;
      let lease;
      try {
        validateRequest(req);
        context = resolveContext(req.headers["x-docket-saved-site"]);
        if (context.revision !== req.headers["x-docket-saved-revision"]) throw changed();
        credentials = Object.freeze({ ...getInstanceCredentials(metaDb, context.instanceId, env), mode: "instance", instanceId: context.instanceId });
        lease = beginInstanceOperations(metaDb, [context.instanceId]);
      } catch {
        // Configuration/registry details must not leak through rejected contexts.
        return rejectChanged(res);
      }
      let db;
      try {
        const getDb = () => db ||= openSavedSiteDatabase(dataDir, context.instanceId);
        const getNoteImagesDir = () => {
          const directory = noteImagesDirFor(dataDir, context.instanceId);
          fs.mkdirSync(directory, { recursive: true });
          return directory;
        };
        req.docketOperation = Object.freeze(createJiraRouteContext({ getCredentials: () => credentials,
          getDb, getNoteImagesDir, getSiteContext: () => context, requestJira, env }));
        return await handler(req, res, next);
      } finally {
        try { db?.close(); } finally { lease.release(); }
      }
    };
  };
  return { withSavedSiteOperation, getSavedSiteContext: resolveContext, rejectUnsupportedSavedSiteOperation };
};
