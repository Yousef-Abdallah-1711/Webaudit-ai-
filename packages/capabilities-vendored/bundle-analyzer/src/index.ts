/**
 * T176 — bundle-analyzer: PERFORMANCE, CODE layer, source-only.
 *
 * What a served page cannot tell you: `network-inspector` (T137) measures the
 * bundle a visitor downloads, which is the right measurement and the wrong
 * question when the answer is "why". A built asset in the repository can be
 * weighed, checked for minification, and searched for the `sourceMappingURL`
 * comment that says the original source is published beside it — none of which
 * is visible from a response body alone.
 *
 * **The build output, not the sources.** Every check below is scoped to
 * directories a bundler writes into, because a 900 KB file in `src/` is a large
 * module and a 900 KB file in `dist/` is a large *download*. Getting this
 * wrong would report every well-structured monorepo as a performance problem.
 * `node_modules` is excluded for the same reason: nobody ships it, and its
 * weight says nothing about what a visitor fetches.
 *
 * **Byte counts come from the file listing, not from reading the files.**
 * `CodeFile` already carries `sizeBytes`, so the weight check costs no I/O at
 * all. Only the minification and source-map checks read.
 *
 * **Head for minification, tail for the source map.** Not symmetry for its own
 * sake: `//# sourceMappingURL=` is written as the *last* line of a bundle by
 * every tool that writes it, so a head-only reader finds it on hand-written
 * files and misses it on exactly the generated ones this check exists for.
 * Minification, conversely, is established from the first lines. Both slices
 * are bounded because a 4 MB bundle does not need to be scanned end to end to
 * answer either question.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeFile,
  CodeLayerContext,
  ReverifyRequest,
  ReverifyResult,
} from '@webaudit/capability-sdk';

/** Directory names a bundler writes into. A path segment match, not a prefix. */
const BUILD_DIRECTORIES = [
  'dist',
  'build',
  'out',
  '.next',
  '.output',
  'public',
  'static',
  'assets',
];

const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs'];

/**
 * Thresholds, published here rather than buried in a condition.
 *
 * 250 KB is the widely-cited budget for a page's total compressed JavaScript;
 * a single uncompressed asset past 512 KB is comfortably over it once one
 * accounts for the rest of the page. These are engineering defaults, and a
 * capability that reported at 100 KB would produce a finding on almost every
 * real application — a check everyone ignores is worse than no check.
 */
const LARGE_SCRIPT_BYTES = 524_288;
const HUGE_SCRIPT_BYTES = 1_572_864;

/** How much of an asset's start the minification heuristic considers. */
const HEAD_BYTES = 65_536;
/** How much of an asset's end is searched for a `sourceMappingURL` comment. */
const TAIL_BYTES = 4_096;

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

function segments(path: string): readonly string[] {
  return path.split('/');
}

function isBuildOutput(path: string): boolean {
  const parts = segments(path);
  return !parts.includes('node_modules') && parts.some((part) => BUILD_DIRECTORIES.includes(part));
}

function hasExtension(path: string, extensions: readonly string[]): boolean {
  return extensions.some((extension) => path.toLowerCase().endsWith(extension));
}

/** Built scripts, largest first, so the report leads with the worst offender. */
function builtScripts(input: CapabilityInput): readonly CodeFile[] {
  return (input.code?.files ?? [])
    .filter(
      (file) =>
        isBuildOutput(file.path) &&
        hasExtension(file.path, SCRIPT_EXTENSIONS) &&
        !file.path.endsWith('.min.js'),
    )
    .slice()
    .sort((a, b) => b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path));
}

function allBuiltScripts(input: CapabilityInput): readonly CodeFile[] {
  return (input.code?.files ?? []).filter(
    (file) => isBuildOutput(file.path) && hasExtension(file.path, SCRIPT_EXTENSIONS),
  );
}

function sourceMaps(input: CapabilityInput): readonly CodeFile[] {
  return (input.code?.files ?? [])
    .filter((file) => isBuildOutput(file.path) && file.path.toLowerCase().endsWith('.js.map'))
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path));
}

function kilobytes(bytes: number): string {
  return `${String(Math.round(bytes / 1024))} KB`;
}

/**
 * Does this look like output a minifier produced?
 *
 * Average line length is the discriminator that survives contact with reality.
 * A minified bundle is a handful of enormous lines; readable source is many
 * short ones. Counting newlines is cheap, has no false positive on a file that
 * merely lacks comments, and — unlike looking for whitespace — is not defeated
 * by a bundler that strips comments without collapsing statements.
 */
function looksMinified(prefix: string): boolean {
  const lines = prefix.split('\n');
  if (lines.length <= 1) return true;
  return prefix.length / lines.length > 200;
}

function sourceMapComment(prefix: string): string | null {
  const match = /\/\/[#@]\s*sourceMappingURL=(\S+)/.exec(prefix);
  return match?.[1] ?? null;
}

interface AssetSlices {
  readonly head: string;
  readonly tail: string;
}

function slice(buffer: Buffer): AssetSlices {
  return {
    head: buffer.subarray(0, HEAD_BYTES).toString('utf8'),
    tail: buffer.subarray(Math.max(0, buffer.byteLength - TAIL_BYTES)).toString('utf8'),
  };
}

async function readSlices(ctx: CodeLayerContext, path: string): Promise<AssetSlices | null> {
  try {
    return slice(await ctx.readFile(path));
  } catch {
    return null;
  }
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const findings: CapabilityFinding[] = [];

  for (const script of builtScripts(input)) {
    if (ctx.signal.aborted) break;
    if (script.sizeBytes < LARGE_SCRIPT_BYTES) continue;

    findings.push(
      finding(
        'bundle.oversize-script',
        ['bundle.oversize-script', script.path],
        script.sizeBytes >= HUGE_SCRIPT_BYTES ? 'HIGH' : 'MEDIUM',
        `A built script is ${kilobytes(script.sizeBytes)}`,
        `${script.path} is ${String(script.sizeBytes)} bytes of JavaScript in build output, past ` +
          `the ${kilobytes(LARGE_SCRIPT_BYTES)} single-asset budget.`,
        'Every byte of JavaScript is downloaded, parsed, and compiled before the page becomes ' +
          'interactive. A bundle this size delays interactivity on exactly the devices least ' +
          'able to absorb it.',
        script.path,
      ),
    );
  }

  for (const script of allBuiltScripts(input)) {
    if (ctx.signal.aborted) break;
    // Reading is the expensive part, so it is confined to assets heavy enough
    // for the answer to change a decision.
    if (script.sizeBytes < LARGE_SCRIPT_BYTES / 4) continue;

    const slices = await readSlices(ctx, script.path);
    if (slices === null) continue;

    if (!looksMinified(slices.head)) {
      findings.push(
        finding(
          'bundle.unminified-output',
          ['bundle.unminified-output', script.path],
          'MEDIUM',
          'A build asset ships unminified',
          `${script.path} is ${kilobytes(script.sizeBytes)} of build output whose formatting is ` +
            'still that of readable source.',
          'Minification is the cheapest weight reduction available and needs no code change. ' +
            'Shipping without it means every visitor pays for whitespace and identifier length.',
          script.path,
        ),
      );
    }

    const mapUrl = sourceMapComment(slices.tail);
    if (mapUrl !== null && !mapUrl.startsWith('data:')) {
      const mapPath = script.path.replace(/[^/]+$/, mapUrl.split('/').at(-1) ?? '');
      const published = sourceMaps(input).some((file) => file.path === mapPath);
      if (published) {
        findings.push(
          finding(
            'bundle.source-map-published',
            ['bundle.source-map-published', script.path],
            'LOW',
            'A source map is published beside the bundle it maps',
            `${script.path} points at ${mapUrl}, and ${mapPath} is present in the same build ` +
              'output, so the original source is downloadable by anyone.',
            'A published source map hands over your unminified source, including comments and ' +
              'internal module names. It is not a vulnerability on its own, but it removes the ' +
              'effort from reading your implementation.',
            script.path,
          ),
        );
      }
    }
  }

  return findings;
}

async function reverify(issue: ReverifyRequest, ctx: CodeLayerContext): Promise<ReverifyResult> {
  const path = issue.location ?? '';
  if (path === '') {
    return { outcome: 'UNVERIFIABLE', reason: 'bundle-analyzer needs the recorded asset path.' };
  }

  if (
    issue.checkId !== 'bundle.oversize-script' &&
    issue.checkId !== 'bundle.unminified-output' &&
    issue.checkId !== 'bundle.source-map-published'
  ) {
    return { outcome: 'UNVERIFIABLE', reason: `bundle-analyzer does not own ${issue.checkId}.` };
  }

  let buffer: Buffer;
  try {
    buffer = await ctx.readFile(path);
  } catch {
    // Either the asset is genuinely gone or — far more likely — the scan
    // workspace was destroyed when the audit ended (FR-090). Those two are
    // indistinguishable from here, and only one of them is a fix, so this
    // never reports PASSED on the ambiguity.
    return {
      outcome: 'UNVERIFIABLE',
      reason:
        'The audited source is destroyed when a scan ends (FR-090), so a built asset can only ' +
        'be re-checked by attaching the source again and re-auditing.',
    };
  }

  if (issue.checkId === 'bundle.oversize-script') {
    return buffer.byteLength < LARGE_SCRIPT_BYTES
      ? { outcome: 'PASSED' }
      : {
          outcome: 'FAILED',
          evidence: { path, sizeBytes: buffer.byteLength, limit: LARGE_SCRIPT_BYTES },
        };
  }

  const slices = slice(buffer);

  if (issue.checkId === 'bundle.unminified-output') {
    return looksMinified(slices.head)
      ? { outcome: 'PASSED' }
      : { outcome: 'FAILED', evidence: { path, minified: false } };
  }

  const mapUrl = sourceMapComment(slices.tail);
  if (mapUrl === null || mapUrl.startsWith('data:')) return { outcome: 'PASSED' };
  const mapPath = path.replace(/[^/]+$/, mapUrl.split('/').at(-1) ?? '');
  const stillThere = await ctx.readFile(mapPath).then(
    () => true,
    () => false,
  );
  return stillThere
    ? { outcome: 'FAILED', evidence: { path, sourceMap: mapPath } }
    : { outcome: 'PASSED' };
}

export const bundleAnalyzer: AuditCapability = {
  id: 'bundle-analyzer',
  module: 'PERFORMANCE',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => allBuiltScripts(input).length > 0,
  runCodeLayer,
  reverify,
};

export default bundleAnalyzer;
