/**
 * Ported from design-system/ui_kits/app/Account.jsx's `UsageScreen` (T242).
 *
 * All demo data (spend figures, the 24-day chart, per-area breakdown,
 * refund history) is the exact placeholder content the vendored source
 * shows — not real data, and this port doesn't invent a wiring for it that
 * doesn't exist yet (T158+, US5 billing lands the real numbers).
 *
 * No client interactivity anywhere in the source (no hooks, no handlers
 * beyond a static `Export CSV` button), so this stays a Server Component —
 * unlike every other T237–T241 screen, which needed `useT()`.
 */
import { Button, Card } from '../../../components/ui';
import { PageHead } from '../../../components/dashboard';
import styles from './page.module.css';

const DAYS = [
  38, 0, 80, 12, 3, 83, 0, 20, 60, 80, 3, 0, 143, 80, 6, 20, 0, 83, 3, 80, 60, 0, 20, 83,
];

const STAT_CARDS: readonly (readonly [string, string, string])[] = [
  ['Spent this period', '980', 'of 1,200 plan credits'],
  ['Remaining', '1,120', '920 plan · 200 purchased'],
  ['Audits run', '11', '9 full · 2 partial'],
  ['Re-checks', '24', '72 credits · 7% of spend'],
];

const BY_AREA: readonly (readonly [string, number, string])[] = [
  ['Security', 280, 'var(--sev-critical)'],
  ['Performance', 220, 'var(--sev-high)'],
  ['Design', 180, 'var(--sev-medium)'],
  ['Testing', 180, 'var(--sev-low)'],
  ['Search visibility', 120, 'var(--sev-info)'],
];
const BY_AREA_MAX = 280;

const REFUNDS: readonly (readonly [string, string, string])[] = [
  ['23 Aug', 'Provider outage — design area', '+20'],
  ['19 Aug', 'Worker timeout — testing area', '+20'],
  ['14 Aug', 'Archive rejected before extraction', '+80'],
];

export default function UsagePage(): React.ReactElement {
  const max = Math.max(...DAYS);

  return (
    <div>
      <PageHead
        eyebrow="Usage"
        title="Credit usage"
        meta="current period · 12 Aug – 12 Sep 2026"
        actions={
          <Button variant="secondary" size="sm">
            Export CSV
          </Button>
        }
      />

      <div className={styles.statsGrid}>
        {STAT_CARDS.map(([label, value, sub]) => (
          <Card key={label} padding={20} eyebrow={label}>
            <div className={styles.statValue}>{value}</div>
            <div className={styles.statSub}>{sub}</div>
          </Card>
        ))}
      </div>

      <Card padding={24} title="Daily spend">
        <div className={styles.chartRow}>
          {DAYS.map((d, i) => (
            <div
              key={i}
              title={`${String(d)} credits`}
              className={d ? `${styles.chartBar} ${styles.chartBarActive}` : styles.chartBar}
              style={{ height: `${String(Math.max(2, (d / max) * 100))}%` }}
            />
          ))}
        </div>
        <div className={styles.chartLegend}>
          <span>12 Aug</span>
          <span>peak 143 cr</span>
          <span>23 Aug</span>
        </div>
      </Card>

      <div className={styles.twoCol}>
        <Card padding={22} title="By area">
          {BY_AREA.map(([name, value, color]) => (
            <div key={name} className={styles.areaRow}>
              <div className={styles.areaRowHead}>
                <span>{name}</span>
                <span className={styles.areaRowValue}>{value} cr</span>
              </div>
              <div className={styles.areaBar}>
                <div
                  className={styles.areaBarFill}
                  style={{ width: `${String((value / BY_AREA_MAX) * 100)}%`, background: color }}
                />
              </div>
            </div>
          ))}
        </Card>
        <Card padding={22} title="Refunds and adjustments">
          {REFUNDS.map(([date, reason, value]) => (
            <div key={date + reason} className={styles.refundRow}>
              <span className={styles.refundDate}>{date}</span>
              <span className={styles.refundReason}>{reason}</span>
              <span className={styles.refundValue}>{value}</span>
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
