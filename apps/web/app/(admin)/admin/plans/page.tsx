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
import { useTranslations } from 'next-intl';
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

/**
 * Copied locally from `apps/web/app/(dashboard)/billing/page.tsx`'s
 * `retentionLine` — `lib/api.ts` doesn't export it, and this codebase's
 * existing convention doesn't share helpers across route folders.
 */
export default function AdminPlansPage(): React.ReactElement {
  const t = useTranslations('admin');
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
      setError(err instanceof ApiError ? err.message : t('plans_load_error'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggleActive = (plan: AdminPlanRecord): void => {
    setBusy(true);
    setError(null);
    setPlanActive(plan.id, !plan.isActive)
      .then(() => load())
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : t('action_did_not_go_through'));
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
      setError(err instanceof ApiError ? err.message : t('save_plan_error'));
    } finally {
      setSaving(false);
    }
  };

  const retentionLine = (days: number): string => {
    if (days >= 365 && days % 365 === 0) {
      return t('retention_months', { count: (days / 365) * 12 });
    }
    return t('retention_day_count', { count: days });
  };

  const entitlementsLine = (plan: AdminPlanRecord): string => {
    const labels: string[] = [];
    if (plan.allowReadinessPass) labels.push(t('entitlement_readiness_pass'));
    if (plan.allowLoadGeneration) labels.push(t('settings_load_generation'));
    if (plan.allowCustomCapability) labels.push(t('entitlement_custom_capability'));
    if (plan.allowCreditPurchase) labels.push(t('entitlement_top_ups'));
    return labels.length === 0 ? t('dash') : t('entitlement_list', { items: labels.join(', ') });
  };

  return (
    <div>
      <AHead
        eyebrow={t('group_commerce')}
        title={t('plans')}
        meta={t('plans_meta')}
        actions={
          <Button size="sm" onClick={beginCreate}>
            {t('new_plan')}
          </Button>
        }
      />

      {error !== null && <p className={'mb-4 mt-0 type-small text-sev-critical'}>{error}</p>}

      {form !== null && (
        <Card
          padding={20}
          title={
            plans.some((plan) => plan.id === form.id)
              ? t('edit_plan_title', { name: form.name })
              : t('create_plan')
          }
        >
          <div className={'grid grid-cols-3 gap-3 [@media(max-width:48rem)]:grid-cols-1'}>
            <label
              className={
                'grid gap-1.5 type-small text-text-secondary [&_input]:min-h-10 [&_input]:rounded-control [&_input]:border [&_input]:border-hairline [&_input]:border-solid [&_input]:border-border-default [&_input]:bg-surface-page [&_input]:px-2.5 [&_input]:text-text-primary [&_input]:type-small'
              }
            >
              <span>{t('plan_id')}</span>
              <input
                value={form.id}
                disabled={plans.some((plan) => plan.id === form.id)}
                onChange={(event) => setForm({ ...form, id: event.target.value })}
              />
            </label>
            <label
              className={
                'grid gap-1.5 type-small text-text-secondary [&_input]:min-h-10 [&_input]:rounded-control [&_input]:border [&_input]:border-hairline [&_input]:border-solid [&_input]:border-border-default [&_input]:bg-surface-page [&_input]:px-2.5 [&_input]:text-text-primary [&_input]:type-small'
              }
            >
              <span>{t('name')}</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label
              className={
                'grid gap-1.5 type-small text-text-secondary [&_input]:min-h-10 [&_input]:rounded-control [&_input]:border [&_input]:border-hairline [&_input]:border-solid [&_input]:border-border-default [&_input]:bg-surface-page [&_input]:px-2.5 [&_input]:text-text-primary [&_input]:type-small'
              }
            >
              <span>{t('monthly_credits')}</span>
              <input
                type="number"
                min="0"
                value={form.monthlyCredits}
                onChange={(event) =>
                  setForm({ ...form, monthlyCredits: Number(event.target.value) })
                }
              />
            </label>
            <label
              className={
                'grid gap-1.5 type-small text-text-secondary [&_input]:min-h-10 [&_input]:rounded-control [&_input]:border [&_input]:border-hairline [&_input]:border-solid [&_input]:border-border-default [&_input]:bg-surface-page [&_input]:px-2.5 [&_input]:text-text-primary [&_input]:type-small'
              }
            >
              <span>{t('concurrent_scan_limit')}</span>
              <input
                type="number"
                min="1"
                value={form.concurrentScanLimit}
                onChange={(event) =>
                  setForm({ ...form, concurrentScanLimit: Number(event.target.value) })
                }
              />
            </label>
            <label
              className={
                'grid gap-1.5 type-small text-text-secondary [&_input]:min-h-10 [&_input]:rounded-control [&_input]:border [&_input]:border-hairline [&_input]:border-solid [&_input]:border-border-default [&_input]:bg-surface-page [&_input]:px-2.5 [&_input]:text-text-primary [&_input]:type-small'
              }
            >
              <span>{t('retention_days')}</span>
              <input
                type="number"
                min="1"
                value={form.retentionDays}
                onChange={(event) =>
                  setForm({ ...form, retentionDays: Number(event.target.value) })
                }
              />
            </label>
            <label className={'flex items-center gap-1.5 type-small text-text-secondary'}>
              <input
                type="checkbox"
                checked={form.creditsRecur}
                onChange={(event) => setForm({ ...form, creditsRecur: event.target.checked })}
              />{' '}
              {t('credits_recur_monthly')}
            </label>
          </div>
          <div className={'mt-4 flex gap-2'}>
            <Button size="sm" disabled={saving} onClick={() => void savePlan()}>
              {saving ? t('saving') : t('save_plan')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setForm(null)}>
              {t('cancel')}
            </Button>
          </div>
        </Card>
      )}

      <Table
        cols={[
          { label: t('table_plan'), width: 130 },
          { label: t('table_credits'), width: 130 },
          { label: t('table_entitlements'), width: '1fr' },
          { label: t('table_concurrent'), width: 110 },
          { label: t('table_retention'), width: 100 },
          { label: t('table_state'), width: 100 },
          { label: '', width: 120 },
          { label: '', width: 120 },
        ]}
        rows={plans.map((plan) => [
          <strong key="name">{plan.name}</strong>,
          mono(
            plan.creditsRecur
              ? t('monthly_credit_recur', { count: plan.monthlyCredits })
              : t('monthly_credit_once', { count: plan.monthlyCredits }),
          ),
          entitlementsLine(plan),
          num(t('number_value', { value: plan.concurrentScanLimit })),
          num(retentionLine(plan.retentionDays)),
          <Badge key="state" tone={plan.isActive ? 'success' : 'neutral'}>
            {t(plan.isActive ? 'status_active' : 'status_inactive')}
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
            {t(plan.isActive ? 'deactivate' : 'activate')}
          </Button>,
          <Button
            key="edit"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => beginEdit(plan)}
          >
            {t('edit')}
          </Button>,
        ])}
      />

      <div className={'mt-[1.125rem] grid grid-cols-3 gap-4 [@media(max-width:40rem)]:grid-cols-1'}>
        <Card padding={20} title={t('credit_schedule')}>
          {[
            [t('credit_schedule_one_area'), t('credit_range', { minimum: 10, maximum: 25 })],
            [t('credit_schedule_full_audit'), t('number_value', { value: 80 })],
            [t('credit_schedule_recheck'), t('number_value', { value: 3 })],
            [t('entitlement_readiness_pass'), t('number_value', { value: 60 })],
          ].map(([a, b]) => (
            <div
              key={a}
              className={
                'flex border-x-0 border-b-0 border-t-hairline border-solid border-border-default py-2 type-small'
              }
            >
              <span>{a}</span>
              <span className={'ms-auto font-mono'}>{b}</span>
            </div>
          ))}
        </Card>
        <Card padding={20} title={t('credit_lifetimes')}>
          <p className={'m-0 type-small text-text-secondary'}>{t('credit_lifetimes_note')}</p>
        </Card>
        <Card padding={20} title={t('top_ups')}>
          <p className={'m-0 type-small text-text-secondary'}>{t('top_ups_note')}</p>
        </Card>
      </div>
    </div>
  );
}
