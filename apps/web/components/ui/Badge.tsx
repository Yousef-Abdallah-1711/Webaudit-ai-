/** Ported from design-system/components/core/Badge.jsx (T237). */
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface BadgeProps {
  tone?: 'neutral' | 'accent' | 'success' | 'inverse';
  /** false gives the square default radius */
  pill?: boolean;
  mono?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const TONE_CLASS: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-surface-raised text-text-secondary border-border-default',
  // These three legacy swatches are hardcoded by the approved source component
  // and have no Wave-0 semantic-token equivalents; keep their exact values.
  // eslint-disable-next-line no-restricted-syntax -- preserve source swatches without introducing new tokens
  accent: 'bg-[#fff3ec] text-accent border-[#ffd9c2]',
  // eslint-disable-next-line no-restricted-syntax -- preserve source swatch without introducing a new token
  success: 'bg-sev-resolved-bg text-sev-resolved border-[#a7f3d0]',
  inverse: 'bg-surface-inverse text-text-on-accent border-transparent',
};

export function Badge({
  tone = 'neutral',
  pill = true,
  mono = false,
  icon = null,
  children,
}: BadgeProps): React.ReactElement {
  const classes = cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap border border-hairline px-2.5 py-1 text-[0.75rem] font-medium leading-4',
    TONE_CLASS[tone],
    pill ? 'rounded-pill' : 'rounded-none',
    mono ? 'font-mono' : 'font-sans',
  );

  return (
    <span className={classes}>
      {icon}
      {children}
    </span>
  );
}
