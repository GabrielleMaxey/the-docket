// Pure state machine for the local-API connection indicator.
// Offline is only declared after consecutive failed health checks so a single
// slow ping never flashes the banner; one success restores online immediately.
export const OFFLINE_AFTER_FAILURES = 2;

export function initialConnectionState() {
  return { online: true, failures: 0 };
}

export function nextConnectionState(state, ok) {
  if (ok) return { online: true, failures: 0 };
  const failures = Math.min((state?.failures || 0) + 1, OFFLINE_AFTER_FAILURES);
  return { online: failures < OFFLINE_AFTER_FAILURES, failures };
}
