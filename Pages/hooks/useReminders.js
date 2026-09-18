import React from "react";
import { fetchReminders, saveReminders } from "../../services/jiraClient.js";
import { WORK_WEEK_STORAGE_KEYS } from "../../utils/workWeekStorage.js";

const REMINDER_SLOT_COUNT = 4;

const defaultReminderRows = () =>
  Array.from({ length: REMINDER_SLOT_COUNT }, () => ({ text: "", done: false }));

const sanitizeReminders = (parsed) => {
  if (!Array.isArray(parsed)) return defaultReminderRows();
  const next = defaultReminderRows();
  for (let i = 0; i < REMINDER_SLOT_COUNT; i += 1) {
    const item = parsed[i];
    if (item && typeof item === "object") {
      next[i] = {
        text: typeof item.text === "string" ? item.text : "",
        done: Boolean(item.done),
      };
    }
  }
  return next;
};

export const useReminders = () => {
  const [reminders, setReminders] = React.useState(defaultReminderRows);
  const [error, setError] = React.useState("");
  const reminderSaveTimeoutRef = React.useRef(null);

  const persistReminders = React.useCallback((next) => {
    clearTimeout(reminderSaveTimeoutRef.current);
    reminderSaveTimeoutRef.current = setTimeout(() => {
      saveReminders(next)
        .then(() => setError(""))
        .catch(() => setError("Reminders could not be saved. Your latest changes may not persist."));
    }, 500);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    fetchReminders()
      .then((items) => {
        if (cancelled) return;
        setError("");
        const fromDb = sanitizeReminders(items);
        if (fromDb.some((row) => row.text.trim() || row.done)) {
          setReminders(fromDb);
          return;
        }

        try {
          const legacyRaw = window.localStorage.getItem(WORK_WEEK_STORAGE_KEYS.reminders);
          const legacy = legacyRaw ? sanitizeReminders(JSON.parse(legacyRaw)) : null;
          if (legacy && legacy.some((row) => row.text.trim() || row.done)) {
            setReminders(legacy);
            saveReminders(legacy).catch(() => {
              if (!cancelled) {
                setError("Saved reminders could not be migrated.");
              }
            });
          }
          window.localStorage.removeItem(WORK_WEEK_STORAGE_KEYS.reminders);
        } catch {
          // Malformed legacy data — nothing to migrate.
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Reminders could not be loaded.");
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(reminderSaveTimeoutRef.current);
    };
  }, []);

  const handleReminderTextChange = React.useCallback((index, value) => {
    setReminders((prev) => {
      const next = prev.map((row, i) => {
        if (i !== index) return row;
        const clearDone = String(value).trim() !== String(row.text).trim() || !String(value).trim();
        return { text: value, done: clearDone ? false : row.done };
      });
      persistReminders(next);
      return next;
    });
  }, [persistReminders]);

  const handleReminderDoneChange = React.useCallback((index, checked) => {
    setReminders((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, done: checked } : row));
      persistReminders(next);
      return next;
    });
  }, [persistReminders]);

  return { reminders, error, handleReminderTextChange, handleReminderDoneChange };
};
