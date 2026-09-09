/** Match web Android scan window so users have time to aim the ID card. */
export const SCAN_TIMEOUT_MS = 15_000;

export function scanTimeoutSeconds() {
  return Math.ceil(SCAN_TIMEOUT_MS / 1000);
}
