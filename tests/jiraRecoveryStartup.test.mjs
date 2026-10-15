import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import Database from "better-sqlite3";
import { openTodoDatabase } from "../server/db/todoDatabase.mjs";
import { initDatabase } from "../server/db/schema.mjs";
import { initInstancesSchema, createInstance, setActiveInstanceId, getActiveInstanceId } from "../server/lib/jiraInstances.mjs";

for (const scenario of ["failed activation", "blocked saved startup", "blocked legacy startup"]) {
  test(`local recovery preserves identity and data after ${scenario}`, async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "docket-recovery-"));
    const dataDir = path.join(dir, "data");
    fs.mkdirSync(dataDir);
    for (const name of ["server", "shared"]) fs.cpSync(path.join(process.cwd(), name), path.join(dir, name), { recursive: true });
    fs.symlinkSync(path.join(process.cwd(), "node_modules"), path.join(dir, "node_modules"), "dir");
    // Fail locally if any path attempts outbound work; never use the real environment.
    fs.writeFileSync(path.join(dir, "deny-network.mjs"), 'globalThis.fetch = () => { throw new Error("OUTBOUND_ATTEMPT"); };');
    const meta = new Database(path.join(dataDir, "instances-meta.sqlite"));
    initInstancesSchema(meta);
    const allowed = createInstance(meta, { displayName: "A", baseUrl: "https://lumen.atlassian.net", email: "fixture@example.test" }).id;
    const blocked = createInstance(meta, { displayName: "B", baseUrl: "https://blocked.example.test", email: "fixture@example.test" }, ["blocked.example.test"]).id;
    const activeId = scenario === "failed activation" ? allowed : scenario === "blocked saved startup" ? blocked : null;
    setActiveInstanceId(meta, activeId);
    const originalPath = path.join(dataDir, activeId ? `workweek-${activeId}.sqlite` : "workweek.sqlite");
    const original = new Database(originalPath);
    initDatabase(original);
    original.exec("INSERT INTO todos (text) VALUES ('retained personal task'); INSERT INTO epic_presets (epic_key, epic_name) VALUES ('SAME-1', 'retained local settings')");
    original.close();
    const personal = openTodoDatabase(dataDir);
    personal.exec("INSERT INTO todos (text) VALUES ('retained personal task')");
    personal.close();
    const listener = net.createServer();
    await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    const child = spawn(process.execPath, ["--import", path.join(dir, "deny-network.mjs"), path.join(dir, "server/jiraProxy.mjs")], {
      cwd: dir, env: { PATH: process.env.PATH, API_PORT: String(port), TASK_MANAGER_USER_DATA: dir, LOG_LEVEL: "error", JIRA_BASE_URL: "https://blocked.example.test", JIRA_EMAIL: "fixture@example.test", JIRA_API_TOKEN: "synthetic" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) { const stopped = once(child, "exit"); child.kill(); await stopped; }
      meta.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const request = (url, options) => fetch(`http://127.0.0.1:${port}${url}`, options);
    let health;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) assert.fail(`Synthetic proxy exited before local recovery: ${output}`);
      try { const res = await request("/api/health"); if (res.ok) { health = await res.json(); break; } } catch (error) { if (!(error instanceof TypeError)) throw error; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(health, "local API starts");
    const context = health.siteContext;
    assert.equal(context.instanceId, activeId);
    const headers = { "X-Docket-Site": activeId || "legacy", "X-Docket-Generation": context.generation };
    if (scenario === "failed activation") {
      assert.equal((await request(`/api/jira/instances/${blocked}/activate`, { method: "POST", headers })).status, 400);
      assert.equal(getActiveInstanceId(meta), allowed);
      assert.deepEqual((await request("/api/health").then((res) => res.json())).siteContext, context);
    } else {
      const denied = await request("/api/jira/myself", { headers });
      assert.equal(denied.ok, false);
      assert.doesNotMatch(await denied.text(), /OUTBOUND_ATTEMPT|synthetic/);
    }
    assert.equal((await request("/api/jira/instances").then((res) => res.json())).activeInstanceId, activeId);
    assert.equal((await request("/api/todos").then((res) => res.json())).items[0].text, "retained personal task");
    assert.equal((await request("/api/epic-presets", { headers })).status, 200);
    const preserved = new Database(originalPath, { readonly: true });
    assert.equal(preserved.prepare("SELECT epic_name FROM epic_presets WHERE epic_key = 'SAME-1'").get().epic_name, "retained local settings");
    preserved.close();
    assert.doesNotMatch(output, /OUTBOUND_ATTEMPT/);
    const recovered = await request(`/api/jira/instances/${allowed}/activate`, { method: "POST", headers });
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).activeInstanceId, allowed);
  });
}
