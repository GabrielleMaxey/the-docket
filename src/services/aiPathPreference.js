const KEY = "taskManagerAiPath";

export const getPreferredAiPath = () => {
  const v = String(localStorage.getItem(KEY) || "").trim().toLowerCase();
  return v === "managed" || v === "local" ? v : null;
};

export const setPreferredAiPath = (path) => {
  const v = String(path || "").trim().toLowerCase();
  if (v !== "managed" && v !== "local") return;
  localStorage.setItem(KEY, v);
};
