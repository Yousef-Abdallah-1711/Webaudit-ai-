/** Ported from design-system/components/core/StatRow.jsx (T237). */
import { Fragment, type ReactNode } from 'react';
import styles from './StatRow.module.css';

export interface StatRowItem {
  value: ReactNode;
  label: string;
}

export interface StatRowProps {
  items: readonly StatRowItem[];
  align?: 'left' | 'center';
}

export function StatRow({ items = [], align = 'left' }: StatRowProps): React.ReactElement {
  const classes = [styles.row, align === 'center' ? styles.center : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden="true" className={styles.separator}>
              ·
            </span>
          )}
          <span>
            <strong className={styles.value}>{it.value}</strong> {it.label}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
