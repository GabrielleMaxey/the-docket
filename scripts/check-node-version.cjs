#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseMajor(versionText) {
  if (!versionText) return NaN;
  const cleaned = String(versionText).trim().replace(/^v/i, "");
  const major = Number.parseInt(cleaned.split(".")[0], 10);
  return Number.isFinite(major) ? major : NaN;
}

const repoRoot = process.cwd();
const nvmrcPath = path.join(repoRoot, ".nvmrc");

if (!fs.existsSync(nvmrcPath)) {
  process.exit(0);
}

const expectedRaw = fs.readFileSync(nvmrcPath, "utf8").trim();
const expectedMajor = parseMajor(expectedRaw);
const currentMajor = parseMajor(process.versions.node);

if (Number.isNaN(expectedMajor)) {
  console.warn(`[node-version-check] Could not parse .nvmrc value: ${expectedRaw}`);
  process.exit(0);
}

if (currentMajor < expectedMajor) {
  console.error("\n[task-manager] Unsupported Node version detected.");
  console.error(`[task-manager] Minimum required Node major: ${expectedMajor} (from .nvmrc)`);
  console.error(`[task-manager] Current Node version: ${process.version}`);
  console.error("\nFix:");
  console.error(`  1) nvm install ${expectedMajor}`);
  console.error(`  2) nvm use ${expectedMajor}`);
  console.error("  3) npm install");
  console.error("  4) npm rebuild better-sqlite3");
  process.exit(1);
}

console.log(`[task-manager] Node version check passed (${process.version}). Minimum supported major is ${expectedMajor}.`);