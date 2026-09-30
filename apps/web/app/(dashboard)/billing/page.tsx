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
 * `/billing/credits/purchase` now return a checkout URL when a payment
 * provider is configured, so this page leaves the current balance unchanged
 * until the provider webhook confirms the payment.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge, Button, Card } from '../../../components/ui';
import { PageHead } from '../../../components/dashboard';
import {
  ApiError,
  cancelSubscription,
  changePlan,
  getCredits,
  getPlans,
  getReceipts,
  purchaseCredits,
  subscribe,
  type BillingReceiptSummary,
  type CreditBalanceView,
  type CreditMovement,
  type Plan,
  type SubscribablePlanId,
} from '../../../lib/api';
import styles from './page.module.css';

const SUBSCRIBABLE = new Set<string>(['starter', 'pro', 'business']);

function goToCheckout(url: string): void {
  window.location.assign(url);
}

interface DrewFromProps {
  readonly drewFrom: Record<string, number>;
}

function DrewFrom({ drewFrom }: DrewFromProps): React.ReactElement | null {
  const t = useTranslations('billing');
  const parts = Object.entries(drewFrom);
  if (parts.length === 0) return null;
  return (
    <span className={styles.drewFrom}>
      {parts
        .map(([kind, count]) =>
          kind === 'PLAN'
            ? t('billing_drew_from_plan', { count })
            : t('billing_drew_from_purchased', { count }),
        )
        .join(' · ')}
    </span>
  );
}

export default function BillingPage(): React.ReactElement {
  const t = useTranslations('billing');
  const format = useFormatter();
  const [balance, setBalance] = useState<CreditBalanceView | null>(null);
  const [movements, setMovements] = useState<readonly CreditMovement[]>([]);
  const [receipts, setReceipts] = useState<readonly BillingReceiptSummary[]>([]);
  const [plans, setPlans] = useState<readonly Plan[]>([]);
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  const [currentPlanId, setCurrentPlanId] = useState<string>('free');
  const [renewsAt, setRenewsAt] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [topUp, setTopUp] = useState('100');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const formatDate = (iso: string | null): string =>
    iso === null
      ? t('billing_value_unavailable')
      : format.dateTime(new Date(iso), {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
  const retentionLine = (days: number): string =>
    days >= 365 && days % 365 === 0
      ? t('billing_retention_months', { count: (days / 365) * 12 })
      : t('billing_retention_days', { count: days });
  const formatCount = (count: number): string => t('billing_number', { value: count });

  const refresh = useCallback(async () => {
    try {
      const [credits, planList, receiptList] = await Promise.all([
        getCredits(),
        getPlans(),
        getReceipts(),
      ]);
      setBalance(credits.balance);
      setMovements(credits.movements);
      setReceipts(receiptList.receipts);
      setPlans(planList.plans);
      setPaymentsEnabled(planList.paymentsEnabled);
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
      setError(t('billing_load_error'));
    }
  }, [t]);

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
            : t('billing_plan_upgrade_error', { message: err.message, tier }),
          );
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError(t('billing_action_error'));
        }
      } finally {
        setBusy(false);
      }
    },
    [refresh, t],
  );

  const onPickPlan = (planId: string): void => {
    if (!SUBSCRIBABLE.has(planId)) return;
    const id = planId as SubscribablePlanId;
    void run(t('billing_plan_changed', { plan: planId }), async () => {
      if (currentPlanId === 'free') {
        const result = await subscribe(id);
        if ('checkout' in result) {
          goToCheckout(result.checkout.checkoutUrl);
          return;
        }
        setCurrentPlanId(result.subscription.planId);
        setRenewsAt(result.subscription.periodEnd);
        setCancelAtPeriodEnd(result.subscription.cancelAtPeriodEnd);
      } else {
        const { subscription } = await changePlan(id);
        setCurrentPlanId(subscription.planId);
        setRenewsAt(subscription.periodEnd);
        setCancelAtPeriodEnd(subscription.cancelAtPeriodEnd);
      }
    });
  };

  const onCancel = (): void => {
    void run(t('billing_plan_cancelled'), async () => {
      const { subscription, reportsReadableUntil } = await cancelSubscription();
      setCancelAtPeriodEnd(subscription.cancelAtPeriodEnd);
      setRenewsAt(subscription.periodEnd);
      setNotice(t('billing_reports_readable_until', { date: formatDate(reportsReadableUntil) }));
    });
  };

  const onBuy = (): void => {
    const n = Number(topUp);
    if (!Number.isInteger(n) || n <= 0) {
      setError(t('billing_credit_amount_invalid'));
      return;
    }
    void run(t('billing_continue_to_checkout'), async () => {
      const result = await purchaseCredits(n);
      if ('checkout' in result) {
        goToCheckout(result.checkout.checkoutUrl);
      }
    });
  };

  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? null;

  return (
    <div>
      <PageHead
        eyebrow={t('billing_page_eyebrow')}
        title={t('billing_page_title')}
        meta={
          renewsAt === null
            ? t('billing_meta_free')
            : t('billing_meta_active', {
                plan: currentPlanId,
                status: t(cancelAtPeriodEnd ? 'billing_status_ends' : 'billing_status_renews'),
                date: formatDate(renewsAt),
              })
        }
      />

      {notice !== null && <p className={styles.notice}>{notice}</p>}
      {error !== null && <p className={styles.error}>{error}</p>}

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          <Card padding={22} title={t('billing_credit_balance')}>
            <div className={styles.balanceGrid}>
              <div>
                <div className={styles.balanceValue}>
                  {balance === null ? t('billing_value_unavailable') : formatCount(balance.plan)}
                </div>
                <div className={styles.balanceLabel}>{t('billing_plan_credits')}</div>
                <div className={styles.balanceNote}>
                  {balance?.planExpiresAt !== null && balance?.planExpiresAt !== undefined
                    ? t('billing_plan_credit_expiration_date', {
                        date: formatDate(balance.planExpiresAt),
                      })
                    : t('billing_plan_credit_expiration')}
                </div>
              </div>
              <div>
                <div className={styles.balanceValue}>
                  {balance === null ? t('billing_value_unavailable') : formatCount(balance.purchased)}
                </div>
                <div className={styles.balanceLabel}>{t('billing_purchased_credits')}</div>
                <div className={styles.balanceNote}>{t('billing_purchased_credit_note')}</div>
              </div>
            </div>
          </Card>

          <Card padding={22} title={t('billing_movements')}>
            {movements.length === 0 && (
              <p className={styles.balanceNote}>{t('billing_no_movements')}</p>
            )}
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
                  {formatCount(Math.abs(m.amount))}
                </span>
              </div>
            ))}
            <p className={styles.balanceNote}>
              {t('billing_failure_refund_note')}
            </p>
          </Card>

          <Card padding={22} title={t('billing_receipts')}>
            {receipts.length === 0 && (
              <p className={styles.balanceNote}>{t('billing_no_receipts')}</p>
            )}
            {receipts.map((receipt) => (
              <a
                key={receipt.id}
                className={styles.receiptRow}
                href={`/billing/receipts/${encodeURIComponent(receipt.id)}`}
              >
                <span>
                  <span className={styles.receiptKind}>{receipt.kind}</span>
                  <span className={styles.receiptMeta}>{formatDate(receipt.createdAt)}</span>
                </span>
                <span className={styles.receiptAmount}>
                  {format.number(receipt.amountMicros / 1_000_000, {
                    style: 'currency',
                    currency: 'USD',
                  })}
                </span>
              </a>
            ))}
          </Card>

          <Card padding={22} title={t('billing_choose_plan')}>
            {!paymentsEnabled && (
              <p className={styles.balanceNote}>
                {t('billing_plan_changes_administered')}
              </p>
            )}
            <div className={styles.tierGrid}>
              {plans.map((p) => {
                const isNow = p.id === currentPlanId;
                return (
                  <div
                    key={p.id}
                    className={isNow ? `${styles.tier} ${styles.tierNow}` : styles.tier}
                  >
                    <div className={styles.tierHead}>
                      <span className={styles.tierName}>{p.name}</span>
                      {isNow && <Badge tone="accent">Current</Badge>}
                    </div>
                    <div className={styles.tierCredits}>
                      {p.creditsRecur
                        ? t('billing_tier_credits_monthly', { count: p.monthlyCredits })
                        : t('billing_tier_credits_once', { count: p.monthlyCredits })}
                    </div>
                    <div className={styles.tierFeat}>
                      <div>{t('billing_feature_concurrency', { count: p.concurrentScanLimit })}</div>
                      <div>
                        {t('billing_feature_retention', {
                          retention: retentionLine(p.retentionDays),
                        })}
                      </div>
                      {p.allowCreditPurchase && <div>{t('billing_feature_topups')}</div>}
                      {p.allowLoadGeneration && <div>{t('billing_feature_load_generation')}</div>}
                    </div>
                    {paymentsEnabled ? (
                      <Button
                        variant={isNow ? 'secondary' : 'primary'}
                        size="sm"
                        fullWidth
                        disabled={isNow || busy || !SUBSCRIBABLE.has(p.id)}
                        onClick={() => {
                          onPickPlan(p.id);
                        }}
                      >
                      {isNow
                        ? t('billing_current_plan')
                        : p.id === 'free'
                          ? t('billing_plan_free')
                          : t('billing_choose_named_plan', { plan: p.name })}
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" fullWidth disabled>
                        {isNow
                          ? t('billing_current_plan')
                          : t('billing_contact_administrator')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className={styles.sideCol}>
          <Card padding={22} title={t('billing_plan')}>
            <div className={styles.planName}>{currentPlan?.name ?? t('billing_plan_free')}</div>
            <div className={styles.balanceNote}>
              {currentPlan === null
                ? t('billing_plan_credits_granted_once')
                : renewsAt === null
                  ? t('billing_plan_monthly_credits', { count: currentPlan.monthlyCredits })
                  : t('billing_plan_monthly_credits_status', {
                      count: currentPlan.monthlyCredits,
                      status: t(cancelAtPeriodEnd ? 'billing_status_ends' : 'billing_status_renews'),
                      date: formatDate(renewsAt),
                    })}
            </div>
            {renewsAt !== null && !cancelAtPeriodEnd && (
              <Button variant="secondary" size="sm" fullWidth disabled={busy} onClick={onCancel}>
                {t('billing_cancel_plan')}
              </Button>
            )}
          </Card>

          <Card padding={22} title={t('billing_topup')}>
            {paymentsEnabled ? (
              <>
                <p className={styles.balanceNote}>
                  {t('billing_topup_note')}
                </p>
                <input
                  className={styles.topUpInput}
                  inputMode="numeric"
                  value={topUp}
                  onChange={(e) => {
                    setTopUp(e.target.value);
                  }}
                  aria-label={t('billing_credits_to_purchase')}
                />
                <Button variant="primary" size="sm" fullWidth disabled={busy} onClick={onBuy}>
                  {t('billing_buy_credits')}
                </Button>
              </>
            ) : (
              <p className={styles.balanceNote}>
                {t('billing_credit_purchases_administered')}
              </p>
            )}
          </Card>

          <Card padding={22} title={t('billing_retention')}>
            <p className={styles.balanceNote}>
              {t('billing_retention_note', {
                retention:
                  currentPlan === null
                    ? t('billing_retention_days', { count: 7 })
                    : retentionLine(currentPlan.retentionDays),
              })}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
