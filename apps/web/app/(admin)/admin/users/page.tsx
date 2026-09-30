'use client';

/**
 * T215 — the Users admin screen, ported from
 * design-system/ui_kits/admin/AdminScreens.jsx's `Users`. Route is
 * `/admin/users` per design/screen-map.md's routing table.
 *
 * The mock's columns are Email / Plan / Credits / Audits / Renews / State /
 * actions ("Grant credits" / "Change plan"). The real `GET /admin/users`
 * (`AdminUserSummary`) carries no per-list "Audits" scan count and no
 * "Renews" date — that's `subscription.periodEnd`, only present on the
 * single-user detail endpoint this page does not call (list-only, matching
 * `AdminScansPage`'s no-detail-page precedent). Plan credits and purchased
 * credits stay two separate columns — this codebase treats the two credit
 * lifetimes as deliberately distinct everywhere else (see
 * `apps/web/app/(dashboard)/billing/page.tsx`). Neither mock action button
 * has a backing endpoint; the only real mutation, `PATCH /admin/users/:id`
 * toggling `isOperator`, replaces both. Pagination is deliberately simple —
 * fetch 50, "Load more" appends the next page — there is no existing
 * pagination-UI precedent elsewhere in this admin console to match.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Badge, Button } from '../../../../components/ui';
import { AHead, mono, num, Table } from '../../../../components/admin';
import {
  ApiError,
  getAdminUsers,
  getAdminUserDetail,
  adjustUserCredits,
  assignUserPlan,
  getAdminPlans,
  getAdminAuditLog,
  setUserOperator,
  type AdminUserSummary,
  type AdminUserDetail,
  type AdminPlanRecord,
  type AdminAuditLogEntry,
} from '../../../../lib/api';
import styles from './page.module.css';

const PAGE_SIZE = 50;

/**
 * Phase 4 (production-without-Paymob-or-AI master plan) — a grant/assignment
 * is a real financial/entitlement mutation, so it requires an explicit
 * confirming click rather than firing on the first submit (discovery §11's
 * "confirmation dialog before granting" gap).
 */
type PendingAction =
  | {
      readonly kind: 'grant';
      readonly amount: number;
      readonly creditKind: 'PLAN' | 'PURCHASED';
      readonly expiresAt: string | null;
      readonly reason: string;
    }
  | {
      readonly kind: 'assign-plan';
      readonly planId: string;
      readonly periodEnd: string | null;
      readonly reason: string;
    };

export default function AdminUsersPage(): React.ReactElement {
  const t = useTranslations('admin');
  const [users, setUsers] = useState<readonly AdminUserSummary[]>([]);
  // `null` until the first successful load — an adversarial review of this
  // task found a real defect here: a plain `useState(0)` renders "0
  // accounts" in the header during the loading window AND on a genuine
  // 401/403 refusal, indistinguishable from a real empty system. Every
  // sibling admin page built this same session already guards against
  // showing a fabricated-looking figure before real data arrives
  // (AdminCapabilitiesPage's meta text, AdminBillingPage's Stat fallbacks)
  // — this page had skipped that guard.
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [auditEntries, setAuditEntries] = useState<readonly AdminAuditLogEntry[]>([]);
  const [plans, setPlans] = useState<readonly AdminPlanRecord[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [grantAmount, setGrantAmount] = useState('');
  const [grantKind, setGrantKind] = useState<'PLAN' | 'PURCHASED'>('PURCHASED');
  const [grantExpiresAt, setGrantExpiresAt] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignPeriodEnd, setAssignPeriodEnd] = useState('');
  const [assignReason, setAssignReason] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const planLabels: Readonly<Record<string, string>> = {
    free: t('plan_free'),
    starter: t('plan_starter'),
    pro: t('plan_pro'),
    business: t('plan_business'),
  };
  const statusLabels: Readonly<Record<string, string>> = {
    ACTIVE: t('subscription_active'),
    PAST_DUE: t('subscription_past_due'),
    CANCELLED: t('subscription_cancelled'),
    EXPIRED: t('subscription_expired'),
    free: t('status_free'),
  };
  const planLabel = (planId: string): string => planLabels[planId] ?? planId;
  const statusLabel = (status: string): string => statusLabels[status] ?? status;

  useEffect(() => {
    getAdminPlans(false)
      .then((result) => setPlans(result.plans))
      .catch(() => undefined); // Non-fatal: the plan-select just stays empty.
  }, []);

  const load = useCallback(
    async (offset: number, append: boolean) => {
      setBusy(true);
      try {
        const page = await getAdminUsers({
          limit: PAGE_SIZE,
          offset,
          ...(search === '' ? {} : { search }),
        });
        setUsers((prev) => (append ? [...prev, ...page.users] : page.users));
        setTotal(page.total);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('users_load_error'));
      } finally {
        setBusy(false);
      }
    },
    [search, t],
  );

  useEffect(() => {
    void load(0, false);
  }, [load]);

  const onSearchSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const onToggleOperator = (user: AdminUserSummary): void => {
    setBusy(true);
    setError(null);
    setUserOperator(user.id, !user.isOperator)
      .then(() => load(0, false))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : t('users_mutation_error'));
        setBusy(false);
      });
  };

  const onLoadMore = (): void => {
    void load(users.length, true);
  };

  const onViewDetail = async (user: AdminUserSummary): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await getAdminUserDetail(user.id);
      setSelectedUser(user);
      setDetail(result.user);
      // P4-T5 (master plan): this user's own audited operator actions —
      // scoped by exact subjectId, never a broader query.
      const auditResult = await getAdminAuditLog({ subjectId: user.id, limit: 20 });
      setAuditEntries(auditResult.entries);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users_detail_error'));
    } finally {
      setBusy(false);
    }
  };

  const onRequestGrantCredits = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (selectedUser === null || grantAmount === '' || grantReason.trim() === '') {
      setError(t('users_grant_invalid'));
      return;
    }
    if (grantKind === 'PURCHASED' && grantExpiresAt !== '') {
      setError(t('users_purchased_never_expires_error'));
      return;
    }
    setError(null);
    setPendingAction({
      kind: 'grant',
      amount: Number(grantAmount),
      creditKind: grantKind,
      expiresAt:
        grantKind === 'PLAN' && grantExpiresAt !== ''
          ? new Date(grantExpiresAt).toISOString()
          : null,
      reason: grantReason.trim(),
    });
  };

  const onRequestAssignPlan = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (selectedUser === null || assignPlanId === '' || assignReason.trim() === '') {
      setError(t('users_assign_invalid'));
      return;
    }
    setError(null);
    setPendingAction({
      kind: 'assign-plan',
      planId: assignPlanId,
      periodEnd: assignPeriodEnd === '' ? null : new Date(assignPeriodEnd).toISOString(),
      reason: assignReason.trim(),
    });
  };

  const onConfirmPendingAction = async (): Promise<void> => {
    if (selectedUser === null || pendingAction === null) return;
    setBusy(true);
    setError(null);
    try {
      if (pendingAction.kind === 'grant') {
        await adjustUserCredits(selectedUser.id, {
          amount: pendingAction.amount,
          kind: pendingAction.creditKind,
          expiresAt: pendingAction.expiresAt,
          reason: pendingAction.reason,
        });
        setGrantAmount('');
        setGrantExpiresAt('');
        setGrantReason('');
      } else {
        await assignUserPlan(selectedUser.id, {
          planId: pendingAction.planId,
          ...(pendingAction.periodEnd === null ? {} : { periodEnd: pendingAction.periodEnd }),
          reason: pendingAction.reason,
        });
        setAssignPlanId('');
        setAssignPeriodEnd('');
        setAssignReason('');
      }
      setPendingAction(null);
      await load(0, false);
      if (detail !== null) await onViewDetail(selectedUser);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users_action_error'));
      setBusy(false);
    }
  };

  return (
    <div>
      <AHead
        eyebrow={t('group_commerce')}
        title={t('users')}
        {...(total === null ? {} : { meta: t('users_accounts', { count: total }) })}
      />

      {error !== null && <p className={styles.error}>{error}</p>}

      <form
        className={styles.searchRow}
        onSubmit={onSearchSubmit}
        role="search"
        aria-label={t('search_users_aria')}
      >
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t('search_by_email')}
          aria-label={t('search_by_email')}
        />
        <Button type="submit" variant="secondary" size="sm" disabled={busy}>
          {t('search')}
        </Button>
        {search !== '' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setSearchInput('');
              setSearch('');
            }}
          >
            {t('clear')}
          </Button>
        )}
      </form>

      <Table
        cols={[
          { label: t('table_email'), width: '1fr' },
          { label: t('table_plan'), width: 110 },
          { label: t('table_plan_credits'), width: 110 },
          { label: t('table_purchased'), width: 110 },
          { label: t('table_state'), width: 110 },
          { label: t('table_created'), width: 110 },
          { label: '', width: 160 },
        ]}
        rows={users.map((user) => {
          const status = user.subscriptionStatus ?? 'free';
          return [
            mono(user.email),
            <Badge key="plan" tone={user.planId === 'free' ? 'neutral' : 'accent'}>
              {planLabel(user.planId)}
            </Badge>,
            num(t('number_value', { value: user.balance.plan })),
            num(t('number_value', { value: user.balance.purchased })),
            <Badge key="state" tone={status === 'active' ? 'success' : 'neutral'}>
              {statusLabel(status)}
            </Badge>,
            t('date_value', { date: new Date(user.createdAt) }),
            <span key="actions" className={styles.actions}>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onToggleOperator(user)}
              >
                {t(user.isOperator ? 'user_remove_operator' : 'user_make_operator')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void onViewDetail(user)}
              >
                {t('view_detail')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setSelectedUser(user);
                  setDetail(null);
                }}
              >
                {t('grant_credits')}
              </Button>
            </span>,
          ];
        })}
      />

      {total !== null && total > users.length && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={onLoadMore}
          className={`${styles.loadMore}`}
        >
          {t('load_more')}
        </Button>
      )}

      <div className={styles.actionPanel}>
        <strong>
          {selectedUser === null
            ? t('user_actions')
            : t('actions_for_user', { email: selectedUser.email })}
        </strong>

        {detail !== null && (
          <dl className={styles.detailSummary}>
            <dt>{t('table_plan')}</dt>
            <dd>{planLabel(detail.planId)}</dd>
            <dt>{t('subscription_state')}</dt>
            <dd>
              {detail.subscriptionStatus === null
                ? t('dash')
                : statusLabel(detail.subscriptionStatus)}
            </dd>
            <dt>{t('table_plan_credits')}</dt>
            <dd>{num(t('number_value', { value: detail.balance.plan }))}</dd>
            <dt>{t('purchased_credits')}</dt>
            <dd>{num(t('number_value', { value: detail.balance.purchased }))}</dd>
            <dt>{t('operator')}</dt>
            <dd>{detail.isOperator ? t('yes') : t('no')}</dd>
          </dl>
        )}

        {detail !== null && (
          <div className={styles.ledger}>
            <strong>{t('recent_ledger')}</strong>
            {detail.recentLedger.length === 0 ? (
              <p className={styles.muted}>{t('no_credit_transactions')}</p>
            ) : (
              <ul className={styles.ledgerList}>
                {detail.recentLedger.map((entry) => (
                  <li key={entry.id}>
                    <Badge tone={entry.type === 'DEBIT' ? 'neutral' : 'success'}>
                      {entry.type === 'DEBIT'
                        ? t('status_debit')
                        : entry.type === 'CREDIT'
                          ? t('status_credit')
                          : entry.type}
                    </Badge>{' '}
                    {t('ledger_entry_tail', {
                      amount: entry.amount,
                      reason: entry.reason,
                      date: new Date(entry.createdAt),
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {detail !== null && (
          <div className={styles.ledger}>
            <strong>{t('audited_user_actions')}</strong>
            {auditEntries.length === 0 ? (
              <p className={styles.muted}>{t('no_audited_actions')}</p>
            ) : (
              <ul className={styles.ledgerList}>
                {auditEntries.map((entry) => (
                  <li key={entry.id}>
                    <Badge tone="accent">{entry.action}</Badge>{' '}
                    {t('audit_entry_meta', {
                      actor: entry.actorEmail ?? entry.actorId,
                      date: new Date(entry.createdAt),
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form className={styles.subForm} onSubmit={onRequestGrantCredits}>
          <strong>{t('grant_credits')}</strong>
          <label>
            {t('amount')}
            <input
              value={grantAmount}
              onChange={(event) => setGrantAmount(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <label>
            {t('kind')}
            <select
              value={grantKind}
              onChange={(event) => setGrantKind(event.target.value as 'PLAN' | 'PURCHASED')}
            >
              <option value="PURCHASED">{t('purchased_never_expires')}</option>
              <option value="PLAN">{t('plan_may_expire')}</option>
            </select>
          </label>
          {grantKind === 'PLAN' && (
            <label>
              {t('expires_at_optional')}
              <input
                type="date"
                value={grantExpiresAt}
                onChange={(event) => setGrantExpiresAt(event.target.value)}
              />
            </label>
          )}
          <label>
            {t('reason')}
            <input value={grantReason} onChange={(event) => setGrantReason(event.target.value)} />
          </label>
          <Button type="submit" disabled={selectedUser === null || busy}>
            {t('review_grant')}
          </Button>
        </form>

        <form className={styles.subForm} onSubmit={onRequestAssignPlan}>
          <strong>{t('assign_plan_no_payment')}</strong>
          <label>
            {t('table_plan')}
            <select value={assignPlanId} onChange={(event) => setAssignPlanId(event.target.value)}>
              <option value="">{t('select_plan')}</option>
              <option value="free">{t('free_revert')}</option>
              {plans
                .filter((plan) => plan.id !== 'free' && plan.isActive)
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {t('plan_option_with_id', { name: plan.name, id: plan.id })}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t('expires_at_indefinite_optional')}
            <input
              type="date"
              value={assignPeriodEnd}
              onChange={(event) => setAssignPeriodEnd(event.target.value)}
            />
          </label>
          <label>
            {t('reason')}
            <input value={assignReason} onChange={(event) => setAssignReason(event.target.value)} />
          </label>
          <Button type="submit" disabled={selectedUser === null || busy}>
            {t('review_assignment')}
          </Button>
        </form>

        {pendingAction !== null && selectedUser !== null && (
          <div className={styles.confirm} role="alertdialog" aria-label={t('confirm_action')}>
            {pendingAction.kind === 'grant' ? (
              <p>
                {pendingAction.expiresAt !== null
                  ? t.rich('grant_confirm_with_expiry', {
                      amount: pendingAction.amount,
                      creditKind: t(
                        pendingAction.creditKind === 'PLAN'
                          ? 'credit_kind_plan'
                          : 'credit_kind_purchased',
                      ),
                      email: selectedUser.email,
                      expires: new Date(pendingAction.expiresAt),
                      reason: pendingAction.reason,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })
                  : t.rich('grant_confirm', {
                      amount: pendingAction.amount,
                      creditKind: t(
                        pendingAction.creditKind === 'PLAN'
                          ? 'credit_kind_plan'
                          : 'credit_kind_purchased',
                      ),
                      email: selectedUser.email,
                      reason: pendingAction.reason,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
              </p>
            ) : (
              <p>
                {pendingAction.periodEnd !== null
                  ? t.rich('assign_confirm_with_expiry', {
                      planId: pendingAction.planId,
                      email: selectedUser.email,
                      expires: new Date(pendingAction.periodEnd),
                      reason: pendingAction.reason,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })
                  : t.rich('assign_confirm_indefinite', {
                      planId: pendingAction.planId,
                      email: selectedUser.email,
                      reason: pendingAction.reason,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
              </p>
            )}
            <Button disabled={busy} onClick={() => void onConfirmPendingAction()}>
              {t('confirm')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setPendingAction(null)}>
              {t('cancel')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
