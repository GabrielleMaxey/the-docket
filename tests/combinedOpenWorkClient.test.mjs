import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

let bundleId = 0;
const bundle = async (contents, plugins = []) => {
  const result = await build({ stdin: { contents, resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "esm", loader: { ".css": "empty" }, define: { "import.meta.env.VITE_API_BASE": "undefined" }, plugins });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${bundleId++}`);
};
const turn = () => new Promise(resolve => setImmediate(resolve));
const saved = [{ id: "a", displayName: "Site A", baseUrl: "https://lumen.atlassian.net", enabled: true }, { id: "b", displayName: "Site B", baseUrl: "https://lumen.atlassian.net", enabled: true }, { id: "disabled", enabled: false }];
const result = (title = "Task") => ({ fetchedAt: "2026-10-15T12:00:00Z", sites: saved.slice(0, 2).map(s => ({ instanceId: s.id, displayName: s.displayName, siteHost: "lumen.atlassian.net", status: "complete", loaded: 1, rows: [{ issueKey: "ABC-1", summary: title, status: "Open", jiraPriority: "High", dueDate: "2026-10-31", url: "https://lumen.atlassian.net/browse/ABC-1" }] })) });
const find = (node, predicate) => !node || typeof node !== "object" ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
const text = node => typeof node === "string" || typeof node === "number" ? String(node) : (node?.children || []).flat(Infinity).map(text).join(" ");
const button = (app, label) => find(app.render(), n => n.type === "button" && text(n).includes(label))[0];

// Exercise the complete page with a small hook renderer; HTTP remains the external boundary.
const mount = async (t, fetcher) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  t.after(() => { globalThis.fetch = previousFetch; });
  const app = await bundle('export { default as Page } from "./src/Pages/CombinedOpenWork.jsx"; export * from "react";', [{
    name: "page-hooks",
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "hooks" }));
      build.onLoad({ filter: /.*/, namespace: "hooks" }, () => ({ contents: `
        let values = [], cursor = 0, effects = [], cleanups = [], Component;
        export const useState = initial => { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], next => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; };
        export const useRef = initial => { const [ref] = useState(() => ({current: initial})); return ref; };
        export const useEffect = (effect, deps) => { const i = cursor++; if (!values[i] || deps.some((value, index) => value !== values[i][index])) { effects.push(() => { cleanups[i]?.(); cleanups[i] = effect(); }); values[i] = deps; } };
        export const createElement = (type, props, ...children) => ({type, props: props || {}, children});
        export const render = () => { cursor = 0; const tree = Component(); effects.splice(0).forEach(effect => effect()); return tree; };
        export const start = component => { Component = component; return render(); };
        export const unmount = () => cleanups.forEach(cleanup => cleanup?.());
        export default {useState,useRef,useEffect,createElement};
      ` }));
    },
  }]);
  app.start(app.Page);
  await turn();
  t.after(app.unmount);
  return app;
};

test("read wrapper sends exact ids and signal without site headers, health dependency or save jobs", async t => {
  const nativeFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = nativeFetch; });
  const client = await bundle('export * from "./src/services/jiraClient.js"; export * from "./src/utils/backgroundJobStore.js";');
  const controller = new AbortController();
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(result())); };
  assert.equal(typeof client.fetchCombinedOpenWork, "function");
  await client.fetchCombinedOpenWork(["a", "b"], { signal: controller.signal });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/combined-open-work");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.deepEqual(JSON.parse(calls[0].options.body), { instanceIds: ["a", "b"] });
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.headers["X-Docket-Site"], undefined);
  assert.equal(client.getActiveBackgroundJobs().length, 0);
});

test("page selects enabled sites, waits for explicit load, keeps same-key rows and safe source links", async t => {
  const calls = [];
  const app = await mount(t, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/health")) return new Response('{"siteContext":{"instanceId":"active","generation":"1"}}');
    return new Response(JSON.stringify(url.endsWith("/instances") ? { instances: saved } : result()));
  });
  let tree = app.render();
  const checkboxes = find(tree, n => n.type === "input" && n.props.type === "checkbox");
  assert.equal(checkboxes.length, 2);
  assert.ok(checkboxes.every(n => n.props.checked));
  assert.ok(!calls.some(c => c.url.endsWith("combined-open-work")));
  await button(app, "Load open work").props.onClick();
  tree = app.render();
  assert.equal(find(tree, n => n.type === "a" && n.props.href === "https://lumen.atlassian.net/browse/ABC-1").length, 2);
  assert.match(text(tree), /Site A/);
  assert.match(text(tree), /Site B/);
  assert.match(text(tree), /2\s+issues/);
  assert.match(text(tree), /2026-10-31/);
  assert.ok(button(app, "Refresh"));
  assert.ok(!calls.some(c => c.url.includes("/activate")));
  checkboxes[0].props.onChange();
  assert.equal(find(app.render(), n => n.type === "a" && n.props.href.includes("/browse/")).length, 0);
});

test("failed and partial notices preserve successful rows; no selection disables load", async t => {
  const response = result();
  response.sites[0].status = "partial";
  response.sites[0].message = "List incomplete";
  response.sites[1] = { ...response.sites[1], rows: [], loaded: 0, status: "failed", message: "Access denied" };
  const app = await mount(t, async url => new Response(JSON.stringify(url.endsWith("/health") ? { siteContext: { instanceId: "active", generation: "1" } } : url.endsWith("/instances") ? { instances: saved } : response)));
  await button(app, "Load open work").props.onClick();
  assert.match(text(app.render()), /List incomplete/);
  assert.match(text(app.render()), /Access denied/);
  assert.equal(find(app.render(), n => n.type === "a" && n.props.href.includes("/browse/")).length, 1);
  for (const n of find(app.render(), n => n.type === "input")) n.props.onChange();
  assert.ok(button(app, "Load open work").props.disabled);
  assert.match(text(app.render()), /Select at least one/i);
});

test("refresh, selection change, cancel and unmount abort obsolete work; late data cannot replace new state", async t => {
  const pending = [];
  const app = await mount(t, async (url, options) => {
    if (url.endsWith("/health")) return new Response('{"siteContext":{"instanceId":"active","generation":"1"}}');
    if (url.endsWith("/instances")) return new Response(JSON.stringify({ instances: saved }));
    return new Promise(resolve => pending.push({ resolve, signal: options.signal }));
  });
  const first = button(app, "Load open work").props.onClick();
  assert.ok(button(app, "Cancel"));
  find(app.render(), n => n.type === "input")[0].props.onChange();
  assert.equal(pending[0].signal.aborted, true);
  const second = button(app, "Load open work").props.onClick();
  pending[1].resolve(new Response(JSON.stringify(result("newer"))));
  await second;
  pending[0].resolve(new Response(JSON.stringify(result("stale"))));
  await first;
  assert.match(text(app.render()), /newer/);
  assert.doesNotMatch(text(app.render()), /stale/);
  const refresh = button(app, "Refresh").props.onClick();
  button(app, "Cancel").props.onClick();
  assert.equal(pending[2].signal.aborted, true);
  pending[2].resolve(new Response(JSON.stringify(result("cancelled"))));
  await refresh;
  assert.doesNotMatch(text(app.render()), /cancelled/);
  const last = button(app, "Refresh").props.onClick();
  app.unmount();
  assert.equal(pending[3].signal.aborted, true);
  pending[3].resolve(new Response(JSON.stringify(result("unmounted"))));
  await last;
});

test("no saved sites offers Settings, registry errors show failure, empty complete states remain explicit", async t => {
  for (const mode of ["none", "error", "empty", "load-error"]) {
    const app = await mount(t, async url => {
      if (url.endsWith("/health")) return new Response('{"siteContext":{"instanceId":"active","generation":"1"}}');
      if (url.endsWith("/instances")) return new Response(JSON.stringify(mode === "error" ? { error: "Registry unavailable" } : { instances: mode === "none" ? [] : saved }), { status: mode === "error" ? 503 : 200 });
      if (mode === "load-error") return new Response('{"error":"Collection unavailable"}', { status: 503 });
      return new Response(JSON.stringify({ ...result(), sites: result().sites.map(s => ({ ...s, rows: [], loaded: 0 })) }));
    });
    if (mode === "none") assert.equal(find(app.render(), n => n.type === "a" && n.props.href === "#/settings").length, 1);
    if (mode === "error") assert.match(text(app.render()), /Registry unavailable/);
    if (mode === "load-error") {
      await button(app, "Load open work").props.onClick();
      assert.match(text(app.render()), /Collection unavailable/);
    }
    if (mode === "empty") {
      await button(app, "Load open work").props.onClick();
      assert.match(text(app.render()), /No open work/);
    }
  }
});
