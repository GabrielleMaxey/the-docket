import React from "react";
import {
  getBackgroundJob,
  getRunningBackgroundJobs,
  runBackgroundJob,
  subscribeBackgroundJobs,
} from "../utils/backgroundJobStore.js";

export {
  BACKGROUND_JOB_IDS,
  cancelBackgroundJob,
  getBackgroundJob,
  runBackgroundJob,
  workWeekProjectReportJobId,
} from "../utils/backgroundJobStore.js";

export const useBackgroundJobs = () => {
  const [jobs, setJobs] = React.useState(getRunningBackgroundJobs);

  React.useEffect(
    () =>
      subscribeBackgroundJobs(() => {
        setJobs(getRunningBackgroundJobs());
      }),
    []
  );

  return jobs;
};

export const useBackgroundJobRunning = (jobId) => {
  const [running, setRunning] = React.useState(
    () => getBackgroundJob(jobId)?.status === "running"
  );

  React.useEffect(
    () =>
      subscribeBackgroundJobs(() => {
        setRunning(getBackgroundJob(jobId)?.status === "running");
      }),
    [jobId]
  );

  return running;
};

/** Re-attach to an in-flight job when a page remounts (e.g. after navigation away mid-refresh). */
export const useAttachBackgroundJob = (jobId, handlers) => {
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;
  const attachedPromiseRef = React.useRef(null);
  const mountedAtRef = React.useRef(Date.now());

  const tryAttach = React.useCallback(() => {
    const job = getBackgroundJob(jobId);
    if (!job?.promise || job.status !== "running") {
      return;
    }
    if (job.startedAt > mountedAtRef.current) {
      return;
    }
    if (attachedPromiseRef.current === job.promise) {
      return;
    }

    attachedPromiseRef.current = job.promise;
    handlersRef.current?.onStart?.();

    job.promise
      .then((result) => handlersRef.current?.onSuccess?.(result))
      .catch((error) => handlersRef.current?.onError?.(error))
      .finally(() => handlersRef.current?.onFinally?.());
  }, [jobId]);

  React.useEffect(() => {
    tryAttach();
    return subscribeBackgroundJobs(tryAttach);
  }, [tryAttach]);
};
