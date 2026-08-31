/**
 * T121 — data-leak-scanner: credential-shaped secrets, wherever the audit
 * has content to look at.
 *
 * **Delegates detection to `@webaudit/redaction` rather than reimplementing
 * it.** R8/FR-056 already define what counts as a secret and how it is
 * reported without the value ever leaving the package boundary —
 * `assemblePrompt` scans every segment it is given and `secretsToFindings`
 * turns what it found into `CapabilityFinding[]` directly assignable here
 * (`SecretFinding` is a type alias for `CapabilityFinding`). Reimplementing
 * detection regexes in this capability would duplicate that logic and risk
 * drifting from it — the one place credential patterns are allowed to live.
 *
 * Two sources, depending on what this scan attached:
 *
 * - **Source code, when attached** (`input.code`): every file under a size
 *   bound, read via `ctx.readFile` — never a raw filesystem call, so the
 *   workspace-confinement guarantee in `context.ts` still applies.
 * - **The fetched page, when it is not**: the vertical slice this ships in
 *   is URL-only (no source attached), and a leaked key pasted into inline
 *   markup or a `<script>` block is a real, common finding a URL-only audit
 *   can still catch.
 *
 * Both sources bound how much is scanned — `assemblePrompt`'s own
 * `maxSegmentChars` truncates per segment, but the file *count* is bounded
 * here so a source tree with thousands of files does not turn one scan into
 * thousands of `ctx.readFile` calls.
 */

import {
  assemblePrompt,
  secretsToFindings,
  SECRET_CHECK_ID,
  type RedactedSecretRef,
} from '@webaudit/redaction';
import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
  ReverifyRequest,
  ReverifyResult,
} from '@webaudit/capability-sdk';

const MAX_FILES = 200;
const MAX_FILE_BYTES = 256 * 1024;
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot',
  '.mp4', '.mp3', '.zip', '.gz', '.tar', '.pdf', '.wasm',
]);

function looksBinary(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return false;
  return BINARY_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

async function scanAttachedCode(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<readonly RedactedSecretRef[]> {
  const files = (input.code?.files ?? [])
    .filter((file) => !looksBinary(file.path) && file.sizeBytes <= MAX_FILE_BYTES)
    .slice(0, MAX_FILES);

  const segments = [];
  for (const file of files) {
    if (ctx.signal.aborted) break;
    try {
      const content = await ctx.readFile(file.path);
      segments.push({ label: 'source', path: file.path, content: content.toString('utf8') });
    } catch {
      // A file that cannot be read is not this capability's finding to make.
      continue;
    }
  }
  if (segments.length === 0) return [];
  return assemblePrompt({ instructions: '', segments }).secrets;
}

async function scanFetchedPage(
  targetUrl: string,
  ctx: CodeLayerContext,
): Promise<readonly RedactedSecretRef[]> {
  const response = await ctx.fetch(targetUrl, { signal: ctx.signal });
  const content = response.text();
  return assemblePrompt({
    instructions: '',
    segments: [{ label: 'fetched-page', path: response.url, content }],
  }).secrets;
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const secrets: RedactedSecretRef[] =
    input.code !== undefined
      ? [...(await scanAttachedCode(input, ctx))]
      : [...(await scanFetchedPage(input.targetUrl!, ctx))];

  return [...secretsToFindings(secrets)];
}

/**
 * T153 — the narrow re-check.
 *
 * **URL-only, and kind-granular rather than instance-granular.** The re-check
 * context has no attached-source workspace (`ctx.readFile` is unavailable),
 * so this re-fetches the recorded page and re-scans it. It can tell whether a
 * credential of the flagged *kind* still appears in the page, not whether the
 * exact one this issue named is the one still there — so a page that had two
 * keys and lost one still reads `FAILED` for both issues until the page is
 * clean of that kind. That is the safe direction: it never reports `PASSED`
 * while any matching credential remains (SC-007).
 */
async function reverify(issue: ReverifyRequest, ctx: CodeLayerContext): Promise<ReverifyResult> {
  if (issue.checkId !== SECRET_CHECK_ID) {
    return { outcome: 'UNVERIFIABLE', reason: `data-leak-scanner does not own ${issue.checkId}.` };
  }
  if (issue.location === undefined) {
    return {
      outcome: 'UNVERIFIABLE',
      reason:
        'This credential was found in attached source, which is not available at re-check time. ' +
        'Re-run the audit to confirm it is gone.',
    };
  }

  // `location` is `path:line:column`; the path half is the fetched URL.
  const url = issue.location.replace(/:\d+:\d+$/, '');
  const response = await ctx.fetch(url, { signal: ctx.signal });
  const { secrets } = assemblePrompt({
    instructions: '',
    segments: [{ label: 'fetched-page', path: response.url, content: response.text() }],
  });

  const wantedKind =
    isRecord(issue.evidence) && typeof issue.evidence['kind'] === 'string'
      ? issue.evidence['kind']
      : null;
  const stillPresent =
    wantedKind === null ? secrets.length > 0 : secrets.some((s) => s.kind === wantedKind);

  if (!stillPresent) return { outcome: 'PASSED' };
  return {
    outcome: 'FAILED',
    evidence: {
      url: response.url,
      note:
        wantedKind === null
          ? `${String(secrets.length)} credential-shaped value(s) still appear in the page.`
          : `A credential of kind ${wantedKind} still appears in the page.`,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const dataLeakScanner: AuditCapability = {
  id: 'data-leak-scanner',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean =>
    input.code !== undefined || typeof input.targetUrl === 'string',
  runCodeLayer,
  reverify,
};

export default dataLeakScanner;
