/**
 * T022 — SPEC 007 `data-model.md` "Derived state (FR-012)".
 *
 * A grant's state is never stored: it is computed on every call from
 * `revokedAt`, `expiresAt` and (optionally) a consumption snapshot, so a
 * revocation bites on the very next check and no cached verdict can go stale.
 * Pure: no I/O, no mutation (FR-024).
 *
 * `GRANTED` (FR-012's pre-activation window) is not produced: this spec has no
 * future-dated effective start, so a grant is `ACTIVE` from `grantedAt`.
 *
 * Budget exhaustion (FR-015) is a fourth refusal reason, not a lifecycle state.
 * The authoritative consumption counters belong to SPEC 008 (F07). Until that
 * exists the caller may pass a pre-set snapshot; when none is supplied the grant
 * is NOT reported exhausted — production budget enforcement is out of this
 * slice. A snapshot that is supplied but malformed fails closed.
 */

export type AuthorizationState = 'REVOKED' | 'EXPIRED' | 'BUDGET_EXHAUSTED' | 'ACTIVE';

/** What has been used so far, supplied by the caller (SPEC 008 will own the source). */
export interface BudgetConsumption {
  requestsConsumed: number;
  concurrencyInUse: number;
}

/** The grant fields state derivation reads. */
export interface DerivableGrant {
  revokedAt: Date | null;
  expiresAt: Date;
  requestBudget: number;
  concurrencyBudget: number;
}

function isValidCount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isBudgetExhausted(grant: DerivableGrant, consumption: BudgetConsumption): boolean {
  if (!isValidCount(consumption.requestsConsumed) || !isValidCount(consumption.concurrencyInUse)) {
    return true;
  }
  return (
    consumption.requestsConsumed >= grant.requestBudget ||
    consumption.concurrencyInUse >= grant.concurrencyBudget
  );
}

export function deriveState(
  grant: DerivableGrant,
  now: Date,
  consumption?: BudgetConsumption,
): AuthorizationState {
  if (grant.revokedAt !== null) return 'REVOKED';
  const expiresAt = grant.expiresAt.getTime();
  // An unreadable expiry can never mean "still valid".
  if (Number.isNaN(expiresAt) || now.getTime() >= expiresAt) return 'EXPIRED';
  if (consumption !== undefined && isBudgetExhausted(grant, consumption)) {
    return 'BUDGET_EXHAUSTED';
  }
  return 'ACTIVE';
}
