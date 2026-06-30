import { usePersistedState } from "./usePersistedState.js";

export const WORK_WEEK_HEADER_PREFS_KEY = "workWeekTasksHeaderPreferences";

const DEFAULT_HEADER_PREFS = {
  showJokeTicker: true,
  showUpcomingDueBanner: false,
};

export const sanitizeHeaderPreferences = (value) => ({
  showJokeTicker: value?.showJokeTicker !== false,
  showUpcomingDueBanner: value?.showUpcomingDueBanner === true,
});

export const useWorkWeekHeaderPreferences = () =>
  usePersistedState(WORK_WEEK_HEADER_PREFS_KEY, DEFAULT_HEADER_PREFS, {
    sanitize: sanitizeHeaderPreferences,
  });
