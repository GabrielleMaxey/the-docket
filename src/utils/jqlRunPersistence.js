import { getSiteContext, siteStorageKey, readSiteStorage } from "./siteContextStore.js";
import { WORK_WEEK_STORAGE_KEYS } from "./workWeekStorage.js";

export const isDrillDownRun = (run) => run?.isDrillDown === true;

const loadDismissedDrillDownIds = (instanceId = getSiteContext()?.instanceId) => {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = readSiteStorage(window.sessionStorage, WORK_WEEK_STORAGE_KEYS.dismissedDrillDownIds, instanceId);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.map((id) => String(id || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
};

const persistDismissedDrillDownIds = (ids, instanceId = getSiteContext()?.instanceId) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (ids.size === 0) {
      window.sessionStorage.removeItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.dismissedDrillDownIds, instanceId));
      return;
    }
    window.sessionStorage.setItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.dismissedDrillDownIds, instanceId),
      JSON.stringify([...ids])
    );
  } catch (error) {
    console.warn("Could not persist dismissed drill-down ids to sessionStorage.", error);
  }
};

export const isDrillDownDismissed = (drillDownId, instanceId = getSiteContext()?.instanceId) => {
  const id = String(drillDownId || "").trim();
  if (!id) {
    return false;
  }
  return loadDismissedDrillDownIds(instanceId).has(id);
};

export const dismissDrillDownId = (drillDownId, instanceId = getSiteContext()?.instanceId) => {
  const id = String(drillDownId || "").trim();
  if (!id) {
    return;
  }

  const dismissed = loadDismissedDrillDownIds(instanceId);
  dismissed.add(id);
  persistDismissedDrillDownIds(dismissed, instanceId);
};

const filterDismissedDrillDownRuns = (runs, instanceId = getSiteContext()?.instanceId) =>
  (runs || []).filter((run) => !isDrillDownDismissed(run.drillDownId, instanceId));

export const partitionJqlRuns = (runs) => {
  const drillDown = [];
  const regular = [];
  for (const run of runs || []) {
    if (isDrillDownRun(run)) {
      drillDown.push(run);
    } else {
      regular.push(run);
    }
  }
  return { drillDown, regular };
};

export const mergeJqlRuns = (drillDown, regular) => [...drillDown, ...regular];

export const savableJqlRuns = (runs) => (runs || []).filter((run) => !isDrillDownRun(run));

export const drillDownJqlRuns = (runs) => (runs || []).filter(isDrillDownRun);

const isValidStoredRun = (run) =>
  Boolean(run && typeof run === "object" && Array.isArray(run.issues));

export const persistJqlRunsToStorage = (jqlRuns, instanceId = getSiteContext()?.instanceId) => {
  if (typeof window === "undefined") {
    return;
  }

  const savable = savableJqlRuns(jqlRuns);

  try {
    if (savable.length === 0) {
      window.localStorage.removeItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.jqlRuns, instanceId));
      return;
    }
    window.localStorage.setItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.jqlRuns, instanceId), JSON.stringify(savable));
  } catch (error) {
    console.warn("Could not persist JQL results to localStorage.", error);
  }
};

export const loadDrillDownRunsFromSessionStorage = (instanceId = getSiteContext()?.instanceId) => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = readSiteStorage(window.sessionStorage, WORK_WEEK_STORAGE_KEYS.drillDownRuns, instanceId);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return filterDismissedDrillDownRuns(
      parsed.filter((run) => isValidStoredRun(run) && isDrillDownRun(run)), instanceId
    );
  } catch {
    return [];
  }
};

export const persistDrillDownRunsToSessionStorage = (jqlRuns, instanceId = getSiteContext()?.instanceId) => {
  if (typeof window === "undefined") {
    return;
  }

  const drillDown = filterDismissedDrillDownRuns(drillDownJqlRuns(jqlRuns), instanceId);

  try {
    if (drillDown.length === 0) {
      window.sessionStorage.removeItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.drillDownRuns, instanceId));
      return;
    }
    window.sessionStorage.setItem(siteStorageKey(WORK_WEEK_STORAGE_KEYS.drillDownRuns, instanceId), JSON.stringify(drillDown));
  } catch (error) {
    console.warn("Could not persist drill-down JQL results to sessionStorage.", error);
  }
};
