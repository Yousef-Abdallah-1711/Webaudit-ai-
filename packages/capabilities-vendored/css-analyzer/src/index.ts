/**
 * T177 — css-analyzer: UI, CODE layer, source-only.
 *
 * The measured half of the design area. `impeccable` (T141) is the UI area's AI
 * layer and judges what a page looks like; this capability judges nothing. It
 * counts things in stylesheets that are true whatever the design intent is — a
 * declaration count, an `!important` count, a distinct-colour count — and
 * leaves the interpretation where Principle III puts it.
 *
 * **Three checks, each measuring the same underlying failure from a different
 * side: a stylesheet that has stopped being a system.** `!important` is what
 * specificity debt looks like when it is paid; a hundred distinct hex colours
 * is what a design system looks like when nobody adopted it; sheer weight is
 * what both look like from the network. None of the three is a bug, which is
 * why none is above MEDIUM — they are the measurements a designer needs before
 * an opinion is worth anything.
 *
 * **Preprocessor sources are read, compiled output is not.** A `.scss` file is
 * where a human would make the fix, so that is where the finding points. The
 * compiled `.css` beside it would double-report the same problem at a location
 * nobody edits. Where only compiled CSS exists, that is what gets reported —
 * a finding at an awkward location beats no finding.
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

const STYLE_EXTENSIONS = ['.css', '.scss', '.sass', '.less'];

/**
 * Thresholds, published rather than hidden in a condition.
 *
 * `!important` at 2% of declarations is the point at which overrides have
 * stopped being exceptions; 48 distinct colours is roughly double what a
 * deliberate palette needs (this repository's own design system publishes far
 * fewer); 300 KB of a single stylesheet is past any render-blocking budget.
 */
const IMPORTANT_RATIO = 0.02;
const IMPORTANT_FLOOR = 10;
const DISTINCT_COLOUR_LIMIT = 48;
const LARGE_STYLESHEET_BYTES = 307_200;

/** Files above this are summarised from a prefix rather than read whole. */
const MAX_READ_BYTES = 2_097_152;

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

function isVendored(path: string): boolean {
  const parts = path.split('/');
  return parts.includes('node_modules') || parts.includes('vendor');
}

function stylesheets(input: CapabilityInput): readonly CodeFile[] {
  const files = (input.code?.files ?? []).filter(
    (file) =>
      !isVendored(file.path) &&
      STYLE_EXTENSIONS.some((extension) => file.path.toLowerCase().endsWith(extension)) &&
      !file.path.toLowerCase().endsWith('.min.css'),
  );

  // Where a preprocessor source and its compiled output sit side by side, the
  // source is the file a human edits, so it is the only one reported.
  const preprocessed = new Set(
    files
      .filter((file) => !file.path.toLowerCase().endsWith('.css'))
      .map((file) => file.path.replace(/\.(scss|sass|less)$/i, '.css')),
  );

  return files
    .filter((file) => !preprocessed.has(file.path))
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Strip comments and string literals before counting anything inside them. */
function stripNoise(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(["'])(?:\\.|(?!\1)[^\\\r\n])*\1/g, '""');
}

export interface StylesheetMetrics {
  readonly declarations: number;
  readonly importants: number;
  readonly distinctColours: number;
}

/**
 * Counted with regular expressions rather than a CSS parser, for the same
 * reason `meta-checker` does not carry a DOM parser: no parser is a dependency
 * anywhere in this repository, and three counts do not need a syntax tree.
 * Comments and strings are removed first, which is where the realistic false
 * positives live — a hex colour inside a `content:` string, an `!important`
 * inside a commented-out block.
 */
export function measure(css: string): StylesheetMetrics {
  const cleaned = stripNoise(css);
  const declarations = (cleaned.match(/[^;{}]+:[^;{}]+[;}]/g) ?? []).length;
  const importants = (cleaned.match(/!\s*important/gi) ?? []).length;

  const colours = new Set<string>();
  for (const match of cleaned.matchAll(/#([0-9a-f]{3,8})\b/gi)) {
    const value = match[1]!.toLowerCase();
    if (value.length === 3 || value.length === 4 || value.length === 6 || value.length === 8) {
      // #abc and #aabbcc are the same colour, and counting them twice would
      // report a palette as sprawling because it is written two ways.
      colours.add(
        value.length <= 4
          ? value
              .split('')
              .map((character) => character + character)
              .join('')
          : value,
      );
    }
  }
  for (const match of cleaned.matchAll(/\brgba?\(([^)]{1,64})\)/gi)) {
    colours.add(`rgb(${match[1]!.replace(/\s+/g, '')})`);
  }

  return { declarations, importants, distinctColours: colours.size };
}

async function readStylesheet(ctx: CodeLayerContext, path: string): Promise<string | null> {
  try {
    const buffer = await ctx.readFile(path);
    return buffer.subarray(0, MAX_READ_BYTES).toString('utf8');
  } catch {
    return null;
  }
}

function kilobytes(bytes: number): string {
  return `${String(Math.round(bytes / 1024))} KB`;
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const findings: CapabilityFinding[] = [];

  for (const sheet of stylesheets(input)) {
    if (ctx.signal.aborted) break;

    if (sheet.sizeBytes >= LARGE_STYLESHEET_BYTES) {
      findings.push(
        finding(
          'css.oversize-stylesheet',
          ['css.oversize-stylesheet', sheet.path],
          'MEDIUM',
          `A stylesheet is ${kilobytes(sheet.sizeBytes)}`,
          `${sheet.path} is ${String(sheet.sizeBytes)} bytes, past the ` +
            `${kilobytes(LARGE_STYLESHEET_BYTES)} single-stylesheet budget.`,
          'CSS blocks rendering. A stylesheet this size delays first paint for every visitor, ' +
            'including the ones who never see the rules it contains.',
          sheet.path,
        ),
      );
    }

    const css = await readStylesheet(ctx, sheet.path);
    if (css === null) continue;
    const metrics = measure(css);

    if (
      metrics.importants >= IMPORTANT_FLOOR &&
      metrics.declarations > 0 &&
      metrics.importants / metrics.declarations > IMPORTANT_RATIO
    ) {
      findings.push(
        finding(
          'css.important-overuse',
          ['css.important-overuse', sheet.path],
          'MEDIUM',
          '!important is carrying the cascade',
          `${sheet.path} uses !important ${String(metrics.importants)} times across ` +
            `${String(metrics.declarations)} declarations — above the ` +
            `${String(Math.round(IMPORTANT_RATIO * 100))}% threshold at which overrides have ` +
            'stopped being exceptions.',
          'Each !important removes a rule from the cascade, so the next change needs another ' +
            'one. The cost is not this stylesheet; it is that every future style fix gets ' +
            'harder and more of them break something else.',
          sheet.path,
        ),
      );
    }

    if (metrics.distinctColours > DISTINCT_COLOUR_LIMIT) {
      findings.push(
        finding(
          'css.colour-sprawl',
          ['css.colour-sprawl', sheet.path],
          'LOW',
          `${String(metrics.distinctColours)} distinct hard-coded colours in one stylesheet`,
          `${sheet.path} declares ${String(metrics.distinctColours)} distinct literal colour ` +
            `values, past the ${String(DISTINCT_COLOUR_LIMIT)} a deliberate palette needs.`,
          'A palette this wide cannot be changed in one place, so a rebrand becomes a ' +
            'find-and-replace and accessibility contrast has to be re-checked value by value. ' +
            'Custom properties fix both at once.',
          sheet.path,
        ),
      );
    }
  }

  return findings;
}

async function reverify(issue: ReverifyRequest, ctx: CodeLayerContext): Promise<ReverifyResult> {
  const path = issue.location ?? '';
  if (path === '') {
    return { outcome: 'UNVERIFIABLE', reason: 'css-analyzer needs the recorded stylesheet path.' };
  }
  if (
    issue.checkId !== 'css.oversize-stylesheet' &&
    issue.checkId !== 'css.important-overuse' &&
    issue.checkId !== 'css.colour-sprawl'
  ) {
    return { outcome: 'UNVERIFIABLE', reason: `css-analyzer does not own ${issue.checkId}.` };
  }

  let buffer: Buffer;
  try {
    buffer = await ctx.readFile(path);
  } catch {
    return {
      outcome: 'UNVERIFIABLE',
      reason:
        'The audited source is destroyed when a scan ends (FR-090), so a stylesheet can only be ' +
        're-checked by attaching the source again and re-auditing.',
    };
  }

  if (issue.checkId === 'css.oversize-stylesheet') {
    return buffer.byteLength < LARGE_STYLESHEET_BYTES
      ? { outcome: 'PASSED' }
      : {
          outcome: 'FAILED',
          evidence: { path, sizeBytes: buffer.byteLength, limit: LARGE_STYLESHEET_BYTES },
        };
  }

  const metrics = measure(buffer.subarray(0, MAX_READ_BYTES).toString('utf8'));

  if (issue.checkId === 'css.important-overuse') {
    const overused =
      metrics.importants >= IMPORTANT_FLOOR &&
      metrics.declarations > 0 &&
      metrics.importants / metrics.declarations > IMPORTANT_RATIO;
    return overused
      ? {
          outcome: 'FAILED',
          evidence: {
            path,
            importants: metrics.importants,
            declarations: metrics.declarations,
          },
        }
      : { outcome: 'PASSED' };
  }

  return metrics.distinctColours > DISTINCT_COLOUR_LIMIT
    ? {
        outcome: 'FAILED',
        evidence: { path, distinctColours: metrics.distinctColours, limit: DISTINCT_COLOUR_LIMIT },
      }
    : { outcome: 'PASSED' };
}

export const cssAnalyzer: AuditCapability = {
  id: 'css-analyzer',
  module: 'UI',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => stylesheets(input).length > 0,
  runCodeLayer,
  reverify,
};

export default cssAnalyzer;
