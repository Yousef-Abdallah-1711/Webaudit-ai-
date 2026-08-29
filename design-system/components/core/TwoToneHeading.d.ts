import * as React from 'react';
/**
 * The signature headline: first clause in text-primary, second in the accent.
 */
export interface TwoToneHeadingProps {
  /** First clause, rendered in --text-primary */
  lead: string;
  /** Second clause, rendered in --accent */
  accent: string;
  level?: 'display' | 'h2';
  align?: 'left' | 'center';
  as?: 'h1' | 'h2' | 'h3';
}
export function TwoToneHeading(props: TwoToneHeadingProps): JSX.Element;
