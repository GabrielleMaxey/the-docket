import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { initReportStorage } from "../db/schema.mjs";
import { getSavedSiteContext } from "./savedSiteOperations.mjs";
import { beginInstanceOperations } from "./jiraInstances.mjs";

export const openCombinedWorkStore = dataDir => {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "docket-combined.sqlite"));
  try {
    db.pragma("journal_mode = WAL");
    initReportStorage(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
};

const hasScope = req => Object.hasOwn(req.headers, "x-docket-report-scope");
const validScope = req => req.headers["x-docket-report-scope"] === "combined-work" &&
  !["x-docket-site", "x-docket-generation", "x-docket-saved-site", "x-docket-saved-revision"].some(key => Object.hasOwn(req.headers, key)) &&
  ((["GET", "PUT"].includes(req.method) && req.path === "/api/settings") ||
   (req.method === "POST" && req.path === "/api/report/project") ||
   (["GET", "DELETE"].includes(req.method) && /^\/api\/reports\/archive(?:\/\d+)?$/.test(req.path)));
const reject = res => res.status(400).json({ error: "Unsupported or conflicting Combined Work report context." });

export const createCombinedWorkOperations = ({ getCombinedWorkDb, withSiteOperation, metaDb, env = process.env }) => ({
  rejectUnsupportedCombinedWorkOperation(req, res, next) {
    if (hasScope(req) && !validScope(req)) return reject(res);
    return next();
  },
  withCombinedWorkOperation(handler) {
    const ordinary = withSiteOperation(handler);
    return async (req, res, next) => {
      if (!hasScope(req)) return ordinary(req, res, next);
      if (!validScope(req)) return reject(res);
      let lease;
      if (req.path === "/api/report/project") {
        const sources = req.body?.combinedSources;
        if (!Array.isArray(sources) || !sources.length) return res.status(400).json({ error: "Selected Combined Work sources are required." });
        try {
          const captured = sources.filter(source => source.sourceContext);
          for (const source of captured) {
            const context = source.sourceContext;
            if (context.kind !== "saved-site" || source.instanceId !== context.instanceId ||
                getSavedSiteContext(metaDb, context.instanceId, env).revision !== context.revision) throw new Error("changed");
          }
          if (captured.length) lease = beginInstanceOperations(metaDb, [...new Set(captured.map(source => source.instanceId))]);
          req.docketCombinedEntries = sources.map(source => ({ instanceId: source.instanceId, displayName: source.displayName,
            siteHost: source.siteHost, status: source.status, message: source.message }));
        } catch {
          return res.status(409).json({ error: "A saved Jira entry changed. Reload Combined Work before generating the report.", code: "SAVED_SITE_CONTEXT_CHANGED" });
        }
      }
      req.docketReportScope = "combined-work";
      req.docketOperation = Object.freeze({ getDb: getCombinedWorkDb });
      try { return await handler(req, res, next); } finally { lease?.release(); }
    };
  },
});
