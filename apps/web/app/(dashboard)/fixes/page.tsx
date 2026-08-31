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
 *   - `GET /issues/:id/attempts` for any issue that has been re-checked and
 *     did not pass, so the current failing evidence renders inline (FR-061).
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHead } from '../../../components/dashboard';
import { FixesBoard } from '../../../components/fixes';
import { connectRealtime } from '../../../lib/realtime';
import { getAccessToken } from '../../../lib/api';
import {
  assertIssueFixed,
  getIssueAttempts,
  getIssues,
  type FixesIssue,
} from '../../../lib/api';

async function loadFailingEvidence(
  issues: readonly FixesIssue[],
): Promise<Record<string, unknown>> {
  const needsEvidence = issues.filter(
    (i) => i.assertedFixedAt !== null && i.state !== 'RESOLVED' && i.state !== 'ASSERTED_FIXED',
  );
  const entries = await Promise.all(
    needsEvidence.map(async (issue) => {
      try {
        const { attempts } = await getIssueAttempts(issue.id);
        const lastFailed = [...attempts].reverse().find((a) => a.outcome === 'FAILED');
        return lastFailed === undefined
          ? null
          : ([issue.id, lastFailed.evidence] as const);
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, unknown] => e !== null));
}

export default function FixesPage(): React.ReactElement {
  // `useSearchParams` needs a Suspense boundary for static rendering (Next 15).
  return (
    <Suspense fallback={<PageHead eyebrow="Fixes" title="Loading…" />}>
      <FixesPageContent />
    </Suspense>
  );
}

function FixesPageContent(): React.ReactElement {
  const scanId = useSearchParams().get('scan') ?? '';
  const [issues, setIssues] = useState<readonly FixesIssue[] | null>(null);
  const [failingEvidence, setFailingEvidence] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (scanId === '') return;
    try {
      const { issues: fetched } = await getIssues(scanId);
      setIssues(fetched);
      setFailingEvidence(await loadFailingEvidence(fetched));
    } catch {
      setError('This audit could not be loaded.');
    }
  }, [scanId]);

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
      } catch {
        setError('That re-check could not be started. You were not charged.');
        void refresh();
      }
    },
    [refresh],
  );

  if (scanId === '') {
    return (
      <div>
        <PageHead eyebrow="Fixes" title="No audit selected" meta="Open a report and choose Fixes." />
      </div>
    );
  }

  const outstanding = (issues ?? []).filter((i) => i.state !== 'RESOLVED').length;
  const resolved = (issues ?? []).filter((i) => i.state === 'RESOLVED').length;

  return (
    <div>
      <PageHead
        eyebrow="Fixes"
        title={`scan ${scanId.slice(0, 8)}`}
        meta={
          issues === null
            ? 'Loading…'
            : `${String(outstanding)} outstanding · ${String(resolved)} resolved`
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
