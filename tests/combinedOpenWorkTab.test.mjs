import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

let bundleId = 0;
const find = (node, predicate) => !node || typeof node !== "object" ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, predicate))];
const text = node => typeof node === "string" || typeof node === "number" ? String(node) : (node?.children || []).flat(Infinity).map(text).join(" ");
const tab = (app, label) => find(app.render(), node => node.props.role === "tab" && text(node) === label)[0];
const run = (index, label) => ({ index, label, jql: "project = TEST", issues: [], loaded: 0, total: 4, loadComplete: false });

// Keep the result-tab state and handlers real; child views are inspected at their component boundary.
const mount = async (t, overrides = {}) => {
  const built = await build({ stdin: { contents: 'export {default as Table} from "./src/Pages/components/JiraResultsTable.jsx"; export * from "react";', resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "esm", loader: { ".css": "empty" }, define: { "import.meta.env.VITE_API_BASE": "undefined" }, plugins: [{ name: "tab-hooks", setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "hooks" }));
    build.onLoad({ filter: /.*/, namespace: "hooks" }, () => ({ contents: `
      let values = [], cursor = 0, effects = [], cleanups = [], Component;
      export const useState = initial => { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], next => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; };
      export const useRef = initial => { const [ref] = useState(() => ({current: initial})); return ref; };
      export const useMemo = (factory, deps) => { const i = cursor++; if (!values[i] || deps.some((value, index) => value !== values[i].deps[index])) values[i] = {deps, value: factory()}; return values[i].value; };
      export const useCallback = (callback, deps) => useMemo(() => callback, deps);
      export const useEffect = (effect, deps) => { const i = cursor++; if (!values[i] || deps.some((value, index) => value !== values[i][index])) { effects.push(() => { cleanups[i]?.(); cleanups[i] = effect(); }); values[i] = deps; } };
      export const createElement = (type, props, ...children) => ({type, props: props || {}, children});
      export const createContext = value => ({Provider: 'provider', value});
      export const render = () => { cursor = 0; const tree = Component(); effects.splice(0).forEach(effect => effect()); return tree; };
      export const start = component => { Component = component; return render(); };
      export const unmount = () => cleanups.forEach(cleanup => cleanup?.());
      export default {useState,useRef,useMemo,useCallback,useEffect,createElement,createContext};
    ` }));
    build.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: "router", namespace: "router" }));
    build.onLoad({ filter: /.*/, namespace: "router" }, () => ({ contents: 'export const Link="a";' }));
    build.onResolve({ filter: /^semantic-ui-react$/ }, () => ({ path: "semantic", namespace: "ui" }));
    build.onLoad({ filter: /.*/, namespace: "ui" }, () => ({ contents: 'export const Button="button", Modal="modal", Icon="i", Input="input", Dropdown="select", Message="message", Checkbox="input", Form="form";' }));
  } }] });
  const app = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}#${bundleId++}`);
  const props = { jqlRuns: [run(0, "Preset A"), run(1, "Preset B")], isClosedLikeStatus: () => false, jiraRowPriorities: {}, ...overrides };
  app.start(() => app.Table(props));
  t.after(app.unmount);
  return { ...app, props };
};

test("combined work remains a selectable result tab without configured JQL runs", async t => {
  const app = await mount(t, { jqlRuns: [] });
  assert.equal(tab(app, "Combined Open Work")?.props["aria-selected"], true);
  assert.equal(find(app.render(), node => node.type?.name === "CombinedOpenWork").length, 1);
});

test("combined selection never persists a fake JQL index and preserves ordinary controls", async t => {
  const selected = [];
  const loaded = [];
  const app = await mount(t, { initialActiveRunIndex: 1, combinedOpenWorkActive: false, onActiveTabChange: index => selected.push(index), onLoadRemaining: index => loaded.push(index) });
  app.props.onCombinedOpenWorkChange = active => { app.props.combinedOpenWorkActive = active; };
  assert.equal(tab(app, "Preset B").props["aria-selected"], true);
  const load = find(app.render(), node => node.type === "button" && text(node).includes("Load remaining"))[0];
  load.props.onClick();
  assert.deepEqual(loaded, [1]);
  assert.ok(tab(app, "Combined Open Work"));
  tab(app, "Combined Open Work").props.onClick();
  assert.equal(tab(app, "Combined Open Work")?.props["aria-selected"], true);
  assert.deepEqual(selected, []);
  assert.equal(find(app.render(), node => node.type?.name === "CombinedOpenWork").length, 1);
  assert.equal(find(app.render(), node => node.props.className === "ww-key-filter-row").length, 0);
  tab(app, "Preset A").props.onClick();
  assert.equal(tab(app, "Preset A").props["aria-selected"], true);
  assert.deepEqual(selected, [0]);
  assert.equal(find(app.render(), node => node.type?.name === "CombinedOpenWork").length, 1, "visited combined work remains mounted across ordinary tab switches");
  assert.equal(find(app.render(), node => node.props["data-combined-work-view"] === true)[0]?.props.hidden, true);
  assert.equal(find(app.render(), node => node.props.className === "ww-key-filter-row").length, 1);
});

test("combined URL selection survives ordinary tab clamping while drill-down tabs still select their run", async t => {
  const selected = [];
  const app = await mount(t, { combinedOpenWorkActive: true, onActiveTabChange: index => selected.push(index) });
  assert.equal(tab(app, "Combined Open Work")?.props["aria-selected"], true);
  app.props.jqlRuns = [];
  app.render();
  assert.equal(tab(app, "Combined Open Work")?.props["aria-selected"], true);
  assert.deepEqual(selected, []);
  app.props.combinedOpenWorkActive = false;
  app.props.jqlRuns = [{ ...run(0, "Drill-down"), isDrillDown: true, drillDownId: "issue:TEST-1" }];
  app.props.drillDownFilters = { key: "TEST-1" };
  app.render();
  assert.equal(tab(app, "Drill-down").props["aria-selected"], true);
  assert.deepEqual(selected, [0]);
});

test("old combined route redirects to the Task Management tab", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const built = await build({ entryPoints: ["src/AppRouter.jsx"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", loader: { ".css": "empty" }, define: { "import.meta.env.VITE_API_BASE": "undefined" }, plugins: [{ name: "capture-routes", setup(build) {
    build.onResolve({ filter: /\.css$/ }, () => ({ path: "css", namespace: "empty" }));
    build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "" }));
    build.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: "router", namespace: "routes" }));
    build.onLoad({ filter: /.*/, namespace: "routes" }, () => ({ contents: 'export * from "react-router-dom-real"; export const createHashRouter = routes => routes;' }));
    build.onResolve({ filter: /^react-router-dom-real$/ }, () => ({ path: require.resolve("react-router-dom"), external: true }));
  } }] });
  const mod = { exports: {} };
  new Function("require", "module", "exports", built.outputFiles[0].text)(require, mod, mod.exports);
  const route = mod.exports.default[0].children.find(route => route.path === "/combined-open-work");
  assert.equal(route.element.props.to, "/work-week?tab=combined-open-work");
  assert.equal(route.element.props.replace, true);
});
