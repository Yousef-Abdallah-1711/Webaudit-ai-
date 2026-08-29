import * as React from 'react';
/**
 * The severity scale, rendered. Always icon + text + colour — never colour alone.
 */
export interface SeverityBadgeProps {
  level?: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'resolved';
  /** Overrides the default word; keep it a word, never blank */
  label?: string;
  /** Optional trailing count, e.g. 3 */
  count?: number;
}
export function SeverityBadge(props: SeverityBadgeProps): JSX.Element;
