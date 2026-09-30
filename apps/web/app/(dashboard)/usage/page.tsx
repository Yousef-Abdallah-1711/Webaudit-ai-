'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { PRODUCT_NAME } from '@webaudit/config';
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

interface CsvLabels {
  type: string;
  date: string;
  label: string;
  credits: string;
  dailySpend: string;
  area: string;
  refund: string;
}

function downloadCsv(
  usage: UsageSummary,
  labels: CsvLabels,
  areaLabel: (area: string) => string,
): void {
  const rows = [
    [labels.type, labels.date, labels.label, labels.credits],
    ...usage.dailySpend.map((e) => [labels.dailySpend, e.date, '', String(e.credits)]),
    ...usage.byArea.map((e) => [labels.area, '', areaLabel(e.area), String(e.credits)]),
    ...usage.refunds.map((e) => [labels.refund, e.date, e.reason, String(e.credits)]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${PRODUCT_NAME.toLowerCase()}-usage.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function UsagePage(): React.ReactElement {
  const t = useTranslations('usage');
  const tr = useTranslations('reports');
  const format = useFormatter();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getUsage()
      .then(setUsage)
      .catch(() => setError(t('usage_error')));
  }, [t]);
  const maxDaily = Math.max(...(usage?.dailySpend.map((entry) => entry.credits) ?? [0]), 1);
  const maxArea = Math.max(...(usage?.byArea.map((entry) => entry.credits) ?? [0]), 1);
  const audits = usage?.auditsRun ?? 0;
  const rechecks = usage?.rechecks ?? 0;
  const areaLabel = (area: string): string => {
    switch (area) {
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
        return area;
    }
  };
  const csvLabels: CsvLabels = {
    type: t('usage_csv_type'),
    date: t('usage_csv_date'),
    label: t('usage_csv_label'),
    credits: t('usage_csv_credits'),
    dailySpend: t('usage_csv_daily_spend'),
    area: t('usage_csv_area'),
    refund: t('usage_csv_refund'),
  };
  const stats = [
    [
      t('usage_spent_this_period'),
      t('usage_number', { value: usage?.spentCredits ?? 0 }),
      t('usage_real_ledger_debits'),
    ],
    [
      t('usage_remaining'),
      t('usage_number', { value: (usage?.balance.plan ?? 0) + (usage?.balance.purchased ?? 0) }),
      t('usage_balance_breakdown', {
        plan: usage?.balance.plan ?? 0,
        purchased: usage?.balance.purchased ?? 0,
      }),
    ],
    [
      t('usage_audits_run'),
      t('usage_number', { value: audits }),
      t('usage_initial_scans', { count: audits }),
    ],
    [
      t('usage_rechecks'),
      t('usage_number', { value: rechecks }),
      t('usage_readiness_scans', { count: rechecks }),
    ],
  ] as const;
  return (
    <div>
      <PageHead
        eyebrow={t('usage_label')}
        title={t('usage_title')}
        meta={usage ? t('usage_period') : t('usage_loading')}
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={usage === null}
            onClick={() => usage && downloadCsv(usage, csvLabels, areaLabel)}
          >
            {t('usage_export_csv')}
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
      <Card padding={24} title={t('usage_daily_spend')}>
        <div className={styles.chartRow}>
          {(usage?.dailySpend ?? []).map((entry) => (
            <div
              key={entry.date}
              title={t('usage_chart_credits', { count: entry.credits })}
              className={
                entry.credits ? `${styles.chartBar} ${styles.chartBarActive}` : styles.chartBar
              }
              style={{ height: `${Math.max(2, (entry.credits / maxDaily) * 100)}%` }}
            />
          ))}
        </div>
        <div className={styles.chartLegend}>
          <span>{t('usage_last_30_days')}</span>
          <span>{t('usage_peak_credits', { credits: maxDaily })}</span>
          <span>{t('usage_today')}</span>
        </div>
      </Card>
      <div className={styles.twoCol}>
        <Card padding={22} title={t('usage_by_area')}>
          {(usage?.byArea ?? []).map((entry) => (
            <div key={entry.area} className={styles.areaRow}>
              <div className={styles.areaRowHead}>
                <span>{areaLabel(entry.area)}</span>
                <span className={styles.areaRowValue}>
                  {t('usage_area_credits', { credits: entry.credits })}
                </span>
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
        <Card padding={22} title={t('usage_refunds_adjustments')}>
          {(usage?.refunds ?? []).map((entry) => (
            <div key={`${entry.date}-${entry.reason}`} className={styles.refundRow}>
              <span className={styles.refundDate}>
                {format.dateTime(new Date(entry.date), { dateStyle: 'medium', timeZone: 'UTC' })}
              </span>
              <span className={styles.refundReason}>{entry.reason}</span>
              <span className={styles.refundValue}>
                {t('usage_refund_amount', { credits: entry.credits })}
              </span>
            </div>
          ))}
          <p className={styles.refundNote}>{t('usage_refund_note')}</p>
        </Card>
      </div>
    </div>
  );
}
