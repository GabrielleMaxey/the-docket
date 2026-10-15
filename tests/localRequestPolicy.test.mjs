import { it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import Database from "better-sqlite3";
import * as instances from "../server/lib/jiraInstances.mjs";
import { registerJiraInstanceRoutes } from "../server/routes/jiraInstanceRoutes.mjs";

import { localRequestPolicy } from "../server/lib/localRequestPolicy.mjs";

const allowed = ["lumen.atlassian.net"];
const nativeFetch = globalThis.fetch;

it("rejects unapproved destinations before credentials are used", () => {
  const { assertAllowedJiraBaseUrl } = instances;
  assert.equal(assertAllowedJiraBaseUrl("https://lumen.atlassian.net/browse/A-1", allowed), "https://lumen.atlassian.net");
  assert.equal(assertAllowedJiraBaseUrl("https://lumen.atlassian.net:443", allowed), "https://lumen.atlassian.net");
  for (const url of [
    "https://lumen.atlassian.net.evil.example", "https://lumen-fake.atlassian.net",
    "http://lumen.atlassian.net", "https://lumen.atlassian.net:444",
    "https://user:pass@lumen.atlassian.net", "https://lumen.atlassian.net./",
    "https://lumen.atlassian.net/rest/api/3", "https://lumen.atlassian.net/?next=evil",
    "not a URL",
  ]) assert.throws(() => assertAllowedJiraBaseUrl(url, allowed), undefined, url);
  assert.equal(assertAllowedJiraBaseUrl("https://extra.atlassian.net", ["extra.atlassian.net"]), "https://extra.atlassian.net");
  const db = new Database(":memory:");
  instances.initInstancesSchema(db);
  let tokenReads = 0;
  const env = { JIRA_BASE_URL: "https://evil.example", get JIRA_API_TOKEN() { tokenReads++; return "fixture"; } };
  assert.throws(() => instances.resolveJiraCredentials(db, env));
  assert.equal(tokenReads, 0);
  db.close();
});

it("checks exact loopback Host and Origin before allowing requests", () => {
  const policy = localRequestPolicy({ apiPort: 8787, allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:8787"] });
  for (const [host, origin, method, expected] of [
    ["127.0.0.1:8787", undefined, "POST", 200],
    ["localhost:8787", "http://localhost:5173", "PATCH", 200],
    ["127.0.0.1:8787", "http://127.0.0.1:8787", "GET", 200],
    ["evil.example:8787", "http://localhost:5173", "POST", 403],
    ["localhost.evil.example:8787", undefined, "GET", 403],
    ["127.0.0.1:9999", undefined, "GET", 403],
    ["user@localhost:8787", undefined, "GET", 403],
    ["localhost:8787/path", undefined, "GET", 403],
    ["127.0.0.1:8787", "http://localhost:9999", "POST", 403],
    ["127.0.0.1:8787", "null", "OPTIONS", 403],
    ["127.0.0.1:8787", "malformed", "DELETE", 403],
    ["127.0.0.1:8787", "http://localhost:5173/path", "GET", 403],
    ["127.0.0.1:8787", "", "POST", 403],
    [undefined, undefined, "GET", 403],
  ]) {
    const req = { method, headers: { host, "x-forwarded-host": "localhost:8787", ...(origin === undefined ? {} : { origin }) } };
    let status = 200;
    let nextCalled = false;
    const headers = {};
    const res = { status(code) { status = code; return this; }, json() {}, setHeader(key, value) { headers[key] = value; }, sendStatus(code) { status = code; } };
    policy(req, res, () => { nextCalled = true; });
    assert.equal(status, expected, `${host} ${origin} ${method}`);
    assert.equal(nextCalled, expected === 200);
    assert.equal(headers["Access-Control-Allow-Origin"], expected === 200 ? origin : undefined);
  }
});

async function withRoutes(t, env = { JIRA_API_TOKEN: "environment-secret" }) {
  const db = new Database(":memory:");
  instances.initInstancesSchema(db);
  const row = instances.createInstance(db, { displayName: "Fixture", baseUrl: "https://lumen.atlassian.net", email: "fixture@example.test" });
  const app = express();
  app.use(express.json());
  registerJiraInstanceRoutes(app, { metaDb: db, env, getCredentials: () => ({ mode: "instance" }), activateInstance: () => ({ instanceId: row.id }) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => { globalThis.fetch = nativeFetch; await new Promise((resolve) => server.close(resolve)); db.close(); });
  const request = (url, body, method = "POST") => nativeFetch(`http://127.0.0.1:${server.address().port}${url}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { db, row, request };
}

it("does not expose or persist tokens", async (t) => {
  const { db, row, request } = await withRoutes(t);
  assert.equal(db.prepare("SELECT api_token FROM jira_instances WHERE id = ?").get(row.id).api_token, "");
  const listing = await (await request("/api/jira/instances", undefined, "GET")).json();
  assert.equal(JSON.stringify(listing).includes("environment-secret"), false);
  assert.equal("apiToken" in listing.instances[0], false);
  assert.equal("hasToken" in listing.instances[0], false);
  for (const [url, method, body] of [
    ["/api/jira/instances", "POST", { displayName: "New", baseUrl: "https://lumen.atlassian.net", email: "x@example.test", apiToken: "submitted-secret" }],
    [`/api/jira/instances/${row.id}`, "PATCH", { apiToken: "submitted-secret" }],
    [`/api/jira/instances/${row.id}/test`, "POST", { apiToken: "submitted-secret" }],
  ]) {
    const response = await request(url, body, method);
    assert.equal(response.status, 400);
    assert.equal(JSON.stringify(await response.json()).includes("submitted-secret"), false);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM jira_instances WHERE api_token != ''").get().count, 0);
  assert.throws(() => instances.createInstance(db, { displayName: "Bad", baseUrl: "https://lumen.atlassian.net", email: "x@example.test", apiToken: "secret" }), /JIRA_API_TOKEN/);
  const seededDb = new Database(":memory:");
  t.after(() => seededDb.close());
  instances.initInstancesSchema(seededDb);
  instances.seedInstancesFromEnv(seededDb, { JIRA_INSTANCE_1_BASE_URL: "https://lumen.atlassian.net", JIRA_INSTANCE_1_EMAIL: "x@example.test", JIRA_INSTANCE_1_API_TOKEN: "ignored-secret", JIRA_API_TOKEN: "fixture" });
  assert.equal(seededDb.prepare("SELECT api_token FROM jira_instances").get().api_token, "");
});

it("does not delete legacy token on failed verification", async (t) => {
  const env = { JIRA_API_TOKEN: "environment-fixture" };
  const { db, row, request } = await withRoutes(t, env);
  db.prepare("UPDATE jira_instances SET api_token = ? WHERE id = ?").run("recovery-fixture", row.id);
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://lumen.atlassian.net/rest/api/3/myself");
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from("fixture@example.test:environment-fixture").toString("base64")}`);
    return new Response(JSON.stringify({ errorMessages: ["Invalid credentials"] }), { status: 401 });
  };
  const response = await request(`/api/jira/instances/${row.id}/test`, {});
  assert.equal(response.status, 401);
  assert.equal(calls, 1);
  assert.equal(db.prepare("SELECT api_token FROM jira_instances WHERE id = ?").get(row.id).api_token, "recovery-fixture");
  env.JIRA_API_TOKEN = "";
  assert.equal((await request(`/api/jira/instances/${row.id}/test`, {})).status, 400);
  assert.equal(calls, 1);
  assert.equal(db.prepare("SELECT api_token FROM jira_instances WHERE id = ?").get(row.id).api_token, "recovery-fixture");
});

it("clears only the saved site's token after successful environment verification", async (t) => {
  const { db, row, request } = await withRoutes(t);
  db.prepare("UPDATE jira_instances SET api_token = ? WHERE id = ?").run("recovery-fixture", row.id);
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.redirect, "error");
    return new Response(JSON.stringify({ displayName: "Fixture", accountId: "test-id" }), { status: 200 });
  };
  assert.equal((await request(`/api/jira/instances/${row.id}/test`, { email: "other@example.test" })).status, 200);
  assert.equal(db.prepare("SELECT api_token FROM jira_instances WHERE id = ?").get(row.id).api_token, "recovery-fixture");
  assert.equal((await request(`/api/jira/instances/${row.id}/test`, {})).status, 200);
  assert.equal(db.prepare("SELECT api_token FROM jira_instances WHERE id = ?").get(row.id).api_token, "");
});

it("rejects test and settings destinations without attempting Jira requests", async (t) => {
  const { row, request } = await withRoutes(t);
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected external request"); };
  for (const baseUrl of ["https://lumen.atlassian.net.evil.example", "http://lumen.atlassian.net", "https://user@lumen.atlassian.net", "https://lumen.atlassian.net:444", "https://lumen-fake.atlassian.net"]) {
    assert.equal((await request(`/api/jira/instances/${row.id}/test`, { baseUrl, email: "fixture@example.test" })).status, 400);
    assert.equal((await request(`/api/jira/instances/${row.id}`, { baseUrl }, "PATCH")).status, 400);
    assert.equal((await request("/api/jira/instances", { baseUrl, email: "fixture@example.test", displayName: "Bad" })).status, 400);
  }
  assert.equal(calls, 0);
});

it("rejects malformed and opaque origins even when misconfigured in the allowlist", () => {
  const policy = localRequestPolicy({ apiPort: 8787, allowedOrigins: ["null", "malformed", "http://localhost:5173/path", "https://user@localhost:5173"] });
  for (const origin of ["null", "malformed", "http://localhost:5173/path", "https://user@localhost:5173"]) {
    let status;
    const res = { status(code) { status = code; return this; }, json() {}, setHeader() {} };
    policy({ method: "POST", headers: { host: "127.0.0.1:8787", origin } }, res, () => {});
    assert.equal(status, 403);
  }
});

it("preserves recovery data when a successful HTTP response is not a Jira identity", async (t) => {
  const { db, row, request } = await withRoutes(t);
  db.prepare("UPDATE jira_instances SET api_token = ? WHERE id = ?").run("recovery-fixture", row.id);
  globalThis.fetch = async () => new Response("<html>Sign in</html>", { status: 200 });
  assert.equal((await request(`/api/jira/instances/${row.id}/test`, {})).status, 502);
  assert.equal(db.prepare("SELECT api_token FROM jira_instances WHERE id = ?").get(row.id).api_token, "recovery-fixture");
});

it("does not clear recovery data when saved settings change during verification", async (t) => {
  const { db, row, request } = await withRoutes(t);
  db.prepare("UPDATE jira_instances SET api_token = ? WHERE id = ?").run("recovery-fixture", row.id);
  globalThis.fetch = async () => {
    db.prepare("UPDATE jira_instances SET email = ? WHERE id = ?").run("changed@example.test", row.id);
    return new Response(JSON.stringify({ accountId: "fixture-account" }), { status: 200 });
  };
  assert.equal((await request(`/api/jira/instances/${row.id}/test`, {})).status, 200);
  assert.equal(db.prepare("SELECT api_token FROM jira_instances WHERE id = ?").get(row.id).api_token, "recovery-fixture");
});
