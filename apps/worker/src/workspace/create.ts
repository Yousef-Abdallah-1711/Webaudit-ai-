/**
 * T103 — per-scan workspace creation, registered with a cleanup owner.
 *
 * FR-090 has two halves and this is the cheap one: "store user source only for
 * the duration of the audit". One directory per scan, under one configured base
 * directory, named by the scan id — which is what makes the destruction half
 * possible at all. A shared extraction directory, or a random temp name recorded
 * nowhere, cannot be swept after a crash, and SC-015 does not exempt a crash.
 *
 * Three things happen here, in this order, and the order is the point:
 *
 *   1. **The path is derived by `workspacePathFor`**, the same function the
 *      capability SDK's read confinement uses. One definition of where a
 *      workspace lives means the reader and the destroyer cannot drift apart —
 *      and it validates the scan id, so `../../etc` is refused before `mkdir`
 *      turns it into a directory somewhere it should not be.
 *   2. **The directory is created.**
 *   3. **The path is recorded on the row and registered with the owner.** The row
 *      is what survives a worker restart, which is why `Scan.workspacePath` exists
 *      at all — the schema comment says so: "FR-090: the cleanup owner reads this
 *      and destroys it on every exit path." The in-memory registration is what
 *      lets shutdown clean up without a database read.
 *
 * If recording fails, the directory is removed again before the error propagates.
 * An unrecorded directory holding user source is the one outcome nothing later can
 * fix: no row points at it, so no sweep and no FR-009 deletion will ever find it.
 *
 * There is deliberately no "reuse the existing directory" path. A scan id is
 * unique, so a workspace that already exists is a resumed scan (fine, the source
 * is still the same source) or a collision (which `mkdir` recursive would hide).
 * `existing: true` in the result says which, rather than pretending it never
 * happened.
 */

import { mkdir, rm } from 'node:fs/promises';
import { workspacePathFor } from '@webaudit/capability-sdk';
import {
  destroyScanWorkspace,
  processCleanupOwner,
  type ArtifactPurgeStep,
  type TeardownOutcome,
  type WorkspaceCleanupOwner,
  type WorkspaceStore,
} from './teardown.js';

export interface CreateWorkspaceOptions {
  /** The one directory scan workspaces live under. Also the confinement root. */
  readonly baseDir: string;
  readonly scanId: string;
  /**
   * Where the path is recorded so it outlives this process. Optional only so a
   * test can create a workspace without a database — production always passes it,
   * and without it a crash leaks the source until the orphan sweep notices.
   */
  readonly db?: WorkspaceStore;
  readonly owner?: WorkspaceCleanupOwner;
  readonly purgeArtifacts?: ArtifactPurgeStep;
}

export interface ScanWorkspace {
  readonly scanId: string;
  /** Absolute. Hand this to `createCodeLayerContext` as `workspaceRoot`. */
  readonly path: string;
  /** True when the directory was already there — a resumed scan, not a new one. */
  readonly existing: boolean;
  /**
   * Destroy it now. The terminal-transition hook in `teardown.ts` is the
   * guarantee; this is for a caller that knows it is finished with the source
   * earlier than the scan is, and it is idempotent, so using both is safe.
   */
  destroy(): Promise<TeardownOutcome>;
}

export async function createScanWorkspace(options: CreateWorkspaceOptions): Promise<ScanWorkspace> {
  // Throws on a scan id that is not one. Deliberately before any I/O: a rejected
  // id must not leave a directory behind as evidence that it was tried.
  const path = workspacePathFor(options.baseDir, options.scanId);
  const owner = options.owner ?? processCleanupOwner;

  const created = await mkdir(path, { recursive: true });
  // Node returns the first directory it created, or undefined when there was
  // nothing to create. That is the only honest way to tell a resumed scan from a
  // fresh one after `recursive: true`.
  const existing = created === undefined;

  try {
    // Registered before the row is written: if the write throws, the rollback
    // below still has an owner entry to clear.
    owner.register(options.scanId, options.baseDir, path);
    await options.db?.scan.update({
      where: { id: options.scanId },
      data: { workspacePath: path },
    });
  } catch (error) {
    owner.forget(options.scanId);
    // Only remove what this call created. Deleting a resumed scan's source
    // because we failed to re-record a path it already had would destroy a live
    // audit's input.
    if (!existing) await rm(path, { recursive: true, force: true });
    throw error;
  }

  return {
    scanId: options.scanId,
    path,
    existing,
    destroy: () =>
      destroyScanWorkspace({
        baseDir: options.baseDir,
        scanId: options.scanId,
        path,
        owner,
        ...(options.db === undefined ? {} : { db: options.db }),
        ...(options.purgeArtifacts === undefined ? {} : { purgeArtifacts: options.purgeArtifacts }),
      }),
  };
}
