/**
 * The four plan tiers, verbatim from spec.md's "Plan Tiers and Entitlements"
 * table (which resolved the constitution's `TODO(PLAN_TIERS)`).
 *
 * Plans are *data*, not code — FR-084 lets an operator change a tier without a
 * deploy, and the `Plan` rows in the database are the source of truth at
 * runtime. This constant is the **seed** for those rows and the shape every
 * consumer agrees on: `scripts/seed.ts` writes it, the test helper writes it,
 * and the billing services read a `Plan` row typed against it. Changing a
 * number here is a specification amendment.
 *
 * The monetary price attached to each tier is a commercial decision the
 * specification explicitly leaves open (Assumptions: "Monetary price points are
 * provisional"); nothing here names one.
 */

import type { InputType } from '@webaudit/types';

export interface PlanTier {
  readonly id: 'free' | 'starter' | 'pro' | 'business';
  readonly name: string;
  /** 50 / 300 / 1,200 / 4,000. */
  readonly monthlyCredits: number;
  /** false for free — a one-time grant with no renewal boundary. */
  readonly creditsRecur: boolean;
  readonly allowedInputTypes: readonly InputType[];
  readonly allowLoadGeneration: boolean;
  readonly allowReadinessPass: boolean;
  /** FR-078: false on free, keeping it an evaluation rather than a route around subscribing. */
  readonly allowCreditPurchase: boolean;
  readonly allowCustomCapability: boolean;
  readonly concurrentScanLimit: number;
  /** Lower runs sooner. */
  readonly queuePriority: number;
  readonly retentionDays: number;
}

export const PLAN_TIERS: readonly PlanTier[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyCredits: 50,
    creditsRecur: false,
    allowedInputTypes: ['URL'],
    allowLoadGeneration: false,
    allowReadinessPass: false,
    allowCreditPurchase: false,
    allowCustomCapability: false,
    concurrentScanLimit: 1,
    queuePriority: 40,
    retentionDays: 7,
  },
  {
    id: 'starter',
    name: 'Starter',
    monthlyCredits: 300,
    creditsRecur: true,
    allowedInputTypes: ['URL', 'ARCHIVE'],
    allowLoadGeneration: false,
    allowReadinessPass: true,
    allowCreditPurchase: true,
    allowCustomCapability: false,
    concurrentScanLimit: 1,
    queuePriority: 30,
    retentionDays: 30,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyCredits: 1_200,
    creditsRecur: true,
    allowedInputTypes: ['URL', 'ARCHIVE', 'REPOSITORY'],
    allowLoadGeneration: true,
    allowReadinessPass: true,
    allowCreditPurchase: true,
    allowCustomCapability: false,
    concurrentScanLimit: 3,
    queuePriority: 20,
    retentionDays: 365,
  },
  {
    id: 'business',
    name: 'Business',
    monthlyCredits: 4_000,
    creditsRecur: true,
    allowedInputTypes: ['URL', 'ARCHIVE', 'REPOSITORY'],
    allowLoadGeneration: true,
    allowReadinessPass: true,
    allowCreditPurchase: true,
    allowCustomCapability: true,
    concurrentScanLimit: 6,
    queuePriority: 10,
    retentionDays: 730,
  },
];

export const PLAN_TIER_BY_ID: Readonly<Record<string, PlanTier>> = Object.fromEntries(
  PLAN_TIERS.map((tier) => [tier.id, tier]),
);

/** The billing period length every tier's allowance is defined in. */
export const BILLING_PERIOD_DAYS = 30;

/** How many days before a renewal the "you are about to lose N credits" warning fires (FR-078). */
export const RENEWAL_WARNING_LEAD_DAYS = 3;

/** How many days before a report's retention expiry the removal warning fires (FR-092). */
export const RETENTION_WARNING_LEAD_DAYS = 3;
