export const PROXY_URL_STORAGE_KEY = "taskManagerProxyUrl";

export const getApiBase = () => {
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).trim().replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(PROXY_URL_STORAGE_KEY);
    if (stored && stored.trim()) {
      return stored.trim().replace(/\/$/, "");
    }
  }

  return "";
};

export const buildApiUrl = (path) => {
  const base = getApiBase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
};

export const setStoredProxyUrl = (value) => {
  if (typeof window === "undefined") {
    return;
  }

  const trimmed = String(value || "").trim().replace(/\/$/, "");
  if (trimmed) {
    window.localStorage.setItem(PROXY_URL_STORAGE_KEY, trimmed);
  } else {
    window.localStorage.removeItem(PROXY_URL_STORAGE_KEY);
  }
};
