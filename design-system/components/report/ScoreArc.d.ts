import * as React from 'react';
/**
 * Health score arc. Tabular numerals, band colour from the severity scale, 600ms reveal, once only.
 */
export interface ScoreArcProps {
  /** 0–100 */
  score: number;
  /** Change against the baseline scan, e.g. +23. Omit when there is no baseline. */
  delta?: number | null;
  size?: number;
  label?: string;
}
export function ScoreArc(props: ScoreArcProps): JSX.Element;
