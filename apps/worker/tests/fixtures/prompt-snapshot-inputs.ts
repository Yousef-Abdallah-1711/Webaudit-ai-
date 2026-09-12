/**
 * T309 — fixed, representative measured-findings sets for the prompt
 * output-stability snapshots. Data only, no logic. Each case name documents
 * why it was chosen; do not add cases without the same justification.
 */
import type { CapabilityFinding } from '@webaudit/types';

export interface SnapshotCase {
  readonly name: string;
  readonly findings: readonly CapabilityFinding[];
}

const NO_FINDINGS: SnapshotCase = {
  name: 'no findings',
  findings: [],
};

const ONE_CRITICAL: SnapshotCase = {
  name: 'one critical finding',
  findings: [
    {
      checkId: 'headers.csp-missing',
      fingerprintParts: ['headers.csp-missing', '/'],
      severity: 'CRITICAL',
      title: 'Content-Security-Policy header is missing',
      description: 'No Content-Security-Policy header was present on the response.',
      location: '/',
      fixable: true,
    },
  ],
};

const MIXED_SEVERITY: SnapshotCase = {
  name: 'several findings of mixed severity',
  findings: [
    ONE_CRITICAL.findings[0]!,
    {
      checkId: 'headers.hsts-missing',
      fingerprintParts: ['headers.hsts-missing', '/'],
      severity: 'MEDIUM',
      title: 'Strict-Transport-Security header is missing',
      description: 'No HSTS header was present on the response.',
      location: '/',
      fixable: true,
    },
    {
      checkId: 'deps.outdated',
      fingerprintParts: ['deps.outdated', 'lodash'],
      severity: 'LOW',
      title: 'Dependency lodash is several major versions behind',
      description: 'lodash@2.4.2 is installed; the current major is 4.x.',
      fixable: true,
    },
  ],
};

/** Cases every module snapshot test iterates over. */
export const SNAPSHOT_CASES: readonly SnapshotCase[] = [NO_FINDINGS, ONE_CRITICAL, MIXED_SEVERITY];
