'use client';

/**
 * T212 — the margin screen, ported from design-system/ui_kits/admin/
 * AdminScreens.jsx's `Margin`. Route is `/admin/billing` per
 * `design/screen-map.md`'s routing table — the source's own "Margin"
 * naming is kept as the page title and nav label; only the URL differs.
 *
 * Deliberately does NOT port the mock's "Gross margin 78%" stat or its
 * per-capability "Margin %" column. Those were placeholder numbers the
 * mock's own hardcoded rows invented before any real backend existed. The
 * real `GET /admin/margin` (`margin.service.ts`, T206) documents — in its
 * own `note` field, always present in the response — exactly why no such
 * figure is ever computed: revenue (`chargedCredits`) is denominated in
 * credits, cost (`costMicros`) is real USD micros, and this codebase has no
 * published credit-to-dollar conversion rate anywhere (PROGRESS.md's Open
 * Decision #3). Dividing one by the other, or subtracting them, would
 * fabricate a number with no basis — precisely what SC-009 and this
 * project's "never invent a number" discipline forbid. This page shows
 * credits and cost side by side instead, and surfaces the backend's own
 * `note` verbatim, so an operator never has to guess why a familiar-looking
 * margin-percentage column is missing.
 *
 * The mock's `perCapability` rows carry no revenue at all, matching the
 * backend exactly — a single capability execution has no credit charge of
 * its own to attribute (`CapabilityMarginRow` has no `chargedCredits`
 * field). "Export" downloads a real CSV from `GET /admin/margin/export`
 * (`exportMarginReport`) — a genuine file, not a designed-but-unwired
 * action.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card } from '../../../../components/ui';
import { AHead, mono, num, Stat, Table } from '../../../../components/admin';
import {
  ApiError,
  exportMarginReport,
  getMarginReport,
  type MarginReport,
} from '../../../../lib/api';
import styles from './page.module.css';

export default function AdminBillingPage(): React.ReactElement {
  const t = useTranslations('admin');
  const [report, setReport] = useState<MarginReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const moduleLabels: Readonly<Record<string, string>> = {
    PERFORMANCE: t('module_performance'),
    SECURITY: t('module_security'),
    UI: t('module_ui'),
    TESTING: t('module_testing'),
    SEO: t('module_seo'),
  };

  const onExport = async (): Promise<void> => {
    setExporting(true);
    setError(null);
    try {
      const blob = await exportMarginReport();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'margin-report.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('margin_export_error'));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    getMarginReport()
      .then(({ report }) => {
        if (!cancelled) setReport(report);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t('margin_load_error'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const totalCharged =
    report === null ? 0 : report.perScan.reduce((sum, s) => sum + s.chargedCredits, 0);
  const totalCostMicros =
    report === null ? 0 : report.perScan.reduce((sum, s) => sum + s.costMicros, 0);

  return (
    <div>
      <AHead
        eyebrow={t('group_commerce')}
        title={t('margin')}
        meta={t('billing_meta')}
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={exporting}
            onClick={() => void onExport()}
          >
            {exporting ? t('exporting') : t('export')}
          </Button>
        }
      />

      {error !== null && <p className={styles.error}>{error}</p>}

      <div className={styles.statsGrid}>
        <Stat
          label={t('credits_recognised')}
          value={report === null ? t('dash') : t('credits_value', { count: totalCharged })}
        />
        <Stat
          label={t('provider_cost')}
          value={
            report === null ? t('dash') : t('usd_value', { amount: totalCostMicros / 1_000_000 })
          }
        />
        <Stat
          label={t('scans_in_window')}
          value={report === null ? t('dash') : t('number_value', { value: report.perScan.length })}
        />
        <Stat
          label={t('capabilities_measured')}
          value={
            report === null ? t('dash') : t('number_value', { value: report.perCapability.length })
          }
        />
      </div>

      <Table
        cols={[
          { label: t('table_capability'), width: '1fr' },
          { label: t('table_area'), width: 150 },
          { label: t('table_runs'), width: 80 },
          { label: t('table_succeeded'), width: 90 },
          { label: t('table_failed'), width: 80 },
          { label: t('table_cost_window'), width: 130 },
        ]}
        rows={
          report?.perCapability.map((c) => [
            mono(c.capabilityName),
            moduleLabels[c.module] ?? c.module,
            num(t('number_value', { value: c.executionCount })),
            num(t('number_value', { value: c.succeededCount })),
            num(t('number_value', { value: c.failedCount })),
            num(t('usd_value', { amount: c.costMicros / 1_000_000 })),
          ]) ?? []
        }
      />

      <div className={styles.noteCard}>
        <Card padding={20} title={t('margin_no_percentage_title')}>
          <p className={styles.note}>{report?.note ?? t('margin_no_percentage_note')}</p>
        </Card>
      </div>
    </div>
  );
}
