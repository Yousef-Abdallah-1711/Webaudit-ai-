'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '../../../components/ui';
import { PageHead } from '../../../components/dashboard';
import { getUsage, type UsageSummary } from '../../../lib/api';
import styles from './page.module.css';

const AREA_COLORS: Record<string, string> = {
  SECURITY: 'var(--sev-critical)',
  PERFORMANCE: 'var(--sev-high)',
  UI: 'var(--sev-medium)',
  TESTING: 'var(--sev-low)',
  SEO: 'var(--sev-info)',
};

function downloadCsv(usage: UsageSummary): void {
  const rows = [
    ['type', 'date', 'label', 'credits'],
    ...usage.dailySpend.map((e) => ['daily_spend', e.date, '', String(e.credits)]),
    ...usage.byArea.map((e) => ['area', '', e.area, String(e.credits)]),
    ...usage.refunds.map((e) => ['refund', e.date, e.reason, String(e.credits)]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'webaudit-usage.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function UsagePage(): React.ReactElement {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getUsage()
      .then(setUsage)
      .catch(() => setError('Usage data could not be loaded.'));
  }, []);
  const maxDaily = Math.max(...(usage?.dailySpend.map((entry) => entry.credits) ?? [0]), 1);
  const maxArea = Math.max(...(usage?.byArea.map((entry) => entry.credits) ?? [0]), 1);
  const audits = usage?.auditsRun ?? 0;
  const rechecks = usage?.rechecks ?? 0;
  const stats = [
    ['Spent this period', String(usage?.spentCredits ?? 0), 'real ledger debits'],
    [
      'Remaining',
      String((usage?.balance.plan ?? 0) + (usage?.balance.purchased ?? 0)),
      `${usage?.balance.plan ?? 0} plan · ${usage?.balance.purchased ?? 0} purchased`,
    ],
    ['Audits run', String(audits), `${audits} initial scans`],
    ['Re-checks', String(rechecks), `${rechecks} readiness scans`],
  ] as const;
  return (
    <div>
      <PageHead
        eyebrow="Usage"
        title="Credit usage"
        meta={usage ? 'current period · last 30 days' : 'Loading usage...'}
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={usage === null}
            onClick={() => usage && downloadCsv(usage)}
          >
            Export CSV
          </Button>
        }
      />
      {error !== null && <p>{error}</p>}
      <div className={styles.statsGrid}>
        {stats.map(([label, value, sub]) => (
          <Card key={label} padding={20} eyebrow={label}>
            <div className={styles.statValue}>{value}</div>
            <div className={styles.statSub}>{sub}</div>
          </Card>
        ))}
      </div>
      <Card padding={24} title="Daily spend">
        <div className={styles.chartRow}>
          {(usage?.dailySpend ?? []).map((entry) => (
            <div
              key={entry.date}
              title={`${entry.credits} credits`}
              className={
                entry.credits ? `${styles.chartBar} ${styles.chartBarActive}` : styles.chartBar
              }
              style={{ height: `${Math.max(2, (entry.credits / maxDaily) * 100)}%` }}
            />
          ))}
        </div>
        <div className={styles.chartLegend}>
          <span>last 30 days</span>
          <span>peak {maxDaily} cr</span>
          <span>today</span>
        </div>
      </Card>
      <div className={styles.twoCol}>
        <Card padding={22} title="By area">
          {(usage?.byArea ?? []).map((entry) => (
            <div key={entry.area} className={styles.areaRow}>
              <div className={styles.areaRowHead}>
                <span>{entry.area}</span>
                <span className={styles.areaRowValue}>{entry.credits} cr</span>
              </div>
              <div className={styles.areaBar}>
                <div
                  className={styles.areaBarFill}
                  style={{
                    width: `${(entry.credits / maxArea) * 100}%`,
                    background: AREA_COLORS[entry.area] ?? 'var(--sev-info)',
                  }}
                />
              </div>
            </div>
          ))}
        </Card>
        <Card padding={22} title="Refunds and adjustments">
          {(usage?.refunds ?? []).map((entry) => (
            <div key={`${entry.date}-${entry.reason}`} className={styles.refundRow}>
              <span className={styles.refundDate}>{new Date(entry.date).toLocaleDateString()}</span>
              <span className={styles.refundReason}>{entry.reason}</span>
              <span className={styles.refundValue}>+{entry.credits}</span>
            </div>
          ))}
          <p className={styles.refundNote}>
            You are never charged for our failures. These returned automatically.
          </p>
        </Card>
      </div>
    </div>
  );
}
