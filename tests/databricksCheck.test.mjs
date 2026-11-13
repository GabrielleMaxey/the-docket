import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkDatabricksAccess,
  cleanEndpointInput,
  cleanHostInput,
  cleanTokenInput,
  listServingEndpoints,
  redactToken,
} from "../server/lib/databricksCheck.mjs";
import { DEVELOPER_ROLE_MESSAGE } from "../shared/databricksSetupGuide.mjs";

const HOST = "example.cloud.databricks.com";
const TOKEN = "dapi-test";
const ENDPOINT = "chat-endpoint";
const IDENTITY_URL = `https://${HOST}/api/2.0/preview/scim/v2/Me`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const ME = { displayName: "Test User", userName: "t@example.com" };

// Routes by URL; each handler is a function or a Response (or array of them, consumed in order).
const makeFetch = (routes) => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    let handler = routes[
      String(url).includes("/chat/completions") ? "model" : "identity"
    ];
    if (Array.isArray(handler)) {
      handler = handler.length > 1 ? handler.shift() : handler[0];
    }
    return typeof handler === "function" ? handler() : handler.clone();
  };
  return { fetchImpl, calls };
};

const run = (fetchImpl, overrides = {}) =>
  checkDatabricksAccess({
    host: HOST,
    token: TOKEN,
    endpoint: ENDPOINT,
    fetchImpl,
    retryDelaysMs: [0, 0],
    sleep: async () => {},
    ...overrides,
  });

const byName = (result, name) => result.checks.find((c) => c.name === name);

describe("redactToken", () => {
  it("replaces every occurrence and ignores an empty token", () => {
    assert.equal(redactToken("a dapi-test b dapi-test", TOKEN), "a <redacted> b <redacted>");
    assert.equal(redactToken("unchanged", ""), "unchanged");
  });
});

describe("input cleaners", () => {
  it("cleanHostInput strips path, query, fragment and API suffixes", () => {
    assert.equal(cleanHostInput(HOST), `https://${HOST}`);
    assert.equal(cleanHostInput(`https://${HOST}/?o=123#x`), `https://${HOST}`);
    assert.equal(cleanHostInput(`https://${HOST}/serving-endpoints/`), `https://${HOST}`);
    assert.equal(cleanHostInput(`${HOST}/ai-gateway/mlflow/v1`), `https://${HOST}`);
    assert.equal(cleanHostInput(`  https://${HOST}/browse?o=1  `), `https://${HOST}`);
  });

  it("cleanHostInput rejects http, non-hostnames and credentials", () => {
    for (const bad of ["", "http://example.cloud.databricks.com", "not a host", "localhost", "ftp://example.cloud.databricks.com", "https://u:p@example.cloud.databricks.com", "10.0.0.1", "/just/a/path"]) {
      assert.equal(cleanHostInput(bad), null, bad);
    }
  });

  it("cleanEndpointInput accepts plain names only", () => {
    assert.equal(cleanEndpointInput("  chat-endpoint "), ENDPOINT);
    for (const bad of ["", "   ", "has space", "a/b"]) {
      assert.equal(cleanEndpointInput(bad), null, bad);
    }
  });

  it("cleanTokenInput trims quotes and a Bearer prefix", () => {
    assert.equal(cleanTokenInput(`  "Bearer ${TOKEN}" `), TOKEN);
    assert.equal(cleanTokenInput(`'${TOKEN}'`), TOKEN);
    assert.equal(cleanTokenInput(TOKEN), TOKEN);
    assert.equal(cleanTokenInput(undefined), "");
  });
});

describe("checkDatabricksAccess", () => {
  it("passes identity and model checks", async () => {
    const { fetchImpl, calls } = makeFetch({ identity: json(ME), model: json({ choices: [] }) });
    const result = await run(fetchImpl);
    assert.equal(result.ok, true);
    assert.equal(result.user, "Test User");
    assert.equal(result.code, null);
    assert.equal(byName(result, "identity").status, "ok");
    assert.equal(byName(result, "model").status, "ok");

    assert.equal(calls[0].url, IDENTITY_URL);
    assert.equal(calls[0].init.method || "GET", "GET");
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(calls[0].init.redirect, "manual");

    assert.match(calls[1].url, /^https:\/\/example\.cloud\.databricks\.com\/.+\/chat\/completions$/);
    assert.equal(calls[1].init.method, "POST");
    assert.equal(calls[1].init.redirect, "manual");
    const body = JSON.parse(calls[1].init.body);
    assert.equal(body.max_tokens, 1);
    assert.equal(body.model, ENDPOINT);
  });

  it("reports a rejected token and skips the model check", async () => {
    const { fetchImpl, calls } = makeFetch({ identity: json({}, 401) });
    const result = await run(fetchImpl);
    assert.equal(result.ok, false);
    assert.equal(result.code, "token_rejected");
    assert.equal(
      result.message,
      "Databricks rejected this token (expired, revoked or mistyped). Create a new one.",
    );
    assert.equal(byName(result, "model").status, "skipped");
    assert.equal(calls.length, 1);
  });

  it("reports missing API access on 403", async () => {
    const { fetchImpl } = makeFetch({ identity: json({}, 403) });
    const result = await run(fetchImpl);
    assert.equal(result.ok, false);
    assert.equal(result.code, "no_api_access");
    assert.equal(result.message, DEVELOPER_ROLE_MESSAGE);
  });

  for (const status of [403, 404]) {
    it(`warns, keeping ok true, when the model check returns ${status}`, async () => {
      const { fetchImpl } = makeFetch({ identity: json(ME), model: json({}, status) });
      const result = await run(fetchImpl);
      assert.equal(result.ok, true);
      const model = byName(result, "model");
      assert.equal(model.status, "warning");
      assert.equal(model.code, "model_unavailable");
      assert.equal(
        model.message,
        "Token works, but the model endpoint `chat-endpoint` isn't available to you.",
      );
    });
  }

  it("warns with model_failed on other model errors", async () => {
    const { fetchImpl } = makeFetch({ identity: json(ME), model: json({}, 500) });
    const result = await run(fetchImpl);
    assert.equal(result.ok, true);
    assert.equal(byName(result, "model").code, "model_failed");
  });

  it("reports unreachable when fetch throws", async () => {
    const fetchImpl = async () => {
      throw new TypeError("fetch failed");
    };
    const result = await run(fetchImpl);
    assert.equal(result.ok, false);
    assert.equal(result.code, "unreachable");
    assert.equal(
      result.message,
      "Cannot reach `https://example.cloud.databricks.com`. Check the host value and your network/VPN.",
    );
  });

  it("reports unexpected_response for an HTML 200", async () => {
    const { fetchImpl } = makeFetch({
      identity: new Response("<html>Sign in</html>", { status: 200, headers: { "content-type": "text/html" } }),
    });
    const result = await run(fetchImpl);
    assert.equal(result.ok, false);
    assert.equal(result.code, "unexpected_response");
  });

  it("reports redirected on 302 and makes no second request", async () => {
    const { fetchImpl, calls } = makeFetch({
      identity: new Response(null, { status: 302, headers: { location: "https://elsewhere.example.com/" } }),
    });
    const result = await run(fetchImpl);
    assert.equal(result.code, "redirected");
    assert.equal(calls.length, 1);
    assert.ok(!result.message.includes("elsewhere"));
  });

  it("times out even when fetch ignores the abort signal", async () => {
    const fetchImpl = () => new Promise(() => {});
    const result = await run(fetchImpl, { timeoutMs: 20 });
    assert.equal(result.ok, false);
    assert.equal(result.code, "timeout");
  });

  it("retries 503 then succeeds", async () => {
    const delays = [];
    const { fetchImpl, calls } = makeFetch({
      identity: [json({}, 503), json(ME)],
      model: json({}),
    });
    const result = await run(fetchImpl, {
      retryDelaysMs: [5, 7],
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(delays, [5]);
    assert.equal(calls.filter((c) => c.url === IDENTITY_URL).length, 2);
  });

  it("gives up after repeated 503 and names the status", async () => {
    const { fetchImpl, calls } = makeFetch({ identity: json({}, 503) });
    const result = await run(fetchImpl);
    assert.equal(result.ok, false);
    assert.equal(result.code, "unexpected_response");
    assert.match(result.message, /503/);
    assert.equal(calls.length, 3);
  });

  it("does not retry a 401", async () => {
    const { fetchImpl, calls } = makeFetch({ identity: json({}, 401) });
    await run(fetchImpl);
    assert.equal(calls.length, 1);
  });

  it("reports missing host or token without calling fetch", async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return json(ME);
    };
    const noHost = await run(fetchImpl, { host: "" });
    assert.equal(noHost.code, "host_missing");
    const noToken = await run(fetchImpl, { token: "  " });
    assert.equal(noToken.code, "token_missing");
    assert.equal(called, 0);
  });

  it("skips the model check with endpoint_missing", async () => {
    const { fetchImpl, calls } = makeFetch({ identity: json(ME) });
    const result = await run(fetchImpl, { endpoint: "" });
    assert.equal(result.ok, true);
    const model = byName(result, "model");
    assert.equal(model.status, "skipped");
    assert.equal(model.code, "endpoint_missing");
    assert.equal(calls.length, 1);
  });

  it("never returns the token in any message", async () => {
    const leaky = new Response(`bad ${TOKEN} here`, { status: 200 });
    const { fetchImpl } = makeFetch({ identity: leaky });
    const r1 = await run(fetchImpl);
    const thrower = async () => {
      throw new TypeError(`boom ${TOKEN}`);
    };
    const r2 = await run(thrower);
    const r3 = await run(makeFetch({ identity: json({ displayName: `x ${TOKEN}` }), model: json({}, 500) }).fetchImpl);
    for (const r of [r1, r2, r3]) {
      assert.ok(!JSON.stringify(r).includes(TOKEN), JSON.stringify(r));
    }
  });
});

describe("listServingEndpoints", () => {
  const list = (fetchImpl) => listServingEndpoints({ host: HOST, token: TOKEN, fetchImpl, timeoutMs: 50 });

  it("returns endpoint names", async () => {
    const calls = [];
    const names = await list(async (url, init) => {
      calls.push({ url: String(url), init });
      return json({ endpoints: [{ name: "a" }, { name: "b" }, {}] });
    });
    assert.deepEqual(names, ["a", "b"]);
    assert.equal(calls[0].url, `https://${HOST}/api/2.0/serving-endpoints`);
    assert.equal(calls[0].init.redirect, "manual");
  });

  it("returns an empty list on any failure", async () => {
    assert.deepEqual(await list(async () => json({}, 403)), []);
    assert.deepEqual(await list(async () => json({ nope: 1 })), []);
    assert.deepEqual(await list(async () => new Response("<html>", { status: 200 })), []);
    assert.deepEqual(await list(async () => { throw new TypeError("x"); }), []);
    assert.deepEqual(await list(() => new Promise(() => {})), []);
  });
});
