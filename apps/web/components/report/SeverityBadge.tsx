/**
 * Ported from design-system/components/core/SeverityBadge.jsx (T239).
 *
 * SeverityBadge.prompt.md: "Never restyle it toward the brand accent: the
 * accent means \"clickable\", and a severity that looks like a CTA breaks the
 * scale. `resolved` and `low` are deliberately different greens." Nothing in
 * this component can enforce that against a caller — noted so it stays true
 * of the next edit rather than the last one.
 */
import styles from './SeverityBadge.module.css';

const LEVEL: Record<
  NonNullable<SeverityBadgeProps['level']>,
  { readonly className: string; readonly text: string; readonly path: string }
> = {
  critical: {
    className: styles.critical!,
    text: 'Critical',
    path: 'M12 2 1 21h22L12 2Zm0 6v6m0 3v.5',
  },
  high: { className: styles.high!, text: 'High', path: 'M12 3v12m0 4v.5M4 20h16' },
  medium: {
    className: styles.medium!,
    text: 'Medium',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v5m0 3v.5',
  },
  low: {
    className: styles.low!,
    text: 'Low',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-4 9 3 3 5-6',
  },
  info: {
    className: styles.info!,
    text: 'Info',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v.5m0 3v5',
  },
  resolved: { className: styles.resolved!, text: 'Resolved', path: 'm4 12 5 5L20 6' },
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
      {label ?? entry.text}
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </span>
  );
}
