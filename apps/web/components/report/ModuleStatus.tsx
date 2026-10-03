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
import { useTranslations } from 'next-intl';
const styles = {
  box: 'flex items-center gap-3 px-4 py-[0.875rem] bg-[var(--state-bg)] border border-solid border-hairline border-border-default font-sans min-w-0 overflow-hidden',
  compact: '!block !px-3 !py-2.5',
  stateWaiting: '[--state-fg:var(--text-muted)] [--state-bg:var(--surface-raised)]',
  stateRunning: '[--state-fg:var(--accent)] [--state-bg:rgb(255,243,236)]',
  stateComplete: '[--state-fg:var(--sev-resolved)] [--state-bg:var(--sev-resolved-bg)]',
  stateDegraded: '[--state-fg:var(--sev-medium)] [--state-bg:var(--sev-medium-bg)] !border-s-[0.1875rem] border-s-sev-medium',
  stateNotApplicable: '[--state-fg:var(--text-muted)] [--state-bg:var(--surface-sunken)]',
  icon: 'inline-flex shrink-0 text-[var(--state-fg)]',
  area: 'min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-[0.9375rem] font-semibold text-text-strong',
  word: 'shrink-0 whitespace-nowrap text-[0.8125rem] font-bold text-[var(--state-fg)]',
  detail: 'min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-[0.8125rem] text-text-secondary',
  issues: 'ms-auto shrink-0 font-mono text-[0.8125rem] text-text-secondary',
  compactRow: 'flex items-center gap-2 min-w-0',
  compactArea: 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.875rem] font-semibold text-text-strong',
  compactIssues: 'ms-auto shrink-0 font-mono text-[0.75rem] text-text-secondary',
  compactMeta: 'flex gap-1.5 mt-[0.1875rem] ps-[1.4375rem] min-w-0',
  compactWord: 'shrink-0 text-[0.75rem] font-bold text-[var(--state-fg)]',
  compactDetail: 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.75rem] text-text-secondary',
} as const;

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
  waiting: styles.stateWaiting,
  running: styles.stateRunning,
  complete: styles.stateComplete,
  degraded: styles.stateDegraded,
  'not-applicable': styles.stateNotApplicable,
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
  const t = useTranslations('reports');
  const stateWord: Record<State, string> = {
    waiting: t('report_module_waiting'),
    running: t('report_module_running'),
    complete: t('report_module_complete'),
    degraded: t('report_module_degraded'),
    'not-applicable': t('report_module_not_applicable'),
  };
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
        aria-hidden="true"
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
              {t('report_count_only', { count: issues })}
            </span>
          )}
        </div>
        <div className={styles.compactMeta}>
          <span className={styles.compactWord}>{stateWord[state]}</span>
          {detail !== undefined && <span className={styles.compactDetail}>{detail}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={boxClasses}>
      {icon}
      <span className={styles.area}>{area}</span>
      <span className={styles.word}>{stateWord[state]}</span>
      {detail !== undefined && <span className={styles.detail}>{detail}</span>}
      {issues !== null && (
        <span dir="ltr" className={styles.issues}>
          {t('report_count_only', { count: issues })}
        </span>
      )}
    </div>
  );
}
