/** Ported from design-system/components/core/Eyebrow.jsx (T237). */
import type { ReactNode } from 'react';
import styles from './Eyebrow.module.css';

export interface EyebrowProps {
  tone?: 'muted' | 'accent';
  children?: ReactNode;
}

export function Eyebrow({ tone = 'muted', children }: EyebrowProps): React.ReactElement {
  const classes = [styles.eyebrow, tone === 'accent' ? styles.accent : undefined]
    .filter(Boolean)
    .join(' ');
  return <div className={classes}>{children}</div>;
}
