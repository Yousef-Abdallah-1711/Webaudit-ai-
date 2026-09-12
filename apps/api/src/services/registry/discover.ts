/**
 * T068 — R10: dual-root discovery. Vendored is reviewed and trusted; installed
 * is unreviewed and untrusted. "Trust level comes from which root a capability
 * was found in, never from its own manifest."
 *
 * The whole design rests on one sentence from R10's rationale: "Discovery by
 * directory root is what makes trust unforgeable." So this module's job is to
 * make the *root* the only thing that decides, and to make sure a capability
 * cannot lie about which root it is in.
 *
 * **The actual directory walk lives in `@webaudit/capability-sdk`'s
 * `discoverManifestsInRoot`** (moved there per Constitution I / Open Decision
 * #13, T249) — this module now only adds what is genuinely registry-specific:
 * assigning trust by which root a manifest was found in, and resolving an id
 * that appears in both roots (vendored always wins). Everything else —
 * manifest parsing, the realpath confinement checks, trust-claim detection —
 * is the same code `apps/worker`'s capability loader now calls directly
 * against the vendored root, so both apps read "what exists" from one real
 * walk instead of two implementations that could quietly drift apart.
 */

import { stat } from 'node:fs/promises';
import {
  discoverManifestsInRoot,
  type DiscoveredManifest,
  type ManifestTrustClaim,
} from '@webaudit/capability-sdk';
import type { CapabilityManifest } from '@webaudit/capability-sdk';
import type { TrustLevel } from '@webaudit/types';

export interface DiscoveredCapability {
  readonly id: string;
  /** Derived from the root. Never read from the manifest. */
  readonly trust: TrustLevel;
  /** Absolute, realpath-resolved directory. */
  readonly directory: string;
  /** Absolute path to the entry module. Asserted present by T074. */
  readonly entrypointPath: string;
  readonly manifest: CapabilityManifest;
}

export interface RejectedCapability {
  readonly id: string;
  readonly directory: string;
  readonly reason: string;
}

export interface TrustClaim {
  readonly id: string;
  readonly keys: readonly string[];
}

export interface DiscoveryResult {
  readonly capabilities: readonly DiscoveredCapability[];
  readonly rejected: readonly RejectedCapability[];
  /** Manifests that tried to declare trust. Changed nothing; worth logging. */
  readonly trustClaims: readonly TrustClaim[];
  /** Ids present in both roots. The installed copy was discarded. */
  readonly shadowed: readonly string[];
}

export interface DiscoveryRoots {
  /** `packages/capabilities-vendored/` in production. Reviewed code. */
  readonly vendoredRoot: string;
  /** The installed-capability store. Unreviewed; runs sandboxed (R1, FR-027). */
  readonly installedRoot: string;
}

/** Vendored first, so it wins a collision by being seen first. */
const ROOT_TRUST: readonly { readonly key: keyof DiscoveryRoots; readonly trust: TrustLevel }[] = [
  { key: 'vendoredRoot', trust: 'VENDORED' },
  { key: 'installedRoot', trust: 'INSTALLED' },
];

function withTrust(manifest: DiscoveredManifest, trust: TrustLevel): DiscoveredCapability {
  return {
    id: manifest.id,
    trust,
    directory: manifest.directory,
    entrypointPath: manifest.entrypointPath,
    manifest: manifest.manifest,
  };
}

export async function discoverCapabilities(roots: DiscoveryRoots): Promise<DiscoveryResult> {
  const capabilities: DiscoveredCapability[] = [];
  const rejected: RejectedCapability[] = [];
  const trustClaims: ManifestTrustClaim[] = [];
  const shadowed: string[] = [];
  const seen = new Set<string>();

  for (const { key, trust } of ROOT_TRUST) {
    const result = await discoverManifestsInRoot(roots[key]);
    rejected.push(...result.rejected);
    trustClaims.push(...result.trustClaims);

    for (const found of result.found) {
      if (seen.has(found.id)) {
        // Vendored was seen first, so this is the installed copy being
        // discarded — never the other way round.
        shadowed.push(found.id);
        continue;
      }
      seen.add(found.id);
      capabilities.push(withTrust(found, trust));
    }
  }

  return { capabilities, rejected, trustClaims, shadowed };
}

/** Is the entry module actually on local disk? Used by T074's boot assertion. */
export async function entrypointExists(capability: DiscoveredCapability): Promise<boolean> {
  try {
    const info = await stat(capability.entrypointPath);
    return info.isFile();
  } catch {
    return false;
  }
}
