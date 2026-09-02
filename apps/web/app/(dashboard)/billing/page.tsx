'use client';

/**
 * T192 — the billing and plans screen, ported from
 * design-system/ui_kits/app/Account.jsx (`ProfileScreen`'s "Plan" and
 * "Retention" sidebar cards) and its `UsageScreen` refund rows, composed
 * with the plan grid from `Pricing.jsx`.
 *
 * **FR-078, made visible.** The two credit lifetimes are shown as two
 * separate figures that never add into one: plan credits carry an
 * "expire at renewal" line with the date; purchased credits carry
 * "never expire". Every movement row names which balance it moved —
 * and a `DEBIT` shows the per-lot split from `drewFrom` (scenario 6) —
 * so "the account shows which balance was drawn against" is answerable
 * on screen, not just from the API. The refund line
 * ("You are never charged for our failures") is always present.
 *
 * Real payment is external; `POST /billing/subscribe` /
 * `/billing/credits/purchase` apply the effect directly on this
 * dev/test path (see `billing.routes.ts`).
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '../../../components/ui';
import { PageHead } from '../../../components/dashboard';
import {
  ApiError,
  cancelSubscription,
  changePlan,
  getCredits,
  getPlans,
  purchaseCredits,
  subscribe,
  type CreditBalanceView,
  type CreditMovement,
  type Plan,
  type SubscribablePlanId,
} from '../../../lib/api';
import styles from './page.module.css';

const SUBSCRIBABLE = new Set<string>(['starter', 'pro', 'business']);

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function retentionLine(days: number): string {
  if (days >= 365 && days % 365 === 0) return `${String((days / 365) * 12)} months`;
  return `${String(days)} days`;
}

interface DrewFromProps {
  readonly drewFrom: Record<string, number>;
}

function DrewFrom({ drewFrom }: DrewFromProps): React.ReactElement | null {
  const parts = Object.entries(drewFrom);
  if (parts.length === 0) return null;
  return (
    <span className={styles.drewFrom}>
      {parts
        .map(([kind, n]) => `${String(n)} ${kind === 'PLAN' ? 'plan' : 'purchased'}`)
        .join(' · ')}
    </span>
  );
}

export default function BillingPage(): React.ReactElement {
  const [balance, setBalance] = useState<CreditBalanceView | null>(null);
  const [movements, setMovements] = useState<readonly CreditMovement[]>([]);
  const [plans, setPlans] = useState<readonly Plan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string>('free');
  const [renewsAt, setRenewsAt] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [topUp, setTopUp] = useState('100');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [credits, planList] = await Promise.all([getCredits(), getPlans()]);
      setBalance(credits.balance);
      setMovements(credits.movements);
      setPlans(planList.plans);
      if (credits.subscription !== null) {
        setCurrentPlanId(credits.subscription.planId);
        setRenewsAt(credits.subscription.periodEnd);
        setCancelAtPeriodEnd(credits.subscription.cancelAtPeriodEnd);
      } else {
        setCurrentPlanId('free');
        setRenewsAt(null);
        setCancelAtPeriodEnd(false);
      }
    } catch {
      setError('Your billing details could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(true);
      setNotice(null);
      setError(null);
      try {
        await fn();
        setNotice(label);
        await refresh();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PLAN_UPGRADE_REQUIRED') {
          const tier = (err.details as { requiredTier?: string } | undefined)?.requiredTier;
          setError(
            tier === undefined
              ? err.message
              : `${err.message} The ${tier} plan or higher is required.`,
          );
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('That did not go through.');
        }
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const onPickPlan = (planId: string): void => {
    if (!SUBSCRIBABLE.has(planId)) return;
    const id = planId as SubscribablePlanId;
    void run(`You are now on the ${planId} plan.`, async () => {
      if (currentPlanId === 'free') {
        const { subscription } = await subscribe(id);
        setCurrentPlanId(subscription.planId);
        setRenewsAt(subscription.periodEnd);
        setCancelAtPeriodEnd(subscription.cancelAtPeriodEnd);
      } else {
        const { subscription } = await changePlan(id);
        setCurrentPlanId(subscription.planId);
        setRenewsAt(subscription.periodEnd);
        setCancelAtPeriodEnd(subscription.cancelAtPeriodEnd);
      }
    });
  };

  const onCancel = (): void => {
    void run('Your plan will end at the period boundary.', async () => {
      const { subscription, reportsReadableUntil } = await cancelSubscription();
      setCancelAtPeriodEnd(subscription.cancelAtPeriodEnd);
      setRenewsAt(subscription.periodEnd);
      setNotice(`Reports stay readable until ${formatDate(reportsReadableUntil)}.`);
    });
  };

  const onBuy = (): void => {
    const n = Number(topUp);
    if (!Number.isInteger(n) || n <= 0) {
      setError('Enter a whole number of credits.');
      return;
    }
    void run(`${String(n)} purchased credits added.`, async () => {
      await purchaseCredits(n);
    });
  };

  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? null;

  return (
    <div>
      <PageHead
        eyebrow="Billing"
        title="Billing and plans"
        meta={
          renewsAt === null
            ? 'Free plan · credits granted once'
            : `${currentPlanId} plan · ${cancelAtPeriodEnd ? 'ends' : 'renews'} ${formatDate(renewsAt)}`
        }
      />

      {notice !== null && <p className={styles.notice}>{notice}</p>}
      {error !== null && <p className={styles.error}>{error}</p>}

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          <Card padding={22} title="Credit balance">
            <div className={styles.balanceGrid}>
              <div>
                <div className={styles.balanceValue}>{balance?.plan ?? '—'}</div>
                <div className={styles.balanceLabel}>Plan credits</div>
                <div className={styles.balanceNote}>
                  Expire at renewal
                  {balance?.planExpiresAt !== null && balance?.planExpiresAt !== undefined
                    ? ` · ${formatDate(balance.planExpiresAt)}`
                    : ''}
                </div>
              </div>
              <div>
                <div className={styles.balanceValue}>{balance?.purchased ?? '—'}</div>
                <div className={styles.balanceLabel}>Purchased credits</div>
                <div className={styles.balanceNote}>Never expire · spent after plan credits</div>
              </div>
            </div>
          </Card>

          <Card padding={22} title="Movements">
            {movements.length === 0 && <p className={styles.balanceNote}>No movements yet.</p>}
            {movements.map((m) => (
              <div key={m.id} className={styles.moveRow}>
                <span className={styles.moveDate}>{formatDate(m.createdAt)}</span>
                <span className={styles.moveReason}>
                  {m.reason ?? m.type}
                  {m.type === 'DEBIT' && <DrewFrom drewFrom={m.drewFrom} />}
                </span>
                <span
                  className={
                    m.type === 'REFUND' || m.type === 'GRANT'
                      ? `${styles.moveAmount} ${styles.moveAmountUp}`
                      : styles.moveAmount
                  }
                >
                  {m.type === 'REFUND' || m.type === 'GRANT' ? '+' : '−'}
                  {String(Math.abs(m.amount))}
                </span>
              </div>
            ))}
            <p className={styles.balanceNote}>
              You are never charged for our failures. Platform faults, provider outages and
              internal errors refund automatically or never debit.
            </p>
          </Card>

          <Card padding={22} title="Choose a plan">
            <div className={styles.tierGrid}>
              {plans.map((p) => {
                const isNow = p.id === currentPlanId;
                return (
                  <div key={p.id} className={isNow ? `${styles.tier} ${styles.tierNow}` : styles.tier}>
                    <div className={styles.tierHead}>
                      <span className={styles.tierName}>{p.name}</span>
                      {isNow && <Badge tone="accent">Current</Badge>}
                    </div>
                    <div className={styles.tierCredits}>
                      {p.monthlyCredits} credits{p.creditsRecur ? ' / mo' : ', once'}
                    </div>
                    <div className={styles.tierFeat}>
                      <div>{p.concurrentScanLimit} concurrent</div>
                      <div>{retentionLine(p.retentionDays)} retention</div>
                      {p.allowCreditPurchase && <div>Top-ups</div>}
                      {p.allowLoadGeneration && <div>Load generation</div>}
                    </div>
                    <Button
                      variant={isNow ? 'secondary' : 'primary'}
                      size="sm"
                      fullWidth
                      disabled={isNow || busy || !SUBSCRIBABLE.has(p.id)}
                      onClick={() => {
                        onPickPlan(p.id);
                      }}
                    >
                      {isNow ? 'Current plan' : p.id === 'free' ? 'Free' : `Choose ${p.name}`}
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className={styles.sideCol}>
          <Card padding={22} title="Plan">
            <div className={styles.planName}>{currentPlan?.name ?? 'Free'}</div>
            <div className={styles.balanceNote}>
              {currentPlan === null
                ? 'Credits granted once.'
                : `${String(currentPlan.monthlyCredits)} credits a month${
                    renewsAt === null ? '' : ` · ${cancelAtPeriodEnd ? 'ends' : 'renews'} ${formatDate(renewsAt)}`
                  }`}
            </div>
            {renewsAt !== null && !cancelAtPeriodEnd && (
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                disabled={busy}
                onClick={onCancel}
              >
                Cancel plan
              </Button>
            )}
          </Card>

          <Card padding={22} title="Top up">
            <p className={styles.balanceNote}>
              Purchased credits never expire. Paid plans only.
            </p>
            <input
              className={styles.topUpInput}
              inputMode="numeric"
              value={topUp}
              onChange={(e) => {
                setTopUp(e.target.value);
              }}
              aria-label="Credits to purchase"
            />
            <Button variant="primary" size="sm" fullWidth disabled={busy} onClick={onBuy}>
              Buy credits
            </Button>
          </Card>

          <Card padding={22} title="Retention">
            <p className={styles.balanceNote}>
              Reports are kept {currentPlan === null ? '7 days' : retentionLine(currentPlan.retentionDays)}.
              We warn you before anything is removed, and an export is always self-contained.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
