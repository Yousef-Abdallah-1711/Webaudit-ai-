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
import { useTranslations } from 'next-intl';
import { IssueRow } from './IssueRow';
import type { FixesIssue } from '../../lib/api';
const styles = {
  stats: 'mb-4',
  list: 'border border-solid border-hairline border-border-default bg-surface-page rounded-card overflow-hidden',
  empty: 'm-0 border border-solid border-hairline border-border-default rounded-card p-6 font-sans text-[0.875rem] leading-5 font-normal text-text-secondary',
  note: 'mt-[0.875rem] font-sans text-[0.875rem] leading-5 font-normal text-text-muted',
} as const;

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
  const t = useTranslations('fixes');
  const outstanding = issues.filter(isOutstanding);
  const counts = [
    {
      value: t('fixes_count_only', {
        count: outstanding.filter((i) => i.severity === 'CRITICAL').length,
      }),
      label: t('fixes_stat_critical'),
    },
    {
      value: t('fixes_count_only', {
        count: outstanding.filter((i) => i.severity === 'HIGH').length,
      }),
      label: t('fixes_stat_high'),
    },
    {
      value: t('fixes_count_only', {
        count: outstanding.filter((i) => i.severity === 'MEDIUM' || i.severity === 'LOW').length,
      }),
      label: t('fixes_stat_medium_low'),
    },
    {
      value: t('fixes_count_only', {
        count: issues.filter((i) => i.state === 'RESOLVED').length,
      }),
      label: t('fixes_stat_resolved'),
    },
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
        <p className={styles.empty}>{t('fixes_empty')}</p>
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

      <p className={styles.note}>{t('fixes_note')}</p>
    </div>
  );
}
