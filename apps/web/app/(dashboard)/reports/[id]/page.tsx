'use client';

/**
 * T134 — the report screen, ported from `ReportScreen` in
 * `design-system/ui_kits/app/Screens.jsx`, wired against `GET /scans/:id/
 * report` instead of the source's static `ISSUES` fixture.
 *
 * **Severity/attribution values are re-cased, not re-decided.** The API
 * returns `Severity`/`Attribution` as the schema's own uppercase enums
 * (`CRITICAL`, `MEASURED`); `SeverityBadge`/`AttributionMark` take the
 * design system's lowercase-hyphenated ones (`critical`, `measured`,
 * `ai-judgment`) — a pure case mapping, not a second source of truth.
 *
 * **A `null` score renders as "—", never as 0** — FR-053's own rule
 * (`packages/scoring`'s `overallScore()`) applies here exactly as it does
 * server-side: an audit that measured nothing must not read as a failing
 * number.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, Card, StatRow } from '../../../../components/ui';
import { PageHead } from '../../../../components/dashboard';
import {
  ScoreArc,
  ModuleStatus,
  IssueCard,
  type ModuleStatusProps,
} from '../../../../components/report';
import {
  ApiError,
  getReport,
  getReportExport,
  type Report,
  type ReportIssue,
} from '../../../../lib/api';
const styles = {
  grid: 'grid grid-cols-[16.25rem_1fr] gap-5 items-start [@media(max-width:40rem)]:grid-cols-1',
  side: 'flex flex-col gap-4',
  scoreWrap: 'grid place-items-center',
  noScore: 'mt-2 font-sans text-[0.875rem] leading-5 font-normal text-text-muted',
  areasList: 'flex flex-col gap-1.5',
  summaryText: 'm-0 font-sans text-[1rem] leading-6 font-normal text-text-primary max-w-[70ch] text-pretty',
  statRow: 'mt-4',
  tabs: 'flex gap-0.5 border-solid border-x-0 border-t-0 border-b-hairline border-b-border-default mb-4 flex-wrap',
  tab: 'bg-transparent border-0 border-solid border-b-2 border-b-transparent mb-[-0.0625rem] px-[0.875rem] py-2.5 font-sans text-[0.875rem] font-normal text-text-secondary cursor-pointer',
  tabActive: '!border-b-accent !font-semibold !text-text-strong',
  issueList: 'flex flex-col gap-3',
  empty: 'font-sans text-[0.875rem] leading-5 font-normal text-text-muted',
} as const;

const AREA_TABS = ['ALL', 'PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO'] as const;

const SEVERITY_CASE: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};

const ATTRIBUTION_CASE: Record<string, 'measured' | 'ai-judgment'> = {
  MEASURED: 'measured',
  AI_JUDGMENT: 'ai-judgment',
};

const MODULE_STATE_CASE: Record<string, NonNullable<ModuleStatusProps['state']>> = {
  PENDING: 'waiting',
  RUNNING: 'running',
  COMPLETE: 'complete',
  DEGRADED: 'degraded',
  FAILED: 'degraded',
  NOT_APPLICABLE: 'not-applicable',
};

function issueCountFor(issues: readonly ReportIssue[], module: string): number {
  return issues.filter((i) => i.module === module).length;
}

export default function ReportPage(): React.ReactElement {
  const t = useTranslations('reports');
  const params = useParams<{ id: string }>();
  const scanId = params.id;
  const [report, setReport] = useState<Report | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [area, setArea] = useState<(typeof AREA_TABS)[number]>('ALL');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getReport(scanId)
      .then(({ report: r }) => {
        if (!cancelled) setReport(r);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t('report_load_error'));
      });
    return () => {
      cancelled = true;
    };
  }, [scanId, t]);

  const onExport = async (): Promise<void> => {
    setExporting(true);
    setExportError(null);
    try {
      const { html, filename } = await getReportExport(scanId);
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(t('report_export_error'));
    } finally {
      setExporting(false);
    }
  };

  const moduleLabel = (module: string): string => {
    switch (module) {
      case 'PERFORMANCE':
        return t('area_performance');
      case 'SECURITY':
        return t('area_security');
      case 'UI':
        return t('area_design');
      case 'TESTING':
        return t('area_testing');
      case 'SEO':
        return t('area_search_visibility');
      default:
        return module;
    }
  };

  const scanStateLabel = (state: string): string => {
    switch (state.toUpperCase()) {
      case 'QUEUED':
        return t('report_scan_state_queued');
      case 'RUNNING':
        return t('report_scan_state_running');
      case 'RUNNING_PHASE_1':
        return t('report_scan_state_running_phase_1');
      case 'AWAITING_QUESTIONNAIRE':
        return t('report_scan_state_awaiting_questionnaire');
      case 'RUNNING_PHASE_2':
        return t('report_scan_state_running_phase_2');
      case 'RUNNING_PHASE_3':
        return t('report_scan_state_running_phase_3');
      case 'RUNNING_MASTER':
        return t('report_scan_state_running_master');
      case 'RUNNING_DOCS':
        return t('report_scan_state_running_docs');
      case 'COMPLETED':
        return t('report_scan_state_completed');
      case 'FAILED':
        return t('report_scan_state_failed');
      case 'CANCELLED':
        return t('report_scan_state_cancelled');
      case 'TIMED_OUT':
        return t('report_scan_state_timed_out');
      default:
        return state.toLowerCase();
    }
  };

  if (loadError !== null) {
    return (
      <div>
        <PageHead eyebrow={t('report_label')} title={t('report_not_found')} />
        <p className={styles.empty}>{loadError}</p>
      </div>
    );
  }

  if (report === null) {
    return (
      <div>
        <PageHead eyebrow={t('report_label')} title={t('report_loading')} />
      </div>
    );
  }

  const list =
    area === 'ALL' ? report.issues : report.issues.filter((i) => i.module === area);

  const counts = {
    critical: report.issues.filter((i) => i.severity === 'CRITICAL').length,
    high: report.issues.filter((i) => i.severity === 'HIGH').length,
    medium: report.issues.filter((i) => i.severity === 'MEDIUM').length,
    low: report.issues.filter((i) => i.severity === 'LOW').length,
  };

  return (
    <div>
      <PageHead
        eyebrow={t('report_label')}
        title={t('report_scan_title', { scanId: scanId.slice(0, 8) })}
        meta={t('report_scan_state', { state: scanStateLabel(report.state) })}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={exporting}
              onClick={() => void onExport()}
            >
              {exporting ? t('report_exporting') : t('report_export')}
            </Button>
            <Button size="sm">{t('report_reaudit')}</Button>
          </>
        }
      />
      {exportError !== null && <p className={styles.empty}>{exportError}</p>}
      <div className={styles.grid}>
        <div className={styles.side}>
          <Card padding={20}>
            <div className={styles.scoreWrap}>
              <ScoreArc score={report.score ?? 0} delta={null} />
              {report.score === null && <div className={styles.noScore}>{t('report_no_score')}</div>}
            </div>
          </Card>
          <Card padding={20} title={t('report_areas')}>
            <div className={styles.areasList}>
              {report.areas.map((a) => {
                const detail = a.degradedReason ?? a.skippedReason;
                return (
                  <ModuleStatus
                    key={a.module}
                    compact
                    area={moduleLabel(a.module)}
                    state={MODULE_STATE_CASE[a.state] ?? 'waiting'}
                    issues={issueCountFor(report.issues, a.module)}
                    {...(detail !== null ? { detail } : {})}
                  />
                );
              })}
            </div>
          </Card>
        </div>
        <div>
          <Card padding={24} title={t('report_summary')} style={{ marginBottom: 'var(--space-4)' }}>
            <p className={styles.summaryText}>{report.summary ?? t('report_no_summary')}</p>
            <div className={styles.statRow}>
              <StatRow
                items={[
                  {
                    value: t('report_count_only', { count: counts.critical }),
                    label: t('report_severity_critical'),
                  },
                  {
                    value: t('report_count_only', { count: counts.high }),
                    label: t('report_severity_high'),
                  },
                  {
                    value: t('report_count_only', { count: counts.medium }),
                    label: t('report_severity_medium'),
                  },
                  {
                    value: t('report_count_only', { count: counts.low }),
                    label: t('report_severity_low'),
                  },
                ]}
              />
            </div>
          </Card>
          <div className={styles.tabs}>
            {AREA_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setArea(tab);
                }}
                className={area === tab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              >
                {tab === 'ALL' ? t('report_tab_all') : moduleLabel(tab)}
              </button>
            ))}
          </div>
          <div className={styles.issueList}>
            {list.map((issue) => (
              <IssueCard
                key={issue.id}
                severity={SEVERITY_CASE[issue.severity] ?? 'medium'}
                area={moduleLabel(issue.module)}
                title={issue.title}
                {...(issue.location !== null ? { location: issue.location } : {})}
                description={issue.explanation}
                attribution={ATTRIBUTION_CASE[issue.attribution] ?? 'measured'}
                {...(issue.fixable ? { prompt: issue.fixPrompt } : {})}
              />
            ))}
            {list.length === 0 && (
              <div className={styles.empty}>{t('report_no_issues_in_area')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
