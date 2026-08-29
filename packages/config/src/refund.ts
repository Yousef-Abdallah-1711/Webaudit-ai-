/**
 * What to refund for a scan that stopped early, in credits.
 *
 * Proportional to undelivered areas, computed from what was actually charged
 * rather than the quote — a scan may have been charged less than quoted, and
 * refunding against the quote would hand back credits nobody paid.
 *
 * Rounded down, so rounding never invents a credit. The remainder stays with
 * the platform on a fractional split, which is the only direction that
 * cannot turn a refund into a grant.
 *
 * Shared by the timeout sweep, the terminal-refund observer, and scan
 * cancellation — one tested implementation, three call sites.
 */
export function refundForUndelivered(input: {
  readonly chargedCredits: number;
  readonly requestedCount: number;
  readonly deliveredCount: number;
}): number {
  if (input.requestedCount <= 0 || input.chargedCredits <= 0) return 0;
  const undelivered = Math.max(0, input.requestedCount - input.deliveredCount);
  if (undelivered === 0) return 0;
  if (input.deliveredCount === 0) return input.chargedCredits;
  return Math.floor((input.chargedCredits * undelivered) / input.requestedCount);
}
