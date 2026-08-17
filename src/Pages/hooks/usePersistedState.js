import React from "react";

// Optional sanitize(parsed, defaultValue) for stored-shape validation beyond JSON.parse.
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
