export const AI_PATH_MANAGED = "managed";
export const AI_PATH_LOCAL = "local";

function trimOrEmpty(value) {
  return String(value ?? "").trim();
}

export function isManagedAiReady(env = process.env) {
  const baseUrl = trimOrEmpty(env.MANAGED_AI_BASE_URL);
  const apiKey = trimOrEmpty(env.MANAGED_AI_API_KEY);
  const model = trimOrEmpty(env.MANAGED_AI_MODEL);
  return Boolean(baseUrl && apiKey && model);
}

export function getHostAiMode(env = process.env) {
  const mode = trimOrEmpty(env.AI_MODE).toLowerCase();
  if (mode === AI_PATH_MANAGED) return AI_PATH_MANAGED;
  if (mode === AI_PATH_LOCAL) return AI_PATH_LOCAL;
  return null;
}

export function getManagedAiCredentials(env = process.env) {
  if (!isManagedAiReady(env)) {
    throw new Error("Managed AI is not configured");
  }
  const baseUrl = trimOrEmpty(env.MANAGED_AI_BASE_URL).replace(/\/$/, "");
  const apiKey = trimOrEmpty(env.MANAGED_AI_API_KEY);
  const model = trimOrEmpty(env.MANAGED_AI_MODEL);
  return { apiKey, baseUrl, model };
}

function pathDisplayLabel(path) {
  if (path === AI_PATH_MANAGED) return "Company AI";
  if (path === AI_PATH_LOCAL) return "Local";
  return "Not configured";
}

export function resolveAiPath({ preferredPath, managedReady, localReady, hostMode }) {
  const lockedByHost = Boolean(hostMode);

  let path;
  if (hostMode) {
    if (hostMode === AI_PATH_MANAGED && managedReady) path = AI_PATH_MANAGED;
    else if (hostMode === AI_PATH_LOCAL && localReady) path = AI_PATH_LOCAL;
    else path = "disabled";
  } else if (managedReady && localReady) {
    if (preferredPath === AI_PATH_MANAGED || preferredPath === AI_PATH_LOCAL) {
      path = preferredPath;
    } else {
      path = AI_PATH_MANAGED;
    }
  } else if (managedReady) {
    path = AI_PATH_MANAGED;
  } else if (localReady) {
    path = AI_PATH_LOCAL;
  } else {
    path = "disabled";
  }

  const switchAllowed = managedReady && localReady && hostMode == null;
  const displayLabel = pathDisplayLabel(path);

  return { path, switchAllowed, displayLabel, lockedByHost };
}
