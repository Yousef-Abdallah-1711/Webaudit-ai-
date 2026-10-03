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
import { useTranslations } from 'next-intl';
import { Badge, Button } from '../../../../components/ui';
import { AHead, mono, num, Table } from '../../../../components/admin';
import { ApiError, getAdminScans, type AdminScanSummary } from '../../../../lib/api';

const PAGE_SIZE = 50;

function stateTone(state: string): 'success' | 'accent' | 'neutral' {
  if (state === 'COMPLETED') return 'success';
  if (state.startsWith('RUNNING')) return 'accent';
  return 'neutral';
}

export default function AdminScansPage(): React.ReactElement {
  const t = useTranslations('admin');
  const [scans, setScans] = useState<readonly AdminScanSummary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stateLabels: Readonly<Record<string, string>> = {
    QUEUED: t('status_queued'),
    RUNNING: t('status_running'),
    RUNNING_PHASE_1: t('status_running_phase_1'),
    AWAITING_QUESTIONNAIRE: t('status_awaiting_questionnaire'),
    RUNNING_PHASE_2: t('status_running_phase_2'),
    RUNNING_PHASE_3: t('status_running_phase_3'),
    RUNNING_MASTER: t('status_running_master'),
    RUNNING_DOCS: t('status_running_docs'),
    COMPLETED: t('status_completed'),
    FAILED: t('status_failed'),
    CANCELLED: t('status_cancelled'),
    TIMED_OUT: t('status_timed_out'),
  };

  const load = useCallback(
    async (offset: number, append: boolean) => {
      setBusy(true);
      try {
        const page = await getAdminScans({ limit: PAGE_SIZE, offset });
        setScans((prev) => (append ? [...prev, ...page.scans] : page.scans));
        setTotal(page.total);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('scans_load_error'));
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load(0, false);
  }, [load]);

  return (
    <div>
      <AHead
        eyebrow={t('group_platform')}
        title={t('scans')}
        {...(total === null ? {} : { meta: t('scans_total', { count: total }) })}
      />

      {error !== null && <p className={'mb-4 mt-0 type-small text-sev-critical'}>{error}</p>}

      <Table
        cols={[
          { label: t('table_scan'), width: 120 },
          { label: t('table_target'), width: '1fr' },
          { label: t('table_customer'), width: 200 },
          { label: t('table_state'), width: 130 },
          { label: t('table_areas'), width: 70 },
          { label: t('table_charged'), width: 90 },
          { label: t('table_score'), width: 70 },
        ]}
        rows={scans.map((scan) => [
          mono(scan.id.slice(0, 8)),
          scan.targetDisplayName,
          mono(scan.userEmail),
          <Badge key="state" tone={stateTone(scan.state)}>
            {stateLabels[scan.state] ?? scan.state.toLowerCase()}
          </Badge>,
          num(t('number_value', { value: scan.requestedModules.length })),
          num(t('credits_value', { count: scan.chargedCredits })),
          num(
            scan.overallScore === null
              ? t('dash')
              : t('number_value', { value: scan.overallScore }),
          ),
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
          className={`${'mt-3'}`}
        >
          {t('load_more')}
        </Button>
      )}
    </div>
  );
}
