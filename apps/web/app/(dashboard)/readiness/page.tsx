'use client';

/**
 * The readiness screen (US3). Not a numbered task on its own — T168 is the
 * `ReadinessVerdict` component — but the component is not user-reachable
 * without it, the same way T157's fixes page composes T155/T156. The
 * `Checkpoint` for Phase 5 is "the full journey — audit, fix, verify, ship —
 * is deliverable," which needs a surface.
 *
 * `?scan=<id>` takes either:
 *   - an INITIAL scan id → offers the pass, shows it as premature (FR-066)
 *     while critical/high issues remain, links to a pass already started;
 *   - a READINESS scan id → shows "auditing…" until the verdict is computed,
 *     then the `ReadinessVerdict` panel + named regressions + the certificate
 *     link on a go.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { READINESS_PASS_COST } from '@webaudit/config';
import { Button, Card } from '../../../components/ui';
import { PageHead } from '../../../components/dashboard';
import { ReadinessVerdict } from '../../../components/report';
import { connectRealtime } from '../../../lib/realtime';
import {
  API_BASE,
  getAccessToken,
  getReadiness,
  startReadiness,
  type ReadinessStatus,
} from '../../../lib/api';

const MODULE_LABEL: Readonly<Record<string, string>> = {
  PERFORMANCE: 'Performance',
  SECURITY: 'Security',
  UI: 'Design',
  TESTING: 'Testing',
  SEO: 'Search visibility',
};

export default function ReadinessPage(): React.ReactElement {
  return (
    <Suspense fallback={<PageHead eyebrow="Readiness" title="Loading…" />}>
      <ReadinessPageContent />
    </Suspense>
  );
}

function ReadinessPageContent(): React.ReactElement {
  const router = useRouter();
  const scanId = useSearchParams().get('scan') ?? '';
  const [status, setStatus] = useState<ReadinessStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    if (scanId === '') return;
    try {
      const { readiness } = await getReadiness(scanId);
      setStatus(readiness);
    } catch {
      setError('This scan could not be loaded.');
    }
  }, [scanId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A readiness scan in flight: refresh when it completes.
  useEffect(() => {
    const readinessScanId =
      status?.scanId ?? (status?.readinessScanId ?? undefined);
    if (readinessScanId === undefined) return undefined;
    const client = connectRealtime({
      scanId: readinessScanId,
      getToken: getAccessToken,
      onEvent: (event) => {
        if (event.type === 'scan:complete' || event.type === 'scan:state') void refresh();
      },
      onResync: () => {
        void refresh();
      },
    });
    return () => {
      client.close();
    };
  }, [status?.scanId, status?.readinessScanId, refresh]);

  const onStart = useCallback(async () => {
    setStarting(true);
    try {
      const { scan } = await startReadiness(scanId, READINESS_PASS_COST);
      router.push(`/readiness?scan=${scan.id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'The readiness pass could not be started.';
      setError(message);
      setStarting(false);
    }
  }, [scanId, router]);

  if (scanId === '') {
    return (
      <div>
        <PageHead eyebrow="Readiness" title="No audit selected" meta="Open a completed report first." />
      </div>
    );
  }

  if (status === null) {
    return (
      <div>
        <PageHead eyebrow="Readiness" title="Loading…" />
        {error !== null && <p>{error}</p>}
      </div>
    );
  }

  // Baseline (INITIAL) scan: offer the pass.
  if (status.premature !== undefined) {
    if (status.readinessScanId) {
      return (
        <div>
          <PageHead eyebrow="Readiness" title="Production readiness pass" meta="A pass is under way." />
          <Card padding={22}>
            <p>
              A readiness pass is {String(status.readinessScanState ?? 'running').toLowerCase()}.{' '}
              <a href={`/readiness?scan=${status.readinessScanId}`}>View it</a>.
            </p>
          </Card>
        </div>
      );
    }
    return (
      <div>
        <PageHead
          eyebrow="Readiness"
          title="Production readiness pass"
          meta={`Fresh full re-audit · ${String(READINESS_PASS_COST)} credits`}
        />
        <Card padding={22}>
          {status.premature ? (
            <>
              <p>
                {String(status.outstandingBlocking ?? 0)} critical or high issue
                {status.outstandingBlocking === 1 ? '' : 's'} still outstanding. The readiness pass is
                available, but running it now is premature — resolve the blocking issues first.
              </p>
              <Button disabled>Run readiness pass — {READINESS_PASS_COST} cr</Button>
            </>
          ) : (
            <>
              <p>
                No critical or high issues remain. A readiness pass re-audits every area fresh,
                compares against this audit, and returns an explicit go or no-go.
              </p>
              <Button
                onClick={() => {
                  void onStart();
                }}
                disabled={starting}
              >
                {starting ? 'Starting…' : `Run readiness pass — ${READINESS_PASS_COST} cr`}
              </Button>
            </>
          )}
          {error !== null && <p>{error}</p>}
        </Card>
      </div>
    );
  }

  // Readiness scan: verdict, or still auditing.
  const verdict = status.verdict ?? null;
  if (verdict === null) {
    return (
      <div>
        <PageHead
          eyebrow="Readiness"
          title="Production readiness pass"
          meta={`Auditing every area fresh · ${String(status.state ?? '').toLowerCase()}`}
        />
        <Card padding={22}>
          <p>The readiness pass is running. This page updates when the verdict is ready.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead
        eyebrow="Readiness"
        title="Production readiness pass"
        meta={`Baseline scan ${(status.baselineScanId ?? '').slice(0, 8)}`}
      />
      <ReadinessVerdict
        verdict={verdict.isReady ? 'go' : 'no-go'}
        score={verdict.overallScore}
        baseline={verdict.baselineScore}
        blockers={[...verdict.blockers]}
        areas={verdict.moduleOutcomes.map((o) => ({
          name: MODULE_LABEL[o.module] ?? o.module,
          score: o.score,
          threshold: o.threshold,
          pass: o.pass,
        }))}
      />

      {verdict.regressions.length > 0 && (
        <Card padding={20} title="Regressions since the original audit" style={{ marginTop: 'var(--space-4)' }}>
          <ul>
            {verdict.regressions.map((r) => (
              <li key={r.name}>{r.name}</li>
            ))}
          </ul>
        </Card>
      )}

      {verdict.improvements.length > 0 && (
        <Card padding={20} title="Improvements" style={{ marginTop: 'var(--space-4)' }}>
          <ul>
            {verdict.improvements.map((i) => (
              <li key={i.name}>{i.name}</li>
            ))}
          </ul>
        </Card>
      )}

      {verdict.isReady && verdict.certificateKey !== null && status.scanId !== undefined && (
        <Card padding={20} style={{ marginTop: 'var(--space-4)' }}>
          <a href={`${API_BASE}/scans/${status.scanId}/readiness/certificate`} target="_blank" rel="noreferrer">
            Open the shareable readiness certificate
          </a>
        </Card>
      )}
    </div>
  );
}
