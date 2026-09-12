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
  setUserOperator,
  type AdminUserSummary,
  type AdminUserDetail,
} from '../../../../lib/api';
import styles from './page.module.css';

const PAGE_SIZE = 50;

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
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');

  const load = useCallback(async (offset: number, append: boolean) => {
    setBusy(true);
    try {
      const page = await getAdminUsers({ limit: PAGE_SIZE, offset });
      setUsers((prev) => (append ? [...prev, ...page.users] : page.users));
      setTotal(page.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Users could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(0, false);
  }, [load]);

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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'User detail could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  const onGrantCredits = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (selectedUser === null || grantAmount === '' || grantReason.trim() === '') {
      setError('Select a user and provide a positive amount and reason.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adjustUserCredits(selectedUser.id, {
        amount: Number(grantAmount),
        kind: 'PURCHASED',
        expiresAt: null,
        reason: grantReason.trim(),
      });
      setGrantAmount('');
      setGrantReason('');
      await load(0, false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Credits could not be granted.');
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

      <form className={styles.actionPanel} onSubmit={(event) => void onGrantCredits(event)}>
        <strong>
          {selectedUser === null ? 'User actions' : `Actions for ${selectedUser.email}`}
        </strong>
        <label>
          Amount
          <input
            value={grantAmount}
            onChange={(event) => setGrantAmount(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label>
          Reason
          <input value={grantReason} onChange={(event) => setGrantReason(event.target.value)} />
        </label>
        <Button type="submit" disabled={selectedUser === null || busy}>
          Grant credits
        </Button>
        <Button
          variant="secondary"
          disabled={selectedUser === null || busy}
          onClick={() => undefined}
        >
          View detail
        </Button>
        {detail !== null && <pre className={styles.detail}>{JSON.stringify(detail, null, 2)}</pre>}
      </form>
    </div>
  );
}
