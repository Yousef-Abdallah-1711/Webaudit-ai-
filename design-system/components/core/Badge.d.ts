import * as React from 'react';
/** Small pill label for counts, plan names, states. Not for severity — use SeverityBadge. */
export interface BadgeProps {
  tone?: 'neutral' | 'accent' | 'success' | 'inverse';
  /** false gives the square default radius */
  pill?: boolean;
  mono?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}
export function Badge(props: BadgeProps): JSX.Element;
