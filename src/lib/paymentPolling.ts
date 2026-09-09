const FIRST_MINUTE_MS = 60_000;
const FIRST_FIVE_MINUTES_MS = 5 * 60_000;

export function paymentPollingDelay(elapsedMs: number, pageHidden = false): number {
  if (pageHidden) return 30_000;
  if (elapsedMs < FIRST_MINUTE_MS) return 3_000;
  if (elapsedMs < FIRST_FIVE_MINUTES_MS) return 10_000;
  return 30_000;
}
