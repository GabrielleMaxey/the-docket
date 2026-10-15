import { siteStorageKey, readSiteStorage } from "./siteContextStore.js";
export const PM_ASK_CREATE_ISSUE_HANDOFF_KEY = "pmAskCreateIssueHandoff";

export function writePmAskCreateIssueHandoff({ askId, title, note }) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(siteStorageKey(PM_ASK_CREATE_ISSUE_HANDOFF_KEY),
    JSON.stringify({
      askId,
      title: String(title || ""),
      note: String(note || ""),
      createdAt: Date.now(),
    })
  );
}

export function consumePmAskCreateIssueHandoff() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = readSiteStorage(window.sessionStorage, PM_ASK_CREATE_ISSUE_HANDOFF_KEY);
  window.sessionStorage.removeItem(siteStorageKey(PM_ASK_CREATE_ISSUE_HANDOFF_KEY));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(Number(parsed.askId))) {
      return null;
    }
    return {
      askId: Number(parsed.askId),
      title: String(parsed.title || ""),
      note: String(parsed.note || ""),
    };
  } catch {
    return null;
  }
}
