import * as React from 'react';
/**
 * The finish line, and the only place visual celebration is allowed.
 */
export interface VerdictPanelProps {
  verdict?: 'go' | 'no-go';
  score?: number;
  /** Baseline scan score; renders the delta when present */
  baseline?: number;
  /** Named blockers — required for a no-go, never a bare refusal */
  blockers?: string[];
  areas?: { name: string; score: number; threshold: number; pass: boolean }[];
}
export function VerdictPanel(props: VerdictPanelProps): JSX.Element;
