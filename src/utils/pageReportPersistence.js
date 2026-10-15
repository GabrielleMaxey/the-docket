import { getSiteContext, siteStorageKey, readSiteStorage } from "./siteContextStore.js";
const DASHBOARD_REPORT_KEY = "taskManagerPersistedDashboardReport";
const WORK_WEEK_PROJECT_REPORTS_KEY = "taskManagerPersistedWorkWeekProjectReports";
const WORK_WEEK_WEEK_PLAN_KEY = "taskManagerPersistedWeekPlan";

const readJson = (key, fallback, instanceId) => {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = readSiteStorage(window.localStorage, key, instanceId);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeJson = (key, value, instanceId) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(siteStorageKey(key, instanceId), JSON.stringify(value));
  } catch (error) {
    console.warn("Could not persist report to localStorage.", error);
  }
};

export const getWorkWeekRunKey = (run) => String(run?.index ?? run?.label ?? "0");

export const loadDashboardReportState = (instanceId = getSiteContext()?.instanceId) => {
  const data = readJson(DASHBOARD_REPORT_KEY, null, instanceId);
  if (!data || typeof data !== "object") {
    return null;
  }
  return data;
};

export const saveDashboardReportState = (state, instanceId = getSiteContext()?.instanceId) => {
  if (!state || typeof state !== "object") {
    return;
  }

  writeJson(DASHBOARD_REPORT_KEY, {
    ...state,
    savedAt: new Date().toISOString(),
  }, instanceId);
};

export const clearDashboardReportState = (instanceId = getSiteContext()?.instanceId) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(siteStorageKey(DASHBOARD_REPORT_KEY, instanceId));
  } catch {
  }
};

export const loadWorkWeekProjectReport = (runKey, instanceId = getSiteContext()?.instanceId) => {
  const all = readJson(WORK_WEEK_PROJECT_REPORTS_KEY, {}, instanceId);
  const entry = all[String(runKey)];
  return entry && typeof entry === "object" ? entry : null;
};

export const saveWorkWeekProjectReport = (runKey, data, instanceId = getSiteContext()?.instanceId) => {
  if (!data || typeof data !== "object") {
    return;
  }

  const all = readJson(WORK_WEEK_PROJECT_REPORTS_KEY, {}, instanceId);
  all[String(runKey)] = {
    ...data,
    savedAt: new Date().toISOString(),
  };
  writeJson(WORK_WEEK_PROJECT_REPORTS_KEY, all, instanceId);
};

export const clearWorkWeekProjectReport = (runKey, instanceId = getSiteContext()?.instanceId) => {
  const all = readJson(WORK_WEEK_PROJECT_REPORTS_KEY, {}, instanceId);
  delete all[String(runKey)];
  writeJson(WORK_WEEK_PROJECT_REPORTS_KEY, all, instanceId);
};

export const loadWeekPlanState = (instanceId = getSiteContext()?.instanceId) => {
  const data = readJson(WORK_WEEK_WEEK_PLAN_KEY, null, instanceId);
  if (!data || typeof data !== "object") {
    return null;
  }
  return data;
};

export const saveWeekPlanState = (state, instanceId = getSiteContext()?.instanceId) => {
  if (!state || typeof state !== "object") {
    return;
  }

  writeJson(WORK_WEEK_WEEK_PLAN_KEY, {
    ...state,
    savedAt: new Date().toISOString(),
  }, instanceId);
};

export const clearWeekPlanState = (instanceId = getSiteContext()?.instanceId) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(siteStorageKey(WORK_WEEK_WEEK_PLAN_KEY, instanceId));
  } catch {
  }
};

export const clearWeekPlanReportOnly = (instanceId = getSiteContext()?.instanceId) => {
  const current = loadWeekPlanState(instanceId);
  if (!current) {
    return;
  }

  saveWeekPlanState({ ...current, plan: null }, instanceId);
};
