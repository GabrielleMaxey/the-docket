import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";

const BOM = "﻿";

/** Render a value so dotenv.parse returns it exactly; quote only when needed. */
function renderValue(key, value) {
  // dotenv expands \n and \r inside double quotes
  const escaped = `"${value.replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
  const rendered = [value, `'${value}'`, `"${value}"`, `\`${value}\``, escaped].find(
    (candidate) => dotenv.parse(`${key}=${candidate}`)[key] === value,
  );
  if (rendered === undefined) throw new Error(`Value for ${key} cannot be written to a .env file safely`);
  return rendered;
}

export function updateEnvText(text, updates) {
  const hasBom = text.startsWith(BOM);
  const body = hasBom ? text.slice(BOM.length) : text;
  const eol = /\r\n|\n/.exec(body)?.[0] ?? "\n";
  // Alternating [content, eol, content, eol, ..., content]; keeps each line's own ending.
  const parts = body.split(/(\r\n|\n)/);
  const changed = new Set();

  for (const [key, value] of Object.entries(updates)) {
    const active = new RegExp(`^(\\s*(?:export\\s+)?)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`);
    let found = false;
    for (let i = 0; i < parts.length; i += 2) {
      const m = active.exec(parts[i]);
      if (!m) continue;
      found = true;
      if (dotenv.parse(parts[i].trimStart().replace(/^export\s+/, ""))[key] === value) continue;
      parts[i] = `${m[1]}${key}=${renderValue(key, value)}`;
      changed.add(key);
    }
    if (!found) {
      if (parts.at(-1) !== "") parts.push(eol, "");
      parts[parts.length - 1] = `${key}=${renderValue(key, value)}`;
      parts.push(eol, "");
      changed.add(key);
    }
  }

  return {
    text: (hasBom ? BOM : "") + parts.join(""),
    changedKeys: [...changed],
  };
}

export function writeEnvFile(envPath, updates, { platform = process.platform, fsImpl = fs } = {}) {
  let current = "";
  try {
    current = fsImpl.readFileSync(envPath, "utf8");
  } catch (err) {
    if (err?.code !== "ENOENT") throw new Error(`Could not read ${envPath}: ${err?.code ?? "error"}`);
  }

  const { text, changedKeys } = updateEnvText(current, updates);
  if (changedKeys.length === 0) return { changedKeys };

  const tmpPath = path.join(
    path.dirname(envPath),
    `.${path.basename(envPath)}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`,
  );
  try {
    const posix = platform !== "win32";
    fsImpl.writeFileSync(tmpPath, text, posix ? { mode: 0o600 } : {});
    if (posix) fsImpl.chmodSync(tmpPath, 0o600);
    fsImpl.renameSync(tmpPath, envPath);
  } catch (err) {
    try {
      fsImpl.rmSync(tmpPath, { force: true });
    } catch {
      // best effort cleanup
    }
    throw new Error(`Could not write ${envPath}: ${err?.code ?? "unknown error"}`);
  }
  return { changedKeys };
}
