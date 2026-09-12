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
 * "New plan" opens a real create-plan form backed by `POST /admin/plans`
 * (`createAdminPlan`); the same form is reused to edit an existing plan's
 * fields via the same `PATCH /admin/plans/:id` used for the active toggle.
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '../../../../components/ui';
import { AHead, mono, num, Table } from '../../../../components/admin';
import {
  ApiError,
  createAdminPlan,
  getAdminPlans,
  setPlanActive,
  type AdminPlanInput,
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
  const [form, setForm] = useState<AdminPlanInput | null>({
    id: '',
    name: '',
    monthlyCredits: 300,
    creditsRecur: true,
    allowedInputTypes: ['URL', 'REPOSITORY', 'ARCHIVE'],
    allowLoadGeneration: false,
    allowReadinessPass: false,
    allowCreditPurchase: false,
    allowCustomCapability: false,
    concurrentScanLimit: 1,
    queuePriority: 10,
    retentionDays: 30,
  });
  const [saving, setSaving] = useState(false);

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

  const beginCreate = (): void =>
    setForm({
      id: '',
      name: '',
      monthlyCredits: 300,
      creditsRecur: true,
      allowedInputTypes: ['URL', 'REPOSITORY', 'ARCHIVE'],
      allowLoadGeneration: false,
      allowReadinessPass: false,
      allowCreditPurchase: false,
      allowCustomCapability: false,
      concurrentScanLimit: 1,
      queuePriority: 10,
      retentionDays: 30,
    });
  const beginEdit = (plan: AdminPlanRecord): void => setForm({ ...plan });
  const savePlan = async (): Promise<void> => {
    if (form === null) return;
    setSaving(true);
    setError(null);
    try {
      if (plans.some((plan) => plan.id === form.id))
        await setPlanActive(form.id, form.isActive ?? true, form);
      else await createAdminPlan(form);
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The plan could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <AHead
        eyebrow="Commerce"
        title="Plans"
        meta="entitlements are enforced server-side before any charge"
        actions={
          <Button size="sm" onClick={beginCreate}>
            New plan
          </Button>
        }
      />

      {error !== null && <p className={styles.error}>{error}</p>}

      {form !== null && (
        <Card
          padding={20}
          title={plans.some((plan) => plan.id === form.id) ? `Edit ${form.name}` : 'Create plan'}
        >
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Plan ID</span>
              <input
                value={form.id}
                disabled={plans.some((plan) => plan.id === form.id)}
                onChange={(event) => setForm({ ...form, id: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Monthly credits</span>
              <input
                type="number"
                min="0"
                value={form.monthlyCredits}
                onChange={(event) =>
                  setForm({ ...form, monthlyCredits: Number(event.target.value) })
                }
              />
            </label>
            <label className={styles.field}>
              <span>Concurrent scan limit</span>
              <input
                type="number"
                min="1"
                value={form.concurrentScanLimit}
                onChange={(event) =>
                  setForm({ ...form, concurrentScanLimit: Number(event.target.value) })
                }
              />
            </label>
            <label className={styles.field}>
              <span>Retention days</span>
              <input
                type="number"
                min="1"
                value={form.retentionDays}
                onChange={(event) =>
                  setForm({ ...form, retentionDays: Number(event.target.value) })
                }
              />
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={form.creditsRecur}
                onChange={(event) => setForm({ ...form, creditsRecur: event.target.checked })}
              />{' '}
              Credits recur monthly
            </label>
          </div>
          <div className={styles.formActions}>
            <Button size="sm" disabled={saving} onClick={() => void savePlan()}>
              {saving ? 'Saving...' : 'Save plan'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setForm(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Table
        cols={[
          { label: 'Plan', width: 130 },
          { label: 'Credits', width: 130 },
          { label: 'Entitlements', width: '1fr' },
          { label: 'Concurrent', width: 110 },
          { label: 'Retention', width: 100 },
          { label: 'State', width: 100 },
          { label: '', width: 120 },
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
          <Button
            key="edit"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => beginEdit(plan)}
          >
            Edit
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
            Plan credits expire at renewal. Purchased top-ups never expire. Expiring lots are always
            drawn first, so nothing paid for is quietly destroyed.
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
