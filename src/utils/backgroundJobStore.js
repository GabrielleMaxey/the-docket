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
  const delay =
    job.status === "error" || job.status === "cancelled" || job.status === "timeout"
      ? 10000
      : 5000;
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

export const cancelBackgroundJob = (id) => {
  const job = jobs.get(id);
  if (!job || job.status !== "running") {
    return false;
  }

  job.abortController?.abort();
  return true;
};

/**
 * Run async work that survives React route unmounts. Reuses the in-flight promise when the same id is already running.
 */
export const runBackgroundJob = (id, { label, scope, run, timeoutMs = 0 }) => {
  const existing = jobs.get(id);
  if (existing?.status === "running" && existing.promise) {
    return existing.promise;
  }

  const abortController = new AbortController();
  const job = {
    id,
    label: label || id,
    scope: scope || "all",
    status: "running",
    startedAt: Date.now(),
    error: null,
    result: null,
    promise: null,
    abortController,
    timeoutMs: timeoutMs > 0 ? timeoutMs : null,
  };

  let timeoutId = null;
  const clearJobTimeout = () => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  if (timeoutMs > 0) {
    timeoutId = window.setTimeout(() => {
      if (!abortController.signal.aborted) {
        const minutes = Math.max(1, Math.round(timeoutMs / 60000));
        abortController.abort(
          new DOMException(`Refresh timed out after ${minutes} minutes.`, "TimeoutError")
        );
      }
    }, timeoutMs);
  }

  const promise = Promise.resolve()
    .then(() => run(abortController.signal))
    .then((result) => {
      clearJobTimeout();
      if (abortController.signal.aborted) {
        const error = abortController.signal.reason;
        throw error instanceof Error
          ? error
          : new DOMException("Cancelled", "AbortError");
      }
      job.status = "done";
      job.result = result;
      job.finishedAt = Date.now();
      notify();
      scheduleClear(id, job);
      return result;
    })
    .catch((error) => {
      clearJobTimeout();
      if (error?.name === "TimeoutError") {
        job.status = "timeout";
        job.error = error instanceof Error ? error.message : "Refresh timed out.";
      } else if (error?.name === "AbortError" || abortController.signal.aborted) {
        job.status = "cancelled";
        job.error = "Cancelled";
      } else {
        job.status = "error";
        job.error = error instanceof Error ? error.message : String(error);
      }
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
