import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  checkDatabricksAccess,
  cleanEndpointInput,
  cleanHostInput,
  cleanTokenInput,
  listServingEndpoints,
} from "../server/lib/databricksCheck.mjs";
import {
  ACCESS_TOKENS_PATH,
  ENDPOINT_GUIDE,
  HOST_GUIDE,
  TOKEN_COMMENT,
  TOKEN_GUIDE,
  TOKEN_LIFETIME_DAYS,
} from "../shared/databricksSetupGuide.mjs";
import { writeEnvFile } from "./lib/envFile.mjs";
import { askLine, isMaskedInputAvailable, readMaskedLine } from "./lib/prompts.mjs";

const MAX_ATTEMPTS = 3;
const isYes = (answer) => /^\s*y/i.test(answer);

export async function runSetup({
  projectRoot,
  stdin,
  stdout,
  platform = process.platform,
  fetchImpl = fetch,
  fsImpl = fs,
  prompts = { askLine, readMaskedLine },
}) {
  const say = (text = "") => stdout.write(`${text}\n`);
  const ask = (prompt) => prompts.askLine({ stdin, stdout, prompt, visibleWarning: false });
  const aborted = (message) => {
    if (message) say(message);
    say("Nothing was changed.");
    return { status: "aborted", changedKeys: [] };
  };
  const failed = (message) => {
    say(message);
    say("Nothing was changed.");
    return { status: "failed", changedKeys: [] };
  };

  const envPath = path.join(projectRoot, ".env");
  const examplePath = path.join(projectRoot, ".env.example");
  let envText = "";
  try {
    envText = fsImpl.readFileSync(envPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") return failed(`Could not read ${envPath}: ${error?.code ?? "error"}`);
  }
  const existing = dotenv.parse(envText);

  // Address
  let host = "";
  const existingHost = existing.DATABRICKS_HOST ? cleanHostInput(existing.DATABRICKS_HOST) : null;
  if (existingHost?.ok) {
    say(`Workspace address from .env: ${existingHost.host}`);
  } else {
    if (existingHost) say(existingHost.message);
    say(HOST_GUIDE);
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !host; attempt += 1) {
    const answer = (await ask(existingHost?.ok ? "Workspace address (Enter to keep): " : "Workspace address: ")).trim();
    if (!answer && existingHost?.ok) {
      host = existingHost.host;
      break;
    }
    const cleaned = cleanHostInput(answer);
    if (cleaned.ok) host = cleaned.host;
    else say(cleaned.message);
  }
  if (!host) return aborted();

  // Token
  say();
  say(`Create a token at ${host}${ACCESS_TOKENS_PATH}`);
  say(`Lifetime: ${TOKEN_LIFETIME_DAYS} days. Comment: "${TOKEN_COMMENT}".`);
  say(TOKEN_GUIDE);
  const tokenPrompt = { stdin, stdout, prompt: "Databricks token: " };
  const rawToken = isMaskedInputAvailable(stdin)
    ? await prompts.readMaskedLine(tokenPrompt)
    : await prompts.askLine(tokenPrompt);
  const token = cleanTokenInput(rawToken);
  if (!token) return aborted("No token entered.");

  // Identity check, before anything is written
  say("Checking the token...");
  const identity = await checkDatabricksAccess({ host, token, fetchImpl });
  if (!identity.ok) return failed(identity.message);
  say(identity.message);

  // Endpoint
  let endpoint = "";
  const existingEndpoint = existing.DATABRICKS_ENDPOINT ? cleanEndpointInput(existing.DATABRICKS_ENDPOINT) : null;
  let names = [];
  if (existingEndpoint?.ok) {
    say(`Model endpoint from .env: ${existingEndpoint.endpoint}`);
  } else {
    if (existingEndpoint) say(existingEndpoint.message);
    names = await listServingEndpoints({ host, token, fetchImpl });
    if (names.length > 0) {
      say("Serving endpoints you can see:");
      names.forEach((name, index) => say(`  ${index + 1}) ${name}`));
    } else {
      say(ENDPOINT_GUIDE);
    }
  }
  const endpointPrompt = existingEndpoint?.ok
    ? "Model endpoint (Enter to keep): "
    : names.length > 0
      ? "Model endpoint (number, or type a different name): "
      : "Model endpoint: ";
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !endpoint; attempt += 1) {
    const answer = (await ask(endpointPrompt)).trim();
    if (!answer && existingEndpoint?.ok) {
      endpoint = existingEndpoint.endpoint;
      break;
    }
    const picked = /^\d+$/.test(answer) ? names[Number(answer) - 1] : undefined;
    const cleaned = cleanEndpointInput(picked ?? answer);
    if (cleaned.ok) endpoint = cleaned.endpoint;
    else say(cleaned.message);
  }
  if (!endpoint) return aborted();

  // Model check
  say("Checking the model endpoint...");
  const access = await checkDatabricksAccess({ host, token, endpoint, fetchImpl });
  if (!access.ok) return failed(access.message);
  const model = access.checks.find((c) => c.name === "model");
  if (model?.status === "ok") {
    say(model.message);
  } else {
    say(`Warning: ${model?.message ?? access.message}`);
    if (!isYes(await ask("Save these values anyway? [y/N]: "))) return aborted();
  }

  // Provider
  const currentProvider = String(existing.CHAT_PROVIDER ?? "").trim();
  const defaultYes = !currentProvider || currentProvider === "databricks";
  const providerAnswer = (await ask(`Set CHAT_PROVIDER=databricks? [${defaultYes ? "Y/n" : "y/N"}]: `)).trim();
  const setProvider = providerAnswer ? isYes(providerAnswer) : defaultYes;

  // Write
  const updates = {
    DATABRICKS_HOST: host,
    DATABRICKS_ENDPOINT: endpoint,
    DATABRICKS_TOKEN: token,
    ...(setProvider ? { CHAT_PROVIDER: "databricks" } : {}),
  };
  let changedKeys;
  try {
    if (!fsImpl.existsSync(envPath) && fsImpl.existsSync(examplePath)) {
      fsImpl.copyFileSync(examplePath, envPath);
    }
    ({ changedKeys } = writeEnvFile(envPath, updates, { platform, fsImpl }));
  } catch (error) {
    return failed(error?.message ?? `Could not write ${envPath}`);
  }

  say();
  say(changedKeys.length > 0 ? `Saved to ${envPath}. Updated: ${changedKeys.join(", ")}` : `${envPath} already had these values.`);
  if (platform === "win32") {
    say("Note: .env inherits the folder's permissions on Windows. Keep this checkout under your user profile.");
  }
  say("Restart The Docket to use the new values: npm run dev:all (browser) or npm run desktop:dev (desktop).");
  return { status: "saved", changedKeys };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && scriptPath === path.resolve(process.argv[1])) {
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  dotenv.config({ path: path.join(projectRoot, ".env"), override: false });
  runSetup({ projectRoot, stdin: process.stdin, stdout: process.stdout })
    .then((result) => process.exit(result.status === "saved" ? 0 : 1))
    .catch((error) => {
      console.error(error?.message === "Cancelled" ? "Cancelled. Nothing was changed." : `Setup failed: ${error?.message ?? "unknown error"}`);
      process.exit(1);
    });
}
