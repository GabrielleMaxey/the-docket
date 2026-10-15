import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { createServer } from "vite";

const root = path.resolve(new URL("..", import.meta.url).pathname);

function assertPolicy(header) {
  assert.ok(header, "Served documents need Content-Security-Policy");
  const directives = Object.fromEntries(header.split(";").map((entry) => {
    const [name, ...values] = entry.trim().split(/\s+/);
    return [name, values];
  }));
  assert.ok(directives["script-src"].includes("'self'"));
  for (const source of ["https:", "'unsafe-inline'", "'unsafe-eval'"]) {
    assert.equal(directives["script-src"].includes(source), false, source);
  }
  assert.equal(directives["connect-src"].includes("https:"), false);
  assert.deepEqual(directives["object-src"], ["'none'"]);
  assert.deepEqual(directives["base-uri"], ["'none'"]);
  assert.deepEqual(directives["frame-ancestors"], ["'none'"]);
  assert.ok(directives["img-src"].includes("blob:"));
  assert.ok(directives["img-src"].includes("data:"));
  return directives;
}

test("Vite serves constrained CSP with the exact React refresh preamble hash and local HMR", async (t) => {
  const envDir = fs.mkdtempSync(path.join(os.tmpdir(), "docket-vite-env-"));
  t.after(() => fs.rmSync(envDir, { recursive: true, force: true }));
  const vite = await createServer({ root, envDir, server: { host: "localhost", port: 5173, strictPort: true } });
  t.after(() => vite.close());
  await vite.listen();
  const response = await fetch("http://localhost:5173/");
  assert.equal(response.status, 200);
  const directives = assertPolicy(response.headers.get("content-security-policy"));
  const html = await response.text();
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).filter((value) => value.trim());
  assert.ok(scripts.length > 0, "React refresh preamble should be present");
  for (const script of scripts) {
    const hash = createHash("sha256").update(script).digest("base64");
    assert.ok(directives["script-src"].includes(`'sha256-${hash}'`), "Each inline script must match its CSP hash");
  }
  assert.ok(directives["connect-src"].includes("ws://localhost:5173"));
  assert.equal(directives["connect-src"].some((source) => source.includes("*:")), false);
  const asset = await fetch("http://localhost:5173/src/main.jsx");
  assertPolicy(asset.headers.get("content-security-policy"));
});

test("the real API server applies production CSP to HTML and fallback application routes", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "docket-csp-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const name of ["server", "shared"]) fs.cpSync(path.join(root, name), path.join(directory, name), { recursive: true });
  fs.symlinkSync(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
  fs.mkdirSync(path.join(directory, "dist"));
  fs.writeFileSync(path.join(directory, "dist/index.html"), '<!doctype html><div id="root">Synthetic CSP fixture</div>');
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, ["server/jiraProxy.mjs"], {
    cwd: directory,
    env: { PATH: process.env.PATH, TASK_MANAGER_USER_DATA: directory, API_PORT: String(port), JIRA_API_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (value) => { logs += value; });
  child.stderr.on("data", (value) => { logs += value; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      ready = (await fetch(`http://127.0.0.1:${port}/api/health`)).status === 200;
      if (ready) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(ready, logs);
  for (const route of ["/", "/work-week", "/reports"]) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    assert.equal(response.status, 200);
    const directives = assertPolicy(response.headers.get("content-security-policy"));
    assert.deepEqual(directives["script-src"], ["'self'"]);
    assert.equal(directives["connect-src"].some((source) => /^wss?:/.test(source)), false);
    assert.ok(directives["connect-src"].includes("https://icanhazdadjoke.com"));
    assert.ok(directives["connect-src"].includes("https://v2.jokeapi.dev"));
  }
});
