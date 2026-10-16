let context = null;
let switching = false;
let recoveryNotice = "";
const listeners = new Set();

export const isSiteSwitching = () => switching;
export const setSiteSwitching = (value) => {
  switching = value;
  listeners.forEach((listener) => listener());
};
export const getSiteContext = () => context;
export const subscribeSiteContext = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const setSiteContext = (next) => {
  context = next ? Object.freeze({ ...next }) : null;
  listeners.forEach((listener) => listener());
};
export const siteStorageKey = (key, instanceId = context?.instanceId) =>
  instanceId?.kind === "combined-work" ? `docket:combined-work:${key}` : `docket:site:${instanceId || "legacy"}:${key}`;
export const getSiteRecoveryNotice = () => recoveryNotice;

export const readSiteStorage = (storage, key, instanceId = context?.instanceId) => {
  const scopedKey = siteStorageKey(key, instanceId);
  const scoped = storage.getItem(scopedKey);
  if (scoped !== null || instanceId?.kind === "combined-work") return scoped;
  const original = storage.getItem(key);
  if (original === null) return null;
  // The actual legacy formats store notes, reports and issue keys without source
  // site identity. Neither matching issue keys nor the active site proves ownership.
  const notice = "Older browser data has an unknown Jira site. It is preserved for recovery and has not been loaded into this site.";
  if (recoveryNotice !== notice) {
    recoveryNotice = notice;
    queueMicrotask(() => listeners.forEach((listener) => listener()));
  }
  return null;
};
