import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { build } from "esbuild";
let bundleId = 0;
const bundle = async contents => {
  const result = await build({ stdin: { contents, resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "esm", define: { "import.meta.env.VITE_API_BASE": "undefined" } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${bundleId++}`);
};
const install = t => {
  const previous = { fetch: globalThis.fetch, window: globalThis.window, localStorage: globalThis.localStorage };
  const values = new Map(); globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) };
  globalThis.window = { localStorage, sessionStorage: localStorage, confirm:()=>true, setTimeout: (fn, ms) => { const timer = setTimeout(fn,ms); timer.unref(); return timer; }, clearTimeout };
  t.after(() => Object.assign(globalThis, previous)); return values;
};
const context = { kind: "combined-work" };
const source = (id, host = `${id}.test`) => ({ instanceId: id, siteHost: host, displayName: id, status: "complete", hydrationReady: true, sourceContext: { kind: "saved-site", instanceId: id, siteHost: host, revision: `revision-${id}` } });
const issue = (key = "ABC-1", extra = {}) => ({ key, fields: { summary: key, status: { name: "Backlog", statusCategory: { key: "new" } }, ...extra } });
const reports = async () => {
  assert.ok(existsSync("src/Pages/combinedWorkReports.js"), "combined report aggregation must be implemented");
  return bundle('export * from "./src/Pages/combinedWorkReports.js"; export * from "./src/utils/siteContextStore.js";');
};

test("combined totals deduplicate hosts and retain differently labeled local notes and planning", async () => {
  const { buildCombinedReportSummary } = await reports();
  const sites = [
    { ...source("a"), issues: [issue()], jiraNotes: { "ABC-1": "A note" }, planningMetaByKey: { "ABC-1": { followUp: "A plan" } } },
    { ...source("duplicate", "a.test"), issues: [issue()], jiraNotes: { "ABC-1": "Other note" } },
    { ...source("b"), issues: [issue("ABC-1", { status: { name: "Done", statusCategory: { key: "done" } } })] },
    { ...source("failed"), status: "error", hydrationReady: false, message: "Offline", issues: [] },
  ];
  const result = buildCombinedReportSummary(sites);
  assert.equal(result.total, 2); assert.equal(result.open, 1); assert.equal(result.closed, 1);
  assert.equal(result.sources[0].issues[0].note, "A note"); assert.equal(result.sources[1].issues[0].note, "Other note");
  assert.equal(result.sources[0].issues[0].localPlanning.followUp, "A plan");
  assert.match(result.notices.join(" "), /failed.*Offline/);
  assert.equal(result.incomplete, true);
  assert.doesNotMatch(result.notices.join(" "), /still loading/);
});

test("history uses each captured context for searches, notes, comments, mappings and parents with partial coverage", async t => {
  install(t); const api = await reports(); api.setSiteContext({ instanceId: "active", generation: 9 });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const id = options.headers["X-Docket-Saved-Site"]; assert.ok(["a", "b"].includes(id), url);
    assert.equal(options.headers["X-Docket-Site"], undefined); assert.equal(options.headers["X-Docket-Saved-Revision"], `revision-${id}`);
    const body = options.body && JSON.parse(options.body); calls.push({ url, id, body });
    let data;
    if (url.includes("search/all")) { assert.equal(body.maxTotal, 500); data = body.jql.includes("changed") ? { issues: [issue("ABC-1", { parent: { key: "EP-1" } })], isComplete: id === "a" } : { issues: [issue("ABC-2"), issue("ABC-3")], isComplete: true }; }
    else if (url.includes("recent-notes")) data = { issueKeys: ["ABC-2"] };
    else if (url.includes("comments/latest")) data = { items: { "ABC-3": { created: new Date().toISOString(), text: `${id} comment` } } };
    else if (url.includes("field-mappings")) data = { items: [{ role: "most_recent_done_date", fieldId: `mrd_${id}` }, { role: "due_date", fieldId: `due_${id}` }] };
    else if (url.endsWith("/api/jira/search")) data = { issues: [issue("EP-1", { [`mrd_${id}`]: "2020-01-01" })] };
    else if (url.includes("issue-metadata/bulk")) data = { items: { "ABC-2": { note: `${id} saved note` } } };
    else if (url.includes("team-priority")) data = { items: {} };
    else assert.fail(url);
    return new Response(JSON.stringify(data));
  };
  const result = await api.loadCombinedReportHistory({ sites: [source("a"), source("b"), { instanceId: "failed", displayName: "Failed", status: "error", message: "No context" }], months: 3 });
  assert.equal(result.total, 6); assert.equal(result.overdue, 2);
  assert.match(result.notices.join(" "), /b.*(limit|incomplete|truncat)/i); assert.match(result.notices.join(" "), /Failed.*No context/);
  assert.equal(result.sources[0].issues.find(i => i.key === "ABC-2").note, "a saved note");
  assert.equal(result.sources[1].issues.find(i => i.key === "ABC-2").note, "b saved note");
  assert.ok(calls.some(call => call.id === "b" && call.url.endsWith("/api/jira/search")));
});

test("report/settings/archive clients use combined header and isolated job ownership", async t => {
  install(t); const api = await bundle('export * from "./src/services/jiraClient.js"; export * from "./src/utils/siteContextStore.js"; export * from "./src/utils/backgroundJobStore.js";');
  api.setSiteContext({ instanceId: "active", generation: 4 }); const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response('{"items":[],"settings":{}}'); };
  await api.saveAppSettings({ work_week_report_user_goals: "Goals" }, { siteContext: context });
  await api.fetchAppSettings({ siteContext: context });
  await api.generateProjectReport({ label: "Combined", summary: {}, combinedSources: [source("a")], reportQueryScope: "current" }, { siteContext: context });
  await api.fetchArchivedReports({ source: "work_week", siteContext: context });
  await api.fetchArchivedReportById(1, { siteContext: context });
  await api.deleteArchivedReport(1, { siteContext: context });
  await api.deleteArchivedReportsBySource("work_week", { siteContext: context });
  for (const call of calls) { assert.equal(call.options.headers["X-Docket-Report-Scope"], "combined-work", call.url); assert.equal(call.options.headers["X-Docket-Site"], undefined); }
  assert.ok(api.getActiveBackgroundJobs().every(job => job.id.startsWith("docket:combined-work:") && job.instanceId === null));
  assert.equal(JSON.parse(calls[2].options.body).combinedSources[0].sourceContext.revision, "revision-a");
});

test("combined cache keys include sorted selections/options while goals scope and jobs remain independent of active site", async t => {
  const values = install(t); const api = await bundle('export * from "./src/utils/pageReportPersistence.js"; export * from "./src/utils/chatSessionContext.js"; export * from "./src/utils/siteContextStore.js"; export * from "./src/utils/backgroundJobStore.js";');
  api.setSiteContext({ instanceId: "active", generation: 4 });
  api.saveWorkWeekProjectReport("a,b:status", { report: "Combined" }, context);
  api.saveChatSessionArtifact({ type: "report", content: "Combined" }, context);
  api.setSiteContext({ instanceId: "other", generation: 5 });
  assert.equal(api.loadWorkWeekProjectReport("a,b:status", context).report, "Combined");
  assert.equal(api.loadWorkWeekProjectReport("a,b:status"), null);
  assert.ok([...values.keys()].every(key => key.startsWith("docket:combined-work:")));
  const id = api.workWeekProjectReportJobId("a,b:status", context);
  await api.runBackgroundJob(id, { siteContext: context, run: async () => "Combined" });
  assert.equal(api.getBackgroundJob(id).instanceId, null);
  const { combinedReportRunKey } = await reports();
  assert.equal(combinedReportRunKey([source("b"), source("a")], { reportType: "status" }), combinedReportRunKey([source("a"), source("b")], { reportType: "status" }));
  assert.notEqual(combinedReportRunKey([source("a")], { reportType: "status" }), combinedReportRunKey([source("a")], { reportType: "pwb" }));
});

test("full metrics mounts Combined Work reports and goals/generation use explicit combined scope", async t => {
  install(t); const api = await bundleUi('export {default as Metrics} from "./src/Pages/components/MyMetricsSection.jsx"; export {default as Panel} from "./src/Pages/components/ProjectReportPanel.jsx"; export {render,unmount} from "react";');
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({url, options}); return new Response(JSON.stringify(url.endsWith("/api/health") ? {siteContext: {instanceId: "active", generation: 1}} : url.endsWith("/api/settings") ? { settings: { work_week_report_user_goals: "Combined goals" } } : { report: "Generated", label: "Combined Work", displayLabel: "Synthetic" })); };
  const sites = [{...source("a"), issues: [issue()], jiraNotes: {"ABC-1":"A note"}}];
  const props = {run:{label:"Combined Work",issues:[issue()]},scope:"combined-work",combinedSites:sites,jiraRowPriorities:{}};
  const metrics = api.render("metrics", () => api.Metrics(props));
  assert.ok(nodes(metrics).some(node => node.type === api.Panel), "full reports must be mounted inside combined metrics");
  let tree = api.render("panel", () => api.Panel(props)); await turn();
  nodes(tree).find(node => textOf(node).startsWith("1:1 Prep") && node.type === "button").props.onClick();
  tree = api.render("panel", () => api.Panel(props));
  assert.ok(nodes(tree).some(node => node.props?.value === "Combined goals"));
  nodes(tree).find(node => node.type === "button" && textOf(node) === "Generate Report").props.onClick();
  for(let i=0;i<6;i++) await turn();
  const generated = calls.find(call => call.url.endsWith("/api/report/project")); assert.ok(generated);
  assert.equal(generated.options.headers["X-Docket-Report-Scope"],"combined-work");
  const body = JSON.parse(generated.options.body); assert.equal(body.summary.sources[0].issues[0].note,"A note"); assert.equal(body.userGoals,"Combined goals");
  assert.ok(calls.filter(call=>call.url.endsWith("/api/settings")).every(call=>call.options.headers["X-Docket-Report-Scope"] === "combined-work"));
  api.unmount();
});

const hooksPlugin = { name: "managed-hooks", setup(build) {
  build.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "hooks" }));
  build.onLoad({ filter: /.*/, namespace: "hooks" }, () => ({ contents: `
    let slots = new Map(), current, cursor = 0, effects = [];
    export const useState = initial => { const store = current; const i = cursor++; if (!(i in store)) store[i] = typeof initial === 'function' ? initial() : initial; return [store[i], next => { store[i] = typeof next === 'function' ? next(store[i]) : next; }]; };
    export const useRef = initial => useState(() => ({current: initial}))[0];
    export const useMemo = (factory, deps) => { const i = cursor++; if (!current[i] || deps.some((v, n) => v !== current[i].deps[n])) current[i] = {deps, value: factory()}; return current[i].value; };
    export const useCallback = (fn, deps) => useMemo(() => fn, deps);
    export const useEffect = (effect, deps) => { const store = current; const i = cursor++; if (!store[i] || !deps || deps.some((v,n) => v !== store[i].deps?.[n])) { const old = store[i]; store[i] = {deps}; effects.push(() => { old?.cleanup?.(); store[i].cleanup = effect(); }); } };
    export const render = (id, component) => { if (!slots.has(id)) slots.set(id, []); current = slots.get(id); cursor = 0; const result = component(); effects.splice(0).forEach(effect => effect()); return result; };
    export const unmount = () => { for (const store of slots.values()) for (const entry of store) entry?.cleanup?.(); };
    export const createElement = (type, props, ...children) => ({type, props: props || {}, children});
    export const createContext = value => ({Provider: 'provider', value});
    export default {useState,useRef,useMemo,useCallback,useEffect,createElement,createContext};
  ` }));
  build.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: "router", namespace: "router" }));
  build.onLoad({ filter: /.*/, namespace: "router" }, () => ({ contents: 'export const Link="a";' }));
  build.onResolve({ filter: /^semantic-ui-react$/ }, () => ({ path: "ui", namespace: "ui" }));
  build.onLoad({ filter: /.*/, namespace: "ui" }, () => ({ contents: 'export const Button="button", Modal="modal", Icon="i", Input="input", Dropdown="select", Message="message", Checkbox="input", Form="form", Container="div", Header="h2", Table="table", Tab={Pane:"div"};' }));
} };

const bundleUi = async contents => {
  const result = await build({ stdin: { contents, resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "esm", loader: {".css":"empty"}, define: { "import.meta.env.VITE_API_BASE": "undefined" }, plugins:[hooksPlugin] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${bundleId++}`);
};
const nodes = tree => !tree || typeof tree !== "object" ? [] : [tree,...(tree.children||[]).flat(Infinity).flatMap(nodes)];
const textOf = tree => tree == null ? "" : typeof tree !== "object" ? String(tree) : (tree.children||[]).flat(Infinity).map(textOf).join("");
const turn = () => new Promise(resolve=>setImmediate(resolve));

test("combined source status categories and partial comment notices preserve successful history", async t => {
  install(t); const api = await reports();
  const initial = api.buildCombinedReportSummary([{...source("a"), issues:[issue("ABC-1",{status:{name:"Not done",statusCategory:{key:"new"}}})]}]);
  assert.equal(initial.sources[0].open,1); assert.equal(initial.sources[0].topPriorities.length,1);
  globalThis.fetch = async (url,options) => {
    let data = {items:{}};
    if(url.includes("search/all")) data = {issues:[issue("ABC-1"),issue("ABC-2")],isComplete:true};
    else if(url.includes("field-mappings")) data = {items:[]};
    else if(url.includes("recent-notes")) data = {issueKeys:[]};
    else if(url.includes("comments/latest")) data = {items:{"ABC-2":{text:"Success",created:new Date().toISOString()}},errors:{"ABC-1":"Latest comment unavailable."}};
    return new Response(JSON.stringify(data));
  };
  const result = await api.loadCombinedReportHistory({sites:[source("a")],months:3});
  assert.match(result.notices.join(" "),/ABC-1: Latest comment unavailable/);
  assert.equal(result.sources[0].issues[1].latestComment.text,"Success");
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = () => assert.fail("aborted report must not query");
  await assert.rejects(api.loadCombinedReportHistory({sites:[source("a")],months:3,signal:controller.signal}),{name:"AbortError"});
});

test("Past Reports Combined Work panel scopes listing, detail and delete even with overlapping numeric IDs", async t => {
  install(t); const api = await bundleUi('export {default as Archive} from "./src/Pages/ReportArchive.jsx"; export {render,unmount} from "react";');
  const calls=[]; globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith("/api/health")?{siteContext:{instanceId:"ordinary",generation:1}}:url.endsWith("/1")?{item:{id:1,label:"Combined",content:"Combined result"}}:{items:[{id:1,label:"Combined"}]}));};
  const tree=api.render("archive",()=>api.Archive());
  const panes=nodes(tree).find(node=>node.props.panes).props.panes;
  assert.ok(panes.some(pane=>pane.menuItem === "Task Management"));
  const panel=panes.find(pane=>pane.menuItem === "Combined Work").render().children[0];
  let rendered=api.render("archive-panel",()=>panel.type(panel.props)); await turn();
  rendered=api.render("archive-panel",()=>panel.type(panel.props));
  let list=nodes(rendered).find(node=>node.type?.name === "ReportList");
  await list.props.onSelect({id:1});
  rendered=api.render("archive-panel",()=>panel.type(panel.props));
  list=nodes(rendered).find(node=>node.type?.name === "ReportList"); await list.props.onDelete({id:1,label:"Combined"});
  assert.ok(calls.some(call=>call.options.method === "DELETE"));
  assert.ok(calls.every(call=>call.options.headers["X-Docket-Report-Scope"] === "combined-work"));
  api.unmount();
});

for (const outcome of ["success", "error"]) test(`reattached Combined Work ${outcome} stays with its originating sources and options`, async t => {
  install(t);
  const api = await bundleUi('export {default as Panel} from "./src/Pages/components/ProjectReportPanel.jsx"; export * from "./src/Pages/combinedWorkReports.js"; export * from "./src/utils/pageReportPersistence.js"; export {render,unmount} from "react";');
  let finishReport;
  globalThis.fetch = async url => {
    if (url.endsWith("/api/report/project")) return new Promise(resolve => { finishReport = resolve; });
    return new Response(JSON.stringify(url.endsWith("/api/settings") ? {settings:{}} : {ready:true}));
  };
  const propsA = {run:{label:"Combined Work",issues:[issue()]},scope:"combined-work",combinedSites:[{...source("a"),issues:[issue()]}],jiraRowPriorities:{}};
  let tree = api.render("original", () => api.Panel(propsA));
  nodes(tree).find(node => node.type === "button" && textOf(node) === "Generate Report").props.onClick();
  await turn(); assert.ok(finishReport);
  api.unmount();
  api.render("remounted", () => api.Panel(propsA));
  const propsB = {...propsA,combinedSites:[{...source("b"),issues:[issue()]}]};
  tree = api.render("remounted", () => api.Panel(propsB));
  nodes(tree).find(node => node.type === "button" && textOf(node).startsWith("1:1 Prep")).props.onClick();
  tree = api.render("remounted", () => api.Panel(propsB));
  tree = api.render("remounted", () => api.Panel(propsB));
  assert.equal(nodes(tree).find(node => node.type?.name === "ReportOutput").props.report, null);
  finishReport(new Response(JSON.stringify(outcome === "success" ? {report:"Source A report",label:"A"} : {error:"Source A failed"}), {status:outcome === "success" ? 200 : 500}));
  for (let i=0;i<6;i++) await turn();
  tree = api.render("remounted", () => api.Panel(propsB));
  assert.equal(nodes(tree).find(node => node.type?.name === "ReportOutput").props.report, null, "A completion must not display under B");
  assert.doesNotMatch(textOf(tree), /Source A failed/, "A error must not display under B");
  const options = {reportScope:"current",allWorkMonths:3,reportType:"one_on_one",pwbPeriod:"quarterly"};
  assert.equal(api.loadWorkWeekProjectReport(api.combinedReportRunKey(propsB.combinedSites,options),context),null);
  if (outcome === "success") {
    const savedA = api.loadWorkWeekProjectReport(api.combinedReportRunKey(propsA.combinedSites,{...options,reportType:"status"}),context);
    assert.equal(savedA.report.report,"Source A report");
  }
  api.unmount();
});

test("ordinary reattachment keeps latest callbacks and original result", async t => {
  install(t);
  const api = await bundleUi('export {useAttachBackgroundJob,runBackgroundJob} from "./src/hooks/useBackgroundJobs.js"; export {render,unmount} from "react";');
  let finish;
  const pending = api.runBackgroundJob("ordinary", {run:() => new Promise(resolve => {finish=resolve;})});
  await turn();
  const received=[];
  api.render("ordinary", () => api.useAttachBackgroundJob("ordinary", {onSuccess:value => received.push(["old",value])}));
  api.render("ordinary", () => api.useAttachBackgroundJob("ordinary", {onSuccess:value => received.push(["latest",value])}));
  finish("ordinary result"); await pending; await turn();
  assert.deepEqual(received,[["latest","ordinary result"]]);
  api.unmount();
});
