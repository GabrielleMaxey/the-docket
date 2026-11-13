import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// This repository is public: committed docs and tests may only use placeholders.
// Patterns are assembled at runtime so this file never contains a matching literal.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TOKEN_RE = new RegExp("\\bdapi" + "[0-9a-f]{16,}\\b", "i");
const SAFE_NAMES = new Set(["example", "your-workspace", "workspace"]);
const HOST_SUFFIXES = ["cloud.databricks.com", "azuredatabricks.net", "gcp.databricks.com"];
const HOST_RE = new RegExp(
  "\\b([a-z0-9][a-z0-9-]*)\\.(" + HOST_SUFFIXES.map((s) => s.replace(/\./g, "\\.")).join("|") + ")\\b",
  "gi",
);

function isScanned(rel) {
  return (
    rel === "README.md" ||
    rel === ".env.example" ||
    (rel.startsWith("docs/") && rel.endsWith(".md")) ||
    rel.startsWith("tests/")
  );
}

function trackedFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
    return out.split("\0").filter(Boolean);
  } catch {
    const found = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (["node_modules", ".git", ".superpowers"].includes(e.name)) continue;
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory()) walk(rel);
        else found.push(rel);
      }
    };
    walk("");
    return found;
  }
}

export function findViolations(rel, text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (TOKEN_RE.test(line)) hits.push(`${rel}:${i + 1} token-shaped value`);
    for (const m of line.matchAll(HOST_RE)) {
      if (!SAFE_NAMES.has(m[1].toLowerCase())) hits.push(`${rel}:${i + 1} workspace hostname "${m[0]}"`);
    }
  });
  return hits;
}

describe("public repo placeholder rule", () => {
  it("detector flags token and hostname shapes built at runtime", () => {
    const fakeToken = "dapi" + "0123456789abcdef0123";
    const fakeHost = "acme-prod." + "cloud." + "databricks.com";
    assert.equal(findViolations("x", `T=${fakeToken}`).length, 1);
    assert.equal(findViolations("x", `https://${fakeHost}`).length, 1);
    assert.equal(findViolations("x", "https://example." + "cloud.databricks.com").length, 0);
    assert.equal(findViolations("x", "https://your-workspace." + "azuredatabricks.net").length, 0);
  });

  it("README, .env.example, docs and tests contain only placeholders", () => {
    const violations = [];
    for (const rel of trackedFiles().filter(isScanned)) {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) continue;
      const buf = fs.readFileSync(abs);
      if (buf.includes(0)) continue; // skip binary
      violations.push(...findViolations(rel, buf.toString("utf8")));
    }
    assert.deepEqual(violations, [], "Replace with placeholders:\n" + violations.join("\n"));
  });
});
