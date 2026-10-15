import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closeTeamPool, getTeamPool, normalizeTeamSiteHost, teamDatabaseError, writeTeamMetadataEntries } from "../server/lib/teamPriorityPostgres.mjs";

export const planTeamDemoImport = (data, mapping) => {
  if (!data || typeof data !== "object" || Array.isArray(data) || !mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new TypeError("Export and site mapping must be JSON objects");
  const sites = Object.fromEntries(Object.entries(mapping).map(([source, host]) => [source, normalizeTeamSiteHost(host)]));
  const siteFor = (record) => {
    // Old demo keys have no source lineage. Require an annotated copy, never infer a Jira site.
    if (typeof record?.source !== "string" || !record.source.trim() || !Object.hasOwn(sites, record.source)) throw new TypeError("Every record and program epic requires an explicit source mapping");
    return sites[record.source];
  };
  const keyFor = (record) => {
    const key = String(record?.issueKey || record?._id || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(key)) throw new TypeError("Export contains an invalid issue key");
    return key;
  };
  for (const [collection, rows] of Object.entries(data)) {
    if (!["team_issue_priorities", "team_issue_dates", "shared_programs"].includes(collection) || !Array.isArray(rows)) throw new TypeError("Unsupported export collection or collection format");
  }
  const entries = [];
  for (const row of data.team_issue_priorities || []) entries.push({ siteHost: siteFor(row), issueKey: keyFor(row), patch: { priority: row.priority } });
  const dateFields = ["startDate", "completeDate", "hasOpenDecision", "plannedStart", "plannedFinish", "pmOverride", "requestor", "openDecisionNote"];
  for (const row of data.team_issue_dates || []) {
    entries.push({ siteHost: siteFor(row), issueKey: keyFor(row), patch: Object.fromEntries(dateFields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]])) });
  }
  const programs = (data.shared_programs || []).map((row) => {
    if (typeof row?.slug !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(row.slug) || typeof row.displayName !== "string" || typeof row.enabled !== "boolean" || !Array.isArray(row.epicRoots)) throw new TypeError("Invalid exported program");
    return { slug: row.slug, displayName: row.displayName, enabled: row.enabled, epicRoots: row.epicRoots.map((epic) => ({ siteHost: siteFor(epic), issueKey: keyFor(epic) })) };
  });
  return { entries, programs };
};

export const importTeamDemo = async (data, mapping, pool = getTeamPool()) => {
  const plan = planTeamDemoImport(data, mapping);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const program of plan.programs) {
      await client.query("INSERT INTO shared_programs (slug, display_name, enabled) VALUES ($1, $2, $3) ON CONFLICT (slug) DO UPDATE SET display_name = excluded.display_name, enabled = excluded.enabled", [program.slug, program.displayName, program.enabled]);
      for (const epic of program.epicRoots) await client.query("INSERT INTO shared_program_epics (program_slug, site_host, issue_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [program.slug, epic.siteHost, epic.issueKey]);
    }
    for (const entry of plan.entries) await writeTeamMetadataEntries(client, { siteHost: entry.siteHost, entries: [entry], updatedBy: "explicit-demo-migration" });
    await client.query("COMMIT");
    return { updated: plan.entries.length, programs: plan.programs.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [exportFile, mappingFile] = process.argv.slice(2);
    if (!exportFile || !mappingFile) throw new TypeError("Usage: npm run team-db:import-demo -- export.json site-map.json");
    const data = JSON.parse(await fs.readFile(exportFile, "utf8"));
    const mapping = JSON.parse(await fs.readFile(mappingFile, "utf8"));
    console.log(JSON.stringify(await importTeamDemo(data, mapping)));
  } catch (error) {
    console.error(error instanceof TypeError ? error.message : teamDatabaseError(error).message);
    process.exitCode = 1;
  } finally { await closeTeamPool(); }
}
