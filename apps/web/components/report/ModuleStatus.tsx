/**
 * Ported from design-system/components/report/ModuleStatus.jsx.
 *
 * T240, folded in ahead of T132 by explicit user decision (tasks.md):
 * Landing.jsx's Proof() section renders this directly, so the landing page
 * cannot be faithfully ported without it.
 *
 * FR-053 / ModuleStatus.prompt.md: the five states must stay visually
 * distinct — an incomplete area may never read as a pass. The colour lookup
 * moved from a JS object into ModuleStatus.module.css's per-state classes;
 * see that file's header for why.
 *
 * The spin animation stays inline (`style={{ animation: ... }}`), matching
 * the source exactly: apps/web/app/tokens/motion.css's own
 * prefers-reduced-motion guard targets `[style*="wa-spin"]`, so moving this
 * to a CSS class would silently break that guard.
 */
import styles from './ModuleStatus.module.css';

export interface ModuleStatusProps {
  /** Area name, e.g. "Security" */
  area: string;
  state?: 'waiting' | 'running' | 'complete' | 'degraded' | 'not-applicable';
  /** Plain-words explanation, required when degraded or not-applicable */
  detail?: string;
  issues?: number | null;
  /** Stacked two-line layout for columns narrower than ~300px */
  compact?: boolean;
}

type State = NonNullable<ModuleStatusProps['state']>;

const STATE_CLASS: Record<State, string> = {
  waiting: styles.stateWaiting!,
  running: styles.stateRunning!,
  complete: styles.stateComplete!,
  degraded: styles.stateDegraded!,
  'not-applicable': styles.stateNotApplicable!,
};

const STATE_WORD: Record<State, string> = {
  waiting: 'Waiting',
  running: 'Running',
  complete: 'Complete',
  degraded: 'Degraded',
  'not-applicable': 'Not applicable',
};

const STATE_ICON_PATH: Record<State, string> = {
  waiting: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  running: 'M12 3a9 9 0 1 0 9 9',
  complete: 'm4 12 5 5L20 6',
  degraded: 'M12 2 1 21h22L12 2Zm0 7v5m0 3v.5',
  'not-applicable': 'M5 12h14',
};

export function ModuleStatus({
  area,
  state = 'waiting',
  detail,
  issues = null,
  compact = false,
}: ModuleStatusProps): React.ReactElement {
  const boxClasses = [styles.box, STATE_CLASS[state], compact ? styles.compact : undefined]
    .filter(Boolean)
    .join(' ');
  const iconSize = compact ? 15 : 18;

  const icon = (
    <span
      className={styles.icon}
      style={{ animation: state === 'running' ? 'wa-spin 1s linear infinite' : 'none' }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={STATE_ICON_PATH[state]} />
      </svg>
    </span>
  );

  if (compact) {
    return (
      <div className={boxClasses}>
        <div className={styles.compactRow}>
          {icon}
          <span className={styles.compactArea}>{area}</span>
          {issues !== null && (
            <span dir="ltr" className={styles.compactIssues}>
              {issues}
            </span>
          )}
        </div>
        <div className={styles.compactMeta}>
          <span className={styles.compactWord}>{STATE_WORD[state]}</span>
          {detail !== undefined && <span className={styles.compactDetail}>{detail}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={boxClasses}>
      {icon}
      <span className={styles.area}>{area}</span>
      <span className={styles.word}>{STATE_WORD[state]}</span>
      {detail !== undefined && <span className={styles.detail}>{detail}</span>}
      {issues !== null && (
        <span dir="ltr" className={styles.issues}>
          {issues}
        </span>
      )}
    </div>
  );
}
