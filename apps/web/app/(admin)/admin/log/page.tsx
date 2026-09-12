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
import { Badge, Button } from '../../../../components/ui';
import { AHead, mono, Table } from '../../../../components/admin';
import { ApiError, getAdminAuditLog, type AdminAuditLogEntry } from '../../../../lib/api';
import styles from './page.module.css';

const PAGE_SIZE = 50;

export default function AdminLogPage(): React.ReactElement {
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
        setError(err instanceof ApiError ? err.message : 'The audit log could not be loaded.');
      } finally {
        setBusy(false);
      }
    },
    [action, actorId, from, search, to],
  );

  useEffect(() => {
    void load(0, false);
  }, [load]);

  return (
    <div>
      <AHead
        eyebrow="Governance"
        title="Audit log"
        {...(total === null ? {} : { meta: `${String(total)} entries · append only` })}
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
          aria-label="Search audit log"
          placeholder="Search action or subject"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <input
          aria-label="Filter action"
          placeholder="Action"
          value={action}
          onChange={(event) => setAction(event.target.value)}
        />
        <input
          aria-label="Filter actor"
          placeholder="Actor ID"
          value={actorId}
          onChange={(event) => setActorId(event.target.value)}
        />
        <input
          aria-label="From date"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <input
          aria-label="To date"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <Button type="submit" size="sm">
          Filter
        </Button>
      </form>

      <Table
        cols={[
          { label: 'When', width: 170 },
          { label: 'Actor', width: 230 },
          { label: 'Action', width: 180 },
          { label: 'Subject', width: '1fr' },
        ]}
        rows={entries.map((entry) => [
          mono(new Date(entry.createdAt).toLocaleString()),
          mono(entry.actorEmail ?? entry.actorId),
          <Badge key="action" mono pill={false}>
            {entry.action}
          </Badge>,
          entry.subjectId === null
            ? entry.subjectType
            : `${entry.subjectType} ${entry.subjectId.slice(0, 8)}`,
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
          Load more
        </Button>
      )}
    </div>
  );
}
