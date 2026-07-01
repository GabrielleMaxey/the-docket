const jobs = new Map();
const listeners = new Set();

export const BACKGROUND_JOB_IDS = {
  DASHBOARD_REFRESH: "dashboard-refresh",
  DASHBOARD_REPORT: "dashboard-report",
  DASHBOARD_WEEKLY_DIGEST: "dashboard-weekly-digest",
  WORK_WEEK_JQL: "work-week-jql-run",
  WORK_WEEK_WEEK_PLAN: "work-week-week-plan",
};

export const workWeekProjectReportJobId = (runKey) =>
  `work-week-project-report:${String(runKey || "0")}`;

const notify = () => {
  const snapshot = getActiveBackgroundJobs();
  listeners.forEach((listener) => listener(snapshot));
};

const scheduleClear = (id, job) => {
  const delay = job.status === "error" ? 10000 : 5000;
  window.setTimeout(() => {
    const current = jobs.get(id);
    if (current === job && current.status !== "running") {
      jobs.delete(id);
      notify();
    }
  }, delay);
};

export const getBackgroundJob = (id) => jobs.get(id) || null;

export const getActiveBackgroundJobs = () => [...jobs.values()];

export const getRunningBackgroundJobs = () =>
  getActiveBackgroundJobs().filter((job) => job.status === "running");

export const subscribeBackgroundJobs = (listener) => {
  listeners.add(listener);
  listener(getActiveBackgroundJobs());
  return () => listeners.delete(listener);
};

/**
 * Run async work that survives React route unmounts. Reuses the in-flight promise when the same id is already running.
 */
export const runBackgroundJob = (id, { label, run }) => {
  const existing = jobs.get(id);
  if (existing?.status === "running" && existing.promise) {
    return existing.promise;
  }

  const job = {
    id,
    label: label || id,
    status: "running",
    startedAt: Date.now(),
    error: null,
    result: null,
    promise: null,
  };

  const promise = Promise.resolve()
    .then(() => run())
    .then((result) => {
      job.status = "done";
      job.result = result;
      job.finishedAt = Date.now();
      notify();
      scheduleClear(id, job);
      return result;
    })
    .catch((error) => {
      job.status = "error";
      job.error = error instanceof Error ? error.message : String(error);
      job.finishedAt = Date.now();
      notify();
      scheduleClear(id, job);
      throw error;
    });

  job.promise = promise;
  jobs.set(id, job);
  notify();
  return promise;
};
