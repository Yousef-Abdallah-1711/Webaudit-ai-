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
  | { readonly kind: 'grant'; readonly amount: number; readonly creditKind: 'PLAN' | 'PURCHASED'; readonly expiresAt: string | null; readonly reason: string }
  | { readonly kind: 'assign-plan'; readonly planId: string; readonly periodEnd: string | null; readonly reason: string };

export default function AdminUsersPage(): React.ReactElement {
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
        setError(err instanceof ApiError ? err.message : 'Users could not be loaded.');
      } finally {
        setBusy(false);
      }
    },
    [search],
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
        setError(err instanceof ApiError ? err.message : 'That did not go through.');
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
      setError(err instanceof ApiError ? err.message : 'User detail could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  const onRequestGrantCredits = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (selectedUser === null || grantAmount === '' || grantReason.trim() === '') {
      setError('Select a user and provide a positive amount and reason.');
      return;
    }
    if (grantKind === 'PURCHASED' && grantExpiresAt !== '') {
      setError('A PURCHASED grant must never expire — leave the expiry blank for it.');
      return;
    }
    setError(null);
    setPendingAction({
      kind: 'grant',
      amount: Number(grantAmount),
      creditKind: grantKind,
      expiresAt: grantKind === 'PLAN' && grantExpiresAt !== '' ? new Date(grantExpiresAt).toISOString() : null,
      reason: grantReason.trim(),
    });
  };

  const onRequestAssignPlan = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (selectedUser === null || assignPlanId === '' || assignReason.trim() === '') {
      setError('Select a user, a plan, and provide a reason.');
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
      setError(err instanceof ApiError ? err.message : 'That action did not go through.');
      setBusy(false);
    }
  };

  return (
    <div>
      <AHead
        eyebrow="Commerce"
        title="Users"
        {...(total === null ? {} : { meta: `${String(total)} accounts` })}
      />

      {error !== null && <p className={styles.error}>{error}</p>}

      <form
        className={styles.searchRow}
        onSubmit={onSearchSubmit}
        role="search"
        aria-label="Search users by email"
      >
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search by email…"
          aria-label="Search by email"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={busy}>
          Search
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
            Clear
          </Button>
        )}
      </form>

      <Table
        cols={[
          { label: 'Email', width: '1fr' },
          { label: 'Plan', width: 110 },
          { label: 'Plan credits', width: 110 },
          { label: 'Purchased', width: 110 },
          { label: 'State', width: 110 },
          { label: 'Created', width: 110 },
          { label: '', width: 160 },
        ]}
        rows={users.map((user) => {
          const status = user.subscriptionStatus ?? 'free';
          return [
            mono(user.email),
            <Badge key="plan" tone={user.planId === 'free' ? 'neutral' : 'accent'}>
              {user.planId}
            </Badge>,
            num(String(user.balance.plan)),
            num(String(user.balance.purchased)),
            <Badge key="state" tone={status === 'active' ? 'success' : 'neutral'}>
              {status}
            </Badge>,
            new Date(user.createdAt).toLocaleDateString(),
            <span key="actions" className={styles.actions}>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onToggleOperator(user)}
              >
                {user.isOperator ? 'Remove operator' : 'Make operator'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void onViewDetail(user)}
              >
                View detail
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
                Grant credits
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
          Load more
        </Button>
      )}

      <div className={styles.actionPanel}>
        <strong>
          {selectedUser === null ? 'User actions' : `Actions for ${selectedUser.email}`}
        </strong>

        {detail !== null && (
          <dl className={styles.detailSummary}>
            <dt>Plan</dt>
            <dd>{detail.planId}</dd>
            <dt>Subscription state</dt>
            <dd>{detail.subscriptionStatus ?? '—'}</dd>
            <dt>Plan credits</dt>
            <dd>{num(String(detail.balance.plan))}</dd>
            <dt>Purchased credits</dt>
            <dd>{num(String(detail.balance.purchased))}</dd>
            <dt>Operator</dt>
            <dd>{detail.isOperator ? 'Yes' : 'No'}</dd>
          </dl>
        )}

        {detail !== null && (
          <div className={styles.ledger}>
            <strong>Recent ledger</strong>
            {detail.recentLedger.length === 0 ? (
              <p className={styles.muted}>No credit transactions yet.</p>
            ) : (
              <ul className={styles.ledgerList}>
                {detail.recentLedger.map((entry) => (
                  <li key={entry.id}>
                    <Badge tone={entry.type === 'DEBIT' ? 'neutral' : 'success'}>{entry.type}</Badge>{' '}
                    {num(String(entry.amount))} — {entry.reason} (
                    {new Date(entry.createdAt).toLocaleString()})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {detail !== null && (
          <div className={styles.ledger}>
            <strong>Audited operator actions for this user</strong>
            {auditEntries.length === 0 ? (
              <p className={styles.muted}>No audited actions recorded.</p>
            ) : (
              <ul className={styles.ledgerList}>
                {auditEntries.map((entry) => (
                  <li key={entry.id}>
                    <Badge tone="accent">{entry.action}</Badge>{' '}
                    {entry.actorEmail ?? entry.actorId} (
                    {new Date(entry.createdAt).toLocaleString()})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form className={styles.subForm} onSubmit={onRequestGrantCredits}>
          <strong>Grant credits</strong>
          <label>
            Amount
            <input
              value={grantAmount}
              onChange={(event) => setGrantAmount(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <label>
            Kind
            <select value={grantKind} onChange={(event) => setGrantKind(event.target.value as 'PLAN' | 'PURCHASED')}>
              <option value="PURCHASED">Purchased (never expires)</option>
              <option value="PLAN">Plan (may expire)</option>
            </select>
          </label>
          {grantKind === 'PLAN' && (
            <label>
              Expires at (optional)
              <input
                type="date"
                value={grantExpiresAt}
                onChange={(event) => setGrantExpiresAt(event.target.value)}
              />
            </label>
          )}
          <label>
            Reason
            <input value={grantReason} onChange={(event) => setGrantReason(event.target.value)} />
          </label>
          <Button type="submit" disabled={selectedUser === null || busy}>
            Review grant
          </Button>
        </form>

        <form className={styles.subForm} onSubmit={onRequestAssignPlan}>
          <strong>Assign plan (no payment)</strong>
          <label>
            Plan
            <select value={assignPlanId} onChange={(event) => setAssignPlanId(event.target.value)}>
              <option value="">Select a plan…</option>
              <option value="free">free (revert to free)</option>
              {plans
                .filter((plan) => plan.id !== 'free' && plan.isActive)
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} ({plan.id})
                  </option>
                ))}
            </select>
          </label>
          <label>
            Expires at (optional — indefinite if left blank)
            <input
              type="date"
              value={assignPeriodEnd}
              onChange={(event) => setAssignPeriodEnd(event.target.value)}
            />
          </label>
          <label>
            Reason
            <input value={assignReason} onChange={(event) => setAssignReason(event.target.value)} />
          </label>
          <Button type="submit" disabled={selectedUser === null || busy}>
            Review assignment
          </Button>
        </form>

        {pendingAction !== null && selectedUser !== null && (
          <div className={styles.confirm} role="alertdialog" aria-label="Confirm action">
            {pendingAction.kind === 'grant' ? (
              <p>
                Grant <strong>{pendingAction.amount}</strong> {pendingAction.creditKind.toLowerCase()}{' '}
                credit(s) to <strong>{selectedUser.email}</strong>
                {pendingAction.expiresAt !== null
                  ? ` (expires ${new Date(pendingAction.expiresAt).toLocaleDateString()})`
                  : ''}
                ? Reason: “{pendingAction.reason}”.
              </p>
            ) : (
              <p>
                Assign plan <strong>{pendingAction.planId}</strong> to{' '}
                <strong>{selectedUser.email}</strong>, no payment involved
                {pendingAction.periodEnd !== null
                  ? ` (until ${new Date(pendingAction.periodEnd).toLocaleDateString()})`
                  : ' (indefinite)'}
                ? Reason: “{pendingAction.reason}”.
              </p>
            )}
            <Button disabled={busy} onClick={() => void onConfirmPendingAction()}>
              Confirm
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
