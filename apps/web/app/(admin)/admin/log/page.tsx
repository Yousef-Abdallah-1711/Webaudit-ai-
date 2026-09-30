'use client';

/**
 * The Audit log admin screen, wired to the real `GET /admin/audit-log` —
 * this page shipped as a Server Component rendering five hardcoded
 * placeholder rows ("capability.disable", "credits.grant", ...) with no
 * backend call at all. Found and closed alongside the scans page, the same
 * gap in kind.
 *
 * `actorEmail` is `null` when the acting operator no longer exists
 * (`AuditLogEntry.actorId` carries no foreign key by design, per the
 * model's own schema comment) — rendered as the raw actor id rather than
 * silently blanked, since "who did this" is the one thing an append-only
 * log must never hide.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge, Button } from '../../../../components/ui';
import { AHead, mono, Table } from '../../../../components/admin';
import { ApiError, getAdminAuditLog, type AdminAuditLogEntry } from '../../../../lib/api';
import styles from './page.module.css';

const PAGE_SIZE = 50;

export default function AdminLogPage(): React.ReactElement {
  const t = useTranslations('admin');
  const [entries, setEntries] = useState<readonly AdminAuditLogEntry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(
    async (offset: number, append: boolean) => {
      setBusy(true);
      try {
        const page = await getAdminAuditLog({
          limit: PAGE_SIZE,
          offset,
          search,
          action,
          actorId,
          from: from === '' ? undefined : new Date(`${from}T00:00:00.000Z`).toISOString(),
          to: to === '' ? undefined : new Date(`${to}T23:59:59.999Z`).toISOString(),
        });
        setEntries((prev) => (append ? [...prev, ...page.entries] : page.entries));
        setTotal(page.total);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('audit_log_load_error'));
      } finally {
        setBusy(false);
      }
    },
    [action, actorId, from, search, t, to],
  );

  useEffect(() => {
    void load(0, false);
  }, [load]);

  return (
    <div>
      <AHead
        eyebrow={t('group_governance')}
        title={t('audit_log')}
        {...(total === null ? {} : { meta: t('audit_log_entries', { count: total }) })}
      />

      {error !== null && <p className={styles.error}>{error}</p>}

      <form
        className={styles.filters}
        onSubmit={(event) => {
          event.preventDefault();
          void load(0, false);
        }}
      >
        <input
          aria-label={t('audit_search_aria')}
          placeholder={t('audit_search_placeholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <input
          aria-label={t('audit_filter_action_aria')}
          placeholder={t('audit_action_placeholder')}
          value={action}
          onChange={(event) => setAction(event.target.value)}
        />
        <input
          aria-label={t('audit_filter_actor_aria')}
          placeholder={t('audit_actor_id_placeholder')}
          value={actorId}
          onChange={(event) => setActorId(event.target.value)}
        />
        <input
          aria-label={t('from_date')}
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <input
          aria-label={t('to_date')}
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <Button type="submit" size="sm">
          {t('filter')}
        </Button>
      </form>

      <Table
        cols={[
          { label: t('table_when'), width: 170 },
          { label: t('table_actor'), width: 230 },
          { label: t('table_action'), width: 180 },
          { label: t('table_subject'), width: '1fr' },
        ]}
        rows={entries.map((entry) => [
          mono(t('date_time_value', { date: new Date(entry.createdAt) })),
          mono(entry.actorEmail ?? entry.actorId),
          <Badge key="action" mono pill={false}>
            {entry.action}
          </Badge>,
          entry.subjectId === null
            ? entry.subjectType
            : t('audit_subject_with_id', {
                subjectType: entry.subjectType,
                subjectId: entry.subjectId.slice(0, 8),
              }),
        ])}
      />

      {total !== null && total > entries.length && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            void load(entries.length, true);
          }}
          className={`${styles.loadMore}`}
        >
          {t('load_more')}
        </Button>
      )}
    </div>
  );
}
