'use client';

/**
 * T157 — the fixes page, composing `FixesBoard` (T155) with real data.
 *
 * Which audit's issues to show comes from `?scan=<id>` — the sidebar's
 * "Fixes" link is not scan-specific, and there is no "current scan" concept
 * in the data model, so the report screen links here with the id.
 *
 * **The loop, wired to reality:**
 *   - `GET /scans/:id/issues` on load and after every verdict (FR-057).
 *   - `POST /issues/:id/assert-fixed` when the user presses "I fixed this"
 *     (FR-058); the row immediately shows "Re-checking…" from the
 *     `ASSERTED_FIXED` state the route returns.
 *   - `issue:verified` over the realtime socket (T135) re-fetches the issue
 *     list, so a row turns green (or comes back red with fresh evidence)
 *     without a reload (FR-044). `onResync` re-fetches too, covering a gap.
 *   - `GET /scans/:id/issues/failing-evidence` batches the current failing
 *     evidence for every issue in the scan into the same round trip as the
 *     issue list itself, so it renders inline for any issue that has been
 *     re-checked and did not pass (FR-061), without one request per issue
 *     (2026-09-02 review, Finding 7).
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PageHead } from '../../../components/dashboard';
import { FixesBoard } from '../../../components/fixes';
import { connectRealtime } from '../../../lib/realtime';
import { getAccessToken } from '../../../lib/api';
import {
  ApiError,
  assertIssueFixed,
  getFailingEvidence,
  getIssues,
  type FixesIssue,
} from '../../../lib/api';

export default function FixesPage(): React.ReactElement {
  const t = useTranslations('fixes');
  // `useSearchParams` needs a Suspense boundary for static rendering (Next 15).
  return (
    <Suspense fallback={<PageHead eyebrow={t('fixes_label')} title={t('fixes_loading')} />}>
      <FixesPageContent />
    </Suspense>
  );
}

function FixesPageContent(): React.ReactElement {
  const t = useTranslations('fixes');
  const scanId = useSearchParams().get('scan') ?? '';
  const [issues, setIssues] = useState<readonly FixesIssue[] | null>(null);
  const [failingEvidence, setFailingEvidence] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (scanId === '') return;
    try {
      const [{ issues: fetched }, { evidence }] = await Promise.all([
        getIssues(scanId),
        getFailingEvidence(scanId),
      ]);
      setIssues(fetched);
      setFailingEvidence(evidence);
    } catch {
      setError(t('fixes_load_error'));
    }
  }, [scanId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (scanId === '') return undefined;
    const client = connectRealtime({
      scanId,
      getToken: getAccessToken,
      onEvent: (event) => {
        if (event.type === 'issue:verified') void refresh();
      },
      onResync: () => {
        void refresh();
      },
    });
    return () => {
      client.close();
    };
  }, [scanId, refresh]);

  const onAssertFixed = useCallback(
    async (issueId: string) => {
      // Optimistic: show "Re-checking…" immediately from the state the route returns.
      setIssues((current) =>
        current === null
          ? current
          : current.map((i) => (i.id === issueId ? { ...i, state: 'ASSERTED_FIXED' as const } : i)),
      );
      try {
        await assertIssueFixed(issueId);
      } catch (err) {
        setError(
          err instanceof ApiError && (err.status === 402 || err.status === 409)
            ? t('fixes_assert_not_charged')
            : t('fixes_assert_refresh_balance'),
        );
        void refresh();
      }
    },
    [refresh, t],
  );

  if (scanId === '') {
    return (
      <div>
        <PageHead
          eyebrow={t('fixes_label')}
          title={t('fixes_no_audit')}
          meta={t('fixes_no_audit_meta')}
        />
      </div>
    );
  }

  const outstanding = (issues ?? []).filter((i) => i.state !== 'RESOLVED').length;
  const resolved = (issues ?? []).filter((i) => i.state === 'RESOLVED').length;

  return (
    <div>
      <PageHead
        eyebrow={t('fixes_label')}
        title={t('fixes_scan_title', { scanId: scanId.slice(0, 8) })}
        meta={
          issues === null
            ? t('fixes_loading_meta')
            : t('fixes_status', { outstanding, resolved })
        }
      />
      {error !== null && <p>{error}</p>}
      {issues !== null && (
        <FixesBoard
          issues={issues}
          failingEvidence={failingEvidence}
          onAssertFixed={(id) => {
            void onAssertFixed(id);
          }}
        />
      )}
    </div>
  );
}
