#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, "src");
const jiraClientPath = path.join(srcRoot, "services", "jiraClient.js");

const isJiraClientImport = (specifier) => {
  return /(^|\/)jiraClient(\.js)?$/.test(specifier);
};

const walkFiles = (dir, out = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, out);
      continue;
    }

    if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) {
      out.push(fullPath);
    }
  }

  return out;
};

const normalizeNamedImports = (raw) => {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/\s+as\s+\w+$/, "").trim())
    .filter(Boolean);
};

const collectImportedNames = (files) => {
  const names = new Set();
  const importRegex = /import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["']/gm;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const rawImports = match[1] || "";
      const specifier = match[2] || "";
      if (!isJiraClientImport(specifier)) {
        continue;
      }

      for (const name of normalizeNamedImports(rawImports)) {
        names.add(name);
      }
    }
  }

  return names;
};

const collectExportedNames = (filePath) => {
  const content = fs.readFileSync(filePath, "utf8");
  const names = new Set();

  const exportConstRegex = /export\s+const\s+(\w+)\s*=/g;
  const exportFunctionRegex = /export\s+function\s+(\w+)\s*\(/g;
  const exportListRegex = /export\s*\{([\s\S]*?)\};?/g;

  let match;
  while ((match = exportConstRegex.exec(content)) !== null) {
    names.add(match[1]);
  }

  while ((match = exportFunctionRegex.exec(content)) !== null) {
    names.add(match[1]);
  }

  while ((match = exportListRegex.exec(content)) !== null) {
    const raw = match[1] || "";
    const exported = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const aliasMatch = item.match(/^(\w+)\s+as\s+(\w+)$/);
        return aliasMatch ? aliasMatch[2] : item;
      });

    for (const name of exported) {
      names.add(name);
    }
  }

  return names;
};

if (!fs.existsSync(srcRoot) || !fs.existsSync(jiraClientPath)) {
  console.error("[jira-client-exports] Could not locate src/services/jiraClient.js");
  process.exit(1);
}

const files = walkFiles(srcRoot);
const importedNames = collectImportedNames(files);
const exportedNames = collectExportedNames(jiraClientPath);

const missing = [...importedNames].filter((name) => !exportedNames.has(name)).sort();

if (missing.length > 0) {
  console.error("\n[jira-client-exports] Missing exports in src/services/jiraClient.js:");
  for (const name of missing) {
    console.error(`  - ${name}`);
  }
  console.error("\nFix the missing exports above so UI imports don't fail at runtime.");
  process.exit(1);
}

console.log(
  `[jira-client-exports] OK: ${importedNames.size} imported jiraClient symbol(s) are exported.`
);
