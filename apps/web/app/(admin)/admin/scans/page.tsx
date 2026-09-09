'use client';

/**
 * The Scans admin screen, wired to the real `GET /admin/scans` — this page
 * shipped as a Server Component rendering five hardcoded placeholder rows
 * ("acme.com", "shopfront.io", ...) with no backend call at all. Found and
 * closed alongside the audit-log page, the same gap in kind.
 *
 * `total` stays `null` until the first successful load, matching
 * AdminUsersPage's own guard against showing a fabricated-looking figure
 * during the loading window or on a genuine 401/403 refusal.
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '../../../../components/ui';
import { AHead, mono, num, Table } from '../../../../components/admin';
import { ApiError, getAdminScans, type AdminScanSummary } from '../../../../lib/api';
import styles from './page.module.css';

const PAGE_SIZE = 50;

function stateTone(state: string): 'success' | 'accent' | 'neutral' {
  if (state === 'COMPLETED') return 'success';
  if (state.startsWith('RUNNING')) return 'accent';
  return 'neutral';
}

export default function AdminScansPage(): React.ReactElement {
  const [scans, setScans] = useState<readonly AdminScanSummary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (offset: number, append: boolean) => {
    setBusy(true);
    try {
      const page = await getAdminScans({ limit: PAGE_SIZE, offset });
      setScans((prev) => (append ? [...prev, ...page.scans] : page.scans));
      setTotal(page.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Scans could not be loaded.');
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
        eyebrow="Platform"
        title="Scans"
        {...(total === null ? {} : { meta: `${String(total)} total` })}
      />

      {error !== null && <p className={styles.error}>{error}</p>}

      <Table
        cols={[
          { label: 'Scan', width: 120 },
          { label: 'Target', width: '1fr' },
          { label: 'Customer', width: 200 },
          { label: 'State', width: 130 },
          { label: 'Areas', width: 70 },
          { label: 'Charged', width: 90 },
          { label: 'Score', width: 70 },
        ]}
        rows={scans.map((scan) => [
          mono(scan.id.slice(0, 8)),
          scan.targetDisplayName,
          mono(scan.userEmail),
          <Badge key="state" tone={stateTone(scan.state)}>
            {scan.state.toLowerCase()}
          </Badge>,
          num(String(scan.requestedModules.length)),
          num(`${String(scan.chargedCredits)} cr`),
          num(scan.overallScore === null ? '—' : String(scan.overallScore)),
        ])}
      />

      {total !== null && total > scans.length && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            void load(scans.length, true);
          }}
          className={`${styles.loadMore}`}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
