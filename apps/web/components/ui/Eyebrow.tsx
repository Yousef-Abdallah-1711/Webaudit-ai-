/** Ported from design-system/components/core/Eyebrow.jsx (T237). */
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface EyebrowProps {
  tone?: 'muted' | 'accent';
  children?: ReactNode;
}

export function Eyebrow({ tone = 'muted', children }: EyebrowProps): React.ReactElement {
  const classes = cn(
    // eslint-disable-next-line no-restricted-syntax -- existing Eyebrow overrides the shared 15.2px token to 12px
    'type-eyebrow text-[12px] uppercase text-text-muted',
    tone === 'accent' && 'text-accent',
  );
  return <div className={classes}>{children}</div>;
}
