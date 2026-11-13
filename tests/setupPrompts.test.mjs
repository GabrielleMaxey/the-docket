import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  isMaskedInputAvailable,
  readMaskedLine,
  askLine,
} from "../scripts/lib/prompts.mjs";

const PROMPT = "Token: ";

const createFakeTty = () => {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.rawModeCalls = [];
  stdin.paused = false;
  stdin.setRawMode = (value) => stdin.rawModeCalls.push(value);
  stdin.resume = () => {
    stdin.paused = false;
  };
  stdin.pause = () => {
    stdin.paused = true;
  };
  return stdin;
};

const createOutput = () => {
  const stdout = new PassThrough();
  let text = "";
  stdout.on("data", (chunk) => {
    text += chunk.toString();
  });
  return { stdout, read: () => text };
};

describe("isMaskedInputAvailable", () => {
  it("is true only for a TTY with setRawMode", () => {
    assert.equal(isMaskedInputAvailable(createFakeTty()), true);
    assert.equal(isMaskedInputAvailable({ isTTY: false, setRawMode() {} }), false);
    assert.equal(isMaskedInputAvailable({ isTTY: true }), false);
  });
});

describe("readMaskedLine", () => {
  it("handles typing, backspace and enter without echoing the secret", async () => {
    const stdin = createFakeTty();
    const { stdout, read } = createOutput();
    const pending = readMaskedLine({ stdin, stdout, prompt: PROMPT });
    for (const key of ["a", "b", "\x7f", "c", "\r"]) stdin.emit("data", Buffer.from(key));
    assert.equal(await pending, "ac");
    const echoed = read().slice(PROMPT.length);
    assert.ok(echoed.includes("*"));
    assert.ok(!/[abc]/.test(echoed));
    assert.deepEqual(stdin.rawModeCalls, [true, false]);
    assert.equal(stdin.paused, true);
    assert.equal(stdin.listenerCount("data"), 0);
  });

  it("treats \\b as backspace", async () => {
    const stdin = createFakeTty();
    const { stdout } = createOutput();
    const pending = readMaskedLine({ stdin, stdout, prompt: PROMPT });
    for (const key of ["x", "\b", "y", "\n"]) stdin.emit("data", key);
    assert.equal(await pending, "y");
  });

  it("handles a pasted chunk with a trailing carriage return", async () => {
    const stdin = createFakeTty();
    const { stdout, read } = createOutput();
    const pending = readMaskedLine({ stdin, stdout, prompt: PROMPT });
    stdin.emit("data", Buffer.from("dapi-test\r"));
    assert.equal(await pending, "dapi-test");
    assert.equal(read().slice(PROMPT.length).replace(/\r?\n$/, ""), "*".repeat(9));
  });

  it("rejects with Cancelled on Ctrl-C and restores raw mode", async () => {
    const stdin = createFakeTty();
    const { stdout } = createOutput();
    const pending = readMaskedLine({ stdin, stdout, prompt: PROMPT });
    stdin.emit("data", Buffer.from("ab\x03"));
    await assert.rejects(pending, (error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Cancelled");
      return true;
    });
    assert.deepEqual(stdin.rawModeCalls, [true, false]);
    assert.equal(stdin.paused, true);
  });

  it("restores raw mode when stdin errors", async () => {
    const stdin = createFakeTty();
    const { stdout } = createOutput();
    const pending = readMaskedLine({ stdin, stdout, prompt: PROMPT });
    stdin.emit("error", new Error("boom"));
    await assert.rejects(pending, /boom/);
    assert.deepEqual(stdin.rawModeCalls, [true, false]);
    assert.equal(stdin.paused, true);
  });
});

describe("askLine", () => {
  it("warns that input is visible and reads one piped line", async () => {
    const stdin = new PassThrough();
    const { stdout, read } = createOutput();
    const pending = askLine({ stdin, stdout, prompt: PROMPT });
    stdin.write("tok\n");
    assert.equal(await pending, "tok");
    assert.match(read(), /visible/);
  });

  it("omits the visibility warning when visibleWarning is false", async () => {
    const stdin = new PassThrough();
    const { stdout, read } = createOutput();
    const pending = askLine({ stdin, stdout, prompt: PROMPT, visibleWarning: false });
    stdin.write("value\n");
    assert.equal(await pending, "value");
    assert.doesNotMatch(read(), /visible/);
    assert.ok(read().includes(PROMPT));
  });
});
