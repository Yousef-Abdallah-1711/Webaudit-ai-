/**
 * T149 — fingerprint → check → capability, for targeted re-verification.
 *
 * FR-059: re-verification "re-run[s] only the narrow check that governs that
 * issue" and "MUST NOT re-audit the target." R14: "Each check registers a
 * re-verification entry point keyed by `checkId`." An `Issue` row already
 * carries its `checkId` (the routing key) and its `fingerprint` (the stable
 * identity across audits) — what this file adds is the last hop: which
 * capability owns that `checkId`, so `runner.ts` can call exactly one
 * capability's `reverify`.
 *
 * **The mapping is by `checkId` namespace, and it is a static table for the
 * same reason `capability-loader.ts`'s is.** Every first-slice capability
 * namespaces its checks (`headers.csp-missing`, `ssl.hsts-missing`,
 * `owasp.cookie-missing-secure`, `meta.title-missing`, `content.h1-missing`,
 * `redaction.secret-in-source`) — the segment before the first `.` is a stable
 * per-capability prefix. Deriving the owner from it, rather than asking each
 * loaded capability in turn, keeps the resolution deterministic and independent
 * of load order, and a `checkId` whose prefix is unknown resolves to nothing —
 * which `runner.ts` turns into `UNVERIFIABLE` (FR-063), never a guess.
 *
 * **A capability with no `reverify` also resolves to nothing.** The contract is
 * explicit: "Absent means issues from this capability are UNVERIFIABLE" — an
 * honest answer, and better than a capability that guesses.
 */

import type { ModuleType } from '@webaudit/types';
import type { AuditCapability } from '@webaudit/capability-sdk';
import { loadCapabilities } from '../orchestrator/capability-loader.js';

/**
 * `checkId` namespace → the capability id that owns it. The namespace is the
 * segment before the first `.`; `data-leak-scanner` delegates detection to
 * `@webaudit/redaction`, whose findings carry `redaction.secret-in-source`.
 */
const CHECK_NAMESPACE_TO_CAPABILITY: Readonly<Record<string, string>> = {
  headers: 'headers-checker',
  ssl: 'ssl-analyzer',
  owasp: 'owasp-checker',
  meta: 'meta-checker',
  content: 'content-checker',
  redaction: 'data-leak-scanner',
  // T175-T177 — the source-only capabilities. Their `reverify` methods are
  // real and answer honestly when a workspace exists, but the scan workspace
  // is destroyed on every exit path (FR-090), so in production they almost
  // always resolve UNVERIFIABLE with that reason. Mapping them anyway is what
  // makes that answer *theirs* rather than a generic "no owner" — the user
  // learns that re-checking a source finding needs the source re-attached,
  // which is true and actionable, instead of nothing.
  dependency: 'dependency-scanner',
  bundle: 'bundle-analyzer',
  css: 'css-analyzer',
};

export function capabilityIdForCheck(checkId: string): string | null {
  const namespace = checkId.split('.')[0] ?? '';
  return CHECK_NAMESPACE_TO_CAPABILITY[namespace] ?? null;
}

export type CapabilityResolver = (module: ModuleType) => Promise<readonly AuditCapability[]>;

/**
 * The capability whose `reverify` should be invoked for this issue, or `null`
 * when there is no entry point — an unknown check namespace, a capability that
 * did not load, or one that ships no `reverify`.
 */
export async function resolveReverifyCapability(
  input: { readonly module: ModuleType; readonly checkId: string },
  loadForModule: CapabilityResolver = loadCapabilities,
): Promise<AuditCapability | null> {
  const wantedId = capabilityIdForCheck(input.checkId);
  if (wantedId === null) return null;

  const capabilities = await loadForModule(input.module);
  const match = capabilities.find((c) => c.id === wantedId);
  if (match === undefined || match.reverify === undefined) return null;
  return match;
}
