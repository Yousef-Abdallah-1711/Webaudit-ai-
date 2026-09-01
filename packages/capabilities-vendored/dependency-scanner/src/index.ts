/**
 * T175 — dependency-scanner: SECURITY, CODE layer, source-only.
 *
 * The first capability in this repository that reads the scan workspace rather
 * than fetching the served page, and the clearest answer to "why attach
 * source at all" (US4): a vulnerable transitive dependency is invisible from
 * outside, however carefully the response headers are measured.
 *
 * **Four checks, and only one of them consults the advisory set.** That split
 * is deliberate and is explained in `advisories.ts`: a vendored snapshot goes
 * stale, so the three checks that matter most over time are properties of the
 * project's own files. A missing lockfile and a floating range are both true
 * for ever once measured, and both describe the same underlying problem — the
 * project cannot say what it actually ships.
 *
 * **`canRun` reads the file *listing*, never the files.** `CapabilityInput.code`
 * carries paths and sizes, which is enough to answer "is there a manifest
 * here", and the conformance suite's `can-run-has-no-side-effects` check
 * enforces that a precondition test does not open a door. On a URL-only audit
 * `input.code` is absent, `canRun` is false, and the module reports the
 * capability NOT_APPLICABLE rather than failed (FR-021) — which is exactly
 * what T170 pins.
 *
 * **Re-verification is honest about the workspace being gone.** FR-090 destroys
 * the source on every exit path, so by the time a user presses "I fixed this"
 * there is nothing left to re-read. `reverify` attempts the read anyway — a
 * caller that *does* have a workspace gets a real answer — and returns
 * UNVERIFIABLE with a reason when it cannot, which is the answer FR-063 asks
 * for and never a guess in the green direction.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
  ReverifyRequest,
  ReverifyResult,
} from '@webaudit/capability-sdk';
import { advisoryFor, DEPRECATED_PACKAGES, type Advisory } from './advisories.js';

/** Lockfiles that pin a resolved version, in the order we prefer to find them. */
const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'npm-shrinkwrap.json'];

/** A specifier that resolves to whatever the registry offered most recently. */
const FLOATING_SPECIFIERS = /^(?:\*|x|latest|)$/i;

interface Manifest {
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
}

function finding(
  checkId: string,
  fingerprintParts: readonly string[],
  severity: CapabilityFinding['severity'],
  title: string,
  description: string,
  consequence: string,
  location: string,
): CapabilityFinding {
  return {
    checkId,
    fingerprintParts: [...fingerprintParts],
    severity,
    title,
    description,
    consequence,
    location,
    fixable: true,
  };
}

function asRecord(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, string> = {};
  for (const [name, specifier] of Object.entries(value as Record<string, unknown>)) {
    if (typeof specifier === 'string') out[name] = specifier;
  }
  return out;
}

function parseManifest(raw: string): Manifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  return {
    dependencies: asRecord(record['dependencies']),
    devDependencies: asRecord(record['devDependencies']),
  };
}

/**
 * An exact pinned version, or null for anything that is a range.
 *
 * `4.17.21` is exact. `^4.17.21`, `~4.17`, `>=4`, `*` and `latest` are not, and
 * the difference is the whole reason `advisoryFor` refuses to work on ranges.
 */
function exactVersion(specifier: string): string | null {
  const trimmed = specifier.trim();
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(trimmed) ? trimmed : null;
}

function isFloating(specifier: string): boolean {
  const trimmed = specifier.trim();
  return FLOATING_SPECIFIERS.test(trimmed) || /^\d+\.x$/i.test(trimmed) || trimmed === '';
}

/** Every `package.json` in the tree that is not inside an installed dependency. */
function manifestPaths(input: CapabilityInput): readonly string[] {
  const files = input.code?.files ?? [];
  return files
    .map((file) => file.path)
    .filter(
      (path) =>
        (path === 'package.json' || path.endsWith('/package.json')) &&
        !path.split('/').includes('node_modules'),
    )
    .sort();
}

function lockfilePaths(input: CapabilityInput): readonly string[] {
  const files = input.code?.files ?? [];
  return files
    .map((file) => file.path)
    .filter((path) => LOCKFILES.includes(path.split('/').at(-1) ?? ''));
}

/** The directory a manifest sits in, `''` for the repository root. */
function directoryOf(manifestPath: string): string {
  const cut = manifestPath.lastIndexOf('/');
  return cut === -1 ? '' : manifestPath.slice(0, cut);
}

function advisoryFinding(
  advisory: Advisory,
  packageName: string,
  version: string,
  location: string,
): CapabilityFinding {
  return finding(
    'dependency.known-vulnerable',
    ['dependency.known-vulnerable', packageName, advisory.id],
    advisory.severity,
    `${packageName}@${version} carries a published advisory`,
    `${advisory.id}: ${advisory.summary} Versions below ${advisory.fixedIn} are affected; this ` +
      `project pins ${version}.`,
    'A published advisory is a vulnerability someone has already written an exploit path for. ' +
      'It is the first thing an attacker checks and the first thing a security review asks about.',
    `${location} · ${packageName}@${version}`,
  );
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const findings: CapabilityFinding[] = [];
  const lockfiles = new Set(lockfilePaths(input));

  for (const manifestPath of manifestPaths(input)) {
    if (ctx.signal.aborted) break;

    const raw = (await ctx.readFile(manifestPath)).toString('utf8');
    const manifest = parseManifest(raw);
    if (manifest === null) {
      findings.push(
        finding(
          'dependency.unparseable-manifest',
          ['dependency.unparseable-manifest', manifestPath],
          'MEDIUM',
          'A package manifest could not be parsed',
          `${manifestPath} is not valid JSON, so its dependencies were not checked.`,
          'A manifest the tooling cannot read is a manifest no dependency check covers — ' +
            'including the ones your CI runs.',
          manifestPath,
        ),
      );
      continue;
    }

    const directory = directoryOf(manifestPath);
    const hasLockfile = LOCKFILES.some((name) =>
      lockfiles.has(directory === '' ? name : `${directory}/${name}`),
    );

    if (!hasLockfile) {
      findings.push(
        finding(
          'dependency.no-lockfile',
          ['dependency.no-lockfile', manifestPath],
          'MEDIUM',
          'No lockfile beside the package manifest',
          `${manifestPath} declares dependencies but no ${LOCKFILES.join(', ')} sits alongside it.`,
          'Without a lockfile, two installs of the same commit can produce different code. ' +
            'That makes a build unreproducible and means an audit of one install says nothing ' +
            'about the next.',
          manifestPath,
        ),
      );
    }

    const all = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const [packageName, specifier] of Object.entries(all)) {
      if (isFloating(specifier)) {
        findings.push(
          finding(
            'dependency.floating-range',
            ['dependency.floating-range', manifestPath, packageName],
            'MEDIUM',
            `${packageName} is pinned to a floating specifier`,
            `${manifestPath} requests "${packageName}": "${specifier}", which resolves to ` +
              'whatever the registry offers at install time.',
            'A dependency that can change without a commit can also change without a review. ' +
              'It is the shape every recent supply-chain compromise has travelled through.',
            `${manifestPath} · ${packageName}`,
          ),
        );
        continue;
      }

      const version = exactVersion(specifier);
      if (version === null) continue;

      const advisory = advisoryFor(packageName, version);
      if (advisory !== null) {
        findings.push(advisoryFinding(advisory, packageName, version, manifestPath));
      }
    }

    for (const packageName of Object.keys(all)) {
      const note = DEPRECATED_PACKAGES[packageName];
      if (note === undefined) continue;
      findings.push(
        finding(
          'dependency.deprecated-package',
          ['dependency.deprecated-package', manifestPath, packageName],
          'LOW',
          `${packageName} is no longer maintained`,
          `${manifestPath} depends on ${packageName}, which is ${note}.`,
          'An unmaintained dependency will not receive a fix when an advisory is published ' +
            'against it, so the only remedy available later is a migration under time pressure.',
          `${manifestPath} · ${packageName}`,
        ),
      );
    }
  }

  return findings;
}

/**
 * T153-shaped re-verification, with the workspace caveat this capability cannot
 * avoid. See the module note: a real workspace gets a real verdict, and its
 * absence is reported as UNVERIFIABLE rather than assumed green.
 */
async function reverify(issue: ReverifyRequest, ctx: CodeLayerContext): Promise<ReverifyResult> {
  const owned = [
    'dependency.known-vulnerable',
    'dependency.no-lockfile',
    'dependency.floating-range',
    'dependency.deprecated-package',
    'dependency.unparseable-manifest',
  ];
  if (!owned.includes(issue.checkId)) {
    return { outcome: 'UNVERIFIABLE', reason: `dependency-scanner does not own ${issue.checkId}.` };
  }

  // `location` is `<manifest path> · <package>@<version>` or just the manifest.
  const manifestPath = (issue.location ?? '').split(' · ')[0]?.trim() ?? '';
  if (manifestPath === '') {
    return {
      outcome: 'UNVERIFIABLE',
      reason: 'dependency-scanner needs the recorded manifest path to re-check.',
    };
  }

  let raw: string;
  try {
    raw = (await ctx.readFile(manifestPath)).toString('utf8');
  } catch {
    return {
      outcome: 'UNVERIFIABLE',
      reason:
        'The audited source is destroyed when a scan ends (FR-090), so this manifest can only ' +
        'be re-checked by attaching the source again and re-auditing.',
    };
  }

  const manifest = parseManifest(raw);
  if (manifest === null) {
    return issue.checkId === 'dependency.unparseable-manifest'
      ? { outcome: 'FAILED', evidence: { manifestPath, parseable: false } }
      : { outcome: 'UNVERIFIABLE', reason: 'The manifest is no longer valid JSON.' };
  }

  const all = { ...manifest.dependencies, ...manifest.devDependencies };
  const packageName = (issue.location ?? '').split(' · ')[1]?.split('@')[0]?.trim();

  switch (issue.checkId) {
    case 'dependency.unparseable-manifest':
      return { outcome: 'PASSED' };
    case 'dependency.deprecated-package':
      return packageName !== undefined && packageName in all
        ? { outcome: 'FAILED', evidence: { manifestPath, stillDeclared: packageName } }
        : { outcome: 'PASSED' };
    case 'dependency.floating-range': {
      if (packageName === undefined) {
        return { outcome: 'UNVERIFIABLE', reason: 'The recorded location names no package.' };
      }
      const specifier = all[packageName];
      return specifier === undefined || !isFloating(specifier)
        ? { outcome: 'PASSED' }
        : { outcome: 'FAILED', evidence: { manifestPath, packageName, specifier } };
    }
    case 'dependency.known-vulnerable': {
      if (packageName === undefined) {
        return { outcome: 'UNVERIFIABLE', reason: 'The recorded location names no package.' };
      }
      const specifier = all[packageName];
      if (specifier === undefined) return { outcome: 'PASSED' };
      const version = exactVersion(specifier);
      if (version === null) {
        // Swapping an advisory-bearing pin for a range is not a fix; it is the
        // same exposure with the evidence removed.
        return {
          outcome: 'FAILED',
          evidence: {
            manifestPath,
            packageName,
            specifier,
            note: 'the pin is now a range, so the installed version cannot be verified',
          },
        };
      }
      const advisory = advisoryFor(packageName, version);
      return advisory === null
        ? { outcome: 'PASSED' }
        : {
            outcome: 'FAILED',
            evidence: { manifestPath, packageName, version, advisory: advisory.id },
          };
    }
    default:
      // dependency.no-lockfile — a lockfile's presence is a listing question,
      // and `reverify` has no listing. `ctx.glob` is confined to the workspace,
      // so it answers this honestly when a workspace exists.
      break;
  }

  const found = await ctx
    .glob(directoryOf(manifestPath) === '' ? '*' : `${directoryOf(manifestPath)}/*`)
    .catch(() => [] as readonly string[]);
  const hasLockfile = found.some((path) => LOCKFILES.includes(path.split('/').at(-1) ?? ''));
  return hasLockfile
    ? { outcome: 'PASSED' }
    : { outcome: 'FAILED', evidence: { manifestPath, lockfileFound: false } };
}

export const dependencyScanner: AuditCapability = {
  id: 'dependency-scanner',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => manifestPaths(input).length > 0,
  runCodeLayer,
  reverify,
};

export default dependencyScanner;
