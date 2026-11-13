import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { registerDatabricksRoutes } from "../server/routes/databricksRoutes.mjs";
import { HOST_INVALID_MESSAGE } from "../shared/databricksSetupGuide.mjs";

const ENV_NAMES = ["DATABRICKS_HOST", "DATABRICKS_TOKEN", "DATABRICKS_ENDPOINT"];
const FAKE_TOKEN = "dapi-test-recognizable-secret";

let savedEnv;
let server;
let baseUrl;
let checkCalls;

const startApp = async (check) => {
  const app = express();
  app.use(express.json());
  registerDatabricksRoutes(app, { check });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
};

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  checkCalls = [];
  await startApp(async (args) => {
    checkCalls.push(args);
    return { ok: true, user: "fake-user", code: "ok", message: "fine", checks: [] };
  });
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

describe("GET /api/databricks/status", () => {
  it("is all false when nothing is set", async () => {
    const res = await fetch(`${baseUrl}/api/databricks/status`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { tokenSet: false, hostConfigured: false, endpointConfigured: false });
  });

  it("returns booleans only and never the token value", async () => {
    process.env.DATABRICKS_HOST = "example.cloud.databricks.com";
    process.env.DATABRICKS_TOKEN = `  ${FAKE_TOKEN}  `;
    process.env.DATABRICKS_ENDPOINT = "chat-endpoint";
    const res = await fetch(`${baseUrl}/api/databricks/status`);
    const text = await res.text();
    assert.ok(!text.includes(FAKE_TOKEN));
    assert.ok(!text.includes("example.cloud.databricks.com"));
    assert.deepEqual(JSON.parse(text), { tokenSet: true, hostConfigured: true, endpointConfigured: true });
  });

  it("treats whitespace-only values as unset", async () => {
    process.env.DATABRICKS_TOKEN = "   ";
    const body = await (await fetch(`${baseUrl}/api/databricks/status`)).json();
    assert.equal(body.tokenSet, false);
  });
});

describe("POST /api/databricks/test", () => {
  it("passes trimmed env values to the check and returns its result unchanged", async () => {
    process.env.DATABRICKS_HOST = "https://example.cloud.databricks.com";
    process.env.DATABRICKS_TOKEN = ` ${FAKE_TOKEN} `;
    process.env.DATABRICKS_ENDPOINT = "chat-endpoint";
    const res = await fetch(`${baseUrl}/api/databricks/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "dapi-test-from-body", host: "evil.example.com" }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, user: "fake-user", code: "ok", message: "fine", checks: [] });
    assert.equal(checkCalls.length, 1);
    assert.equal(checkCalls[0].token, FAKE_TOKEN);
    assert.equal(checkCalls[0].endpoint, "chat-endpoint");
    assert.ok(checkCalls[0].host.includes("example.cloud.databricks.com"));
    assert.ok(!checkCalls[0].host.includes("evil"));
  });

  it("returns host_missing from the real check when nothing is set", async () => {
    await new Promise((resolve) => server.close(resolve));
    const app = express();
    registerDatabricksRoutes(app);
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const res = await fetch(`${baseUrl}/api/databricks/test`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "host_missing");
  });

  it("rejects an invalid host without calling the check", async () => {
    process.env.DATABRICKS_HOST = "http://";
    process.env.DATABRICKS_TOKEN = FAKE_TOKEN;
    const res = await fetch(`${baseUrl}/api/databricks/test`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      ok: false,
      user: null,
      code: "host_invalid",
      message: HOST_INVALID_MESSAGE,
      checks: [],
    });
    assert.equal(checkCalls.length, 0);
  });

  it("passes an unset host through so the check reports host_missing", async () => {
    process.env.DATABRICKS_TOKEN = FAKE_TOKEN;
    await fetch(`${baseUrl}/api/databricks/test`, { method: "POST" });
    assert.equal(checkCalls.length, 1);
    assert.equal(checkCalls[0].host, "");
  });
});
