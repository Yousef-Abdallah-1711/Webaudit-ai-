/**
 * T168 — ported from `design-system/components/report/VerdictPanel.jsx`.
 *
 * `VerdictPanel.prompt.md`: "the finish line, and the only place visual
 * celebration is allowed" — and "A no-go always names its blockers.
 * Regressions are reported as named regressions, not merely as a lower score."
 * This keeps both: `blockers` renders as an always-visible list under the area
 * grid, never collapsed, and the header colour is the only celebratory signal.
 *
 * Prop names match the vendored `.d.ts` exactly (`verdict`, `score`,
 * `baseline`, `blockers`, `areas`). The source's inline `style` objects moved
 * into `ReadinessVerdict.module.css` — the same lint-technical relocation
 * `ModuleStatus` and `IssueCard` already made — with the go/no-go colour set
 * by a class rather than an inline `var()` switch.
 */

import { useTranslations } from 'next-intl';
const styles = {
  panel: 'border border-solid border-hairline border-border-default rounded-card overflow-hidden font-sans',
  go: '!border-sev-resolved',
  noGo: '!border-sev-critical',
  head: 'px-6 py-[1.375rem] border-solid border-x-0 border-t-0 border-b-hairline border-b-border-default',
  goHead: 'bg-sev-resolved-bg',
  noGoHead: 'bg-sev-critical-bg',
  eyebrow: 'font-sans text-[0.75rem] leading-5 font-bold tracking-[var(--track-eyebrow)] uppercase mb-2',
  goEyebrow: 'text-sev-resolved',
  noGoEyebrow: 'text-sev-critical',
  title: 'type-h3 text-text-strong',
  score: 'mt-1.5 font-mono text-[0.875rem] leading-5 text-text-secondary',
  body: 'px-6 py-[1.125rem] bg-surface-page',
  area: 'flex items-center gap-[0.625rem] py-2',
  areaBordered: 'border-solid border-x-0 border-t-0 border-b-hairline border-b-border-default',
  tickPass: 'text-sev-resolved inline-flex',
  tickFail: 'text-sev-critical inline-flex',
  areaName: 'text-[0.9375rem] text-text-primary',
  areaScore: 'ms-auto font-mono text-[0.8125rem] text-text-secondary',
  blockers: 'mt-4',
  blockersTitle: 'mb-2 font-sans text-[0.875rem] leading-5 font-bold text-sev-critical',
  blocker: 'py-1 font-sans text-[0.875rem] leading-5 font-normal text-text-primary',
} as const;

export interface ReadinessVerdictProps {
  verdict?: 'go' | 'no-go';
  score?: number;
  /** Baseline scan score; renders the delta when present. */
  baseline?: number;
  /** Named blockers — required for a no-go, never a bare refusal. */
  blockers?: string[];
  areas?: { name: string; score: number | null; threshold: number; pass: boolean }[];
}

export function ReadinessVerdict({
  verdict = 'go',
  score,
  baseline,
  blockers = [],
  areas = [],
}: ReadinessVerdictProps): React.ReactElement {
  const t = useTranslations('reports');
  const go = verdict === 'go';
  const delta = score !== undefined && baseline !== undefined ? score - baseline : undefined;

  return (
    <div className={go ? `${styles.panel} ${styles.go}` : `${styles.panel} ${styles.noGo}`}>
      <div className={go ? `${styles.head} ${styles.goHead}` : `${styles.head} ${styles.noGoHead}`}>
        <div className={go ? `${styles.eyebrow} ${styles.goEyebrow}` : `${styles.eyebrow} ${styles.noGoEyebrow}`}>
          {t('report_readiness_heading')}
        </div>
        <div className={styles.title}>
          {go ? t('report_readiness_go') : t('report_readiness_no_go')}
        </div>
        {score !== undefined && (
          <div className={styles.score}>
            {baseline !== undefined && delta !== undefined
              ? t('report_score_summary', {
                  score,
                  baseline,
                  sign: delta >= 0 ? '+' : '',
                  delta,
                })
              : t('report_score_only', { score })}
          </div>
        )}
      </div>

      <div className={styles.body}>
        {areas.map((area, i) => (
          <div
            key={area.name}
            className={i < areas.length - 1 ? `${styles.area} ${styles.areaBordered}` : styles.area}
          >
            <span className={area.pass ? styles.tickPass : styles.tickFail}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={area.pass ? 'm4 12 5 5L20 6' : 'M6 6l12 12M18 6 6 18'} />
              </svg>
            </span>
            <span className={styles.areaName}>{area.name}</span>
            <span dir="ltr" className={styles.areaScore}>
              {area.score === null
                ? t('report_area_score_missing', { threshold: area.threshold })
                : t('report_area_score', { score: area.score, threshold: area.threshold })}
            </span>
          </div>
        ))}

        {blockers.length > 0 && (
          <div className={styles.blockers}>
            <div className={styles.blockersTitle}>{t('report_blockers')}</div>
            {blockers.map((b) => (
              <div key={b} className={styles.blocker}>
                — {b}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
