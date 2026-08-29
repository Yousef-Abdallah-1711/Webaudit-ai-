/**
 * T035 — SC-022. THE FIRST ADVERSARIAL GATE.
 *
 * "Zero purchased credits are lost at a billing renewal, and zero operations
 * draw purchased credits while plan credits remain."
 *
 * A property test over random grant / debit / refund / renewal sequences, not a
 * handful of hand-picked cases. The bug this class of test catches is the one
 * that only appears after operations interleave in an order nobody thought to
 * write down — and a user quietly losing credits they paid cash for is the
 * worst failure this product can have, because it is invisible until they add
 * it up themselves.
 *
 * Two invariants, checked after every single step:
 *
 *   I1  purchased credits are never destroyed except by being spent
 *   I2  a debit never touches a purchased lot while any unexpired plan credit
 *       remains — asserted against the allocations of every debit the loop
 *       makes, on the step that makes it
 *   I3  a refund lot's lifetime matches its kind: PLAN expires, PURCHASED does
 *       not. I2 cannot see this defect once the debit's `kind` tiebreak is in
 *       place — the mis-lifetimed lot still sorts correctly — but a plan credit
 *       that never expires is a permanent credit handed out in place of an
 *       expiring one, and it survives every renewal it should have died at.
 *   I4  a lot the expiry sweep destroyed credits in never holds credits again.
 *       An EXPIRE is final; a refund that walks credits back into a swept lot
 *       resurrects credits the ledger has already told the user are gone.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { grantLot } from '../../src/services/credits/grant.js';
import { debit, InsufficientCreditsError } from '../../src/services/credits/debit.js';
import { refund } from '../../src/services/credits/refund.js';
import { balanceOf } from '../../src/services/credits/balance.js';
import { expireRenewedLots } from '../../src/services/credits/expiry.js';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

/** Deterministic PRNG so a failure is reproducible from its seed. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

async function makeUser(email: string): Promise<string> {
  const u = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return u.id;
}

/** Total purchased credits ever granted, minus what was legitimately spent. */
async function purchasedAccounting(userId: string): Promise<{
  granted: number;
  remaining: number;
  spent: number;
}> {
  const lots = await testDb.creditLot.findMany({ where: { userId, kind: 'PURCHASED' } });
  const granted = lots.reduce((n, l) => n + l.amountGranted, 0);
  const remaining = lots.reduce((n, l) => n + l.amountRemaining, 0);

  const allocations = await testDb.creditAllocation.findMany({
    where: { lot: { userId, kind: 'PURCHASED' } },
    include: { transaction: true },
  });
  const spent = allocations.reduce(
    (n, a) => n + (a.transaction.type === 'DEBIT' ? a.amount : -a.amount),
    0,
  );
  return { granted, remaining, spent };
}

/**
 * I2, as a query rather than a hope: did this debit draw a purchased credit
 * while an unexpired plan credit was still spendable?
 *
 * Evaluated against the state immediately after the debit, which is the only
 * honest moment — a later grant or refund cannot retroactively make an earlier
 * draw wrong, and the check must not be fooled by one.
 *
 * Returns null when the invariant holds, or a printable explanation when it does
 * not. C1 shipped because this function did not exist.
 */
async function purchasedDrawnWhilePlanRemained(
  userId: string,
  transactionId: string,
): Promise<string | null> {
  const drawn = await testDb.creditAllocation.findMany({
    where: { transactionId },
    include: { lot: true },
  });
  const fromPurchased = drawn
    .filter((a) => a.lot.kind === 'PURCHASED')
    .reduce((n, a) => n + a.amount, 0);
  if (fromPurchased === 0) return null;

  const now = new Date();
  const planLeft = await testDb.creditLot.findMany({
    where: {
      userId,
      kind: 'PLAN',
      amountRemaining: { gt: 0 },
      // "Unexpired" is the same predicate the debit itself selects on: an
      // expired lot's row still exists, it just cannot be spent.
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, amountRemaining: true, expiresAt: true, source: true },
  });
  if (planLeft.length === 0) return null;

  const stranded = planLeft.reduce((n, l) => n + l.amountRemaining, 0);
  const detail = planLeft
    .map((l) => `${l.source} ${l.amountRemaining} exp=${l.expiresAt?.toISOString() ?? 'never'}`)
    .join('; ');
  return (
    `drew ${fromPurchased} purchased while ${stranded} plan credits remained spendable ` +
    `[${detail}]`
  );
}

/**
 * I3: every lot the refund path minted still says what kind of credit it holds.
 *
 * `kind` alone does not say it — the lifetime does. A PLAN lot with a null
 * `expiresAt` is not an expiring credit however its column reads, and a
 * PURCHASED lot with a deadline is not a permanent one.
 */
async function refundLotWithWrongLifetime(userId: string): Promise<string | null> {
  const lots = await testDb.creditLot.findMany({
    where: { userId, source: 'REFUND' },
    select: { id: true, kind: true, expiresAt: true, amountGranted: true },
  });
  for (const lot of lots) {
    if (lot.kind === 'PLAN' && lot.expiresAt === null) {
      return `PLAN refund lot ${lot.id} (${lot.amountGranted} credits) never expires`;
    }
    if (lot.kind === 'PURCHASED' && lot.expiresAt !== null) {
      return `PURCHASED refund lot ${lot.id} expires at ${lot.expiresAt.toISOString()}`;
    }
  }
  return null;
}

describe('SC-022 — credit integrity under random operation sequences', () => {
  it('never loses a purchased credit and never draws one out of order (200 steps x 8 seeds)', async () => {
    for (const seed of [1, 7, 42, 99, 1234, 31337, 65535, 987654]) {
      await resetDb();
      await seedPlans();
      const rand = rng(seed);
      const userId = await makeUser(`prop-${seed}@example.com`);
      const debits: string[] = [];
      // Lots the sweep has destroyed credits in. Nothing may ever put credits
      // back into one of these (I4).
      const swept = new Set<string>();
      let renewalBoundary = new Date(Date.now() + 30 * 86_400_000);

      for (let step = 0; step < 200; step++) {
        const roll = rand();
        // The debit this step performed, if any — I2 is a statement about a
        // single debit's allocations, so it is checked against that debit.
        let debitedThisStep: string | null = null;

        if (roll < 0.3) {
          const amount = 1 + Math.floor(rand() * 100);
          if (rand() < 0.2) {
            // A non-renewing plan grant: the free tier's one-time allocation has
            // no renewal boundary, so `expiresAt` is null. That is a PLAN credit
            // that never expires, which ties with every PURCHASED lot in the
            // debit order — the exact collision the `kind` tiebreak resolves, and
            // a live state on every registered account.
            await grantLot(testDb, {
              userId,
              amount,
              kind: 'PLAN',
              source: 'FREE_GRANT',
              expiresAt: null,
            });
          } else {
            // grant plan credits, expiring at the current renewal boundary
            await grantLot(testDb, {
              userId,
              amount,
              kind: 'PLAN',
              source: 'PLAN_RENEWAL',
              expiresAt: renewalBoundary,
            });
          }
        } else if (roll < 0.5) {
          // grant purchased credits — these must never expire
          await grantLot(testDb, {
            userId,
            amount: 1 + Math.floor(rand() * 100),
            kind: 'PURCHASED',
            source: 'PURCHASE',
            expiresAt: null,
          });
        } else if (roll < 0.8) {
          const amount = 1 + Math.floor(rand() * 60);
          try {
            const tx = await debit(testDb, { userId, amount, reason: `prop:step-${step}` });
            debits.push(tx.id);
            debitedThisStep = tx.id;
          } catch (e) {
            // A shortfall is a legitimate outcome; anything else is a defect.
            if (!(e instanceof InsufficientCreditsError)) throw e;
          }
        } else if (roll < 0.9 && debits.length > 0) {
          const idx = Math.floor(rand() * debits.length);
          const [txId] = debits.splice(idx, 1);
          if (txId) await refund(testDb, txId, 'prop:refund');
        } else {
          // renewal: expire plan lots at the boundary, then move the boundary
          //
          // The sweep leaves those lots observably expired, not merely emptied,
          // which is what carries this loop into the refund's dead-lot path. It
          // did not always: while the sweep zeroed `amountRemaining` and left a
          // future `expiresAt` behind, every reader still called the lot alive,
          // the dead-lot path was never once reached in 1,600 steps, and that is
          // how C1 shipped past this very test.
          //
          // Recorded before the sweep, mirroring its own predicate: these are the
          // lots about to have an EXPIRE written against their credits.
          const doomed = await testDb.creditLot.findMany({
            where: {
              userId,
              amountRemaining: { gt: 0 },
              expiresAt: { not: null, lte: renewalBoundary },
            },
            select: { id: true },
          });
          for (const l of doomed) swept.add(l.id);

          await expireRenewedLots(testDb, userId, renewalBoundary);
          renewalBoundary = new Date(renewalBoundary.getTime() + 30 * 86_400_000);
        }

        // ── I1: purchased credits are only ever reduced by being spent ──────
        const acct = await purchasedAccounting(userId);
        expect(
          acct.remaining,
          `seed ${seed} step ${step}: purchased granted=${acct.granted} spent=${acct.spent} remaining=${acct.remaining}`,
        ).toBe(acct.granted - acct.spent);
        expect(
          acct.remaining,
          `seed ${seed} step ${step}: negative purchased balance`,
        ).toBeGreaterThanOrEqual(0);

        // ── I2: no purchased credit moves while a plan credit is spendable ──
        // This is SC-022's second half, and until now it had no assertion here
        // at all — which is how a refund that dropped its lot's expiry shipped.
        if (debitedThisStep) {
          const violation = await purchasedDrawnWhilePlanRemained(userId, debitedThisStep);
          expect(
            violation,
            `seed ${seed} step ${step}: I2 violated by debit ${debitedThisStep} — ${violation ?? ''}`,
          ).toBeNull();
        }

        // ── I3: a refund lot's lifetime matches its kind ────────────────────
        const lifetime = await refundLotWithWrongLifetime(userId);
        expect(lifetime, `seed ${seed} step ${step}: I3 violated — ${lifetime ?? ''}`).toBeNull();

        // ── I4: an expired lot never holds credits again ────────────────────
        if (swept.size > 0) {
          const risen = await testDb.creditLot.findMany({
            where: { id: { in: [...swept] }, amountRemaining: { gt: 0 } },
            select: { id: true, amountRemaining: true, expiresAt: true },
          });
          expect(
            risen,
            `seed ${seed} step ${step}: I4 violated — swept lots holding credits again: ` +
              risen
                .map(
                  (l) =>
                    `${l.id}=${l.amountRemaining} exp=${l.expiresAt?.toISOString() ?? 'never'}`,
                )
                .join(', '),
          ).toEqual([]);
        }
      }
    }
  }, 300_000);

  it('never draws a purchased credit while an unexpired plan credit remains', async () => {
    const userId = await makeUser('order@example.com');
    const soon = new Date(Date.now() + 86_400_000);

    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: soon,
    });
    await grantLot(testDb, {
      userId,
      amount: 500,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });

    // 60 is well within the plan allocation, so nothing purchased may move.
    const tx = await debit(testDb, { userId, amount: 60, reason: 'order:test' });

    const touched = await testDb.creditAllocation.findMany({
      where: { transactionId: tx.id },
      include: { lot: true },
    });
    expect(touched).toHaveLength(1);
    expect(touched[0]?.lot.kind).toBe('PLAN');

    const bal = await balanceOf(testDb, userId);
    expect(bal.plan).toBe(40);
    expect(bal.purchased).toBe(500);
  });

  /**
   * The free tier's one-time grant is a PLAN lot with `expiresAt: null` —
   * "no deadline", the same thing every PURCHASED lot says. They tie on the
   * leading sort key, so `createdAt` used to decide, and an older purchase won.
   * Every registered account carries such a lot, so this needed no refund and no
   * unusual sequence to reach: buy credits, then spend.
   */
  it('draws a null-expiry plan grant before an older purchase', async () => {
    const userId = await makeUser('freegrant-order@example.com');

    // The purchase is FIRST — `createdAt` cannot rescue the plan lot here.
    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });
    await grantLot(testDb, {
      userId,
      amount: 50,
      kind: 'PLAN',
      source: 'FREE_GRANT',
      expiresAt: null,
    });

    const tx = await debit(testDb, { userId, amount: 30, reason: 'freegrant:test' });

    const touched = await testDb.creditAllocation.findMany({
      where: { transactionId: tx.id },
      include: { lot: true },
    });
    expect(touched.map((a) => a.lot.kind)).toEqual(['PLAN']);
    expect(touched[0]?.lot.source).toBe('FREE_GRANT');

    const bal = await balanceOf(testDb, userId);
    expect(bal.plan).toBe(20);
    expect(bal.purchased).toBe(100);
  });

  it('still spills to an older purchase once a null-expiry plan grant is drained', async () => {
    const userId = await makeUser('freegrant-spill@example.com');
    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });
    await grantLot(testDb, {
      userId,
      amount: 50,
      kind: 'PLAN',
      source: 'FREE_GRANT',
      expiresAt: null,
    });

    const tx = await debit(testDb, { userId, amount: 70, reason: 'freegrant:spill' });

    const alloc = await testDb.creditAllocation.findMany({
      where: { transactionId: tx.id },
      include: { lot: true },
    });
    const byKind = new Map(alloc.map((a) => [a.lot.kind, a.amount]));
    expect(byKind.get('PLAN')).toBe(50);
    expect(byKind.get('PURCHASED')).toBe(20);
  });

  it('keeps expiry the leading sort key, ahead of the kind tiebreak', async () => {
    const userId = await makeUser('leading-key@example.com');
    // A dated plan lot and an undated one. The tiebreak must not reorder these:
    // they are the same kind, and the deadline is what decides.
    await grantLot(testDb, {
      userId,
      amount: 40,
      kind: 'PLAN',
      source: 'FREE_GRANT',
      expiresAt: null,
    });
    await grantLot(testDb, {
      userId,
      amount: 40,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const tx = await debit(testDb, { userId, amount: 40, reason: 'leading:test' });

    const alloc = await testDb.creditAllocation.findMany({
      where: { transactionId: tx.id },
      include: { lot: true },
    });
    expect(alloc).toHaveLength(1);
    // The lot with a deadline goes first; the undated one is not touched.
    expect(alloc[0]?.lot.source).toBe('PLAN_RENEWAL');
    expect(alloc[0]?.lot.expiresAt).not.toBeNull();
  });

  it('spills into purchased credits only after plan credits are exhausted', async () => {
    const userId = await makeUser('spill@example.com');
    const soon = new Date(Date.now() + 86_400_000);

    await grantLot(testDb, {
      userId,
      amount: 30,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: soon,
    });
    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });

    const tx = await debit(testDb, { userId, amount: 50, reason: 'spill:test' });

    const alloc = await testDb.creditAllocation.findMany({
      where: { transactionId: tx.id },
      include: { lot: true },
    });
    const byKind = new Map(alloc.map((a) => [a.lot.kind, a.amount]));
    // Plan drained first, purchased covers only the remainder.
    expect(byKind.get('PLAN')).toBe(30);
    expect(byKind.get('PURCHASED')).toBe(20);

    const bal = await balanceOf(testDb, userId);
    expect(bal.plan).toBe(0);
    expect(bal.purchased).toBe(80);
  });

  it('drains the soonest-expiring plan lot first', async () => {
    const userId = await makeUser('fifo@example.com');
    const day = 86_400_000;

    await grantLot(testDb, {
      userId,
      amount: 50,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: new Date(Date.now() + 30 * day),
    });
    await grantLot(testDb, {
      userId,
      amount: 50,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: new Date(Date.now() + 2 * day),
    });

    const tx = await debit(testDb, { userId, amount: 40, reason: 'fifo:test' });

    const alloc = await testDb.creditAllocation.findMany({
      where: { transactionId: tx.id },
      include: { lot: true },
    });
    expect(alloc).toHaveLength(1);
    // Credits about to die are always spent first.
    const remainingDays = (alloc[0]!.lot.expiresAt!.getTime() - Date.now()) / day;
    expect(remainingDays).toBeLessThan(3);
  });

  it('renewal destroys expired plan credits and leaves purchased untouched', async () => {
    const userId = await makeUser('renew@example.com');
    const boundary = new Date(Date.now() + 1000);

    await grantLot(testDb, {
      userId,
      amount: 240,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: boundary,
    });
    await grantLot(testDb, {
      userId,
      amount: 500,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });

    await expireRenewedLots(testDb, userId, new Date(boundary.getTime() + 1));

    const bal = await balanceOf(testDb, userId);
    expect(bal.plan).toBe(0);
    // The half of SC-022 that a two-column balance gets wrong.
    expect(bal.purchased).toBe(500);

    const expiry = await testDb.creditTransaction.findFirst({ where: { userId, type: 'EXPIRE' } });
    expect(expiry?.amount).toBe(240);
  });

  it('refuses a debit larger than the balance and writes nothing', async () => {
    const userId = await makeUser('short@example.com');
    await grantLot(testDb, {
      userId,
      amount: 10,
      kind: 'PLAN',
      source: 'FREE_GRANT',
      expiresAt: null,
    });

    await expect(debit(testDb, { userId, amount: 80, reason: 'short:test' })).rejects.toThrow(
      InsufficientCreditsError,
    );

    // FR-074: report the shortfall, do not start and fail.
    expect(await testDb.creditTransaction.count({ where: { userId, type: 'DEBIT' } })).toBe(0);
    expect(await testDb.creditAllocation.count()).toBe(0);
    const bal = await balanceOf(testDb, userId);
    expect(bal.plan).toBe(10);
  });

  it('ignores expired lots when computing a balance', async () => {
    const userId = await makeUser('expired@example.com');
    await grantLot(testDb, {
      userId,
      amount: 90,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: new Date(Date.now() - 1000),
    });
    await grantLot(testDb, {
      userId,
      amount: 10,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });

    const bal = await balanceOf(testDb, userId);
    expect(bal.plan).toBe(0);
    expect(bal.purchased).toBe(10);

    // And an expired lot cannot be spent, even though its row still exists.
    await expect(debit(testDb, { userId, amount: 50, reason: 'expired:test' })).rejects.toThrow(
      InsufficientCreditsError,
    );
  });
});
