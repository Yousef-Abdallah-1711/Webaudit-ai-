/** Ported from design-system/components/core/Badge.jsx (T237). */
import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export interface BadgeProps {
  tone?: 'neutral' | 'accent' | 'success' | 'inverse';
  /** false gives the square default radius */
  pill?: boolean;
  mono?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const TONE_CLASS: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: styles.neutral!,
  accent: styles.accent!,
  success: styles.success!,
  inverse: styles.inverse!,
};

export function Badge({
  tone = 'neutral',
  pill = true,
  mono = false,
  icon = null,
  children,
}: BadgeProps): React.ReactElement {
  const classes = [
    styles.badge,
    TONE_CLASS[tone],
    pill ? styles.pill : styles.square,
    mono ? styles.mono : styles.sans,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      {icon}
      {children}
    </span>
  );
}
