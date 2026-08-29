/**
 * T073 — R3: "Every issue carries a deterministic fingerprint: a hash over
 * (targetId, moduleType, checkId, normalizedLocation, discriminator)."
 *
 * This one function makes three separate requirements work: targeted
 * re-verification knows which check to re-run (FR-059), recurrence detection
 * recognises a returning problem (FR-064), and the readiness pass diffs fresh
 * findings against the original audit to name regressions (FR-069). Without a
 * stable identity, "mark this fixed and re-verify it" has nothing to re-verify.
 *
 * **Length-prefixed encoding, not `parts.join('|')`.**
 *
 * This is the detail that looks like fussiness and is not. With a separator,
 * `['a|b', 'c']` and `['a', 'b|c']` hash identically, so two different findings
 * become one issue — one of them silently disappears from the report, and which
 * one depends on insertion order. Any separator has this problem, because
 * capability-supplied parts are arbitrary strings: CSS selectors carry `|`,
 * header values carry `:`, URLs carry almost everything, and a NUL byte is
 * reachable through a crafted response. Prefixing each part with its byte length
 * makes the encoding injective, so distinct inputs cannot collide by
 * construction rather than by luck.
 *
 * **Normalisation is separate and explicit.** `normalizeLocation` strips what R3
 * calls volatile — query strings, cache-busting hashes, absolute path prefixes.
 * It is exported rather than folded in because only the check knows what is
 * volatile about its own location (R3), so a capability may normalise
 * differently, and must be able to see what the default did.
 */

import { createHash } from 'node:crypto';
import type { ModuleType } from '@webaudit/types';

export interface FingerprintInput {
  /** Scopes the identity to one target. The same defect on two sites is two issues. */
  readonly targetId: string;
  readonly module: ModuleType;
  /** Which check produced it. Routes re-verification (FR-059). */
  readonly checkId: string;
  /**
   * Supplied by the capability, which is the only thing that knows what is
   * stable about its own finding (R3). Order is significant.
   */
  readonly parts: readonly string[];
}

/**
 * Injective encoding: `<byteLength>:<bytes>` per part.
 *
 * Because the length is unambiguous, no part's content can be mistaken for a
 * boundary. There is no character a capability can emit to forge one.
 */
function encodeParts(parts: readonly string[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const bytes = Buffer.from(part, 'utf8');
    chunks.push(Buffer.from(`${String(bytes.length)}:`, 'utf8'), bytes);
  }
  return Buffer.concat(chunks);
}

/**
 * A finding's stable identity. Same defect, same target, same fingerprint —
 * across runs, across deploys, across months.
 *
 * @returns 64 lowercase hex characters.
 */
export function fingerprintOf(input: FingerprintInput): string {
  // targetId, module and checkId are length-prefixed too, so a checkId
  // containing a digit-and-colon cannot imitate the framing of the parts.
  const encoded = encodeParts([input.targetId, input.module, input.checkId, ...input.parts]);
  return createHash('sha256').update(encoded).digest('hex');
}

export interface NormalizeOptions {
  /**
   * Stripped from the front of a path so a finding survives being audited in a
   * different workspace. Absolute paths are volatile by definition: the same
   * repository checked out twice produces two of them (R3).
   */
  readonly workspaceRoot?: string;
}

/** Hash-shaped segments a build tool inserted, not part of the identity. */
const CACHE_BUSTING = [
  // main.4f3a9c1b.js, styles-8e2d4f6a.min.css. The extension group repeats:
  // `.min.css` and `.module.css` are the common case, not the exception.
  /[.-][0-9a-f]{8,32}(?=(?:\.[a-z0-9]+)+$)/gi,
  // ?v=1712345678, ?_=1712345678
  /(?:[?&](?:v|_|ts|t|rev|hash)=[^&#]*)/gi,
];

/**
 * Strip the volatile parts of a location.
 *
 * A location is a URL, a file path, or a selector. All three carry things that
 * change without the defect changing, and every one of them would otherwise
 * turn one recurring issue into a new issue every audit — which is the failure
 * FR-064 exists to prevent, and the one that makes a fixes board useless.
 */
export function normalizeLocation(location: string, options: NormalizeOptions = {}): string {
  let value = location.trim();

  // A URL: keep origin and path, drop query and fragment entirely. A query
  // string is where session ids, cache busters, and tracking parameters live.
  //
  // Gated on an explicit http(s) prefix rather than on `new URL` succeeding,
  // because `new URL('C:\repo\src\app.ts')` succeeds: it reads `c:` as a
  // scheme and hands back origin "null" and a mangled pathname. Every Windows
  // absolute path is a valid URL, so "did it parse" is not the question.
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      value = `${url.origin}${url.pathname}`;
    } catch {
      // Malformed despite the prefix. Fall through.
    }
  }

  if (options.workspaceRoot !== undefined && options.workspaceRoot !== '') {
    const root = options.workspaceRoot.replace(/[/\\]+$/, '');
    if (value.startsWith(root)) {
      value = value.slice(root.length).replace(/^[/\\]+/, '');
    }
  }

  for (const pattern of CACHE_BUSTING) {
    value = value.replace(pattern, '');
  }

  // Backslashes to forward slashes: the same repository audited on Windows and
  // on Linux must produce one issue, not two.
  value = value.replace(/\\/g, '/');

  // A trailing line:column moves with every unrelated edit above it (R3). The
  // file and the check are the identity; the line number is for the human.
  value = value.replace(/:\d+(?::\d+)?$/, '');

  return value.replace(/\/+$/, '') || '/';
}
