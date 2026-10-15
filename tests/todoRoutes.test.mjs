import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { initDatabase } from "../server/db/schema.mjs";
import { registerTodoRoutes } from "../server/routes/todoRoutes.mjs";
import { initInstancesSchema, createInstance, setActiveInstanceId } from "../server/lib/jiraInstances.mjs";

const withServer = async (run) => {
  const db = new Database(":memory:");
  initDatabase(db);
  const app = express();
  app.use(express.json());
  registerTodoRoutes(app, {
    getDb: () => db,
    withSiteOperation: () => (_req, res) => res.status(409).json({ error: "synthetic site switch" }),
    getMigrationStatus: () => ({ unresolved: [{ sourceId: "site:old", sourceTable: "todos", count: 2, reason: "ambiguous lineage" }] }),
  });
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const request = (url, options) => fetch(`http://127.0.0.1:${server.address().port}${url}`, options);
  try { await run({ db, request }); }
  finally { await new Promise((resolve) => server.close(resolve)); db.close(); }
};
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("personal routes allow CRUD without Jira context even while a site change is blocked", async () => {
  await withServer(async ({ request }) => {
    const response = await request("/api/todos", json("POST", { text: "personal", priority: 2, dueDate: "2026-10-20" }));
    assert.equal(response.status, 201);
    const item = await response.json();
    assert.equal(item.text, "personal");
    assert.equal((await request(`/api/todos/${item.id}`, json("PUT", { text: "saved", done: true }))).status, 200);
    const completed = await request("/api/todos/completed?days=0").then((res) => res.json());
    assert.equal(completed.days, 0);
    assert.equal(completed.items[0].text, "saved");
    assert.equal((await request(`/api/todos/${item.id}`, { method: "DELETE" })).status, 200);
    assert.deepEqual((await request("/api/todos").then((res) => res.json())).items, []);
  });
});

test("All time includes unknown dates and editing completed history preserves unknown dates", async () => {
  await withServer(async ({ db, request }) => {
    db.exec("INSERT INTO todos (text, done, completed_at) VALUES ('unknown', 1, ''), ('old', 1, '2001-02-03')");
    const all = await request("/api/todos/completed?days=0").then((res) => res.json());
    assert.equal(all.days, 0);
    assert.equal(all.items.length, 2);
    const updated = await request("/api/todos/1", json("PUT", { text: "edited history" })).then((res) => res.json());
    assert.equal(updated.completedAt, "");
    const recent = await request("/api/todos/completed?days=30").then((res) => res.json());
    assert.equal(recent.items.length, 0);
    const cleared = await request("/api/todos/completed", { method: "DELETE" }).then((res) => res.json());
    assert.equal(cleared.deleted, 2);
  });
});

test("GET never recreates deleted reminders and surfaces unresolved recovery details", async () => {
  await withServer(async ({ db, request }) => {
    db.exec("INSERT INTO reminders (slot_index, text, done) VALUES (0, 'deleted', 1)");
    const response = await request("/api/todos");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.items, []);
    assert.equal(body.migration.unresolved[0].count, 2);
  });
});

test("the creation limit keeps existing 20 active items visible and blocks new items", async () => {
  await withServer(async ({ db, request }) => {
    for (let i = 0; i < 20; i++) db.prepare("INSERT INTO todos (text) VALUES (?)").run(`item ${i}`);
    assert.equal((await request("/api/todos").then((res) => res.json())).items.length, 20);
    assert.equal((await request("/api/todos", json("POST", { text: "extra" }))).status, 400);
  });
});


// Running a copied code tree prevents the proxy from reading the real project .env.
for (const scenario of ["reminder-only legacy", "todo-only saved site"]) {
  test(`proxy preserves ${scenario} across migration, site deletion and restart`, async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "todo-proxy-"));
    const dataDir = path.join(dir, "data");
    fs.mkdirSync(dataDir);
    for (const name of ["server", "shared"]) fs.cpSync(path.join(process.cwd(), name), path.join(dir, name), { recursive: true });
    fs.symlinkSync(path.join(process.cwd(), "node_modules"), path.join(dir, "node_modules"), "dir");
    const legacy = new Database(path.join(dataDir, "workweek.sqlite"));
    let originalSiteId;
    if (scenario === "reminder-only legacy") {
      legacy.exec("CREATE TABLE reminders (slot_index INTEGER PRIMARY KEY, text TEXT, done INTEGER, updated_at TEXT); INSERT INTO reminders VALUES (0, 'historic reminder', 1, '2020-01-02 03:04:05')");
    } else {
      initDatabase(legacy);
      legacy.exec("INSERT INTO epic_presets (epic_key, epic_name) VALUES ('SYN-1', 'Eligible legacy seed'); INSERT INTO todos (id, text, done) VALUES (1, 'legacy todo', 1)");
      const meta = new Database(path.join(dataDir, "instances-meta.sqlite"));
      initInstancesSchema(meta);
      originalSiteId = createInstance(meta, { displayName: "Original", baseUrl: "https://lumen.atlassian.net", email: "test@example.test" }).id;
      setActiveInstanceId(meta, originalSiteId);
      meta.close();
      const originalSite = new Database(path.join(dataDir, `workweek-${originalSiteId}.sqlite`));
      initDatabase(originalSite);
      originalSite.exec("INSERT INTO todos (id, text) VALUES (1, 'original site todo')");
      originalSite.close();
    }
    const initialCount = originalSiteId ? 2 : 1;
    legacy.close();
    const listener = net.createServer();
    await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    let child;
    const stop = async () => {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
    };
    t.after(async () => { await stop(); fs.rmSync(dir, { recursive: true, force: true }); });
    const start = async () => {
      child = spawn(process.execPath, [path.join(dir, "server/jiraProxy.mjs")], {
        cwd: dir, env: { PATH: process.env.PATH, API_PORT: String(port), TASK_MANAGER_USER_DATA: dir, LOG_LEVEL: "error" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (data) => { output += data; });
      child.stderr.on("data", (data) => { output += data; });
      for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) assert.fail(`Synthetic proxy exited: ${output}`);
        try {
          if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
        } catch (error) { if (!(error instanceof TypeError)) throw error; }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.fail(`Synthetic proxy did not start: ${output}`);
    };
    const request = (url, options) => fetch(`http://127.0.0.1:${port}${url}`, options);
    await start();
    const migrated = await request("/api/todos").then((res) => res.json());
    assert.equal(migrated.items.length, initialCount, "original source records must survive before seeding and schema upgrade");
    assert.equal(migrated.items.find((item) => item.done).completedAt, "");
    if (originalSiteId) {
      assert.ok(migrated.items.some((item) => item.text === "original site todo"));
      const originalSite = new Database(path.join(dataDir, `workweek-${originalSiteId}.sqlite`), { readonly: true });
      assert.equal(originalSite.prepare("SELECT text FROM todos WHERE id = 1").get().text, "original site todo");
      originalSite.close();
      const personal = new Database(path.join(dataDir, "personal-todos.sqlite"), { readonly: true });
      assert.equal(personal.prepare("SELECT COUNT(*) AS n FROM todo_migration_ledger WHERE source_id = ?").get(`site:${originalSiteId}`).n, 1);
      personal.close();
    }
    const active = await request("/api/todos", json("POST", { text: "independent" })).then((res) => res.json());
    let context = await request("/api/health").then((res) => res.json()).then((data) => data.siteContext);
    const register = async (baseUrl) => {
      const options = json("POST", { displayName: "Synthetic", email: "test@example.test", baseUrl });
      options.headers["X-Docket-Generation"] = context.generation;
      const response = await request("/api/jira/instances", options);
      assert.equal(response.status, 201);
      const data = await response.json();
      context = data.siteContext;
      return data.id;
    };
    const a = await register("https://lumen.atlassian.net");
    const b = await register("https://lumen-nm.atlassian.net");
    const switched = await request(`/api/jira/instances/${b}/activate`, { method: "POST", headers: { "X-Docket-Generation": context.generation } }).then((res) => res.json());
    context = switched.siteContext;
    assert.equal((await request("/api/todos").then((res) => res.json())).items.length, initialCount + 1);
    for (const id of [a, b, ...(originalSiteId ? [originalSiteId] : [])]) {
      const response = await request(`/api/jira/instances/${id}`, { method: "DELETE", headers: { "X-Docket-Generation": context.generation } });
      assert.equal(response.status, 200);
      context = (await response.json()).siteContext;
    }
    await stop();
    await start();
    const reloaded = await request("/api/todos").then((res) => res.json());
    assert.equal(reloaded.items.length, initialCount + 1);
    assert.equal(reloaded.items.find((item) => item.id === active.id).text, "independent");
    assert.equal((await request("/api/todos/completed?days=0").then((res) => res.json())).items.length, 1);
    for (const item of reloaded.items) assert.equal((await request(`/api/todos/${item.id}`, { method: "DELETE" })).status, 200);
    await stop();
    await start();
    assert.deepEqual((await request("/api/todos").then((res) => res.json())).items, []);
  });

}

test("browser personal requests bypass site initialization and save admission", async (t) => {
  const { build } = await import("esbuild");
  const bundled = await build({
    stdin: { contents: 'export * from "./src/services/jiraClient.js"; export * from "./src/utils/siteContextStore.js"; export * from "./src/utils/backgroundJobStore.js";', resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env.VITE_API_BASE": "undefined" },
  });
  const client = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const urls = [];
  globalThis.fetch = async (url, options) => {
    urls.push(url);
    assert.ok(url.startsWith("/api/todos"), "personal requests must not bootstrap Jira health");
    assert.equal(options.headers["X-Docket-Generation"], undefined);
    if (options.method === "POST") return new Response(JSON.stringify({ id: 1, text: "saved" }), { status: 201 });
    return new Response(JSON.stringify({ items: [{ id: 1, text: "saved" }], days: 0, migration: { unresolved: [{ count: 2 }] } }));
  };
  assert.equal((await client.fetchTodos()).length, 1);
  client.setSiteContext({ instanceId: "synthetic", generation: "old" });
  client.setSiteSwitching(true);
  assert.equal((await client.createTodo({ text: "saved" })).id, 1);
  const completed = await client.fetchCompletedTodos(0);
  assert.equal(completed.days, 0);
  assert.equal(completed.migration.unresolved[0].count, 2);
  assert.deepEqual(urls, ["/api/todos", "/api/todos", "/api/todos/completed?days=0"]);
});
