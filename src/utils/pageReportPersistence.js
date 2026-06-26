const DASHBOARD_REPORT_KEY = "taskManagerPersistedDashboardReport";
const WORK_WEEK_PROJECT_REPORTS_KEY = "taskManagerPersistedWorkWeekProjectReports";
const WORK_WEEK_WEEK_PLAN_KEY = "taskManagerPersistedWeekPlan";

const readJson = (key, fallback) => {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Could not persist report to localStorage.", error);
  }
};

export const getWorkWeekRunKey = (run) => String(run?.index ?? run?.label ?? "0");

export const loadDashboardReportState = () => {
  const data = readJson(DASHBOARD_REPORT_KEY, null);
  if (!data || typeof data !== "object") {
    return null;
  }
  return data;
};

export const saveDashboardReportState = (state) => {
  if (!state || typeof state !== "object") {
    return;
  }

  writeJson(DASHBOARD_REPORT_KEY, {
    ...state,
    savedAt: new Date().toISOString(),
  });
};

export const loadWorkWeekProjectReport = (runKey) => {
  const all = readJson(WORK_WEEK_PROJECT_REPORTS_KEY, {});
  const entry = all[String(runKey)];
  return entry && typeof entry === "object" ? entry : null;
};

export const saveWorkWeekProjectReport = (runKey, data) => {
  if (!data || typeof data !== "object") {
    return;
  }

  const all = readJson(WORK_WEEK_PROJECT_REPORTS_KEY, {});
  all[String(runKey)] = {
    ...data,
    savedAt: new Date().toISOString(),
  };
  writeJson(WORK_WEEK_PROJECT_REPORTS_KEY, all);
};

export const loadWeekPlanState = () => {
  const data = readJson(WORK_WEEK_WEEK_PLAN_KEY, null);
  if (!data || typeof data !== "object") {
    return null;
  }
  return data;
};

export const saveWeekPlanState = (state) => {
  if (!state || typeof state !== "object") {
    return;
  }

  writeJson(WORK_WEEK_WEEK_PLAN_KEY, {
    ...state,
    savedAt: new Date().toISOString(),
  });
};

export const clearWeekPlanState = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(WORK_WEEK_WEEK_PLAN_KEY);
  } catch {
    // ignore
  }
};
