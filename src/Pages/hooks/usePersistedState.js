import { getSiteContext, siteStorageKey, readSiteStorage } from "../../utils/siteContextStore.js";
import React from "react";

// Optional sanitize(parsed, defaultValue) for stored-shape validation beyond JSON.parse.
export const usePersistedState = (key, defaultValue, { sanitize, siteScoped = false } = {}) => {
  const instanceId = React.useRef(getSiteContext()?.instanceId).current;
  const storageKey = siteScoped ? siteStorageKey(key, instanceId) : key;
  const [state, setState] = React.useState(() => {
    if (typeof window === "undefined") {
      return defaultValue;
    }

    try {
      const raw = siteScoped ? readSiteStorage(window.localStorage, key, instanceId) : window.localStorage.getItem(key);
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
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.warn(`Could not persist "${key}" to localStorage (size or quota).`, error);
    }
  }, [storageKey, state]);

  return [state, setState];
};
