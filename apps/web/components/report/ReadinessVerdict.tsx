'use client';

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

import styles from './ReadinessVerdict.module.css';

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
  const go = verdict === 'go';
  const delta = score !== undefined && baseline !== undefined ? score - baseline : undefined;

  return (
    <div className={go ? `${styles.panel} ${styles.go}` : `${styles.panel} ${styles.noGo}`}>
      <div className={styles.head}>
        <div className={styles.eyebrow}>Production readiness</div>
        <div className={styles.title}>{go ? 'Ready to ship' : 'Not ready to ship'}</div>
        {score !== undefined && (
          <div className={styles.score}>
            Score {score}
            {baseline !== undefined && (
              <>
                {' · baseline '}
                {baseline}
                {' · '}
                {delta !== undefined && delta >= 0 ? '+' : ''}
                {delta}
              </>
            )}
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
              {area.score === null ? '—' : area.score} / {area.threshold}
            </span>
          </div>
        ))}

        {blockers.length > 0 && (
          <div className={styles.blockers}>
            <div className={styles.blockersTitle}>Blockers</div>
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
