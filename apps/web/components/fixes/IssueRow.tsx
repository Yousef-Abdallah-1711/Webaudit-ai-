'use client';

/**
 * T156 — one row of the fixes board, extracted from the inline row in
 * `FixesScreen` (`design-system/ui_kits/app/Screens.jsx`).
 *
 * **Failing evidence is inline, in mono, never behind a click** (FR-061). The
 * source renders the "Re-check failed — current evidence" block directly in
 * the row when a re-check fails; this keeps that, because a negative verdict
 * the user has to expand to read is the terse response FR-061 forbids.
 *
 * **"I fixed this — 3 cr" is a real, always-visible button**, matching the
 * source and `IssueCard.prompt.md`'s rule for its own copy control. While a
 * re-check is running (`state === 'ASSERTED_FIXED'`) it reads "Re-checking…"
 * and is disabled; a resolved issue reads "Verified" with the timestamp.
 */

import { SeverityBadge, type SeverityBadgeProps } from '../report';
import type { FixesIssue } from '../../lib/api';
import styles from './IssueRow.module.css';

const SEVERITY_RULE: Record<NonNullable<SeverityBadgeProps['level']>, string> = {
  critical: 'var(--sev-critical)',
  high: 'var(--sev-high)',
  medium: 'var(--sev-medium)',
  low: 'var(--sev-low)',
  info: 'var(--sev-info)',
  resolved: 'var(--sev-resolved)',
};

const SEVERITY_CASE: Record<string, NonNullable<SeverityBadgeProps['level']>> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};

function timeOf(iso: string | null): string {
  if (iso === null) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface IssueRowProps {
  issue: FixesIssue;
  /** Current failing evidence from the most recent FAILED re-check, if any. */
  failingEvidence?: unknown;
  first?: boolean;
  onAssertFixed: (issueId: string) => void;
}

export function IssueRow({
  issue,
  failingEvidence,
  first = false,
  onAssertFixed,
}: IssueRowProps): React.ReactElement {
  const resolved = issue.state === 'RESOLVED';
  const checking = issue.state === 'ASSERTED_FIXED';
  const level = resolved ? 'resolved' : (SEVERITY_CASE[issue.severity] ?? 'info');

  const rowClass = [styles.row, first ? '' : styles.rowBordered, resolved ? styles.rowResolved : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClass} style={{ borderInlineStartColor: SEVERITY_RULE[level] }}>
      <div className={styles.head}>
        <SeverityBadge level={level} />
        <span className={styles.title}>{issue.title}</span>
        <span className={styles.actions}>
          {resolved && (
            <span className={styles.verified}>verified {timeOf(issue.resolvedAt)}</span>
          )}
          {issue.previouslyResolved && !resolved && (
            <span className={styles.regressed}>regressed</span>
          )}
          <button
            type="button"
            className={styles.assertBtn}
            disabled={resolved || checking}
            onClick={() => {
              onAssertFixed(issue.id);
            }}
          >
            {resolved ? 'Verified' : checking ? 'Re-checking…' : 'I fixed this — 3 cr'}
          </button>
        </span>
      </div>

      {issue.location !== null && (
        <div dir="ltr" className={styles.location}>
          {issue.location}
        </div>
      )}

      {issue.state === 'UNVERIFIABLE' && (
        <div className={styles.unverifiable}>
          This issue has no automated re-check. Re-run the audit to confirm it is fixed.
        </div>
      )}

      {failingEvidence !== undefined && !resolved && !checking && (
        <div className={styles.evidence}>
          <div className={styles.evidenceLabel}>Re-check failed — current evidence</div>
          <pre className={styles.evidenceBody}>{formatEvidence(failingEvidence)}</pre>
        </div>
      )}
    </div>
  );
}

function formatEvidence(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
