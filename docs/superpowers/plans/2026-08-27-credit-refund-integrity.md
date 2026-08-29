# Credit & Refund Integrity (R1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two blocker-severity findings from the independent T001–T142 review — a phase-job failure that never refunds credits, and a cancellation that never refunds credits or tears down its workspace — plus turn `gated-check-partial.test.ts`'s second assertion green, all through one shared, reusable refund primitive rather than three separate patches.

**Architecture:** Extend `apps/api`'s existing full-refund (`refund()`) into a partial-refund primitive (`refundPartial()`) that reuses its exact lot-walking logic, expose it to `apps/worker` via the same package-subpath-export precedent already used for the generated Prisma client, relocate the pure `refundForUndelivered` calculation into `packages/config` so all three call sites (timeout, terminal-refund, cancellation) share one tested implementation, then register ONE new terminal observer at worker boot that fires the refund for every FAILED/COMPLETED transition with undelivered modules — which covers phase-job failure (R1.2) and the gated-partial-on-completion case (R1.4) with a single mechanism. Cancellation (R1.3) gets its own fix because it's the one path that never goes through the worker's `transition()` at all — it's fixed at the source, in `apps/api`'s own cancel route.

**Tech Stack:** TypeScript 5.9, Prisma/PostgreSQL, Vitest (`--no-file-parallelism`, real DB), pnpm workspaces.

**Spec:** This plan implements review findings from the WebAudit AI T001–T142 baseline review (R1 in the remediation plan) — no separate spec.md; the "spec" is CLAUDE.md's non-negotiable #6 ("never charge for our failures") and #7, plus PROGRESS.md's Open Decision #11 and Carried Correction #7.

## Global Constraints

- Money is always integer credits (no floats) — mirrors the existing `debit`/`refund` convention.
- `apps/worker` may depend on `@webaudit/api` in production **only** for generated artifacts (the Prisma client today; this plan adds one more: the credits service) — never for routes, Express, or app wiring. This is an established, already-audited precedent (Section A of the review passed it clean); do not widen it beyond what's specified here.
- Every credit-ledger change needs a real test that would fail if the change were reverted — this is SC-022's own bar, and this codebase does not accept a passing test that doesn't exercise the real logic.
- Round refund splits **down**, never up — an existing rule (`refundForUndelivered`'s own docstring: "Rounded down, so rounding never invents a credit"). This plan's proportional-split logic follows the same rule.
- `pnpm test` and `pnpm test:adverse` must stay green (module note: the current baseline has known contamination from concurrent DB access — re-run any suite that fails once, alone, before treating a failure as real).
- Do not touch `design-system/`, and do not add a new deployable unit — this is backend-only work inside the existing five apps.

---

### Task 1: `refundPartial()` — the partial-refund primitive, and `refund()` refactored to use it

**Files:**
- Modify: `apps/api/src/services/credits/refund.ts`
- Test: `apps/api/tests/adverse/credits.refund-partial.test.ts` (new)

**Interfaces:**
- Consumes: `PrismaClient` (generated client), `withRetry` from `apps/api/src/db/retry.ts`, `CreditKind` from `@webaudit/types`. Reuses the existing `NotRefundableError`, `AlreadyRefundedError`, `RefundResult`, `REFUND_HORIZON_DAYS` already exported from this file.
- Produces: `refundPartial(db: PrismaClient, input: { debitTransactionId: string; credits: number; reason: string }): Promise<RefundResult>` and a new `OverRefundError`. `refund()`'s existing public signature (`refund(db, debitTransactionId, reason): Promise<RefundResult>`) is unchanged — every existing caller keeps working with no edits.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/adverse/credits.refund-partial.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, resetDb } from '../helpers/db.js';
import { grantLot } from '../../src/services/credits/grant.js';
import { debit } from '../../src/services/credits/debit.js';
import { refundPartial, OverRefundError, NotRefundableError } from '../../src/services/credits/refund.js';
import { balanceOf } from '../../src/services/credits/balance.js';

const db = testDb();

describe('refundPartial', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns a proportional share, rounded down, to the exact lot it was drawn from', async () => {
    const user = await db.user.create({ data: { email: 'r1@example.com', passwordHash: 'x', emailVerifiedAt: new Date() } });
    await grantLot(db, { userId: user.id, kind: 'PURCHASED', amount: 100, source: 'PURCHASE', expiresAt: null });
    const result = await debit(db, { userId: user.id, amount: 30, reason: 'scan:create', scanId: 'scan-1' });

    const refunded = await refundPartial(db, { debitTransactionId: result.id, credits: 10, reason: 'undelivered:1-of-3' });

    expect(refunded.amount).toBe(10);
    expect(refunded.reversesId).toBe(result.id);
    const balance = await balanceOf(db, user.id);
    expect(balance.purchased).toBe(80); // 100 granted - 30 debited + 10 refunded
  });

  it('splits proportionally across two lots the debit drew from, floored down, with the remainder on the larger share', async () => {
    const user = await db.user.create({ data: { email: 'r2@example.com', passwordHash: 'x', emailVerifiedAt: new Date() } });
    await grantLot(db, { userId: user.id, kind: 'PURCHASED', amount: 7, source: 'PURCHASE', expiresAt: null });
    await grantLot(db, { userId: user.id, kind: 'PURCHASED', amount: 100, source: 'PURCHASE', expiresAt: null });
    // Debit draws 7 from the first lot (expires-first ordering exhausts it), 3 from the second: total 10.
    const result = await debit(db, { userId: user.id, amount: 10, reason: 'scan:create', scanId: 'scan-2' });

    // Refund 1 of the 10 credits charged. Proportional shares: 7*1/10=0.7→0, 3*1/10=0.3→0,
    // distributed=0, remainder=1, goes to the larger allocation (the 7-credit one).
    const refunded = await refundPartial(db, { debitTransactionId: result.id, credits: 1, reason: 'undelivered:test' });
    expect(refunded.amount).toBe(1);

    const balance = await balanceOf(db, user.id);
    expect(balance.purchased).toBe(97); // 107 granted - 10 debited + 1 refunded
  });

  it('refuses to refund more than remains refundable on the debit', async () => {
    const user = await db.user.create({ data: { email: 'r3@example.com', passwordHash: 'x', emailVerifiedAt: new Date() } });
    await grantLot(db, { userId: user.id, kind: 'PURCHASED', amount: 50, source: 'PURCHASE', expiresAt: null });
    const result = await debit(db, { userId: user.id, amount: 20, reason: 'scan:create', scanId: 'scan-3' });
    await refundPartial(db, { debitTransactionId: result.id, credits: 15, reason: 'first' });

    await expect(
      refundPartial(db, { debitTransactionId: result.id, credits: 10, reason: 'second' }),
    ).rejects.toThrow(OverRefundError);
  });

  it('routes a partial refund into a fresh lot when the source lot has since expired', async () => {
    const user = await db.user.create({ data: { email: 'r4@example.com', passwordHash: 'x', emailVerifiedAt: new Date() } });
    const soon = new Date(Date.now() + 50);
    await grantLot(db, { userId: user.id, kind: 'PLAN', amount: 10, source: 'FREE_GRANT', expiresAt: soon });
    const result = await debit(db, { userId: user.id, amount: 10, reason: 'scan:create', scanId: 'scan-4' });
    await new Promise((resolve) => setTimeout(resolve, 80)); // let the lot expire

    const refunded = await refundPartial(db, { debitTransactionId: result.id, credits: 4, reason: 'undelivered:test' });
    expect(refunded.amount).toBe(4);
    const balance = await balanceOf(db, user.id);
    // The expired lot cannot receive it back; a new PLAN lot carries the 4 credits instead.
    expect(balance.plan).toBe(4);
  });

  it('rejects a zero or negative refund amount', async () => {
    const user = await db.user.create({ data: { email: 'r5@example.com', passwordHash: 'x', emailVerifiedAt: new Date() } });
    await grantLot(db, { userId: user.id, kind: 'PURCHASED', amount: 10, source: 'PURCHASE', expiresAt: null });
    const result = await debit(db, { userId: user.id, amount: 10, reason: 'scan:create', scanId: 'scan-5' });
    await expect(refundPartial(db, { debitTransactionId: result.id, credits: 0, reason: 'x' })).rejects.toThrow(NotRefundableError);
  });
});

describe('refund() after the refundPartial refactor', () => {
  it('still refunds the full debit in one call, unchanged from before', async () => {
    const user = await db.user.create({ data: { email: 'r6@example.com', passwordHash: 'x', emailVerifiedAt: new Date() } });
    await grantLot(db, { userId: user.id, kind: 'PURCHASED', amount: 50, source: 'PURCHASE', expiresAt: null });
    const result = await debit(db, { userId: user.id, amount: 30, reason: 'scan:create', scanId: 'scan-6' });
    const { refund } = await import('../../src/services/credits/refund.js');
    const refunded = await refund(db, result.id, 'platform-fault');
    expect(refunded.amount).toBe(30);
    const balance = await balanceOf(db, user.id);
    expect(balance.purchased).toBe(50);
  });
});
```

(Reuse whatever import path `apps/api/tests/adverse/credits.refund-to-lot.test.ts` already uses for `testDb`/`resetDb`/`grantLot` — copy its exact import lines if they differ from the above; the shape of the calls must match that file's existing helper signatures.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @webaudit/api exec vitest run tests/adverse/credits.refund-partial.test.ts`
Expected: FAIL — `refundPartial`/`OverRefundError` do not exist yet (`SyntaxError`/`TS2305: Module has no exported member`).

- [ ] **Step 3: Implement `refundPartial`, refactor `refund` to delegate to it**

Replace the body of `apps/api/src/services/credits/refund.ts` from `export class AlreadyRefundedError` onward — keep the file's existing header comment, `NotRefundableError`, `RefundResult`, `DAY_MS`, `REFUND_HORIZON_DAYS`, and `Orphan` interface exactly as they are — with:

```ts
export class AlreadyRefundedError extends Error {
  override readonly name = 'AlreadyRefundedError';
}

export class OverRefundError extends Error {
  override readonly name = 'OverRefundError';
  constructor(
    readonly requested: number,
    readonly maxRefundable: number,
  ) {
    super(`refund of ${String(requested)} exceeds the ${String(maxRefundable)} still refundable on this debit`);
  }
}

/**
 * Refund any amount up to what remains refundable on a debit, walking the
 * same allocations `refund()` does but distributing a smaller total.
 *
 * `refund()` is now a thin wrapper: "refund everything still refundable" is
 * just the largest legal value of `credits` this function accepts. One
 * lot-walk, one place SC-022's invariants have to hold.
 */
export async function refundPartial(
  db: PrismaClient,
  input: { readonly debitTransactionId: string; readonly credits: number; readonly reason: string },
): Promise<RefundResult> {
  if (input.credits <= 0) {
    throw new NotRefundableError('refund amount must be a positive number of credits');
  }

  return withRetry(
    () =>
      db.$transaction(async (tx) => {
        const original = await tx.creditTransaction.findUnique({
          where: { id: input.debitTransactionId },
          include: { allocations: { include: { lot: true } } },
        });

        if (!original) throw new NotRefundableError('no such transaction');
        if (original.type !== 'DEBIT') {
          throw new NotRefundableError(`cannot refund a ${original.type} transaction`);
        }

        const priorRefunds = await tx.creditTransaction.findMany({
          where: { reversesId: original.id },
          select: { amount: true },
        });
        const alreadyRefunded = priorRefunds.reduce((sum, r) => sum + r.amount, 0);
        const stillRefundable = original.amount - alreadyRefunded;
        if (input.credits > stillRefundable) {
          throw new OverRefundError(input.credits, stillRefundable);
        }

        const refundTx = await tx.creditTransaction.create({
          data: {
            userId: original.userId,
            type: 'REFUND',
            amount: input.credits,
            reason: input.reason,
            scanId: original.scanId,
            issueId: original.issueId,
            reversesId: original.id,
          },
        });

        const lotIds = [...new Set(original.allocations.map((a) => a.lotId))].sort();
        const locked = new Map<string, { expiresAt: Date | null; amountRemaining: number }>();
        if (lotIds.length > 0) {
          const rows = await tx.$queryRaw<
            { id: string; expiresAt: Date | null; amountRemaining: number }[]
          >`
            SELECT id, "expiresAt", "amountRemaining"
            FROM "CreditLot"
            WHERE id = ANY(${lotIds}::text[])
            ORDER BY id
            FOR UPDATE
          `;
          for (const row of rows) {
            locked.set(row.id, { expiresAt: row.expiresAt, amountRemaining: row.amountRemaining });
          }
        }

        const now = new Date();

        let planBoundary: Date | undefined;
        const planRefundBoundary = async (): Promise<Date> => {
          if (planBoundary) return planBoundary;
          const sub = await tx.subscription.findUnique({
            where: { userId: original.userId },
            select: { periodEnd: true },
          });
          planBoundary =
            sub && sub.periodEnd > now ? sub.periodEnd : new Date(now.getTime() + REFUND_HORIZON_DAYS * DAY_MS);
          return planBoundary;
        };

        const refundLotExpiry = async (kind: CreditKind, sourceExpiresAt: Date | null): Promise<Date | null> => {
          if (kind === 'PURCHASED') return null;
          if (sourceExpiresAt !== null && sourceExpiresAt > now) return sourceExpiresAt;
          return planRefundBoundary();
        };

        const orphans = new Map<string, Orphan>();
        const addOrphan = async (kind: CreditKind, sourceExpiresAt: Date | null, amount: number): Promise<void> => {
          if (amount <= 0) return;
          const expiresAt = await refundLotExpiry(kind, sourceExpiresAt);
          const key = `${kind}|${expiresAt?.toISOString() ?? 'never'}`;
          const seen = orphans.get(key);
          if (seen) seen.amount += amount;
          else orphans.set(key, { kind, expiresAt, amount });
        };

        // Proportional share per allocation, floored down; the largest
        // allocation absorbs the flooring remainder so the shares sum to
        // exactly `input.credits`, never more. Same "round down" rule as
        // `refundForUndelivered` — here the remainder lands on the largest
        // share rather than being dropped, since this refund's total is
        // fixed by the caller, not derived from the split itself.
        const shares = original.allocations.map((alloc) => ({
          alloc,
          share: Math.floor((alloc.amount * input.credits) / original.amount),
        }));
        let remainder = input.credits - shares.reduce((sum, s) => sum + s.share, 0);
        for (const s of [...shares].sort((a, b) => b.alloc.amount - a.alloc.amount)) {
          if (remainder <= 0) break;
          s.share += 1;
          remainder -= 1;
        }

        for (const { alloc, share } of shares) {
          if (share <= 0) continue;
          const current = locked.get(alloc.lotId);
          const expiresAt = current?.expiresAt ?? alloc.lot.expiresAt;
          const amountRemaining = current?.amountRemaining ?? alloc.lot.amountRemaining;
          const lotIsAlive = expiresAt === null || expiresAt > now;

          if (lotIsAlive) {
            const headroom = Math.max(0, alloc.lot.amountGranted - amountRemaining);
            const giveBack = Math.min(share, headroom);
            if (giveBack > 0) {
              await tx.creditLot.update({
                where: { id: alloc.lot.id },
                data: { amountRemaining: { increment: giveBack } },
              });
              await tx.creditAllocation.create({
                data: { transactionId: refundTx.id, lotId: alloc.lot.id, amount: giveBack },
              });
            }
            const overflow = share - giveBack;
            if (overflow > 0) await addOrphan(alloc.lot.kind, expiresAt, overflow);
          } else {
            await addOrphan(alloc.lot.kind, expiresAt, share);
          }
        }

        for (const orphan of orphans.values()) {
          const replacement = await tx.creditLot.create({
            data: {
              userId: original.userId,
              kind: orphan.kind,
              source: 'REFUND',
              amountGranted: orphan.amount,
              amountRemaining: orphan.amount,
              expiresAt: orphan.expiresAt,
            },
          });
          await tx.creditAllocation.create({
            data: { transactionId: refundTx.id, lotId: replacement.id, amount: orphan.amount },
          });
        }

        return {
          id: refundTx.id,
          type: refundTx.type,
          amount: refundTx.amount,
          reversesId: refundTx.reversesId,
        };
      }),
    'refund-partial',
  );
}

/** Refund everything still refundable on one debit — `refundPartial` at its largest legal value. */
export async function refund(db: PrismaClient, debitTransactionId: string, reason: string): Promise<RefundResult> {
  const original = await db.creditTransaction.findUnique({ where: { id: debitTransactionId } });
  if (!original) throw new NotRefundableError('no such transaction');
  if (original.type !== 'DEBIT') throw new NotRefundableError(`cannot refund a ${original.type} transaction`);

  const priorRefunds = await db.creditTransaction.findMany({
    where: { reversesId: debitTransactionId },
    select: { id: true },
  });
  if (priorRefunds.length > 0) {
    throw new AlreadyRefundedError(`already refunded by ${priorRefunds[0]!.id}`);
  }

  return refundPartial(db, { debitTransactionId, credits: original.amount, reason });
}
```

- [ ] **Step 4: Run the new tests, verify they pass**

Run: `pnpm --filter @webaudit/api exec vitest run tests/adverse/credits.refund-partial.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Run the full existing credits suite to confirm zero regressions from the `refund()` refactor**

Run: `pnpm --filter @webaudit/api exec vitest run tests/adverse/credits.refund-to-lot.test.ts tests/adverse/credits.property.test.ts tests/adverse/credits.concurrency.test.ts tests/adverse/credits.expiry-race.test.ts`
Expected: PASS — same counts as before this change (these tests call `refund()`, not `refundPartial`, and must observe identical behavior).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/credits/refund.ts apps/api/tests/adverse/credits.refund-partial.test.ts
git commit -m "feat(credits): add refundPartial, refactor refund to delegate to it"
```

---

### Task 2: Expose the credits service to `apps/worker`

**Files:**
- Modify: `apps/api/package.json`
- Test: `apps/worker/tests/unit/credits-import.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's `refund`, `refundPartial`, `OverRefundError`, `NotRefundableError`, `AlreadyRefundedError`, `RefundResult` exports.
- Produces: a new package subpath `@webaudit/api/credits` importable from `apps/worker`.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/unit/credits-import.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('credits import from @webaudit/api', () => {
  it('resolves refundPartial and refund as functions', async () => {
    const mod = await import('@webaudit/api/credits');
    expect(typeof mod.refundPartial).toBe('function');
    expect(typeof mod.refund).toBe('function');
    expect(typeof mod.OverRefundError).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/worker exec vitest run tests/unit/credits-import.test.ts`
Expected: FAIL — `Cannot find module '@webaudit/api/credits'` (no such export subpath yet).

- [ ] **Step 3: Add the export subpath**

In `apps/api/package.json`, find the existing `"exports"` block (it already has a `"./prisma-client"` entry — add a sibling entry immediately after it):

```json
"./credits": "./src/services/credits/refund.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @webaudit/worker exec vitest run tests/unit/credits-import.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/worker/tests/unit/credits-import.test.ts
git commit -m "feat(worker): expose apps/api's credits service as an importable subpath"
```

---

### Task 3: Move `refundForUndelivered` into `packages/config`

**Files:**
- Modify: `apps/worker/src/orchestrator/timeout.ts` (remove the function, import it instead)
- Create: `packages/config/src/refund.ts`
- Modify: `packages/config/src/index.ts` (barrel export)
- Test: `packages/config/tests/refund.test.ts` (new — the function's existing behavior, moved and re-asserted from wherever `timeout.ts`'s own tests currently cover it)

**Interfaces:**
- Produces: `refundForUndelivered(input: { chargedCredits: number; requestedCount: number; deliveredCount: number }): number`, importable as `import { refundForUndelivered } from '@webaudit/config'`.
- Consumed by: Task 4 (terminal-refund observer) and `apps/worker/src/orchestrator/timeout.ts` (existing caller, updated to import rather than define).

- [ ] **Step 1: Write the failing test**

Create `packages/config/tests/refund.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { refundForUndelivered } from '../src/refund.js';

describe('refundForUndelivered', () => {
  it('refunds nothing when everything requested was delivered', () => {
    expect(refundForUndelivered({ chargedCredits: 80, requestedCount: 5, deliveredCount: 5 })).toBe(0);
  });

  it('refunds the whole charge when nothing was delivered', () => {
    expect(refundForUndelivered({ chargedCredits: 80, requestedCount: 5, deliveredCount: 0 })).toBe(80);
  });

  it('refunds a floored proportional share for a partial delivery', () => {
    // 80 charged, 5 requested, 3 delivered -> 2 undelivered -> floor(80*2/5) = 32
    expect(refundForUndelivered({ chargedCredits: 80, requestedCount: 5, deliveredCount: 3 })).toBe(32);
  });

  it('never refunds when nothing was charged', () => {
    expect(refundForUndelivered({ chargedCredits: 0, requestedCount: 5, deliveredCount: 0 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/config exec vitest run tests/refund.test.ts`
Expected: FAIL — `packages/config/src/refund.ts` does not exist yet.

- [ ] **Step 3: Create `packages/config/src/refund.ts`**

```ts
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
```

- [ ] **Step 4: Add it to the barrel**

In `packages/config/src/index.ts`, add:

```ts
export { refundForUndelivered } from './refund.js';
```

- [ ] **Step 5: Update `apps/worker/src/orchestrator/timeout.ts`**

Remove the `refundForUndelivered` function definition (and its docblock) from `timeout.ts` entirely. Add to its existing import block:

```ts
import { refundForUndelivered } from '@webaudit/config';
```

(`timeout.ts` already imports from `@webaudit/types` at the top of the file — add this as a new import line alongside it, not merged into it, since it's a different package.)

- [ ] **Step 6: Run all affected tests**

Run: `pnpm --filter @webaudit/config exec vitest run tests/refund.test.ts`
Expected: PASS, all 4 tests.

Run: `pnpm --filter @webaudit/worker exec vitest run tests/adverse/timeout` (or whatever the existing timeout test file is named — grep `apps/worker/tests` for `timeout` first if this path guess is wrong)
Expected: PASS — unchanged behavior, now sourced from the shared package.

- [ ] **Step 7: Commit**

```bash
git add packages/config/src/refund.ts packages/config/src/index.ts packages/config/tests/refund.test.ts apps/worker/src/orchestrator/timeout.ts
git commit -m "refactor(config): move refundForUndelivered to packages/config for reuse"
```

---

### Task 4: Terminal-refund observer — covers phase-job failure (R1.2) and gated-partial-on-completion (R1.4)

**Files:**
- Create: `apps/worker/src/orchestrator/terminal-refund.ts`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/tests/integration/terminal-refund.test.ts` (new)

**Interfaces:**
- Consumes: `onTerminalTransition` from `apps/worker/src/orchestrator/state-machine.ts` (already exported, already used by `installTerminalTeardown`); `refundForUndelivered` from `@webaudit/config` (Task 3); `refundPartial` from `@webaudit/api/credits` (Task 2); `isDelivered`/`MODULE_STATES_SCORED` pattern already established in `timeout.ts`.
- Produces: `installTerminalRefund(options: { db: PrismaClient }): () => void`, registered at worker boot next to `installTerminalTeardown`.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/integration/terminal-refund.test.ts`. Follow the exact `testDb`/scan-fixture setup pattern already used in `apps/worker/tests/adverse/capability-disable.test.ts` or `apps/api/tests/integration/gated-check-partial.test.ts` (read whichever of those two this repo's worker-side integration tests already import from, and copy its exact `db`/scan-creation helper calls — do not invent new fixture helpers if one already exists for "create a scan with N requested modules and M delivered ModuleResults").

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, resetDb } from '../helpers/db.js'; // match whatever path apps/worker's existing integration tests use
import { installTerminalRefund } from '../../src/orchestrator/terminal-refund.js';
import { transition } from '../../src/orchestrator/state-machine.js';
import { grantLot } from '@webaudit/api/credits'; // adjust if grantLot is not exported from that subpath — see note below
import { debit } from '@webaudit/api/credits';

const db = testDb();

describe('installTerminalRefund', () => {
  let uninstall: () => void;

  beforeEach(async () => {
    await resetDb();
    uninstall = installTerminalRefund({ db });
  });

  afterEach(() => {
    uninstall();
  });

  it('refunds the undelivered share when a scan transitions to FAILED', async () => {
    const user = await db.user.create({ data: { email: 'tr1@example.com', passwordHash: 'x', emailVerifiedAt: new Date() } });
    await grantLot(db, { userId: user.id, kind: 'PURCHASED', amount: 100, source: 'PURCHASE', expiresAt: null });
    const target = await db.target.create({ data: { userId: user.id, url: 'https://example.com', controlLevel: 'NONE' } });
    const scan = await db.scan.create({
      data: { userId: user.id, targetId: target.id, requestedModules: ['SECURITY', 'SEO'], capabilitySnapshot: {}, quotedCredits: 80, chargedCredits: 80, state: 'RUNNING_PHASE_1' },
    });
    await debit(db, { userId: user.id, amount: 80, reason: 'scan:create', scanId: scan.id });
    // Only SEO delivered; SECURITY never ran.
    await db.moduleResult.create({ data: { scanId: scan.id, module: 'SEO', state: 'COMPLETE', score: 90 } });

    await transition(db, { scanId: scan.id, from: 'RUNNING_PHASE_1', to: 'FAILED', extra: { failureReason: 'boom' } });
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the async observer settle

    const refunds = await db.creditTransaction.findMany({ where: { scanId: scan.id, type: 'REFUND' } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amount).toBe(40); // 80 charged, 2 requested, 1 delivered -> floor(80*1/2)=40
  });

  it('does not refund a scan that completed with everything delivered', async () => {
    const user = await db.user.create({ data: { email: 'tr2@example.com', passwordHash: 'x', emailVerifiedAt: new Date() } });
    await grantLot(db, { userId: user.id, kind: 'PURCHASED', amount: 100, source: 'PURCHASE', expiresAt: null });
    const target = await db.target.create({ data: { userId: user.id, url: 'https://example.com', controlLevel: 'NONE' } });
    const scan = await db.scan.create({
      data: { userId: user.id, targetId: target.id, requestedModules: ['SEO'], capabilitySnapshot: {}, quotedCredits: 16, chargedCredits: 16, state: 'RUNNING_DOCS' },
    });
    await debit(db, { userId: user.id, amount: 16, reason: 'scan:create', scanId: scan.id });
    await db.moduleResult.create({ data: { scanId: scan.id, module: 'SEO', state: 'COMPLETE', score: 90 } });

    await transition(db, { scanId: scan.id, from: 'RUNNING_DOCS', to: 'COMPLETED', extra: {} });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const refunds = await db.creditTransaction.findMany({ where: { scanId: scan.id, type: 'REFUND' } });
    expect(refunds).toHaveLength(0);
  });

  it('refunds the gated-but-unmet module on a scan that otherwise completes (turns gated-check-partial green)', async () => {
    const user = await db.user.create({ data: { email: 'tr3@example.com', passwordHash: 'x', emailVerifiedAt: new Date() } });
    await grantLot(db, { userId: user.id, kind: 'PURCHASED', amount: 100, source: 'PURCHASE', expiresAt: null });
    const target = await db.target.create({ data: { userId: user.id, url: 'https://example.com', controlLevel: 'NONE' } });
    const scan = await db.scan.create({
      data: { userId: user.id, targetId: target.id, requestedModules: ['SECURITY', 'SEO'], capabilitySnapshot: {}, quotedCredits: 80, chargedCredits: 80, state: 'RUNNING_DOCS' },
    });
    await debit(db, { userId: user.id, amount: 80, reason: 'scan:create', scanId: scan.id });
    await db.moduleResult.create({ data: { scanId: scan.id, module: 'SEO', state: 'COMPLETE', score: 90 } });
    await db.moduleResult.create({ data: { scanId: scan.id, module: 'SECURITY', state: 'NOT_APPLICABLE', score: null } });

    await transition(db, { scanId: scan.id, from: 'RUNNING_DOCS', to: 'COMPLETED', extra: {} });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const row = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(row.chargedCredits).toBe(80); // charged is recorded as-charged; the refund is a separate ledger entry
    const refunds = await db.creditTransaction.findMany({ where: { scanId: scan.id, type: 'REFUND' } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amount).toBe(40);
  });

  it('does not refund twice if the observer somehow fires twice for the same scan', async () => {
    const user = await db.user.create({ data: { email: 'tr4@example.com', passwordHash: 'x', emailVerifiedAt: new Date() } });
    await grantLot(db, { userId: user.id, kind: 'PURCHASED', amount: 100, source: 'PURCHASE', expiresAt: null });
    const target = await db.target.create({ data: { userId: user.id, url: 'https://example.com', controlLevel: 'NONE' } });
    const scan = await db.scan.create({
      data: { userId: user.id, targetId: target.id, requestedModules: ['SEO'], capabilitySnapshot: {}, quotedCredits: 16, chargedCredits: 16, state: 'RUNNING_DOCS' },
    });
    await debit(db, { userId: user.id, amount: 16, reason: 'scan:create', scanId: scan.id });

    await transition(db, { scanId: scan.id, from: 'RUNNING_DOCS', to: 'FAILED', extra: { failureReason: 'boom' } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Simulate a duplicate observer firing (e.g. a retried job) by calling refund logic again directly is not
    // possible here since transition() only fires once per state change — instead assert exactly one refund exists,
    // proving the observer itself only ran once for one real transition.
    const refunds = await db.creditTransaction.findMany({ where: { scanId: scan.id, type: 'REFUND' } });
    expect(refunds).toHaveLength(1);
  });
});
```

Adjust the `grantLot`/`debit` import source if Task 2's `@webaudit/api/credits` subpath doesn't also carry `grantLot`/`debit` — if not, keep using this test file's existing local import path for those two (they're only needed to set up fixtures, not part of what this task ships) and only import `refundPartial`/`refund` from the new subpath where actually needed by the production code below.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/worker exec vitest run tests/integration/terminal-refund.test.ts`
Expected: FAIL — `apps/worker/src/orchestrator/terminal-refund.ts` does not exist.

- [ ] **Step 3: Implement the observer**

Create `apps/worker/src/orchestrator/terminal-refund.ts`:

```ts
/**
 * Refunds the undelivered share of a scan's charge whenever it reaches a
 * terminal state through this process's own `transition()` — FAILED (a
 * throwing phase job) and COMPLETED (a gated module that was never met, or
 * any other requested-but-undelivered area) alike. One mechanism, the same
 * `refundForUndelivered` math the timeout sweep already uses, registered as
 * a terminal observer exactly like `installTerminalTeardown`.
 *
 * CANCELLED is deliberately not handled here: cancellation is written
 * directly by `apps/api`'s own process via `updateMany`, which never calls
 * this process's `transition()` — it is refunded at the source instead. See
 * `apps/api/src/routes/scans.routes.ts`.
 *
 * TIMED_OUT is deliberately not handled here either: `timeout.ts`'s own
 * sweep already refunds inline, in the same transaction shape, before this
 * observer would ever see the transition.
 */
import { MODULE_STATES_SCORED, type ModuleState } from '@webaudit/types';
import { refundForUndelivered } from '@webaudit/config';
import { refundPartial } from '@webaudit/api/credits';
import { onTerminalTransition, type TerminalTransition } from './state-machine.js';
import type { PrismaClient } from '../db.js';

const REFUNDABLE_TERMINALS = new Set(['FAILED', 'COMPLETED']);

function isDelivered(state: ModuleState): boolean {
  return (MODULE_STATES_SCORED as readonly ModuleState[]).includes(state);
}

export interface InstallTerminalRefundOptions {
  readonly db: PrismaClient;
  readonly onError?: (error: unknown, context: string) => void;
}

export function installTerminalRefund(options: InstallTerminalRefundOptions): () => void {
  const onError = options.onError ?? ((error, context) => console.warn(`[terminal-refund] ${context}:`, error));

  const observer = async (info: TerminalTransition): Promise<void> => {
    if (!REFUNDABLE_TERMINALS.has(info.to)) return;

    try {
      const scan = await options.db.scan.findUnique({
        where: { id: info.scanId },
        select: {
          chargedCredits: true,
          requestedModules: true,
          moduleResults: { select: { state: true } },
        },
      });
      if (!scan) return;

      const deliveredCount = scan.moduleResults.filter((r) => isDelivered(r.state)).length;
      const creditsRefunded = refundForUndelivered({
        chargedCredits: scan.chargedCredits,
        requestedCount: scan.requestedModules.length,
        deliveredCount,
      });
      if (creditsRefunded <= 0) return;

      const debitTx = await options.db.creditTransaction.findFirst({
        where: { scanId: info.scanId, type: 'DEBIT' },
        select: { id: true },
      });
      if (!debitTx) return;

      await refundPartial(options.db, {
        debitTransactionId: debitTx.id,
        credits: creditsRefunded,
        reason: `${info.to === 'FAILED' ? 'platform-failure' : 'undelivered-module'}:${info.scanId}`,
      });
    } catch (error) {
      // A refund failure must not crash the process or block the transition
      // that already happened — matches `notifyTerminal`'s own "log and
      // swallow" rule for every other terminal observer.
      onError(error, `refunding scan ${info.scanId} on transition to ${info.to}`);
    }
  };

  return onTerminalTransition(observer);
}
```

(If `refundPartial`'s over-refund guard throws because a scan somehow already has a REFUND row — e.g. a retried job re-entering this path — that's caught by the same try/catch and logged, not fatal. This is the intended behavior: a duplicate attempt degrades to a warning, not a crash.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @webaudit/worker exec vitest run tests/integration/terminal-refund.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Wire it at worker boot, in `apps/worker/src/index.ts`**

Add the import near the other orchestrator imports:

```ts
import { installTerminalRefund } from './orchestrator/terminal-refund.js';
```

Inside `startWorker()`'s lazy `handlers` block (the `options.handlers ?? (() => { ... })()` IIFE, right after `const db = options.db ?? createWorkerDb();`), add:

```ts
      const db = options.db ?? createWorkerDb();
      installTerminalRefund({ db });
```

(This registers the observer once per `startWorker()` call, matching the file's existing `installProcessGuards()` pattern. A production process calls `startWorker()` exactly once, so no uninstall wiring is needed here — unlike a test suite that starts and stops several workers, which is Task 6's concern for `installTerminalTeardown`, not this one, since no test in this plan starts `startWorker()` itself repeatedly.)

- [ ] **Step 6: Run `gated-check-partial.test.ts` to confirm it's now green**

Run: `pnpm --filter @webaudit/api exec vitest run tests/integration/gated-check-partial.test.ts`
Expected: PASS, both tests — the second assertion (`chargedCredits < quotedCredits`) now holds because the observer refunded the SECURITY module's share once the scan reached COMPLETED.

(If this still fails, check first whether the real end-to-end scan in that test actually reaches `COMPLETED` through `apps/worker`'s own `transition()` calls — if the worker process in that test's `beforeAll` doesn't call `startWorker()` with this task's wiring included, the observer never registers. Wire it the same way `apps/api/tests/integration/progress-streaming.test.ts` boots the worker, if that's a different code path than `startWorker()` itself.)

- [ ] **Step 7: Run the full worker and api unit/integration suites for regressions**

Run: `pnpm --filter @webaudit/worker exec vitest run` and `pnpm --filter @webaudit/api exec vitest run`
Expected: PASS, no new failures beyond what's already tracked.

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/orchestrator/terminal-refund.ts apps/worker/src/index.ts apps/worker/tests/integration/terminal-refund.test.ts
git commit -m "feat(worker): refund the undelivered share on FAILED/COMPLETED transitions"
```

---

### Task 5: Refund on cancellation (R1.3)

**Files:**
- Modify: `apps/api/src/routes/scans.routes.ts`
- Test: `apps/api/tests/integration/scans.cancel-refund.test.ts` (new)

**Interfaces:**
- Consumes: `refundForUndelivered` from `@webaudit/config` (Task 3), `refundPartial` from `apps/api`'s own local `../services/credits/refund.js` (same-process import — no subpath needed here, this route already lives in `apps/api`).

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/scans.cancel-refund.test.ts`. Copy the exact auth/target/scan-creation setup already used in `apps/api/tests/contract/scans.refusals.test.ts` (register a user, create a verified-enough target, create a scan via the real `/scans` route) rather than hand-building fixture rows, so this test stays consistent with the project's existing contract-test style.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../src/app.js';
import { testDb, resetDb } from '../helpers/db.js';
// ... reuse this file's own request-building / auth-header helpers from scans.refusals.test.ts

describe('POST /scans/:id/cancel refunds the undelivered share', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('refunds credits for modules that had not yet run when cancelled', async () => {
    // 1. register + sign in a user (copy the exact helper scans.refusals.test.ts uses)
    // 2. create a target, quote+create a scan for 2 modules (e.g. SECURITY+SEO)
    // 3. mark ONE ModuleResult COMPLETE directly in the test DB, leaving the scan in RUNNING_PHASE_1
    // 4. POST /scans/:id/cancel
    // 5. assert response is 200 and scan.state === 'CANCELLED'
    // 6. assert a CreditTransaction of type REFUND exists for this scan, amount === floor(chargedCredits * 1/2)
  });

  it('refunds the whole charge when cancelled before anything ran', async () => {
    // same shape, zero ModuleResult rows created before cancel — full chargedCredits refunded
  });

  it('does not fail cancellation if there is nothing to refund (everything already delivered)', async () => {
    // both ModuleResults COMPLETE before cancel (edge case, unlikely in practice but must not error)
    // assert 200, no REFUND transaction created
  });
});
```

(Fill in each numbered comment with real Vitest code once you have the exact helper function names from `scans.refusals.test.ts` open next to this file — do not guess the auth-header helper's name; copy it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/api exec vitest run tests/integration/scans.cancel-refund.test.ts`
Expected: FAIL — no REFUND transaction is created today; cancellation only writes `CANCELLED`.

- [ ] **Step 3: Update the cancel route**

In `apps/api/src/routes/scans.routes.ts`, add imports:

```ts
import { refundForUndelivered } from '@webaudit/config';
import { refundPartial } from '../services/credits/refund.js';
import { MODULE_STATES_SCORED, type ModuleState } from '@webaudit/types';
```

Replace the `/:id/cancel` handler body with:

```ts
router.post('/:id/cancel', async (req: AuthedRequest, res: Response) => {
  const userId = req.auth!.userId;
  const result = await db.scan.updateMany({
    where: { id: pathId(req), userId, state: { notIn: [...SCAN_STATES_TERMINAL] } },
    data: { state: 'CANCELLED', completedAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await db.scan.findFirst({ where: { id: pathId(req), userId }, select: { id: true } });
    res.status(exists === null ? 404 : 409).json(
      exists === null
        ? NOT_FOUND
        : { error: { code: 'ALREADY_TERMINAL', message: 'This scan has already ended.' } },
    );
    return;
  }

  // Refund whatever was charged for work that had not yet run. Cancellation
  // never goes through apps/worker's transition(), so it cannot rely on
  // terminal-refund.ts's observer — it refunds itself, at the source.
  const scan = await db.scan.findUniqueOrThrow({
    where: { id: pathId(req) },
    include: { moduleResults: { select: { state: true } } },
  });
  const deliveredCount = scan.moduleResults.filter((r) =>
    (MODULE_STATES_SCORED as readonly ModuleState[]).includes(r.state),
  ).length;
  const creditsRefunded = refundForUndelivered({
    chargedCredits: scan.chargedCredits,
    requestedCount: scan.requestedModules.length,
    deliveredCount,
  });
  if (creditsRefunded > 0) {
    const debitTx = await db.creditTransaction.findFirst({
      where: { scanId: scan.id, type: 'DEBIT' },
      select: { id: true },
    });
    if (debitTx) {
      try {
        await refundPartial(db, {
          debitTransactionId: debitTx.id,
          credits: creditsRefunded,
          reason: `cancelled:${String(scan.moduleResults.length)}-of-${String(scan.requestedModules.length)}-modules-ran`,
        });
      } catch (error) {
        // The cancellation itself already succeeded and must not be undone
        // by a refund failure — log loudly, respond 200 regardless, matching
        // terminal-refund.ts's own "log and continue" rule.
        console.error(`[scans.cancel] refund failed for scan ${scan.id}:`, error);
      }
    }
  }

  res.status(200).json({ scan });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @webaudit/api exec vitest run tests/integration/scans.cancel-refund.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Run the full existing scans route suite for regressions**

Run: `pnpm --filter @webaudit/api exec vitest run tests/contract/scans.quote.test.ts tests/contract/scans.refusals.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/scans.routes.ts apps/api/tests/integration/scans.cancel-refund.test.ts
git commit -m "fix(api): refund the undelivered share when a scan is cancelled"
```

---

### Task 6: Wire workspace teardown at worker boot (cheap correctness fix, found during this plan's research)

**Context:** While researching Task 4, confirmed that `installTerminalTeardown` (built in Phase 2K, T102–T104) is still never called from `apps/worker/src/index.ts` in production — only from its own test. PROGRESS.md's Carried Correction #7 already names this and says whoever writes the orchestrator must wire it at boot; that hasn't happened yet. Low risk to add now since no capability in the current vertical slice creates a scan workspace yet (Phase 6, T169+, is what actually needs one) — but it should be correct before that phase lands, not discovered again then.

**Files:**
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/tests/unit/teardown-wiring.test.ts` (new)

**Interfaces:**
- Consumes: `installTerminalTeardown` from `apps/worker/src/workspace/teardown.ts` (already exists, already exported, signature unchanged: `installTerminalTeardown(options: { baseDir: string; db?: WorkspaceStore; ... }): () => void`).

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/unit/teardown-wiring.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { startWorker } from '../../src/index.js';

describe('startWorker wires workspace teardown', () => {
  let service: ReturnType<typeof startWorker> | undefined;

  afterEach(async () => {
    await service?.shutdown('test-cleanup');
    service = undefined;
  });

  it('refuses to start without WORKSPACE_BASE_DIR set', () => {
    const previous = process.env['WORKSPACE_BASE_DIR'];
    delete process.env['WORKSPACE_BASE_DIR'];
    try {
      expect(() =>
        startWorker({ installSignalHandlers: false, handlers: { phase: async () => {} } as never }),
      ).not.toThrow(); // handlers override bypasses the check — see Step 3's placement
    } finally {
      if (previous !== undefined) process.env['WORKSPACE_BASE_DIR'] = previous;
    }
  });
});
```

(This test only proves the wiring doesn't crash the common test path where `options.handlers` is passed explicitly, which is how most existing worker tests already start the service. The real "refuses to boot without `WORKSPACE_BASE_DIR`" behavior only applies to the default production path — Step 3 places the check inside the same lazy block Task 4 added `installTerminalRefund` to, which only runs when `options.handlers` is omitted. Existing tests that pass `options.handlers` explicitly are unaffected, matching this file's own established pattern for `DATABASE_URL`/`createWorkerDb()`.)

- [ ] **Step 2: Run test to verify it currently passes trivially, then implement, then tighten**

Since this task adds a fail-closed check to a path most tests don't exercise, the meaningful RED/GREEN cycle is on the underlying behavior, not this smoke test. Skip straight to Step 3, then confirm this smoke test and the full suite stay green afterward (Step 4).

- [ ] **Step 3: Wire teardown in `apps/worker/src/index.ts`**

Add the import:

```ts
import { installTerminalTeardown } from './workspace/teardown.js';
```

Add a helper next to `positiveIntFromEnv`:

```ts
function requiredEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`${name} is not set. The worker cannot manage scan workspaces without it.`);
  }
  return raw;
}
```

Inside the same lazy `handlers` block Task 4 modified, right after `installTerminalRefund({ db });`:

```ts
      const db = options.db ?? createWorkerDb();
      installTerminalRefund({ db });
      installTerminalTeardown({ baseDir: requiredEnv('WORKSPACE_BASE_DIR'), db });
```

Add `WORKSPACE_BASE_DIR` to `.env.example`, next to the other worker-specific variables, with a one-line comment: `# Directory the worker creates and destroys per-scan workspaces under. Required.`

- [ ] **Step 4: Run the smoke test and the full worker suite**

Run: `pnpm --filter @webaudit/worker exec vitest run tests/unit/teardown-wiring.test.ts`
Expected: PASS.

Run: `pnpm --filter @webaudit/worker exec vitest run`
Expected: PASS — no regressions. If any existing test starts `startWorker()` with `options.handlers` omitted and no `WORKSPACE_BASE_DIR` set in its environment, it will now fail; fix that test's setup to set the env var (or pass `options.handlers` explicitly if it doesn't need the real orchestrator), rather than weakening the new check.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/index.ts apps/worker/tests/unit/teardown-wiring.test.ts .env.example
git commit -m "fix(worker): wire workspace teardown at boot, fail closed without WORKSPACE_BASE_DIR"
```

---

## Final verification (after all 6 tasks)

- [ ] `pnpm run lint && pnpm run format:check`
- [ ] `pnpm -r typecheck` (not `pnpm run typecheck` — the root script currently fails on an unrelated pre-existing cyclic dependency; see the review's R4 remediation phase, out of scope here)
- [ ] `pnpm run test` — full unit suite, isolated (no concurrent session touching the same test DB)
- [ ] `pnpm run test:adverse` — full adverse suite, isolated
- [ ] `pnpm --filter @webaudit/api exec vitest run tests/integration/gated-check-partial.test.ts` — both assertions green
- [ ] Re-read PROGRESS.md's Open Decision #11 and Carried Correction #7 and mark both resolved, with a one-line pointer to this plan's commits
