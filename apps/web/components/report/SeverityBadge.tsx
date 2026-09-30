/**
 * Ported from design-system/components/core/SeverityBadge.jsx (T239).
 *
 * SeverityBadge.prompt.md: "Never restyle it toward the brand accent: the
 * accent means \"clickable\", and a severity that looks like a CTA breaks the
 * scale. `resolved` and `low` are deliberately different greens." Nothing in
 * this component can enforce that against a caller — noted so it stays true
 * of the next edit rather than the last one.
 */
import { useTranslations } from 'next-intl';
import styles from './SeverityBadge.module.css';

type SeverityTranslationKey =
  | 'report_severity_badge_critical'
  | 'report_severity_badge_high'
  | 'report_severity_badge_medium'
  | 'report_severity_badge_low'
  | 'report_severity_badge_info'
  | 'report_severity_badge_resolved';

const LEVEL: Record<
  NonNullable<SeverityBadgeProps['level']>,
  {
    readonly className: string;
    readonly textKey: SeverityTranslationKey;
    readonly path: string;
  }
> = {
  critical: {
    className: styles.critical!,
    textKey: 'report_severity_badge_critical',
    path: 'M12 2 1 21h22L12 2Zm0 6v6m0 3v.5',
  },
  high: {
    className: styles.high!,
    textKey: 'report_severity_badge_high',
    path: 'M12 3v12m0 4v.5M4 20h16',
  },
  medium: {
    className: styles.medium!,
    textKey: 'report_severity_badge_medium',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v5m0 3v.5',
  },
  low: {
    className: styles.low!,
    textKey: 'report_severity_badge_low',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-4 9 3 3 5-6',
  },
  info: {
    className: styles.info!,
    textKey: 'report_severity_badge_info',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v.5m0 3v5',
  },
  resolved: {
    className: styles.resolved!,
    textKey: 'report_severity_badge_resolved',
    path: 'm4 12 5 5L20 6',
  },
};

export interface SeverityBadgeProps {
  level?: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'resolved';
  /** Overrides the default word; keep it a word, never blank */
  label?: string;
  /** Optional trailing count, e.g. 3 */
  count?: number;
}

export function SeverityBadge({
  level = 'medium',
  label,
  count,
}: SeverityBadgeProps): React.ReactElement {
  const t = useTranslations('reports');
  const entry = LEVEL[level];

  return (
    <span className={`${styles.badge} ${entry.className}`}>
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={entry.path} />
      </svg>
      {label ?? t(entry.textKey)}
      {count !== undefined && (
        <span className={styles.count}>{t('report_count_only', { count })}</span>
      )}
    </span>
  );
}
