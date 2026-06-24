import React from "react";

// Generic "JSON in localStorage" state hook. Replaces the load/save-with-
// fallback pattern that was hand-rolled separately for jiraNotes,
// jiraRowPriorities, jqlRuns (useTaskManagerJira.js), and reminders /
// taskManagerSegmentOpen (WorkWeekTasks.jsx) — same shape every time:
// parse JSON, fall back to a default, guard for SSR, swallow parse errors.
//
// `sanitize(parsed, defaultValue)` is optional — use it when the stored
// shape needs validation/migration beyond a plain JSON.parse (e.g.
// jqlRuns filtering out malformed entries).
export const usePersistedState = (key, defaultValue, { sanitize } = {}) => {
  const [state, setState] = React.useState(() => {
    if (typeof window === "undefined") {
      return defaultValue;
    }

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        return defaultValue;
      }

      const parsed = JSON.parse(raw);
      return sanitize ? sanitize(parsed, defaultValue) : parsed;
    } catch {
      return defaultValue;
    }
  });

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.warn(`Could not persist "${key}" to localStorage (size or quota).`, error);
    }
  }, [key, state]);

  return [state, setState];
};
