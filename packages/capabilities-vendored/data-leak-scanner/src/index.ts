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

import { assemblePrompt, secretsToFindings, type RedactedSecretRef } from '@webaudit/redaction';
import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
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

export const dataLeakScanner: AuditCapability = {
  id: 'data-leak-scanner',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean =>
    input.code !== undefined || typeof input.targetUrl === 'string',
  runCodeLayer,
};

export default dataLeakScanner;
