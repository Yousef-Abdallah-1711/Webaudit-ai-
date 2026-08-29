import * as React from 'react';
/**
 * One finding. 3px left rule in the severity colour — the one exception to square-by-default.
 */
export interface IssueCardProps {
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'resolved';
  title: string;
  /** Selector, header name, or file path — rendered in mono */
  location?: string;
  description?: string;
  /** FR-032: required on every delivered issue */
  attribution?: 'measured' | 'ai-judgment';
  /** The paste-ready remediation prompt; presence renders the copy button */
  prompt?: string;
  area?: string;
  onCopy?: (prompt: string) => void;
}
export function IssueCard(props: IssueCardProps): JSX.Element;
