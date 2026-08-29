/**
 * T043 — Credit cost schedule.
 *
 * Verbatim from the Credit Cost Schedule in
 * specs/001-webaudit-mvp-baseline/spec.md, which resolved the constitution's
 * TODO(CREDIT_PRICE_TABLE). Nothing here is invented; changing a number is a
 * specification amendment.
 */

import type { ModuleType } from '@webaudit/types';

/** Per-area cost. Design costs most: vision work on screenshots. */
export const AREA_COST: Readonly<Record<ModuleType, number>> = {
  PERFORMANCE: 20,
  SECURITY: 20,
  UI: 25,
  TESTING: 20,
  SEO: 10,
};

/**
 * The five areas total 95 bought individually against 80 bundled, so a full
 * audit is always the cheapest route to complete coverage.
 */
export const FULL_AUDIT_COST = 80;

/**
 * Under 4% of a full audit. This ratio is what makes Principle VII real rather
 * than aspirational — if completing the loop were expensive, users would stop
 * walking it, and the loop is the product.
 */
export const REVERIFY_COST = 3;

/**
 * Discounted below a full audit despite doing equivalent work, because
 * reaching it is the behaviour the product exists to produce.
 */
export const READINESS_PASS_COST = 60;

export const DOCS_GENERATION_COST = 10;

/** The free tier's one-time allocation. Deliberately below FULL_AUDIT_COST. */
export const FREE_ALLOCATION = 50;

export const ALL_AREAS: readonly ModuleType[] = ['PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO'];

/**
 * Cost of auditing a set of areas. Selecting all five charges the bundled
 * price, never the sum — a user must not be able to pay more by asking for
 * everything.
 */
export function quoteAreas(areas: readonly ModuleType[]): number {
  const unique = new Set(areas);
  if (unique.size === 0) return 0;
  if (unique.size === ALL_AREAS.length) return FULL_AUDIT_COST;
  return [...unique].reduce((sum, a) => sum + AREA_COST[a], 0);
}

/** Sum of the five areas bought separately. Exists to assert the bundle discount. */
export const SUM_OF_AREAS = ALL_AREAS.reduce((n, a) => n + AREA_COST[a], 0);
