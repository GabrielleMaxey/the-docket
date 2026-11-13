import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { isDirectRun, runSetup } from "../scripts/setup-databricks.mjs";
import {
  ACCESS_TOKENS_PATH,
  DEVELOPER_ROLE_MESSAGE,
  ENDPOINT_GUIDE,
  ENDPOINT_INVALID_MESSAGE,
  HOST_GUIDE,
  HOST_INVALID_MESSAGE,
  TOKEN_GUIDE,
} from "../shared/databricksSetupGuide.mjs";

const HOST = "https://example.cloud.databricks.com";
const TOKEN = "dapi-test-token";
const ANSWERS = [HOST, TOKEN, "chat-endpoint", ""];
const EXAMPLE = "# example\nAPI_PORT=8787\n";

const makeProject = (envText) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docket-setup-"));
  fs.writeFileSync(path.join(root, ".env.example"), EXAMPLE);
  if (envText !== undefined) fs.writeFileSync(path.join(root, ".env"), envText);
  return root;
};

const readEnv = (root) => fs.readFileSync(path.join(root, ".env"), "utf8");

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const makeFetch = ({ identity = () => jsonResponse({ displayName: "Test User" }), endpoints = [], model = () => jsonResponse({ ok: true }), events = [] } = {}) =>
  async (url) => {
    const { pathname } = new URL(url);
    if (pathname.endsWith("/scim/v2/Me")) {
      events.push("fetch:identity");
      return identity();
    }
    if (pathname === "/api/2.0/serving-endpoints") {
      events.push("fetch:list");
      return jsonResponse({ endpoints: endpoints.map((name) => ({ name })) });
    }
    events.push("fetch:model");
    return model();
  };

const run = async ({ env, answers, fetchImpl, platform = "linux", fsImpl, stdinOverride, events = [] }) => {
  const root = makeProject(env);
  const queue = [...answers];
  const stdout = new PassThrough();
  let output = "";
  stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  const calls = [];
  const ask = (kind) => async ({ prompt, visibleWarning }) => {
    calls.push({ kind, prompt, visibleWarning });
    events.push(`ask:${prompt}`);
    stdout.write(prompt);
    if (queue.length === 0) throw new Error(`No scripted answer left for prompt: ${prompt}`);
    return queue.shift();
  };
  const result = await runSetup({
    projectRoot: root,
    stdin: stdinOverride ?? new PassThrough(),
    stdout,
    platform,
    fetchImpl: fetchImpl ?? makeFetch({ events }),
    fsImpl,
    prompts: { askLine: ask("line"), readMaskedLine: ask("masked") },
  });
  return { result, output, calls, events, remaining: queue.length, root };
};

describe("runSetup happy path", () => {
  it("creates .env from the example, shows guides before prompts, saves keys and never prints the token", async () => {
    const { result, output, calls, root } = await run({
      answers: ["example.cloud.databricks.com", TOKEN, "chat-endpoint", ""],
    });
    assert.equal(result.status, "saved");
    const env = readEnv(root);
    assert.ok(env.includes("API_PORT=8787"));
    assert.ok(env.includes(`DATABRICKS_HOST=${HOST}`));
    assert.ok(env.includes("DATABRICKS_ENDPOINT=chat-endpoint"));
    assert.ok(env.includes(`DATABRICKS_TOKEN=${TOKEN}`));
    assert.ok(env.includes("CHAT_PROVIDER=databricks"));
    assert.deepEqual(
      [...result.changedKeys].sort(),
      ["CHAT_PROVIDER", "DATABRICKS_ENDPOINT", "DATABRICKS_HOST", "DATABRICKS_TOKEN"],
    );

    assert.ok(output.indexOf(HOST_GUIDE) !== -1);
    assert.ok(output.indexOf(HOST_GUIDE) < output.indexOf(calls[0].prompt));
    assert.ok(output.indexOf(TOKEN_GUIDE) !== -1);
    assert.ok(output.includes(`${HOST}${ACCESS_TOKENS_PATH}`));
    assert.ok(output.indexOf(TOKEN_GUIDE) < output.indexOf(calls[1].prompt));
    assert.ok(output.indexOf(ENDPOINT_GUIDE) !== -1);
    assert.ok(output.indexOf(ENDPOINT_GUIDE) < output.indexOf(calls[2].prompt));

    assert.ok(!output.includes(TOKEN));
    assert.ok(output.includes("DATABRICKS_TOKEN"));
    assert.ok(output.includes("npm run dev:all"));
    assert.ok(output.includes("npm run desktop:dev"));

    assert.equal(calls[0].visibleWarning, false);
    assert.notEqual(calls[1].visibleWarning, false);
    assert.equal(calls[2].visibleWarning, false);
    assert.equal(calls[3].visibleWarning, false);
  });

  it("uses the masked prompt when stdin is a TTY", async () => {
    const stdin = new PassThrough();
    stdin.isTTY = true;
    stdin.setRawMode = () => {};
    const { result, calls } = await run({
      stdinOverride: stdin,
      answers: ANSWERS,
    });
    assert.equal(result.status, "saved");
    assert.deepEqual(calls.map((c) => c.kind), ["line", "masked", "line", "line"]);
  });

  it("asks address, then token, then verifies identity, then asks the endpoint, then checks the model", async () => {
    const { events } = await run({ answers: ANSWERS });
    const order = events.map((e) => e.replace(/^ask:(\w+).*/s, "ask:$1"));
    assert.deepEqual(
      order,
      [
        "ask:Workspace",
        "ask:Databricks",
        "fetch:identity",
        "fetch:list",
        "ask:Model",
        "fetch:identity",
        "fetch:model",
        "ask:Set",
      ],
    );
  });
});

describe("runSetup input cleaning", () => {
  it("strips quotes and Bearer from the pasted token", async () => {
    const { result, root } = await run({
      answers: [HOST, `  "Bearer ${TOKEN}"\n`, "chat-endpoint", ""],
    });
    assert.equal(result.status, "saved");
    assert.ok(readEnv(root).includes(`DATABRICKS_TOKEN=${TOKEN}\n`));
  });

  it("aborts with a message when no token is entered", async () => {
    const { result, output, root } = await run({ answers: [HOST, "   "] });
    assert.equal(result.status, "aborted");
    assert.ok(output.includes("No token entered."));
    assert.ok(!fs.existsSync(path.join(root, ".env")));
  });

  for (const answer of [
    "example.cloud.databricks.com",
    "https://example.cloud.databricks.com/",
    "https://example.cloud.databricks.com/serving-endpoints",
    "https://example.cloud.databricks.com/?o=123",
  ]) {
    it(`normalizes the address ${answer}`, async () => {
      const { result, root } = await run({ answers: [answer, TOKEN, "chat-endpoint", ""] });
      assert.equal(result.status, "saved");
      assert.ok(readEnv(root).includes(`DATABRICKS_HOST=${HOST}\n`));
    });
  }

  it("shows the invalid-address message once per bad entry and re-asks", async () => {
    const { result, output, root } = await run({
      answers: ["http://example.cloud.databricks.com", "https://example.cloud.databricks.com/?o=1", TOKEN, "chat-endpoint", ""],
    });
    assert.equal(result.status, "saved");
    assert.equal(output.split(HOST_INVALID_MESSAGE).length - 1, 1);
    assert.ok(readEnv(root).includes(`DATABRICKS_HOST=${HOST}\n`));
  });

  it("aborts after three bad addresses without writing", async () => {
    const { result, output, root } = await run({
      answers: ["http://a.example.com", "nope", "http://b.example.com"],
    });
    assert.equal(result.status, "aborted");
    assert.equal(output.split(HOST_INVALID_MESSAGE).length - 1, 3);
    assert.ok(!fs.existsSync(path.join(root, ".env")));
  });

  it("shows the invalid-endpoint message once and re-asks", async () => {
    const { result, output, root } = await run({
      answers: [HOST, TOKEN, "chat endpoint", "chat-endpoint", ""],
    });
    assert.equal(result.status, "saved");
    assert.equal(output.split(ENDPOINT_INVALID_MESSAGE).length - 1, 1);
    assert.ok(readEnv(root).includes("DATABRICKS_ENDPOINT=chat-endpoint\n"));
  });
});

describe("runSetup endpoint discovery and existing values", () => {
  it("shows a numbered list and saves the chosen number", async () => {
    const { result, output, root } = await run({
      fetchImpl: makeFetch({ endpoints: ["first-endpoint", "second-endpoint"] }),
      answers: [HOST, TOKEN, "2", ""],
    });
    assert.equal(result.status, "saved");
    assert.ok(output.includes("1) first-endpoint"));
    assert.ok(output.includes("2) second-endpoint"));
    assert.ok(readEnv(root).includes("DATABRICKS_ENDPOINT=second-endpoint\n"));
  });

  it("accepts a typed name that is not in the list", async () => {
    const { result, root } = await run({
      fetchImpl: makeFetch({ endpoints: ["first-endpoint"] }),
      answers: [HOST, TOKEN, "other-endpoint", ""],
    });
    assert.equal(result.status, "saved");
    assert.ok(readEnv(root).includes("DATABRICKS_ENDPOINT=other-endpoint\n"));
  });

  it("keeps existing host and endpoint on Enter without listing endpoints", async () => {
    const { result, output, root, events } = await run({
      env: `DATABRICKS_HOST=${HOST}\nDATABRICKS_ENDPOINT=kept-endpoint\n`,
      answers: ["", TOKEN, "", ""],
    });
    assert.equal(result.status, "saved");
    assert.ok(!events.includes("fetch:list"));
    assert.ok(output.includes(HOST));
    assert.ok(output.includes("kept-endpoint"));
    const env = readEnv(root);
    assert.ok(env.includes("DATABRICKS_ENDPOINT=kept-endpoint"));
    assert.ok(env.includes(`DATABRICKS_TOKEN=${TOKEN}`));
  });

  it("does not send the token to an existing invalid host", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(String(url));
      return jsonResponse({ displayName: "Test User" });
    };
    const { result } = await run({ env: "DATABRICKS_HOST=http://example.cloud.databricks.com\n", fetchImpl, answers: ["", "", "", ""] });
    assert.equal(result.status, "aborted");
    assert.deepEqual(urls, []);
  });
});

describe("runSetup verification failures", () => {
  it("fails on a 401 without touching .env", async () => {
    const original = "API_PORT=1\n";
    const { result, output, remaining, root } = await run({
      env: original,
      fetchImpl: makeFetch({ identity: () => jsonResponse({}, 401) }),
      answers: [HOST, TOKEN],
    });
    assert.equal(result.status, "failed");
    assert.equal(remaining, 0);
    assert.ok(output.includes("Databricks rejected this token"));
    assert.ok(!output.includes(TOKEN));
    assert.equal(readEnv(root), original);
  });

  it("shows the developer-role message on 403", async () => {
    const { result, output, root } = await run({
      fetchImpl: makeFetch({ identity: () => jsonResponse({}, 403) }),
      answers: [HOST, TOKEN],
    });
    assert.equal(result.status, "failed");
    assert.ok(output.includes(DEVELOPER_ROLE_MESSAGE));
    assert.ok(!fs.existsSync(path.join(root, ".env")));
  });

  it("warns on a model failure and saves when the user says yes", async () => {
    const { result, output, calls, root } = await run({
      fetchImpl: makeFetch({ model: () => jsonResponse({}, 404) }),
      answers: [HOST, TOKEN, "chat-endpoint", "y", ""],
    });
    assert.equal(result.status, "saved");
    assert.ok(output.includes("isn't available to you"));
    assert.match(calls[3].prompt, /anyway/i);
    assert.ok(readEnv(root).includes(`DATABRICKS_TOKEN=${TOKEN}`));
  });

  it("aborts without writing when the user declines to save after a model warning", async () => {
    const { result, root } = await run({
      fetchImpl: makeFetch({ model: () => jsonResponse({}, 404) }),
      answers: [HOST, TOKEN, "chat-endpoint", "n"],
    });
    assert.equal(result.status, "aborted");
    assert.ok(!fs.existsSync(path.join(root, ".env")));
  });
});

describe("runSetup provider question and file handling", () => {
  it("keeps an existing different CHAT_PROVIDER by default", async () => {
    const { result, root } = await run({ env: "CHAT_PROVIDER=anthropic\n", answers: ANSWERS });
    assert.equal(result.status, "saved");
    assert.ok(readEnv(root).includes("CHAT_PROVIDER=anthropic\n"));
    assert.ok(!result.changedKeys.includes("CHAT_PROVIDER"));
  });

  it("replaces an existing different CHAT_PROVIDER only when the user answers yes", async () => {
    const { result, root } = await run({ env: "CHAT_PROVIDER=anthropic\n", answers: [HOST, TOKEN, "chat-endpoint", "yes"] });
    assert.equal(result.status, "saved");
    assert.ok(readEnv(root).includes("CHAT_PROVIDER=databricks\n"));
  });

  it("leaves CHAT_PROVIDER unset when the user answers no", async () => {
    const { result, root } = await run({ answers: [HOST, TOKEN, "chat-endpoint", "n"] });
    assert.equal(result.status, "saved");
    assert.ok(!readEnv(root).includes("CHAT_PROVIDER"));
  });

  it("preserves existing lines, CRLF and the BOM", async () => {
    const { result, root } = await run({ env: "﻿JIRA_EMAIL=a@example.com\r\nAPI_PORT=8787\r\n", answers: ANSWERS });
    assert.equal(result.status, "saved");
    const env = readEnv(root);
    assert.ok(env.startsWith("﻿JIRA_EMAIL=a@example.com\r\nAPI_PORT=8787\r\n"));
    assert.ok(!/[^\r]\n/.test(env));
    assert.ok(env.includes(`DATABRICKS_TOKEN=${TOKEN}\r\n`));
  });

  it("notes that .env inherits folder permissions on Windows", async () => {
    const { output } = await run({ platform: "win32", answers: ANSWERS });
    assert.match(output, /inherits the folder's permissions/);
  });

  it("returns failed and prints the path when the .env write fails", async () => {
    const fsImpl = {
      ...fs,
      renameSync() {
        throw Object.assign(new Error("denied"), { code: "EPERM" });
      },
    };
    const { result, output, root } = await run({ fsImpl, answers: ANSWERS });
    assert.equal(result.status, "failed");
    assert.ok(output.includes(path.join(root, ".env")));
    assert.ok(output.includes("EPERM"));
    assert.ok(!output.includes(TOKEN));
  });
});

describe("BOM and direct-run handling", () => {
  it("recognises DATABRICKS_HOST as the first key after a BOM and keeps the BOM", async () => {
    const { result, output, root } = await run({
      env: `\uFEFFDATABRICKS_HOST=${HOST}\n`,
      answers: ["", TOKEN, "chat-endpoint", ""],
    });
    assert.equal(result.status, "saved");
    assert.ok(output.includes(`Workspace address from .env: ${HOST}`));
    assert.ok(readEnv(root).startsWith("\uFEFF"));
  });

  it("isDirectRun follows symlinks and falls back to string comparison", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "docket-link-"));
    const real = path.join(dir, "real.mjs");
    fs.writeFileSync(real, "");
    const link = path.join(dir, "link.mjs");
    fs.symlinkSync(real, link);
    assert.equal(isDirectRun(link, real), true);
    assert.equal(isDirectRun(undefined, real), false);
    assert.equal(isDirectRun(path.join(dir, "missing.mjs"), real), false);
  });
});
