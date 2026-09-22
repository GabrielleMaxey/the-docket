import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AI_PATH_MANAGED,
  AI_PATH_LOCAL,
  isManagedAiReady,
  getHostAiMode,
  resolveAiPath,
  getManagedAiCredentials,
} from "../server/lib/aiPath.mjs";

describe("isManagedAiReady", () => {
  it("requires base URL, API key, and model", () => {
    assert.equal(isManagedAiReady({}), false);
    assert.equal(
      isManagedAiReady({
        MANAGED_AI_BASE_URL: "https://example/v1",
        MANAGED_AI_API_KEY: "tok",
        MANAGED_AI_MODEL: "model-a",
      }),
      true
    );
  });
});

describe("resolveAiPath", () => {
  it("defaults to managed when both ready and no preference", () => {
    const r = resolveAiPath({
      preferredPath: null,
      managedReady: true,
      localReady: true,
      hostMode: null,
    });
    assert.equal(r.path, AI_PATH_MANAGED);
    assert.equal(r.switchAllowed, true);
    assert.equal(r.displayLabel, "Company AI");
  });

  it("honors preferred local when both ready", () => {
    const r = resolveAiPath({
      preferredPath: AI_PATH_LOCAL,
      managedReady: true,
      localReady: true,
      hostMode: null,
    });
    assert.equal(r.path, AI_PATH_LOCAL);
    assert.equal(r.displayLabel, "Local");
  });

  it("host AI_MODE overrides preference", () => {
    const r = resolveAiPath({
      preferredPath: AI_PATH_LOCAL,
      managedReady: true,
      localReady: true,
      hostMode: AI_PATH_MANAGED,
    });
    assert.equal(r.path, AI_PATH_MANAGED);
    assert.equal(r.lockedByHost, true);
    assert.equal(r.switchAllowed, false);
  });

  it("uses only available path when the other is not ready", () => {
    assert.equal(
      resolveAiPath({
        preferredPath: AI_PATH_LOCAL,
        managedReady: true,
        localReady: false,
        hostMode: null,
      }).path,
      AI_PATH_MANAGED
    );
    assert.equal(
      resolveAiPath({
        preferredPath: AI_PATH_MANAGED,
        managedReady: false,
        localReady: true,
        hostMode: null,
      }).path,
      AI_PATH_LOCAL
    );
  });

  it("returns disabled when nothing is ready", () => {
    assert.equal(
      resolveAiPath({
        preferredPath: null,
        managedReady: false,
        localReady: false,
        hostMode: null,
      }).path,
      "disabled"
    );
  });

  it("host mode pointing at unready path yields disabled", () => {
    assert.equal(
      resolveAiPath({
        preferredPath: null,
        managedReady: false,
        localReady: true,
        hostMode: AI_PATH_MANAGED,
      }).path,
      "disabled"
    );
  });
});

describe("getManagedAiCredentials", () => {
  it("returns trimmed credentials when ready", () => {
    const creds = getManagedAiCredentials({
      MANAGED_AI_BASE_URL: "https://example/v1/",
      MANAGED_AI_API_KEY: " tok ",
      MANAGED_AI_MODEL: " model-a ",
    });
    assert.deepEqual(creds, {
      apiKey: "tok",
      baseUrl: "https://example/v1",
      model: "model-a",
    });
  });
});

describe("getHostAiMode", () => {
  it("parses managed|local and ignores other values", () => {
    assert.equal(getHostAiMode({ AI_MODE: "managed" }), AI_PATH_MANAGED);
    assert.equal(getHostAiMode({ AI_MODE: "LOCAL" }), AI_PATH_LOCAL);
    assert.equal(getHostAiMode({ AI_MODE: "nope" }), null);
  });
});
