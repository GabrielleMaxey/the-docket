import { JQL_RUNS_STORAGE_KEY } from "./chatSessionContext.js";

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

export const persistJqlRunsToStorage = (jqlRuns) => {
  if (typeof window === "undefined") {
    return;
  }

  const savable = savableJqlRuns(jqlRuns);

  try {
    if (savable.length === 0) {
      window.localStorage.removeItem(JQL_RUNS_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(JQL_RUNS_STORAGE_KEY, JSON.stringify(savable));
  } catch (error) {
    console.warn("Could not persist JQL results to localStorage.", error);
  }
};
