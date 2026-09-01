/**
 * The vendored advisory set.
 *
 * **Why this is a file and not an API call.** Principle II and FR-024: nothing
 * is fetched from a third party while an audit is running, and "deleting an
 * upstream repo must change nothing". Every dependency scanner in the industry
 * works by querying an advisory service at scan time; this one cannot, so the
 * data has to live here, in full, versioned with the code that reads it.
 *
 * **What that costs, stated plainly rather than hidden.** This list is a
 * snapshot, so it goes stale, and a finding's absence is not evidence that a
 * dependency is safe. That is why `dependency.known-vulnerable` is the only
 * check here that consults it and why the other three checks are properties of
 * the manifest itself — a floating range or a missing lockfile is measurable
 * from the source alone and stays true however old this file gets. Refreshing
 * the set is a vendoring task (`scripts/capability-update.ts`), the same
 * process every other vendored artifact uses, not a runtime fetch.
 *
 * Each entry names a real published advisory so a user can go and read it. The
 * set is deliberately small: a handful of advisories that are genuinely
 * well-known is more honest than a partial mirror that implies completeness.
 */

export interface Advisory {
  /** npm package name, exactly as it appears in a manifest. */
  readonly package: string;
  /** Every version strictly below this one is affected. */
  readonly fixedIn: string;
  /** Versions at or above this are affected. Absent means "from 0.0.0". */
  readonly introducedIn?: string;
  readonly id: string;
  readonly severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  readonly summary: string;
}

export const ADVISORIES: readonly Advisory[] = [
  {
    package: 'serialize-javascript',
    fixedIn: '6.0.2',
    id: 'GHSA-hxcc-f52p-wc94',
    severity: 'CRITICAL',
    summary: 'Cross-site scripting through unsanitised regular-expression serialisation.',
  },
  {
    package: 'minimist',
    fixedIn: '1.2.6',
    id: 'GHSA-xvch-5gv4-984h',
    severity: 'CRITICAL',
    summary: 'Prototype pollution through crafted command-line arguments.',
  },
  {
    package: 'lodash',
    fixedIn: '4.17.21',
    id: 'GHSA-35jh-r3h4-6jhm',
    severity: 'HIGH',
    summary: 'Command injection through the template function.',
  },
  {
    package: 'axios',
    fixedIn: '1.6.0',
    introducedIn: '0.8.1',
    id: 'GHSA-wf5p-g6vw-rhxx',
    severity: 'HIGH',
    summary: 'Cross-site request forgery through an unconditionally attached secret header.',
  },
  {
    package: 'semver',
    fixedIn: '7.5.2',
    id: 'GHSA-c2qf-rxjj-qqgw',
    severity: 'MEDIUM',
    summary: 'Denial of service through a regular expression with exponential backtracking.',
  },
  {
    package: 'tar',
    fixedIn: '6.2.1',
    id: 'GHSA-f5x3-32g6-xq36',
    severity: 'HIGH',
    summary: 'Arbitrary file write through insufficient symbolic-link protection.',
  },
  {
    package: 'ws',
    fixedIn: '8.17.1',
    introducedIn: '8.0.0',
    id: 'GHSA-3h5v-q93c-6h6q',
    severity: 'HIGH',
    summary: 'Denial of service through an unbounded number of request headers.',
  },
];

/**
 * Packages whose maintainers have marked them end-of-life on the registry.
 *
 * Separate from the advisory set because a deprecation is not a vulnerability:
 * it is a maintenance finding, reported at a lower severity, and it stays true
 * regardless of which version is pinned.
 */
export const DEPRECATED_PACKAGES: Readonly<Record<string, string>> = {
  request: 'unmaintained since 2020; no security fixes are published for it',
  'left-pad': 'superseded by String.prototype.padStart, which is built in',
  'node-uuid': 'renamed to uuid; the old name receives no updates',
  istanbul: 'superseded by nyc',
  'core-js@2': 'version 2 receives no updates; version 3 is maintained',
  tslint: 'deprecated in favour of typescript-eslint',
};

/** Numeric-prefix comparison. Returns <0, 0, or >0, like a sort comparator. */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string): number[] =>
    version
      .replace(/^[^0-9]*/, '')
      .split('-')[0]!
      .split('.')
      .map((piece) => Number.parseInt(piece, 10))
      .map((value) => (Number.isFinite(value) ? value : 0));

  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The advisory affecting this exact resolved version, if any.
 *
 * **Resolved versions only.** A range like `^4.17.0` says nothing about what is
 * installed — `^` resolves to whatever the registry offered on the day the
 * lockfile was written. Matching a range against an advisory would report a
 * vulnerability for a project that has the fixed version installed, and the
 * cost of a false CRITICAL here is a user who stops believing the report.
 * Ranges are handled by `dependency.floating-range` instead, which is a
 * different, honest finding: "we cannot tell what you are running."
 */
export function advisoryFor(packageName: string, resolvedVersion: string): Advisory | null {
  for (const advisory of ADVISORIES) {
    if (advisory.package !== packageName) continue;
    if (compareVersions(resolvedVersion, advisory.fixedIn) >= 0) continue;
    if (
      advisory.introducedIn !== undefined &&
      compareVersions(resolvedVersion, advisory.introducedIn) < 0
    ) {
      continue;
    }
    return advisory;
  }
  return null;
}
