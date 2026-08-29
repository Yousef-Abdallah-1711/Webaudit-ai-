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
 * Three ways it could lie, and the answer to each:
 *
 *   - **The manifest claims trust.** There is no trust field on
 *     `CapabilityManifest`, and Zod strips unknown keys, so the claim never
 *     reaches parsed data. `assertNoTrustClaim` reports the attempt anyway.
 *   - **A symlink puts foreign content under a trusted root.** The entry name
 *     would say `vendored/`, and the bytes would be wherever the attacker put
 *     them. Every directory is therefore `realpath`ed and required to resolve
 *     *inside* its root. This is the same reasoning as the workspace confinement
 *     in `context.ts`: a lexical check is defeated by a link, so the check has to
 *     be on where the path lands.
 *   - **Two directories claim one id.** Then which copy runs depends on
 *     `readdir` order — a coin flip deciding whether the reviewed capability or
 *     the dropped-in one executes. Vendored always wins, the shadowing is
 *     reported, and a manifest id that disagrees with its own directory name is
 *     refused outright.
 *
 * Discovery never throws for a bad capability. One malformed manifest must not
 * stop the platform booting, because that turns "drop a directory in" (FR-019)
 * into "drop a directory in and take the API down". Bad capabilities are
 * collected in `rejected` with a reason, and the caller logs them.
 */

import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  MANIFEST_FILENAME,
  assertNoTrustClaim,
  parseManifest,
  type CapabilityManifest,
} from '@webaudit/capability-sdk';
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

async function listDirectories(root: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return (
      entries
        // `isDirectory()` is false for a symlink, so links are picked up here and
        // rejected below by the realpath check rather than skipped silently — the
        // difference between "we refused this" and "we never noticed".
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => entry.name)
        .sort()
    );
  } catch {
    // A root that does not exist yet is normal: a fresh deployment has no
    // installed store until someone installs something. Refusing to boot would
    // make installing the first capability impossible.
    return [];
  }
}

async function loadOne(
  root: string,
  rootReal: string,
  entryName: string,
  trust: TrustLevel,
): Promise<
  | {
      readonly ok: true;
      readonly capability: DiscoveredCapability;
      readonly claims: readonly string[];
    }
  | { readonly ok: false; readonly rejected: RejectedCapability }
> {
  const declared = join(root, entryName);
  const reject = (reason: string): { ok: false; rejected: RejectedCapability } => ({
    ok: false,
    rejected: { id: entryName, directory: declared, reason },
  });

  let directory: string;
  try {
    directory = await realpath(declared);
  } catch {
    return reject('directory could not be resolved');
  }

  // The confinement check. `relative` from the resolved root must not climb.
  const within = relative(rootReal, directory);
  if (within === '' || within.startsWith('..') || isAbsolute(within)) {
    return reject(`resolves outside its discovery root (${directory})`);
  }

  const manifestPath = join(directory, MANIFEST_FILENAME);
  let rawText: string;
  try {
    rawText = await readFile(manifestPath, 'utf8');
  } catch {
    return reject(`no ${MANIFEST_FILENAME}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch (error) {
    return reject(`manifest is not valid JSON: ${(error as Error).message}`);
  }

  const claims = assertNoTrustClaim(raw);

  const parsed = parseManifest(raw);
  if (!parsed.ok) {
    return reject(parsed.problems.map((p) => `${p.path}: ${p.message}`).join('; '));
  }
  const manifest = parsed.manifest;

  // The directory name is the id. Anything else lets two directories claim one
  // capability, and lets a manifest point the registry at a different name than
  // the one a reviewer approved.
  if (manifest.id !== entryName) {
    return reject(`manifest id "${manifest.id}" does not match its directory "${entryName}"`);
  }

  // The entrypoint is validated as relative by the schema, which catches a
  // string with `..` in it. It does not catch a *link* on the path: an
  // entrypoint of `dist/index.js` where `dist` is a directory link elsewhere
  // has no `..` anywhere and still reads a file outside this capability. The
  // lexical check below is kept for a manifest that is malformed some other
  // way, but the check that actually matters is the realpath one that follows
  // it — "for the same reason the directory is confirmed" above meant this.
  const entrypointPath = resolve(directory, manifest.entrypoint);
  const entryWithin = relative(directory, entrypointPath);
  if (entryWithin.startsWith('..') || isAbsolute(entryWithin)) {
    return reject(`entrypoint "${manifest.entrypoint}" leaves the capability directory`);
  }

  // A missing entrypoint is not this function's problem to report — T074's
  // `entrypointExists` does that, against the discovered (unresolved) path, so
  // the message stays "no such file" rather than "cannot resolve a link that
  // is not there".
  let entrypointReal: string | undefined;
  try {
    entrypointReal = await realpath(entrypointPath);
  } catch {
    entrypointReal = undefined;
  }
  if (entrypointReal !== undefined) {
    const entryRealWithin = relative(directory, entrypointReal);
    if (entryRealWithin === '' || entryRealWithin.startsWith('..') || isAbsolute(entryRealWithin)) {
      return reject(
        `entrypoint "${manifest.entrypoint}" resolves outside its capability directory (${entrypointReal})`,
      );
    }
  }

  return {
    ok: true,
    // `trust` is assigned here, from the loop that knows which root we are in.
    // It is the only place in the codebase that decides it.
    capability: { id: manifest.id, trust, directory, entrypointPath, manifest },
    claims,
  };
}

export async function discoverCapabilities(roots: DiscoveryRoots): Promise<DiscoveryResult> {
  const capabilities: DiscoveredCapability[] = [];
  const rejected: RejectedCapability[] = [];
  const trustClaims: TrustClaim[] = [];
  const shadowed: string[] = [];
  const seen = new Set<string>();

  for (const { key, trust } of ROOT_TRUST) {
    const root = roots[key];
    const names = await listDirectories(root);
    if (names.length === 0) continue;

    let rootReal: string;
    try {
      rootReal = await realpath(root);
    } catch {
      continue;
    }

    for (const name of names) {
      const outcome = await loadOne(root, rootReal, name, trust);
      if (!outcome.ok) {
        rejected.push(outcome.rejected);
        continue;
      }
      if (outcome.claims.length > 0) {
        trustClaims.push({ id: outcome.capability.id, keys: outcome.claims });
      }
      if (seen.has(outcome.capability.id)) {
        // Vendored was seen first, so this is the installed copy being
        // discarded — never the other way round.
        shadowed.push(outcome.capability.id);
        continue;
      }
      seen.add(outcome.capability.id);
      capabilities.push(outcome.capability);
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
