import { WORK_WEEK_STORAGE_KEYS } from "./workWeekStorage.js";

export const isDrillDownRun = (run) => run?.isDrillDown === true;

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

export const persistJqlRunsToStorage = (jqlRuns) => {
  if (typeof window === "undefined") {
    return;
  }

  const savable = savableJqlRuns(jqlRuns);

  try {
    if (savable.length === 0) {
      window.localStorage.removeItem(WORK_WEEK_STORAGE_KEYS.jqlRuns);
      return;
    }
    window.localStorage.setItem(WORK_WEEK_STORAGE_KEYS.jqlRuns, JSON.stringify(savable));
  } catch (error) {
    console.warn("Could not persist JQL results to localStorage.", error);
  }
};

export const loadDrillDownRunsFromSessionStorage = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(WORK_WEEK_STORAGE_KEYS.drillDownRuns);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((run) => isValidStoredRun(run) && isDrillDownRun(run));
  } catch {
    return [];
  }
};

export const persistDrillDownRunsToSessionStorage = (jqlRuns) => {
  if (typeof window === "undefined") {
    return;
  }

  const drillDown = drillDownJqlRuns(jqlRuns);

  try {
    if (drillDown.length === 0) {
      window.sessionStorage.removeItem(WORK_WEEK_STORAGE_KEYS.drillDownRuns);
      return;
    }
    window.sessionStorage.setItem(WORK_WEEK_STORAGE_KEYS.drillDownRuns, JSON.stringify(drillDown));
  } catch (error) {
    console.warn("Could not persist drill-down JQL results to sessionStorage.", error);
  }
};
