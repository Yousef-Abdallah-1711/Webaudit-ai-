/** Ported from design-system/components/core/StatRow.jsx (T237). */
import { Fragment, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface StatRowItem {
  value: ReactNode;
  label: string;
}

export interface StatRowProps {
  items: readonly StatRowItem[];
  align?: 'left' | 'center';
}

export function StatRow({ items = [], align = 'left' }: StatRowProps): React.ReactElement {
  const classes = cn(
    'type-small flex flex-wrap items-center gap-2.5 text-text-secondary',
    align === 'center' && 'justify-center',
  );

  return (
    <div className={classes}>
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden="true" className="text-border-default">
              ·
            </span>
          )}
          <span>
            <strong className="font-bold text-text-strong">{it.value}</strong> {it.label}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
