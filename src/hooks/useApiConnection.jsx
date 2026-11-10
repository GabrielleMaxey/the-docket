import React from "react";
import { fetchJiraHealth } from "../services/jiraClient.js";
import { initialConnectionState, nextConnectionState } from "../utils/connectionState.js";

const PING_INTERVAL_MS = 15000;
const PING_TIMEOUT_MS = 5000;
const ApiConnectionContext = React.createContext({ online: true });

const pingApi = () =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
    Promise.resolve()
      .then(() => fetchJiraHealth())
      .then(() => resolve(true), () => resolve(false))
      .finally(() => clearTimeout(timer));
  });

// Watches the local Express API (/api/health). Jira reachability is out of scope.
export function ApiConnectionProvider({ children }) {
  const [state, setState] = React.useState(initialConnectionState);

  React.useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await pingApi();
      if (!cancelled) setState((prev) => nextConnectionState(prev, ok));
    };
    check();
    const id = setInterval(check, PING_INTERVAL_MS);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, []);

  const value = React.useMemo(() => ({ online: state.online }), [state.online]);
  return <ApiConnectionContext.Provider value={value}>{children}</ApiConnectionContext.Provider>;
}

export const useApiConnection = () => React.useContext(ApiConnectionContext);

export const OFFLINE_REASON = "Not connected to the Docket service. Your entries are kept.";
