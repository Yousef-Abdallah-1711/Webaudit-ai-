/**
 * T205 (plans half) — operator definition and management of plan tiers and
 * their entitlements (FR-084). Kept in its own file: T205's own naming
 * scopes `users.service.ts` to users only.
 *
 * Plans are data, not code (packages/config/src/plans.ts's own module note):
 * `PLAN_TIERS` there is the seed, the `Plan` table is the runtime source of
 * truth, and this is where an operator changes it without a deploy.
 *
 * **What this deliberately does not do**: touch any existing `Subscription`.
 * Changing a plan's fields mid-flight has no effect on an existing
 * subscriber's current period — their entitlements and credit allowance
 * follow the `Plan` row they are already linked to by `planId`, and the next
 * renewal (`renewSubscription`, billing/subscription.service.ts) reads
 * whatever the row says at that time. That is an existing, working behaviour
 * this service must not disturb, not a gap for this task to close.
 *
 * `isActive: false` already has real, tested meaning elsewhere:
 * `loadSubscribablePlan` (billing/subscription.service.ts) refuses to let
 * anyone newly `subscribe` or `changePlan` onto an inactive plan. This
 * service does not re-implement that refusal — flipping the column here is
 * the whole action, and every consumer that cares already reads it.
 */

import type { InputType } from '@webaudit/types';
import type { Prisma, PrismaClient } from '../../../prisma/generated/client/index.js';
import { recordAuditLog } from './audit-log.js';

export class PlanNotFoundError extends Error {
  override readonly name = 'PlanNotFoundError';
  constructor(readonly planId: string) {
    super(`No such plan: ${planId}.`);
  }
}

export class DuplicatePlanIdError extends Error {
  override readonly name = 'DuplicatePlanIdError';
  constructor(readonly planId: string) {
    super(`A plan with id ${planId} already exists.`);
  }
}

export interface PlanRecord {
  readonly id: string;
  readonly name: string;
  readonly monthlyCredits: number;
  readonly creditsRecur: boolean;
  readonly allowedInputTypes: readonly InputType[];
  readonly allowLoadGeneration: boolean;
  readonly allowReadinessPass: boolean;
  readonly allowCreditPurchase: boolean;
  readonly allowCustomCapability: boolean;
  readonly concurrentScanLimit: number;
  readonly queuePriority: number;
  readonly retentionDays: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ListPlansOptions {
  /** Defaults to false: the tier table is normally shown active-only. */
  readonly includeInactive?: boolean;
}

export async function listPlans(
  db: PrismaClient,
  opts: ListPlansOptions = {},
): Promise<readonly PlanRecord[]> {
  return db.plan.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: { monthlyCredits: 'asc' },
  });
}

export async function getPlan(db: PrismaClient, planId: string): Promise<PlanRecord> {
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (plan === null) throw new PlanNotFoundError(planId);
  return plan;
}

export interface CreatePlanInput {
  /** The operator performing this mutation — the audit row's `actorId`. */
  readonly operatorId: string;
  readonly id: string;
  readonly name: string;
  readonly monthlyCredits: number;
  readonly creditsRecur: boolean;
  readonly allowedInputTypes: readonly InputType[];
  readonly allowLoadGeneration: boolean;
  readonly allowReadinessPass: boolean;
  readonly allowCreditPurchase: boolean;
  readonly allowCustomCapability: boolean;
  readonly concurrentScanLimit: number;
  readonly queuePriority: number;
  readonly retentionDays: number;
  /** Defaults to true — a newly defined tier is subscribable unless said otherwise. */
  readonly isActive?: boolean | undefined;
}

export async function createPlan(db: PrismaClient, input: CreatePlanInput): Promise<PlanRecord> {
  const existing = await db.plan.findUnique({ where: { id: input.id }, select: { id: true } });
  if (existing !== null) throw new DuplicatePlanIdError(input.id);

  const { operatorId, ...rest } = input;
  const created = await db.plan.create({
    data: {
      ...rest,
      allowedInputTypes: [...rest.allowedInputTypes],
      isActive: rest.isActive ?? true,
    },
  });

  await recordAuditLog(db, {
    actorId: operatorId,
    action: 'plan.create',
    subjectType: 'Plan',
    subjectId: created.id,
    after: created,
  });

  return created;
}

/**
 * Every field explicitly unioned with `undefined` rather than relying on
 * `Partial<Pick<PlanRecord, ...>>`'s bare `?:` — this repo runs with
 * `exactOptionalPropertyTypes`, under which an object that *carries* the key
 * with value `undefined` (exactly what a `z.object({...}).partial()` parse
 * produces) is not assignable to a `?:` property typed without `| undefined`.
 */
export interface UpdatePlanPatch {
  readonly name?: string | undefined;
  readonly monthlyCredits?: number | undefined;
  readonly creditsRecur?: boolean | undefined;
  readonly allowedInputTypes?: readonly InputType[] | undefined;
  readonly allowLoadGeneration?: boolean | undefined;
  readonly allowReadinessPass?: boolean | undefined;
  readonly allowCreditPurchase?: boolean | undefined;
  readonly allowCustomCapability?: boolean | undefined;
  readonly concurrentScanLimit?: number | undefined;
  readonly queuePriority?: number | undefined;
  readonly retentionDays?: number | undefined;
  readonly isActive?: boolean | undefined;
}

export interface UpdatePlanInput {
  /** The operator performing this mutation — the audit row's `actorId`. */
  readonly operatorId: string;
  readonly planId: string;
  readonly patch: UpdatePlanPatch;
}

/**
 * The `before` read, the write, and the audit log all happen inside one
 * transaction with the row locked `FOR UPDATE` — the same pattern
 * `users.service.ts`'s `updateUser` uses. Without the lock, two concurrent
 * PATCHes on the same plan both read the row's state before either writes,
 * so the second write's audit entry would claim a `before` that was never
 * actually true immediately before it ran (Prisma has no way to express
 * `FOR UPDATE`, hence the raw query).
 */
export async function updatePlan(db: PrismaClient, input: UpdatePlanInput): Promise<PlanRecord> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Plan" WHERE id = ${input.planId} FOR UPDATE
    `;
    if (locked.length === 0) throw new PlanNotFoundError(input.planId);
    const before = await tx.plan.findUniqueOrThrow({ where: { id: input.planId } });

    // Built field-by-field rather than via a conditional double spread: two
    // spreads that may each define the same key (`...patch` and a conditional
    // `...{allowedInputTypes: ...}`) merge their *types* as a union under
    // `exactOptionalPropertyTypes`, which is what produced the original
    // `readonly InputType[]` vs `InputType[]` mismatch here.
    const { patch } = input;
    const data: Prisma.PlanUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.monthlyCredits !== undefined) data.monthlyCredits = patch.monthlyCredits;
    if (patch.creditsRecur !== undefined) data.creditsRecur = patch.creditsRecur;
    if (patch.allowedInputTypes !== undefined) data.allowedInputTypes = [...patch.allowedInputTypes];
    if (patch.allowLoadGeneration !== undefined) data.allowLoadGeneration = patch.allowLoadGeneration;
    if (patch.allowReadinessPass !== undefined) data.allowReadinessPass = patch.allowReadinessPass;
    if (patch.allowCreditPurchase !== undefined) data.allowCreditPurchase = patch.allowCreditPurchase;
    if (patch.allowCustomCapability !== undefined)
      data.allowCustomCapability = patch.allowCustomCapability;
    if (patch.concurrentScanLimit !== undefined) data.concurrentScanLimit = patch.concurrentScanLimit;
    if (patch.queuePriority !== undefined) data.queuePriority = patch.queuePriority;
    if (patch.retentionDays !== undefined) data.retentionDays = patch.retentionDays;
    if (patch.isActive !== undefined) data.isActive = patch.isActive;

    const after = await tx.plan.update({ where: { id: input.planId }, data });

    await recordAuditLog(tx, {
      actorId: input.operatorId,
      action: 'plan.update',
      subjectType: 'Plan',
      subjectId: input.planId,
      before,
      after,
    });

    return after;
  });
}
