/**
 * Ported from design-system/components/core/PromoBar.jsx (T237).
 *
 * `gone` stays as React state — unlike Button/Input's hover/focus, dismissal
 * unmounts the element entirely, which CSS alone cannot do.
 */
'use client';

import { useState } from 'react';
import styles from './PromoBar.module.css';

export interface PromoBarProps {
  message: string;
  code?: string;
  dark?: boolean;
  onDismiss?: () => void;
}

export function PromoBar({
  message,
  code,
  dark = false,
  onDismiss,
}: PromoBarProps): React.ReactElement | null {
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const classes = [styles.bar, dark ? styles.dark : undefined].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <span>{message}</span>
      {code !== undefined && <code className={styles.code}>{code}</code>}
      <button
        type="button"
        onClick={() => {
          setGone(true);
          onDismiss?.();
        }}
        aria-label="Dismiss"
        className={styles.dismiss}
      >
        ×
      </button>
    </div>
  );
}
