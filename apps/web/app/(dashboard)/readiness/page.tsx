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
import { useTranslations } from 'next-intl';
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

export default function ReadinessPage(): React.ReactElement {
  const t = useTranslations('readiness');
  return (
    <Suspense fallback={<PageHead eyebrow={t('readiness_label')} title={t('readiness_loading')} />}>
      <ReadinessPageContent />
    </Suspense>
  );
}

function ReadinessPageContent(): React.ReactElement {
  const t = useTranslations('readiness');
  const tr = useTranslations('reports');
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
      setError(t('readiness_load_error'));
    }
  }, [scanId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A readiness scan in flight: refresh when it completes.
  useEffect(() => {
    const readinessScanId = status?.scanId ?? status?.readinessScanId ?? undefined;
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
      const message = e instanceof Error ? e.message : t('readiness_start_error');
      setError(message);
      setStarting(false);
    }
  }, [scanId, router, t]);

  const moduleLabel = (module: string): string => {
    switch (module) {
      case 'PERFORMANCE':
        return tr('area_performance');
      case 'SECURITY':
        return tr('area_security');
      case 'UI':
        return tr('area_design');
      case 'TESTING':
        return tr('area_testing');
      case 'SEO':
        return tr('area_search_visibility');
      default:
        return module;
    }
  };

  const scanStateLabel = (state: string): string => {
    switch (state.toUpperCase()) {
      case 'QUEUED':
        return tr('report_scan_state_queued');
      case 'RUNNING':
        return tr('report_scan_state_running');
      case 'RUNNING_PHASE_1':
        return tr('report_scan_state_running_phase_1');
      case 'AWAITING_QUESTIONNAIRE':
        return tr('report_scan_state_awaiting_questionnaire');
      case 'RUNNING_PHASE_2':
        return tr('report_scan_state_running_phase_2');
      case 'RUNNING_PHASE_3':
        return tr('report_scan_state_running_phase_3');
      case 'RUNNING_MASTER':
        return tr('report_scan_state_running_master');
      case 'RUNNING_DOCS':
        return tr('report_scan_state_running_docs');
      case 'COMPLETED':
        return tr('report_scan_state_completed');
      case 'FAILED':
        return tr('report_scan_state_failed');
      case 'CANCELLED':
        return tr('report_scan_state_cancelled');
      case 'TIMED_OUT':
        return tr('report_scan_state_timed_out');
      default:
        return state.toLowerCase();
    }
  };

  if (scanId === '') {
    return (
      <div>
        <PageHead
          eyebrow={t('readiness_label')}
          title={t('readiness_no_audit')}
          meta={t('readiness_no_audit_meta')}
        />
      </div>
    );
  }

  if (status === null) {
    return (
      <div>
        <PageHead eyebrow={t('readiness_label')} title={t('readiness_loading')} />
        {error !== null && <p>{error}</p>}
      </div>
    );
  }

  // Baseline (INITIAL) scan: offer the pass.
  if (status.premature !== undefined) {
    if (status.readinessScanId) {
      return (
        <div>
          <PageHead
            eyebrow={t('readiness_label')}
            title={t('readiness_pass_title')}
            meta={t('readiness_pass_underway')}
          />
          <Card padding={22}>
            <p>
              {t('readiness_pass_status', {
                state: scanStateLabel(status.readinessScanState ?? 'RUNNING'),
              })}{' '}
              <a href={`/readiness?scan=${status.readinessScanId}`}>{t('readiness_view')}</a>.
            </p>
          </Card>
        </div>
      );
    }
    return (
      <div>
        <PageHead
          eyebrow={t('readiness_label')}
          title={t('readiness_pass_title')}
          meta={t('readiness_fresh_full_reaudit', { credits: READINESS_PASS_COST })}
        />
        <Card padding={22}>
          {status.premature ? (
            <>
              <p>
                {t('readiness_blocking_issues', { count: status.outstandingBlocking ?? 0 })}
              </p>
              <Button disabled>{t('readiness_run_pass', { credits: READINESS_PASS_COST })}</Button>
            </>
          ) : (
            <>
              <p>{t('readiness_no_blocking_issues')}</p>
              <Button
                onClick={() => {
                  void onStart();
                }}
                disabled={starting}
              >
                {starting
                  ? t('readiness_starting')
                  : t('readiness_run_pass', { credits: READINESS_PASS_COST })}
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
          eyebrow={t('readiness_label')}
          title={t('readiness_pass_title')}
          meta={t('readiness_auditing', { state: scanStateLabel(status.state ?? '') })}
        />
        <Card padding={22}>
          <p>{t('readiness_running')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead
        eyebrow={t('readiness_label')}
        title={t('readiness_pass_title')}
        meta={t('readiness_baseline_scan', {
          scanId: (status.baselineScanId ?? '').slice(0, 8),
        })}
      />
      <ReadinessVerdict
        verdict={verdict.isReady ? 'go' : 'no-go'}
        score={verdict.overallScore}
        baseline={verdict.baselineScore}
        blockers={[...verdict.blockers]}
        areas={verdict.moduleOutcomes.map((o) => ({
          name: moduleLabel(o.module),
          score: o.score,
          threshold: o.threshold,
          pass: o.pass,
        }))}
      />

      {verdict.regressions.length > 0 && (
        <Card
          padding={20}
          title={t('readiness_regressions_title')}
          style={{ marginTop: 'var(--space-4)' }}
        >
          <ul>
            {verdict.regressions.map((r) => (
              <li key={r.name}>{r.name}</li>
            ))}
          </ul>
        </Card>
      )}

      {verdict.improvements.length > 0 && (
        <Card
          padding={20}
          title={t('readiness_improvements_title')}
          style={{ marginTop: 'var(--space-4)' }}
        >
          <ul>
            {verdict.improvements.map((i) => (
              <li key={i.name}>{i.name}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* '' is the claim placeholder while the certificate is mid-generation
          (see readiness.routes.ts's 202 CERTIFICATE_GENERATING) -- not yet a
          real key, so the link must wait for it rather than linking to a raw
          JSON error body. */}
      {verdict.isReady &&
        verdict.certificateKey !== null &&
        verdict.certificateKey !== '' &&
        status.scanId !== undefined && (
          <Card padding={20} style={{ marginTop: 'var(--space-4)' }}>
            <a
              href={`${API_BASE}/scans/${status.scanId}/readiness/certificate`}
              target="_blank"
              rel="noreferrer"
            >
              {t('readiness_open_certificate')}
            </a>
          </Card>
        )}
    </div>
  );
}
