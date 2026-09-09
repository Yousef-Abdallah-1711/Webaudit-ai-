/**
 * T149, re-founded on self-declaration at T249 — fingerprint → check →
 * capability, for targeted re-verification.
 *
 * FR-059: re-verification "re-run[s] only the narrow check that governs that
 * issue" and "MUST NOT re-audit the target." R14: "Each check registers a
 * re-verification entry point keyed by `checkId`." An `Issue` row already
 * carries its `checkId` (the routing key) and its `fingerprint` (the stable
 * identity across audits) — what this file adds is the last hop: which
 * capability owns that `checkId`, so `runner.ts` can call exactly one
 * capability's `reverify`.
 *
 * **Ownership comes from each capability's own `checkNamespaces` declaration
 * now, not a hardcoded namespace-to-capability-id table** (Open Decision #13
 * / Constitution I: "the core reads those declarations rather than encoding
 * them"). Every first-slice capability namespaces its checks
 * (`headers.csp-missing`, `ssl.hsts-missing`, `owasp.cookie-missing-secure`,
 * `meta.title-missing`, `content.h1-missing`, `redaction.secret-in-source`)
 * — the segment before the first `.` is a stable per-capability prefix, and
 * `AuditCapability.checkNamespaces` is where each capability says which
 * prefixes are its own. A `checkId` whose prefix no loaded capability
 * declares resolves to nothing — which `runner.ts` turns into UNVERIFIABLE
 * (FR-063), never a guess.
 *
 * **A capability with no `reverify` also resolves to nothing.** The contract
 * is explicit: "Absent means issues from this capability are UNVERIFIABLE" —
 * an honest answer, and better than a capability that guesses.
 */

import type { ModuleType } from '@webaudit/types';
import type { AuditCapability } from '@webaudit/capability-sdk';
import { loadCapabilities } from '../orchestrator/capability-loader.js';

function namespaceOf(checkId: string): string {
  return checkId.split('.')[0] ?? '';
}

/** The loaded capability that declared ownership of `checkId`'s namespace, or `null`. */
export function capabilityIdForCheck(
  checkId: string,
  capabilities: readonly AuditCapability[],
): string | null {
  const namespace = namespaceOf(checkId);
  const owner = capabilities.find((c) => c.checkNamespaces?.includes(namespace) === true);
  return owner?.id ?? null;
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
  const capabilities = await loadForModule(input.module);
  const wantedId = capabilityIdForCheck(input.checkId, capabilities);
  if (wantedId === null) return null;

  const match = capabilities.find((c) => c.id === wantedId);
  if (match === undefined || match.reverify === undefined) return null;
  return match;
}
