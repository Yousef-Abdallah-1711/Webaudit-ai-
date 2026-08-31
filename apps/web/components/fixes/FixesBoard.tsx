'use client';

/**
 * T155 — the fixes board, ported from `FixesScreen` in
 * `design-system/ui_kits/app/Screens.jsx`, wired to `GET /scans/:id/issues`
 * instead of the source's static `ISSUES` fixture and its in-memory
 * `useState` toggle.
 *
 * FR-057: "present every issue from every area of an audit in a single
 * tracker, with counts of what is outstanding and what is resolved." The
 * `StatRow` above the list is those counts; the list is every issue, ordered
 * by severity then by whether it is still outstanding — resolved rows sink to
 * the bottom, exactly as the source's `sev-resolved` styling implies.
 *
 * The board does no network itself: `fixes/page.tsx` owns fetching, the
 * realtime subscription, and the `assertIssueFixed` call. This component is
 * presentational so its unit test needs no mocked `fetch`.
 */

import { StatRow } from '../ui';
import { IssueRow } from './IssueRow';
import type { FixesIssue } from '../../lib/api';
import styles from './FixesBoard.module.css';

const SEVERITY_RANK: Readonly<Record<string, number>> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

function isOutstanding(issue: FixesIssue): boolean {
  return issue.state !== 'RESOLVED';
}

export interface FixesBoardProps {
  issues: readonly FixesIssue[];
  /** issueId → current failing evidence from its most recent FAILED re-check. */
  failingEvidence?: Readonly<Record<string, unknown>>;
  onAssertFixed: (issueId: string) => void;
}

export function FixesBoard({
  issues,
  failingEvidence = {},
  onAssertFixed,
}: FixesBoardProps): React.ReactElement {
  const outstanding = issues.filter(isOutstanding);
  const counts = [
    { value: outstanding.filter((i) => i.severity === 'CRITICAL').length, label: 'critical' },
    { value: outstanding.filter((i) => i.severity === 'HIGH').length, label: 'high' },
    {
      value: outstanding.filter((i) => i.severity === 'MEDIUM' || i.severity === 'LOW').length,
      label: 'medium and low',
    },
    { value: issues.filter((i) => i.state === 'RESOLVED').length, label: 'resolved' },
  ];

  const ordered = [...issues].sort((a, b) => {
    const aOut = isOutstanding(a) ? 0 : 1;
    const bOut = isOutstanding(b) ? 0 : 1;
    if (aOut !== bOut) return aOut - bOut;
    const bySeverity = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (bySeverity !== 0) return bySeverity;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return (
    <div>
      <div className={styles.stats}>
        <StatRow items={counts} />
      </div>

      {ordered.length === 0 ? (
        <p className={styles.empty}>This audit produced no issues.</p>
      ) : (
        <div className={styles.list}>
          {ordered.map((issue, index) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              first={index === 0}
              failingEvidence={failingEvidence[issue.id]}
              onAssertFixed={onAssertFixed}
            />
          ))}
        </div>
      )}

      <p className={styles.note}>
        Marking an issue fixed runs one narrow check. It turns green only when that check passes.
      </p>
    </div>
  );
}
