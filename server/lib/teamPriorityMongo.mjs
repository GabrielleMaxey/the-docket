import { MongoClient } from "mongodb";
import { clampIssuePriority } from "../../shared/issuePriority.mjs";
import { createLogger } from "./logger.mjs";

const log = createLogger("team-priority-mongo");

const COL_PROGRAMS = "shared_programs";
const COL_PRIORITIES = "team_issue_priorities";

const SEED_PROGRAMS = [
  {
    slug: "nora",
    displayName: "NORA",
    enabled: true,
    epicRoots: ["ODI-23957"],
  },
  {
    slug: "ask-greg",
    displayName: "MCP - Ask Greg",
    enabled: true,
    epicRoots: ["ODI-23066", "ODI-18520"],
  },
];

let clientPromise = null;

export const isTeamPriorityMongoConfigured = () =>
  Boolean(String(process.env.TEAM_PRIORITY_MONGODB_URI || "").trim());

const getClient = async () => {
  const uri = String(process.env.TEAM_PRIORITY_MONGODB_URI || "").trim();
  if (!uri) {
    return null;
  }
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new MongoClient(uri, {
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 8000,
      });
      await client.connect();
      return client;
    })().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
};

const getDb = async () => {
  const client = await getClient();
  if (!client) {
    return null;
  }
  return client.db();
};

export const pingTeamPriorityMongo = async () => {
  if (!isTeamPriorityMongoConfigured()) {
    return { configured: false, connected: false };
  }
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return { configured: true, connected: true };
  } catch (error) {
    log.warn("Mongo ping failed", error instanceof Error ? error.message : error);
    return {
      configured: true,
      connected: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
};

export const seedSharedPrograms = async () => {
  const db = await getDb();
  if (!db) {
    throw new Error("Team priority demo not configured");
  }
  const col = db.collection(COL_PROGRAMS);
  for (const program of SEED_PROGRAMS) {
    await col.updateOne(
      { slug: program.slug },
      {
        $set: {
          displayName: program.displayName,
          enabled: program.enabled,
          epicRoots: program.epicRoots,
        },
        $setOnInsert: { slug: program.slug },
      },
      { upsert: true }
    );
  }
  return listSharedPrograms();
};

export const listSharedPrograms = async () => {
  const db = await getDb();
  if (!db) {
    return [];
  }
  const rows = await db
    .collection(COL_PROGRAMS)
    .find({ enabled: true })
    .project({ _id: 0, slug: 1, displayName: 1, enabled: 1, epicRoots: 1 })
    .sort({ slug: 1 })
    .toArray();
  return rows;
};

export const bulkGetTeamPriorities = async (issueKeys) => {
  const db = await getDb();
  if (!db) {
    throw new Error("Team priority demo not configured");
  }
  const keys = [
    ...new Set(
      (Array.isArray(issueKeys) ? issueKeys : [])
        .map((key) => String(key || "").trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
  if (keys.length === 0) {
    return {};
  }

  const rows = await db
    .collection(COL_PRIORITIES)
    .find({ _id: { $in: keys } })
    .toArray();

  const items = {};
  for (const row of rows) {
    items[row._id] = {
      priority: clampIssuePriority(row.priority),
      updatedAt: row.updatedAt || null,
      updatedBy: String(row.updatedBy || ""),
    };
  }
  return items;
};

// Every priority currently stored in Atlas, unfiltered by issue key.
// Used to pull the shared set down into local SQLite.
export const listAllTeamPriorities = async () => {
  const db = await getDb();
  if (!db) {
    throw new Error("Team priority demo not configured");
  }
  const rows = await db.collection(COL_PRIORITIES).find({}).toArray();
  return rows
    .map((row) => ({
      issueKey: String(row._id || "").trim().toUpperCase(),
      priority: clampIssuePriority(row.priority),
      updatedAt: row.updatedAt || null,
      updatedBy: String(row.updatedBy || ""),
    }))
    .filter((row) => row.issueKey);
};

export const putTeamPriority = async ({ issueKey, priority, updatedBy }) => {
  const db = await getDb();
  if (!db) {
    throw new Error("Team priority demo not configured");
  }
  const key = String(issueKey || "").trim().toUpperCase();
  if (!key) {
    throw new Error("Missing issue key");
  }

  const nextPriority = clampIssuePriority(priority);
  const col = db.collection(COL_PRIORITIES);

  if (nextPriority === 0) {
    await col.deleteOne({ _id: key });
    return { ok: true, deleted: true, issueKey: key };
  }

  const updatedAt = new Date();
  const by = String(updatedBy || "demo").trim() || "demo";
  await col.updateOne(
    { _id: key },
    {
      $set: {
        priority: nextPriority,
        updatedAt,
        updatedBy: by,
      },
    },
    { upsert: true }
  );

  return {
    ok: true,
    deleted: false,
    issueKey: key,
    priority: nextPriority,
    updatedAt,
    updatedBy: by,
  };
};

export const bulkPutTeamPriorities = async (entries, updatedBy = "csv-import") => {
  const by = String(updatedBy || "csv-import").trim() || "csv-import";
  let updated = 0;
  let deleted = 0;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = String(entry?.issueKey || "").trim().toUpperCase();
    if (!key) {
      continue;
    }
    const result = await putTeamPriority({
      issueKey: key,
      priority: entry?.priority,
      updatedBy: by,
    });
    if (result.deleted) {
      deleted += 1;
    } else {
      updated += 1;
    }
  }

  return { updated, deleted };
};
