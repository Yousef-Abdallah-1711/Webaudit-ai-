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
import { Button, Card } from '../../../../components/ui';
import { AHead, mono, num, Stat, Table } from '../../../../components/admin';
import {
  ApiError,
  exportMarginReport,
  getMarginReport,
  type MarginReport,
} from '../../../../lib/api';
import styles from './page.module.css';

function formatCredits(n: number): string {
  return `${String(n)} cr`;
}

function formatUsd(costMicros: number): string {
  return `$${(costMicros / 1_000_000).toFixed(2)}`;
}

export default function AdminBillingPage(): React.ReactElement {
  const [report, setReport] = useState<MarginReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

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
      setError(err instanceof ApiError ? err.message : 'The margin export failed.');
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
        setError(err instanceof ApiError ? err.message : 'The margin report could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalCharged =
    report === null ? 0 : report.perScan.reduce((sum, s) => sum + s.chargedCredits, 0);
  const totalCostMicros =
    report === null ? 0 : report.perScan.reduce((sum, s) => sum + s.costMicros, 0);

  return (
    <div>
      <AHead
        eyebrow="Commerce"
        title="Margin"
        meta="attributable to the individual capability that caused the cost"
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={exporting}
            onClick={() => void onExport()}
          >
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
        }
      />

      {error !== null && <p className={styles.error}>{error}</p>}

      <div className={styles.statsGrid}>
        <Stat
          label="Credits recognised"
          value={report === null ? '—' : formatCredits(totalCharged)}
        />
        <Stat label="Provider cost" value={report === null ? '—' : formatUsd(totalCostMicros)} />
        <Stat
          label="Scans in window"
          value={report === null ? '—' : String(report.perScan.length)}
        />
        <Stat
          label="Capabilities measured"
          value={report === null ? '—' : String(report.perCapability.length)}
        />
      </div>

      <Table
        cols={[
          { label: 'Capability', width: '1fr' },
          { label: 'Area', width: 150 },
          { label: 'Runs', width: 80 },
          { label: 'Succeeded', width: 90 },
          { label: 'Failed', width: 80 },
          { label: 'Cost (window)', width: 130 },
        ]}
        rows={
          report?.perCapability.map((c) => [
            mono(c.capabilityName),
            c.module,
            num(String(c.executionCount)),
            num(String(c.succeededCount)),
            num(String(c.failedCount)),
            num(formatUsd(c.costMicros)),
          ]) ?? []
        }
      />

      <div className={styles.noteCard}>
        <Card padding={20} title="Why there is no margin percentage here">
          <p className={styles.note}>
            {report?.note ??
              'Revenue is denominated in credits, cost is real USD micros, and this codebase has ' +
                'no published conversion rate between them.'}
          </p>
        </Card>
      </div>
    </div>
  );
}
