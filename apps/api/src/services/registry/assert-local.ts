/**
 * T074 — the boot assertion. FR-023: "System MUST retain a complete local copy
 * of every externally sourced capability, such that removal of the original
 * source has no effect on any audit."
 *
 * Principle II states the test to apply: "Deleting an upstream repo must change
 * nothing." This function is where that becomes checkable rather than aspirational
 * — every capability the registry is about to serve must have its entry module
 * present on local disk, right now, before the first request is accepted.
 *
 * **It fails closed, and that is a deliberate trade.** Refusing to boot is a
 * strong response, and the alternative — start, and let the audit that reaches
 * the missing capability fail — is worse in exactly the way this product cannot
 * afford: the user has paid, the scan has run, and the area comes back empty for
 * a reason nobody can see. A missing entrypoint is an operator error at deploy
 * time, and deploy time is when it should be discovered.
 *
 * A capability that is *registered but not on disk* cannot happen through
 * `CapabilityRegistry.build`, which intersects the two sets. This assertion
 * covers the other direction and the gap between them: discovered, reconciled,
 * and then the file turns out not to be there — a partial checkout, a
 * `.gitignore`d `dist/`, a vendoring script that copied the manifest and not the
 * build. All three are real, and all three are silent without this.
 *
 * It deliberately checks the *entrypoint file*, not the directory. A directory
 * with a manifest and no code is the failure mode a vendoring script produces,
 * and the one a directory-existence check would miss.
 */

import { entrypointExists, type DiscoveredCapability } from './discover.js';

export class CapabilityNotLocalError extends Error {
  override readonly name = 'CapabilityNotLocalError';
  constructor(readonly missing: readonly { readonly id: string; readonly path: string }[]) {
    super(
      `FR-023: ${String(missing.length)} capabilit${missing.length === 1 ? 'y' : 'ies'} ` +
        `have no local entry module — ${missing.map((m) => `${m.id} (${m.path})`).join(', ')}. ` +
        'A capability must resolve entirely from local disk; nothing is fetched at runtime.',
    );
  }
}

export interface LocalityReport {
  readonly checked: number;
  readonly missing: readonly { readonly id: string; readonly path: string }[];
}

/** Check without throwing. For an operator health endpoint (US7). */
export async function checkCapabilitiesAreLocal(
  discovered: readonly DiscoveredCapability[],
): Promise<LocalityReport> {
  const missing: { id: string; path: string }[] = [];
  for (const capability of discovered) {
    if (!(await entrypointExists(capability))) {
      missing.push({ id: capability.id, path: capability.entrypointPath });
    }
  }
  return { checked: discovered.length, missing };
}

/**
 * Called during boot, before the server listens.
 *
 * @throws CapabilityNotLocalError naming every capability that is not local, not
 *   just the first. An operator fixing these one boot at a time is an operator
 *   fixing them for an hour.
 */
export async function assertCapabilitiesAreLocal(
  discovered: readonly DiscoveredCapability[],
): Promise<LocalityReport> {
  const report = await checkCapabilitiesAreLocal(discovered);
  if (report.missing.length > 0) throw new CapabilityNotLocalError(report.missing);
  return report;
}
