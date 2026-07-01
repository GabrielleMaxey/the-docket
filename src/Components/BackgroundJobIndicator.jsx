import React from "react";
import { useBackgroundJobs } from "../hooks/useBackgroundJobs.js";

const BackgroundJobIndicator = () => {
  const jobs = useBackgroundJobs();

  if (jobs.length === 0) {
    return null;
  }

  return (
    <div className="app-nav-background-jobs" aria-live="polite" role="status">
      {jobs.map((job) => (
        <span key={job.id} className="app-nav-background-job">
          <span className="app-nav-background-job-spinner" aria-hidden="true" />
          {job.label}
        </span>
      ))}
    </div>
  );
};

export default BackgroundJobIndicator;
