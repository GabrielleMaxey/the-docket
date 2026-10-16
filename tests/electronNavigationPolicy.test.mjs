import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const policyPath = new URL("../electron/navigationPolicy.cjs", import.meta.url);
const policy = require(policyPath.pathname);
const appOrigin = "http://localhost:5173";
const jiraHosts = ["lumen.atlassian.net", "extra.example.test"];
const externalHosts = ["auth.atlassian.com"];

for (const [url, expected] of [
  ["http://localhost:5173/work-week?tab=1#notes", true],
  ["http://localhost:5173", true],
  ["http://127.0.0.1:5173", false],
  ["http://localhost:5174", false],
  ["https://localhost:5173", false],
  ["http://localhost:5173.evil.test", false],
  ["http://user:pass@localhost:5173", false],
  ["javascript:alert(1)", false],
  ["file:///tmp/index.html", false],
  ["blob:http://localhost:5173/fixture", false],
  ["not a URL", false],
]) {
  test(`app navigation ${expected ? "permits" : "blocks"} ${url}`, () => {
    assert.equal(typeof policy.isAppNavigation, "function", "App navigation validator is required");
    assert.equal(policy.isAppNavigation(url, { appOrigin }), expected);
  });
}

for (const [url, expected] of [
  ["https://lumen.atlassian.net/browse/TEST-1", true],
  ["https://extra.example.test/browse/TEST-2", true],
  ["https://auth.atlassian.com/authorize?client_id=fixture", true],
  ["https://lumen.atlassian.net.evil.test/browse/TEST-1", false],
  ["https://sub.lumen.atlassian.net/browse/TEST-1", false],
  ["https://evil.test/?next=https://lumen.atlassian.net", false],
  ["https://user:pass@lumen.atlassian.net/browse/TEST-1", false],
  ["https://lumen.atlassian.net:444/browse/TEST-1", false],
  ["http://lumen.atlassian.net/browse/TEST-1", false],
  ["javascript:alert(1)", false],
  ["file:///tmp/fixture.pdf", false],
  ["blob:http://localhost:5173/fixture", false],
  ["not a URL", false],
]) {
  test(`external navigation ${expected ? "permits" : "blocks"} ${url}`, () => {
    assert.equal(typeof policy.isAllowedExternalUrl, "function", "External URL validator is required");
    assert.equal(policy.isAllowedExternalUrl(url, { jiraHosts, externalHosts }), expected);
  });
}

test("sandbox preload exposes the argument API without requiring process.env", () => {
  let desktop;
  vm.runInNewContext(fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8"), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { desktop = value; } } }),
    process: { argv: ["electron", "--api-port=59187", "--api-base=http://127.0.0.1:59187"], platform: "darwin" },
  });
  assert.equal(desktop.apiPort, 59187);
  assert.equal(desktop.apiBaseUrl, "http://127.0.0.1:59187");
});

test("sandbox preload keeps the default API address when arguments are absent", () => {
  let desktop;
  vm.runInNewContext(fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8"), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { desktop = value; } } }),
    process: { argv: ["electron"], platform: "darwin" },
  });
  assert.equal(desktop.apiPort, 8787);
  assert.equal(desktop.apiBaseUrl, "http://127.0.0.1:8787");
});

for (const packaged of [false, true]) {
  test(`Electron ${packaged ? "packaged" : "development"} denies windows and uses server navigation configuration`, (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "docket-navigation-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const userData = path.join(directory, "user-data");
    fs.mkdirSync(userData);
    fs.writeFileSync(path.join(directory, ".env"), "JIRA_ALLOWED_HOSTS=root.example.test\nDOCKET_EXTERNAL_HOSTS=root-links.example.test\n");
    fs.writeFileSync(path.join(userData, ".env"), "JIRA_ALLOWED_HOSTS=user.example.test\nDOCKET_EXTERNAL_HOSTS=user-links.example.test\n");
    const expectedAppOrigin = packaged ? "http://127.0.0.1:59187" : appOrigin;
    let windowOptions;
    let openHandler;
    let loadedUrl;
    const handlers = {};
    const externalUrls = [];
    const electron = {
      app: { isPackaged: packaged, getAppPath: () => directory, getPath: () => userData },
      BrowserWindow: function (options) {
        windowOptions = options;
        this.once = () => {};
        this.loadURL = (url) => { loadedUrl = url; };
        this.webContents = {
          on: (name, handler) => { handlers[name] = handler; },
          setWindowOpenHandler: (handler) => { openHandler = handler; },
        };
      },
      shell: { openExternal: async (url) => { externalUrls.push(url); } },
    };
    const source = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
    vm.runInNewContext(`${source.slice(0, source.indexOf("app.whenReady()"))}\ncreateWindow();`, {
      require: (name) => name === "electron" ? electron : name.startsWith("./") ? require(new URL(`../electron/${name.slice(2)}`, import.meta.url).pathname) : require(name),
      __dirname: new URL("../electron", import.meta.url).pathname,
      process: { env: { API_PORT: "59187", TASK_MANAGER_USER_DATA: userData, JIRA_ALLOWED_HOSTS: "process.example.test" }, platform: "darwin" },
      console,
      URL,
    });
    assert.equal(windowOptions.webPreferences.sandbox, true);
    assert.equal(windowOptions.webPreferences.contextIsolation, true);
    assert.equal(windowOptions.webPreferences.nodeIntegration, false);
    assert.equal(loadedUrl, expectedAppOrigin);
    assert.deepEqual(Array.from(windowOptions.webPreferences.additionalArguments), ["--api-port=59187"]);
    assert.equal(typeof openHandler, "function");
    for (const url of ["https://lumen.atlassian.net/browse/TEST-1", "https://auth.atlassian.com/authorize?client_id=fixture", "https://user.example.test/browse/TEST-1", "https://user-links.example.test/report", "https://root.example.test", "https://root-links.example.test", "https://process.example.test", "https://evil.test", `${expectedAppOrigin}/reports`, "file:///tmp/fixture", "javascript:alert(1)"]) {
      assert.equal(openHandler({ url }).action, "deny");
    }
    assert.deepEqual(externalUrls, ["https://lumen.atlassian.net/browse/TEST-1", "https://auth.atlassian.com/authorize?client_id=fixture", "https://user.example.test/browse/TEST-1", "https://user-links.example.test/report"]);
    let prevented = false;
    handlers["will-navigate"]({ preventDefault: () => { prevented = true; } }, `${expectedAppOrigin}/reports`);
    assert.equal(prevented, false);
    handlers["will-navigate"]({ preventDefault: () => { prevented = true; } }, "https://evil.test");
    assert.equal(prevented, true);
    assert.equal(externalUrls.length, 4);
    prevented = false;
    handlers["will-redirect"]({ preventDefault: () => { prevented = true; } }, "https://evil.test");
    assert.equal(prevented, true);
  });
}
