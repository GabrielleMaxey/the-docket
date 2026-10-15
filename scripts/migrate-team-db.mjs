import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closeTeamPool, getTeamPool, teamDatabaseError } from "../server/lib/teamPriorityPostgres.mjs";

export const migrateTeamDatabase = async (pool = getTeamPool()) => {
  const directory = new URL("../server/db/team/", import.meta.url);
  const files = (await fs.readdir(directory)).filter((name) => /^\d+-.+\.sql$/.test(name)).sort();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1347371604, 1)");
    await client.query("CREATE TABLE IF NOT EXISTS team_schema_versions (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    let applied = 0;
    for (const file of files) {
      const existing = await client.query("SELECT version FROM team_schema_versions WHERE version = $1", [file]);
      if (existing.rows.length) continue;
      await client.query(await fs.readFile(new URL(file, directory), "utf8"));
      await client.query("INSERT INTO team_schema_versions (version) VALUES ($1)", [file]);
      applied += 1;
    }
    await client.query("COMMIT");
    return { applied };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { console.log(JSON.stringify(await migrateTeamDatabase())); }
  catch (error) { console.error(teamDatabaseError(error).message); process.exitCode = 1; }
  finally { await closeTeamPool(); }
}
