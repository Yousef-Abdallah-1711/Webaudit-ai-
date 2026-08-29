import * as React from 'react';
/** Live scan progress. Elapsed time is always visible — a bar with no elapsed time reads as hung. */
export interface ProgressRowProps {
  /** m:ss, tabular numerals */
  elapsed?: string;
  phase: string;
  done?: number;
  total?: number;
  /** Says in words that closing the browser is safe */
  safeToClose?: boolean;
}
export function ProgressRow(props: ProgressRowProps): JSX.Element;
