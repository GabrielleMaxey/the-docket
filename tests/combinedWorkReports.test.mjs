import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import express from "express";
import { once } from "node:events";
import { initDatabase } from "../server/db/schema.mjs";
import { registerAppConfigRoutes } from "../server/routes/appConfigRoutes.mjs";
import { registerReportRoutes } from "../server/routes/reportRoutes.mjs";
import { insertGeneratedReport } from "../server/lib/reportArchive.mjs";
import { initInstancesSchema, createInstance, updateInstance } from "../server/lib/jiraInstances.mjs";
import { getSavedSiteContext } from "../server/lib/savedSiteOperations.mjs";
import { localRequestPolicy } from "../server/lib/localRequestPolicy.mjs";
const combined = await import("../server/lib/combinedWorkStore.mjs").catch(error => { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; return {}; });
const setup = async t => {
  assert.equal(typeof combined.openCombinedWorkStore, "function", "dedicated combined storage must exist");
  const directory = mkdtempSync(path.join(os.tmpdir(), "combined-reports-"));
  const db = combined.openCombinedWorkStore(directory);
  const ordinary = new Database(":memory:"); initDatabase(ordinary);
  const metaDb = new Database(":memory:"); initInstancesSchema(metaDb);
  const env = { JIRA_ALLOWED_HOSTS: "a.test,b.test", JIRA_API_TOKEN: "synthetic" };
  const entries = ["a", "b"].map(id => createInstance(metaDb, {displayName:id,baseUrl:`https://${id}.test`,email:`${id}@example.test`}, ["a.test","b.test"]));
  const sources = entries.map(entry => ({instanceId:entry.id,displayName:entry.displayName,siteHost:new URL(entry.baseUrl).hostname,status:"complete",sourceContext:getSavedSiteContext(metaDb,entry.id,env)}));
  const operations = combined.createCombinedWorkOperations({ getCombinedWorkDb: () => db, withSiteOperation: handler => handler, metaDb, env });
  const app = express(); app.use(express.json()); app.use(operations.rejectUnsupportedCombinedWorkOperation);
  const context = { getDb: () => ordinary, withSiteOperation: operations.withCombinedWorkOperation, jiraRequest: () => assert.fail("no active Jira query") };
  registerAppConfigRoutes(app, context); registerReportRoutes(app, context);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); ordinary.close(); metaDb.close(); rmSync(directory, { recursive: true, force: true }); });
  const request = (route, options = {}) => fetch(url + route, { ...options, headers: { "Content-Type": "application/json", "X-Docket-Report-Scope": "combined-work", ...options.headers } });
  return { db, ordinary, request, metaDb, sources };
};

test("combined goals persist independently and only the two goals keys can be written", async t => {
  const { db, ordinary, request } = await setup(t);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence' ORDER BY name").all().map(row => row.name), ["app_settings", "generated_reports"]);
  const goals = { work_week_report_user_goals: "Grow", work_week_report_company_goals: "Deliver" };
  assert.equal((await request("/api/settings", { method: "PUT", body: JSON.stringify({ settings: goals }) })).status, 200);
  assert.deepEqual((await (await request("/api/settings")).json()).settings, goals);
  assert.equal(ordinary.prepare("SELECT value FROM app_settings WHERE key='work_week_report_user_goals'").get(), undefined);
  assert.equal((await request("/api/settings", { method: "PUT", body: JSON.stringify({ settings: { ...goals, proxy_url: "forbidden" } }) })).status, 400);
  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='proxy_url'").get(), undefined);
});

test("overlapping archive IDs cannot read or delete the ordinary source archive", async t => {
  const { db, ordinary, request } = await setup(t);
  const row = { source: "work_week", reportType: "work_week_project_report", label: "Combined", content: "Combined result", meta: { scope: "combined-work" } };
  assert.equal(insertGeneratedReport(db, row), 1); assert.equal(insertGeneratedReport(ordinary, { ...row, content: "Ordinary result" }), 1);
  assert.equal((await (await request("/api/reports/archive/1")).json()).item.content, "Combined result");
  assert.equal((await (await request("/api/reports/archive?source=work_week")).json()).items.length, 1);
  assert.equal((await request("/api/reports/archive/1", { method: "DELETE" })).status, 200);
  assert.equal(ordinary.prepare("SELECT content FROM generated_reports WHERE id=1").get().content, "Ordinary result");
  insertGeneratedReport(db, row);
  assert.equal((await request("/api/reports/archive?source=work_week", { method: "DELETE" })).status, 200);
  assert.equal(db.prepare("SELECT count(*) n FROM generated_reports").get().n, 0);
  assert.equal(ordinary.prepare("SELECT count(*) n FROM generated_reports").get().n, 1);
});

test("combined context rejects unsupported routes, values and active/saved conflicts", async t => {
  const { request } = await setup(t);
  for (const [route, headers, method] of [
    ["/api/jira/search", {}, "POST"], ["/api/reports/archive", {}, "POST"],
    ["/api/settings", { "X-Docket-Site": "legacy" }, "GET"],
    ["/api/settings", { "X-Docket-Generation": "1" }, "GET"],
    ["/api/settings", { "X-Docket-Saved-Site": "a" }, "GET"],
    ["/api/settings", { "X-Docket-Saved-Revision": "a" }, "GET"],
    ["/api/settings", { "X-Docket-Report-Scope": "other" }, "GET"],
  ]) assert.equal((await request(route, { headers, method })).status, 400, route);
});

test("direct API preflight allows exactly the new scope header for existing approved origins", () => {
  const invoke = origin => {
    const headers = {}; const res = { setHeader: (k,v) => headers[k] = v, status(code) { this.code = code; return this; }, json() {}, sendStatus(code) { this.code = code; } };
    localRequestPolicy({ apiPort: 5555, allowedOrigins: ["http://localhost:5556"] })({ method: "OPTIONS", headers: { host: "127.0.0.1:5555", origin, "access-control-request-headers": "x-docket-report-scope" } }, res, () => assert.fail());
    return { headers, code: res.code };
  };
  const good = invoke("http://localhost:5556"); assert.equal(good.code, 204); assert.match(good.headers["Access-Control-Allow-Headers"], /X-Docket-Report-Scope/);
  assert.equal(invoke("https://unapproved.test").code, 403);
});

test("comment batch reports per-issue HTTP failures instead of presenting missing comments as complete", async () => {
  const { fetchLatestCommentTextBulk } = await import("../server/lib/jiraCommentText.mjs");
  const result = await fetchLatestCommentTextBulk({ issueKeys: ["ABC-1", "ABC-2"], jiraRequest: async ({pathWithQuery}) => pathWithQuery.includes("ABC-2") ? {ok:true,data:{comments:[{body:{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"Successful comment"}]}]},created:"2026-10-15"}]}} : ({ok:false,status:403,data:{error:"denied"}}) });
  assert.ok(result.errors?.["ABC-1"]);
  assert.equal(result.items["ABC-2"].text,"Successful comment");
});

test("generation retains source labels, coverage and goals in dedicated archive, validates revisions without active Jira reads", async t => {
  const { request, db, ordinary, metaDb, sources } = await setup(t);
  const previousFetch = globalThis.fetch;
  const names = ["AI_MODE", "MANAGED_AI_BASE_URL", "MANAGED_AI_API_KEY", "MANAGED_AI_MODEL"];
  const previous = Object.fromEntries(names.map(name=>[name,process.env[name]]));
  Object.assign(process.env,{AI_MODE:"managed",MANAGED_AI_BASE_URL:"https://synthetic.invalid/v1",MANAGED_AI_API_KEY:"synthetic",MANAGED_AI_MODEL:"fixture"});
  t.after(()=>{ globalThis.fetch = previousFetch; for(const name of names) if(previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });
  let prompt;
  globalThis.fetch = async (url, options) => {
    if(String(url).startsWith("http://127.0.0.1:")) return previousFetch(url, options);
    assert.equal(url,"https://synthetic.invalid/v1/chat/completions");
    prompt = JSON.parse(options.body);
    return new Response(JSON.stringify({choices:[{message:{content:"Synthetic report with incomplete coverage"}}]}));
  };
  const combinedSources = [...sources,{instanceId:"failed",displayName:"Failed source",siteHost:"failed.test",status:"failed",message:"Offline"}];
  const payload = {label:"Combined Work",reportType:"one_on_one",userGoals:"Grow",combinedSources,reportQueryScope:{reportScope:"all_work",months:3},summary:{total:2,open:2,sources:[{displayName:"a",issues:[{key:"ABC-1",note:"A local note"}]}],notices:["Failed source: Offline"],topPriorities:[{key:"ABC-1",status:"Backlog"}]}};
  const response = await request("/api/report/project",{method:"POST",body:JSON.stringify(payload)});
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.match(JSON.stringify(prompt),/A local note/); assert.match(JSON.stringify(prompt),/Failed source: Offline/); assert.match(JSON.stringify(prompt),/Grow/);
  const meta = JSON.parse(db.prepare("SELECT meta_json FROM generated_reports WHERE id=1").get().meta_json);
  assert.equal(meta.scope,"combined-work"); assert.equal(meta.selectedEntries[2].displayName,"Failed source"); assert.deepEqual(meta.coverage,["Failed source: Offline"]); assert.equal(meta.reportQueryScope.months,3); assert.ok(meta.timestamp);
  assert.equal(ordinary.prepare("SELECT count(*) n FROM generated_reports").get().n,0);
  updateInstance(metaDb,sources[0].instanceId,{displayName:"Changed"},["a.test","b.test"]);
  assert.equal((await request("/api/report/project",{method:"POST",body:JSON.stringify(payload)})).status,409);
  assert.equal(db.prepare("SELECT count(*) n FROM generated_reports").get().n,1);
});
