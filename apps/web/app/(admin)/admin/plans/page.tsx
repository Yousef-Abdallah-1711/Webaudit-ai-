'use client';

/**
 * T215 — the Plans admin screen, ported from
 * design-system/ui_kits/admin/AdminScreens.jsx's `Plans`. Route is
 * `/admin/plans` per design/screen-map.md's routing table.
 *
 * The mock's columns are Plan / Credits / Entitlements / Concurrent /
 * Retention / Price / actions ("Edit"). "Price" is dropped entirely — there
 * is no credit-to-dollar conversion rate anywhere in this codebase
 * (PROGRESS.md's Open Decision #3), the same reason `AdminBillingPage`
 * (T212) refuses to show a fabricated margin percentage. A State badge
 * takes its place: this page fetches with `includeInactive=true` so an
 * operator can toggle a plan back on, and needs a way to tell active and
 * inactive plans apart. The mock's generic "Edit" action is replaced with
 * the one real mutation, `PATCH /admin/plans/:id` toggling `isActive`.
 * "New plan" stays present but inert — no create-plan form exists, the same
 * "designed but not yet wired" precedent as `AdminProvidersPage`'s
 * "Add provider".
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '../../../../components/ui';
import { AHead, mono, num, Table } from '../../../../components/admin';
import {
  ApiError,
  getAdminPlans,
  setPlanActive,
  type AdminPlanRecord,
} from '../../../../lib/api';
import styles from './page.module.css';

/**
 * Copied locally from `apps/web/app/(dashboard)/billing/page.tsx`'s
 * `retentionLine` — `lib/api.ts` doesn't export it, and this codebase's
 * existing convention doesn't share helpers across route folders.
 */
function retentionLine(days: number): string {
  if (days >= 365 && days % 365 === 0) return `${String((days / 365) * 12)} months`;
  return `${String(days)} days`;
}

function entitlementsLine(plan: AdminPlanRecord): string {
  const labels: string[] = [];
  if (plan.allowReadinessPass) labels.push('Readiness pass');
  if (plan.allowLoadGeneration) labels.push('Load generation');
  if (plan.allowCustomCapability) labels.push('Custom capability');
  if (plan.allowCreditPurchase) labels.push('Top-ups');
  return labels.length === 0 ? '—' : labels.join(', ');
}

export default function AdminPlansPage(): React.ReactElement {
  const [plans, setPlans] = useState<readonly AdminPlanRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { plans: list } = await getAdminPlans(true);
      setPlans(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Plans could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggleActive = (plan: AdminPlanRecord): void => {
    setBusy(true);
    setError(null);
    setPlanActive(plan.id, !plan.isActive)
      .then(() => load())
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'That did not go through.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div>
      <AHead
        eyebrow="Commerce"
        title="Plans"
        meta="entitlements are enforced server-side before any charge"
        actions={<Button size="sm">New plan</Button>}
      />

      {error !== null && <p className={styles.error}>{error}</p>}

      <Table
        cols={[
          { label: 'Plan', width: 130 },
          { label: 'Credits', width: 130 },
          { label: 'Entitlements', width: '1fr' },
          { label: 'Concurrent', width: 110 },
          { label: 'Retention', width: 100 },
          { label: 'State', width: 100 },
          { label: '', width: 120 },
        ]}
        rows={plans.map((plan) => [
          <strong key="name">{plan.name}</strong>,
          mono(`${String(plan.monthlyCredits)}${plan.creditsRecur ? ' / mo' : ', once'}`),
          entitlementsLine(plan),
          num(String(plan.concurrentScanLimit)),
          num(retentionLine(plan.retentionDays)),
          <Badge key="state" tone={plan.isActive ? 'success' : 'neutral'}>
            {plan.isActive ? 'active' : 'inactive'}
          </Badge>,
          <Button
            key="toggle"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              onToggleActive(plan);
            }}
          >
            {plan.isActive ? 'Deactivate' : 'Activate'}
          </Button>,
        ])}
      />

      <div className={styles.grid}>
        <Card padding={20} title="Credit schedule">
          {[
            ['One area', '10–25'],
            ['Full audit bundled', '80'],
            ['Re-check', '3'],
            ['Readiness pass', '60'],
          ].map(([a, b]) => (
            <div key={a} className={styles.scheduleRow}>
              <span>{a}</span>
              <span className={styles.scheduleValue}>{b}</span>
            </div>
          ))}
        </Card>
        <Card padding={20} title="Two credit lifetimes">
          <p className={styles.cardText}>
            Plan credits expire at renewal. Purchased top-ups never expire. Expiring lots are
            always drawn first, so nothing paid for is quietly destroyed.
          </p>
        </Card>
        <Card padding={20} title="Top-ups">
          <p className={styles.cardText}>
            Refused on the free tier, so it stays an evaluation rather than a route around
            subscribing.
          </p>
        </Card>
      </div>
    </div>
  );
}
