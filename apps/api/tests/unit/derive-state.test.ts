/**
 * T022 / T019 — SPEC 007 `data-model.md` "Derived state (FR-012)".
 *
 * `deriveState` is pure: state is computed from `revokedAt`/`expiresAt`/budgets
 * and an optional caller-supplied consumption snapshot on every call, never
 * from a stored verdict. Production consumption tracking is SPEC 008's (F07);
 * absent consumption data never reports exhaustion.
 */

import { describe, expect, it } from 'vitest';
import {
  deriveState,
  type BudgetConsumption,
  type DerivableGrant,
} from '../../src/services/authorization/derive-state.js';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const FUTURE = new Date('2026-11-25T12:00:00.000Z');
const PAST = new Date('2026-10-01T12:00:00.000Z');

function grant(overrides: Partial<DerivableGrant> = {}): DerivableGrant {
  return {
    revokedAt: null,
    expiresAt: FUTURE,
    requestBudget: 1000,
    concurrencyBudget: 5,
    ...overrides,
  };
}

const used = (requestsConsumed: number, concurrencyInUse: number): BudgetConsumption => ({
  requestsConsumed,
  concurrencyInUse,
});

describe('deriveState', () => {
  it('is ACTIVE for an unrevoked, unexpired grant', () => {
    expect(deriveState(grant(), NOW)).toBe('ACTIVE');
  });

  it('is REVOKED whenever revokedAt is set', () => {
    expect(deriveState(grant({ revokedAt: PAST }), NOW)).toBe('REVOKED');
  });

  it('is EXPIRED at and after expiresAt, but not one millisecond before', () => {
    const expiresAt = new Date(NOW.getTime());
    expect(deriveState(grant({ expiresAt }), new Date(NOW.getTime() - 1))).toBe('ACTIVE');
    expect(deriveState(grant({ expiresAt }), NOW)).toBe('EXPIRED');
    expect(deriveState(grant({ expiresAt: PAST }), NOW)).toBe('EXPIRED');
  });

  it('REVOKED takes precedence over EXPIRED and BUDGET_EXHAUSTED', () => {
    expect(deriveState(grant({ revokedAt: PAST, expiresAt: PAST }), NOW, used(9999, 99))).toBe(
      'REVOKED',
    );
  });

  it('EXPIRED takes precedence over BUDGET_EXHAUSTED', () => {
    expect(deriveState(grant({ expiresAt: PAST }), NOW, used(9999, 99))).toBe('EXPIRED');
  });

  it('is BUDGET_EXHAUSTED when requests consumed >= requestBudget', () => {
    expect(deriveState(grant(), NOW, used(999, 0))).toBe('ACTIVE');
    expect(deriveState(grant(), NOW, used(1000, 0))).toBe('BUDGET_EXHAUSTED');
    expect(deriveState(grant(), NOW, used(1001, 0))).toBe('BUDGET_EXHAUSTED');
  });

  it('is BUDGET_EXHAUSTED when concurrency in use >= concurrencyBudget', () => {
    expect(deriveState(grant(), NOW, used(0, 4))).toBe('ACTIVE');
    expect(deriveState(grant(), NOW, used(0, 5))).toBe('BUDGET_EXHAUSTED');
  });

  it('does not report exhaustion when no consumption data is supplied', () => {
    expect(deriveState(grant(), NOW)).toBe('ACTIVE');
    expect(deriveState(grant(), NOW, undefined)).toBe('ACTIVE');
  });

  it('fails closed on malformed consumption rather than treating it as headroom', () => {
    expect(deriveState(grant(), NOW, used(Number.NaN, 0))).toBe('BUDGET_EXHAUSTED');
    expect(deriveState(grant(), NOW, used(-1, 0))).toBe('BUDGET_EXHAUSTED');
    expect(deriveState(grant(), NOW, used(0, Number.POSITIVE_INFINITY))).toBe('BUDGET_EXHAUSTED');
  });

  it('is pure: the same inputs give the same answer and nothing is mutated', () => {
    const g = Object.freeze(grant());
    const c = Object.freeze(used(10, 1));
    expect(deriveState(g, NOW, c)).toBe(deriveState(g, NOW, c));
    expect(c).toEqual({ requestsConsumed: 10, concurrencyInUse: 1 });
  });
});
