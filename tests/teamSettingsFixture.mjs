import Database from "better-sqlite3";
import { initInstancesSchema } from "../server/lib/jiraInstances.mjs";
import { initializeTeamPrioritySettings } from "../server/lib/teamPriorityPostgres.mjs";

export const enableTeamDatabase = (t) => {
  const db = new Database(":memory:");
  initInstancesSchema(db);
  db.prepare("INSERT INTO jira_instance_meta (key,value) VALUES ('use_team_db','true')").run();
  initializeTeamPrioritySettings(db);
  t.after(() => { initializeTeamPrioritySettings(null); db.close(); });
  return db;
};
