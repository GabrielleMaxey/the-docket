import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { updateEnvText, writeEnvFile } from "../scripts/lib/envFile.mjs";

describe("updateEnvText", () => {
  it("replaces an active line in place and keeps comments, blanks and order", () => {
    const text = "# header\nA=1\n\nDATABRICKS_HOST=old\n# tail\nZ=9\n";
    const r = updateEnvText(text, { DATABRICKS_HOST: "https://example.cloud.databricks.com" });
    assert.equal(
      r.text,
      "# header\nA=1\n\nDATABRICKS_HOST=https://example.cloud.databricks.com\n# tail\nZ=9\n",
    );
    assert.deepEqual(r.changedKeys, ["DATABRICKS_HOST"]);
  });

  it("appends a missing key once and is idempotent", () => {
    const first = updateEnvText("A=1", { DATABRICKS_TOKEN: "dapi-test" });
    assert.equal(first.text, "A=1\nDATABRICKS_TOKEN=dapi-test\n");
    assert.deepEqual(first.changedKeys, ["DATABRICKS_TOKEN"]);
    const second = updateEnvText(first.text, { DATABRICKS_TOKEN: "dapi-test" });
    assert.equal(second.text, first.text);
    assert.deepEqual(second.changedKeys, []);
  });

  it("appends to empty text", () => {
    assert.equal(updateEnvText("", { A: "1" }).text, "A=1\n");
  });

  it("leaves a commented placeholder alone and appends one active line", () => {
    const text = "# DATABRICKS_TOKEN=<placeholder>\nA=1\n";
    const r = updateEnvText(text, { DATABRICKS_TOKEN: "dapi-test" });
    assert.equal(r.text, "# DATABRICKS_TOKEN=<placeholder>\nA=1\nDATABRICKS_TOKEN=dapi-test\n");
  });

  it("updates every active duplicate and matches export lines", () => {
    const text = "K=1\nexport K=2\n  K = 3\n";
    const r = updateEnvText(text, { K: "new" });
    assert.equal(r.text, "K=new\nexport K=new\n  K=new\n");
    assert.deepEqual(dotenv.parse(r.text), { K: "new" });
  });

  it("preserves a leading BOM and still matches the first key", () => {
    const text = "﻿DATABRICKS_HOST=old\nA=1\n";
    const r = updateEnvText(text, { DATABRICKS_HOST: "h" });
    assert.equal(r.text, "﻿DATABRICKS_HOST=h\nA=1\n");
    assert.equal(r.text.split("DATABRICKS_HOST").length, 2);
  });

  it("preserves CRLF, including on appended lines", () => {
    const r = updateEnvText("A=1\r\nB=2\r\n", { B: "3", C: "4" });
    assert.equal(r.text, "A=1\r\nB=3\r\nC=4\r\n");
  });

  it("round-trips awkward values through dotenv.parse", () => {
    const values = [
      "plain",
      "has # hash",
      "a#b",
      "two words",
      `it's "quoted"`,
      `say "hi"`,
      "it's",
      "  padded  ",
      "back\\slash",
      "",
      "#leading",
      "https://example.cloud.databricks.com/serving-endpoints",
    ];
    for (const value of values) {
      const r = updateEnvText("A=1\n", { KEY: value });
      assert.equal(dotenv.parse(r.text).KEY, value, JSON.stringify(value));
      assert.equal(dotenv.parse(r.text).A, "1");
    }
  });

  it("does not rewrite a line whose parsed value already matches", () => {
    const text = 'KEY="two words"\n';
    const r = updateEnvText(text, { KEY: "two words" });
    assert.equal(r.text, text);
    assert.deepEqual(r.changedKeys, []);
  });
});

describe("writeEnvFile", () => {
  const dirs = [];
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "envfile-test-"));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
  });

  it("treats a missing file as empty and writes with mode 0600", () => {
    const envPath = path.join(tmp(), ".env");
    const r = writeEnvFile(envPath, { A: "1" }, { platform: "darwin" });
    assert.deepEqual(r.changedKeys, ["A"]);
    assert.equal(fs.readFileSync(envPath, "utf8"), "A=1\n");
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(envPath).mode & 0o777, 0o600);
    }
  });

  it("writes through a same-folder temp file, then renames", () => {
    const dir = tmp();
    const envPath = path.join(dir, ".env");
    fs.writeFileSync(envPath, "A=1\n");
    const calls = [];
    const fsImpl = {
      ...fs,
      writeFileSync: (p, ...rest) => {
        calls.push(["write", p]);
        return fs.writeFileSync(p, ...rest);
      },
      renameSync: (from, to) => {
        calls.push(["rename", from, to]);
        return fs.renameSync(from, to);
      },
    };
    writeEnvFile(envPath, { A: "2" }, { fsImpl, platform: "darwin" });
    const write = calls.find((c) => c[0] === "write");
    const rename = calls.find((c) => c[0] === "rename");
    assert.notEqual(write[1], envPath);
    assert.equal(path.dirname(write[1]), dir);
    assert.deepEqual(rename.slice(1), [write[1], envPath]);
    assert.equal(fs.readFileSync(envPath, "utf8"), "A=2\n");
    assert.deepEqual(fs.readdirSync(dir), [".env"]);
  });

  it("does not request a POSIX mode on win32", () => {
    const envPath = path.join(tmp(), ".env");
    const modes = [];
    const fsImpl = {
      ...fs,
      writeFileSync: (p, d, o) => {
        modes.push(o);
        return fs.writeFileSync(p, d);
      },
      chmodSync: () => {
        throw new Error("chmod must not be called on win32");
      },
    };
    writeEnvFile(envPath, { A: "1" }, { fsImpl, platform: "win32" });
    assert.equal(modes.length, 1);
    assert.equal(modes[0]?.mode, undefined);
  });

  it("on rename EPERM leaves the original, removes the temp file and names path and code", () => {
    const dir = tmp();
    const envPath = path.join(dir, ".env");
    const original = Buffer.from("﻿A=1\r\n# keep\r\n");
    fs.writeFileSync(envPath, original);
    const fsImpl = {
      ...fs,
      renameSync: () => {
        throw Object.assign(new Error("operation not permitted"), { code: "EPERM" });
      },
    };
    assert.throws(
      () => writeEnvFile(envPath, { A: "2", TOKEN: "dapi-test" }, { fsImpl, platform: "win32" }),
      (err) => {
        assert.ok(err.message.includes(envPath), err.message);
        assert.ok(err.message.includes("EPERM"), err.message);
        assert.ok(!err.message.includes("dapi-test"));
        return true;
      },
    );
    assert.deepEqual(fs.readFileSync(envPath), original);
    assert.deepEqual(fs.readdirSync(dir), [".env"]);
  });

  it("does not write when nothing changed", () => {
    const dir = tmp();
    const envPath = path.join(dir, ".env");
    fs.writeFileSync(envPath, "A=1\n");
    const fsImpl = {
      ...fs,
      writeFileSync: () => {
        throw new Error("should not write");
      },
    };
    const r = writeEnvFile(envPath, { A: "1" }, { fsImpl });
    assert.deepEqual(r.changedKeys, []);
  });
});
