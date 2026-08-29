import * as React from 'react';
/**
 * One audit area's state. The five states must remain visually distinct — an incomplete
 * area may never read as a pass (FR-053).
 */
export interface ModuleStatusProps {
  /** Area name, e.g. "Security" */
  area: string;
  state?: 'waiting' | 'running' | 'complete' | 'degraded' | 'not-applicable';
  /** Plain-words explanation, required when degraded or not-applicable */
  detail?: string;
  issues?: number | null;
  /** Stacked two-line layout for columns narrower than ~300px */
  compact?: boolean;
}
export function ModuleStatus(props: ModuleStatusProps): JSX.Element;
