/**
 * Ported from design-system/components/core/Card.jsx (T237).
 *
 * `padding` (a number, in px) and `accentRule` (an arbitrary CSS colour) are
 * genuinely per-instance values, not design tokens — they stay as inline
 * style, matching the source's own `...style` merge, rather than becoming
 * static CSS Module classes that could not express them.
 */
import type { CSSProperties, ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps {
  title?: ReactNode;
  /** Uppercase label above the title */
  eyebrow?: string;
  footer?: ReactNode;
  padding?: number;
  /** CSS colour for a 3px left rule — used by severity surfaces only */
  accentRule?: string;
  /** Adds shadow-card; prefer a background tint step instead */
  elevated?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Card({
  title,
  eyebrow,
  footer,
  padding = 24,
  accentRule,
  elevated = false,
  children,
  style,
  ...rest
}: CardProps): React.ReactElement {
  const classes = [styles.card, elevated ? styles.elevated : undefined].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{
        padding: `${String(padding)}px`,
        ...(accentRule !== undefined ? { borderInlineStart: `3px solid ${accentRule}` } : {}),
        ...style,
      }}
      {...rest}
    >
      {eyebrow !== undefined && <div className={styles.eyebrow}>{eyebrow}</div>}
      {title !== undefined && <div className={styles.title}>{title}</div>}
      {children}
      {footer !== undefined && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
