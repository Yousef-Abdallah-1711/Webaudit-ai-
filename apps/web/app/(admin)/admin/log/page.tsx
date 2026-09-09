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

  const load = useCallback(async (offset: number, append: boolean) => {
    setBusy(true);
    try {
      const page = await getAdminAuditLog({ limit: PAGE_SIZE, offset });
      setEntries((prev) => (append ? [...prev, ...page.entries] : page.entries));
      setTotal(page.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The audit log could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, []);

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
          entry.subjectId === null ? entry.subjectType : `${entry.subjectType} ${entry.subjectId.slice(0, 8)}`,
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
