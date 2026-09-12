/**
 * Single-root capability manifest discovery — the trust-free core shared by
 * `apps/api`'s dual-root registry discovery (`discoverCapabilities`, which
 * adds trust-by-root and cross-root shadow resolution on top of this) and
 * `apps/worker`'s capability loader (which calls this directly against the
 * vendored root only, since a worker never runs an untrusted capability).
 *
 * Extracted from `apps/api/src/services/registry/discover.ts` so neither
 * caller hardcodes which capabilities exist — Constitution I: "Module,
 * orchestrator, and route code MUST NOT import a concrete skill, reference a
 * skill by identifier, or branch on which skills exist." Before this, the
 * worker's own copy of "which capabilities exist" was a static per-module
 * `import()` table; this is the one real directory walk both apps read from.
 *
 * All of R10's confinement logic (path escape via a smuggled directory, an
 * entrypoint that is itself a link elsewhere, a manifest id disagreeing with
 * its directory name) lives here, unchanged from the original — only the
 * trust stamp and cross-root shadow bookkeeping moved to the caller, because
 * both are meaningless for a single root.
 */

import { readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { MANIFEST_FILENAME, assertNoTrustClaim, parseManifest } from './manifest.js';
import type { CapabilityManifest } from './manifest.js';

export interface DiscoveredManifest {
  readonly id: string;
  /** Absolute, realpath-resolved directory. */
  readonly directory: string;
  /** Absolute path to the entry module. */
  readonly entrypointPath: string;
  readonly manifest: CapabilityManifest;
}

export interface RejectedManifest {
  readonly id: string;
  readonly directory: string;
  readonly reason: string;
}

export interface ManifestTrustClaim {
  readonly id: string;
  readonly keys: readonly string[];
}

export interface SingleRootDiscoveryResult {
  readonly found: readonly DiscoveredManifest[];
  readonly rejected: readonly RejectedManifest[];
  /** Manifests that tried to declare trust. Changed nothing; worth logging. */
  readonly trustClaims: readonly ManifestTrustClaim[];
}

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
): Promise<
  | {
      readonly ok: true;
      readonly capability: DiscoveredManifest;
      readonly claims: readonly string[];
    }
  | { readonly ok: false; readonly rejected: RejectedManifest }
> {
  const declared = join(root, entryName);
  const reject = (reason: string): { ok: false; rejected: RejectedManifest } => ({
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

  // A missing entrypoint is not this function's problem to report — the
  // caller's own boot assertion does that, against the discovered
  // (unresolved) path, so the message stays "no such file" rather than
  // "cannot resolve a link that is not there".
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
    capability: { id: manifest.id, directory, entrypointPath, manifest },
    claims,
  };
}

/**
 * Walks one root directory, parsing and confining every `capability.manifest.json`
 * it finds. Never throws for a bad capability — one malformed manifest must not
 * stop the caller booting (FR-019).
 */
export async function discoverManifestsInRoot(root: string): Promise<SingleRootDiscoveryResult> {
  const found: DiscoveredManifest[] = [];
  const rejected: RejectedManifest[] = [];
  const trustClaims: ManifestTrustClaim[] = [];

  const names = await listDirectories(root);
  if (names.length === 0) return { found, rejected, trustClaims };

  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    return { found, rejected, trustClaims };
  }

  for (const name of names) {
    const outcome = await loadOne(root, rootReal, name);
    if (!outcome.ok) {
      rejected.push(outcome.rejected);
      continue;
    }
    if (outcome.claims.length > 0) {
      trustClaims.push({ id: outcome.capability.id, keys: outcome.claims });
    }
    found.push(outcome.capability);
  }

  return { found, rejected, trustClaims };
}
