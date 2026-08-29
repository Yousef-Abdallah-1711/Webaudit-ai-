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
import { Button, Card, StatRow } from '../../../../components/ui';
import { PageHead } from '../../../../components/dashboard';
import { ScoreArc, ModuleStatus, IssueCard, type ModuleStatusProps } from '../../../../components/report';
import { getReport, type Report, type ReportIssue } from '../../../../lib/api';
import styles from './page.module.css';

const MODULE_LABEL: Readonly<Record<string, string>> = {
  PERFORMANCE: 'Performance',
  SECURITY: 'Security',
  UI: 'Design',
  TESTING: 'Testing',
  SEO: 'Search visibility',
};

const AREA_TABS = ['All', 'Performance', 'Security', 'Design', 'Testing', 'Search visibility'];

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
  const params = useParams<{ id: string }>();
  const scanId = params.id;
  const [report, setReport] = useState<Report | null>(null);
  const [area, setArea] = useState('All');

  useEffect(() => {
    let cancelled = false;
    void getReport(scanId).then(({ report: r }) => {
      if (!cancelled) setReport(r);
    });
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  if (report === null) {
    return (
      <div>
        <PageHead eyebrow="Report" title="Loading…" />
      </div>
    );
  }

  const list =
    area === 'All'
      ? report.issues
      : report.issues.filter((i) => MODULE_LABEL[i.module] === area);

  const counts = {
    critical: report.issues.filter((i) => i.severity === 'CRITICAL').length,
    high: report.issues.filter((i) => i.severity === 'HIGH').length,
    medium: report.issues.filter((i) => i.severity === 'MEDIUM').length,
    low: report.issues.filter((i) => i.severity === 'LOW').length,
  };

  return (
    <div>
      <PageHead
        eyebrow="Report"
        title={`scan ${scanId.slice(0, 8)}`}
        meta={`state ${report.state.toLowerCase()}`}
        actions={
          <>
            <Button variant="secondary" size="sm">
              Export
            </Button>
            <Button size="sm">Re-audit</Button>
          </>
        }
      />
      <div className={styles.grid}>
        <div className={styles.side}>
          <Card padding={20}>
            <div className={styles.scoreWrap}>
              <ScoreArc score={report.score ?? 0} delta={null} />
              {report.score === null && <div className={styles.noScore}>No score yet</div>}
            </div>
          </Card>
          <Card padding={20} title="Areas">
            <div className={styles.areasList}>
              {report.areas.map((a) => {
                const detail = a.degradedReason ?? a.skippedReason;
                return (
                  <ModuleStatus
                    key={a.module}
                    compact
                    area={MODULE_LABEL[a.module] ?? a.module}
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
          <Card padding={24} title="Executive summary" style={{ marginBottom: 'var(--space-4)' }}>
            <p className={styles.summaryText}>{report.summary ?? 'No summary yet.'}</p>
            <div className={styles.statRow}>
              <StatRow
                items={[
                  { value: counts.critical, label: 'critical' },
                  { value: counts.high, label: 'high' },
                  { value: counts.medium, label: 'medium' },
                  { value: counts.low, label: 'low' },
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
                {tab}
              </button>
            ))}
          </div>
          <div className={styles.issueList}>
            {list.map((issue) => (
              <IssueCard
                key={issue.id}
                severity={SEVERITY_CASE[issue.severity] ?? 'medium'}
                area={MODULE_LABEL[issue.module] ?? issue.module}
                title={issue.title}
                {...(issue.location !== null ? { location: issue.location } : {})}
                description={issue.explanation}
                attribution={ATTRIBUTION_CASE[issue.attribution] ?? 'measured'}
                prompt={issue.fixPrompt}
              />
            ))}
            {list.length === 0 && <div className={styles.empty}>No issues in this area.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
