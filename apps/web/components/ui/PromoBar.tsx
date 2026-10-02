/**
 * Ported from design-system/components/core/PromoBar.jsx (T237).
 *
 * `gone` stays as React state — unlike Button/Input's hover/focus, dismissal
 * unmounts the element entirely, which CSS alone cannot do.
 */
'use client';

import { useState } from 'react';
import { cn } from '../../lib/cn';

export interface PromoBarProps {
  message: string;
  dismissLabel: string;
  code?: string;
  dark?: boolean;
  onDismiss?: () => void;
}

export function PromoBar({
  message,
  dismissLabel,
  code,
  dark = false,
  onDismiss,
}: PromoBarProps): React.ReactElement | null {
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const classes = cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the existing 13px promotional label size
    'relative flex items-center justify-center gap-3 bg-promo-bg px-4 py-2.5 font-sans text-[13px] font-medium uppercase tracking-[0.6px] text-white',
    dark && 'bg-promo-bg-dark',
  );
  const dismissClasses = // eslint-disable-next-line no-restricted-syntax -- preserve the source dismiss control inset and glyph size
    'absolute end-[14px] cursor-pointer border-0 bg-transparent text-[16px] leading-none text-white opacity-80';

  return (
    <div className={classes}>
      <span>{message}</span>
      {code !== undefined && (
        // eslint-disable-next-line no-restricted-syntax -- preserve the existing 3px code-chip inset
        <code className="rounded-control bg-[rgba(0,0,0,0.22)] px-2 py-[3px] font-mono normal-case tracking-normal">
          {code}
        </code>
      )}
      <button
        type="button"
        onClick={() => {
          setGone(true);
          onDismiss?.();
        }}
        aria-label={dismissLabel}
        className={dismissClasses}
      >
        ×
      </button>
    </div>
  );
}
