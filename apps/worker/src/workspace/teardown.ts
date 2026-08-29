/**
 * T104 — FR-090: "store user source only for the duration of the audit, and MUST
 * destroy it when the audit ends, including on failure, timeout, and
 * cancellation."
 *
 * SC-015 turns that into a gate: "Zero audits retain user source after ending,
 * verified by inspection following normal completion, failure, timeout, and
 * cancellation." Four endings. A `try/finally` around the happy path satisfies
 * exactly one of them, which is why this file hangs teardown off the *state
 * machine* rather than off any job.
 *
 * **One hook, not four call sites — with one known gap.** `COMPLETED`, `FAILED`,
 * and `TIMED_OUT` are written by `transition` in `state-machine.ts` and by
 * nothing else, so `installTerminalTeardown` registering a terminal observer
 * there once, at worker boot, covers all three by construction. `CANCELLED` is
 * the exception: `apps/api`'s `/scans/:id/cancel` route writes it directly via
 * its own `updateMany`, in a different process, and never calls this process's
 * `transition` — so this mechanism does not fire on cancellation today. (Its
 * credit refund is still handled, separately, at the source in that route; only
 * workspace teardown is left uncovered.) Closing that gap needs a real
 * cross-process design — a maintenance-queue job, or moving cancellation
 * through the worker — and is out of scope here.
 *
 * **Idempotent by three independent mechanisms**, because the sweep runs on a
 * schedule and can overlap itself:
 *   1. The observer fires only on `moved: true`, and terminal states have no
 *      outgoing edges — so exactly one transition per scan can ever win.
 *   2. Removal treats a missing path as success. FR-090 asks for absence, and
 *      absence is what a second run finds.
 *   3. `workspacePath` is nulled only after removal succeeded, so a failed
 *      teardown stays discoverable and a successful one is not retried for ever.
 *
 * **Teardown is confined, because it is a delete primitive if it is not.** The
 * path comes from a database column, so it is input, not fact: a row whose
 * `workspacePath` reads `/etc` must be refused rather than obeyed. Containment is
 * checked by realpath against the configured base directory, the same way
 * `packages/capability-sdk/src/context.ts` confines the read side — a lexical
 * `..` check alone is defeated by a symlink.
 *
 * **Links are unlinked, never followed.** An uploaded archive is untrusted
 * content (FR-094) and can contain a symlink to `/`. Recursing through it turns
 * "extract an archive" into "delete the host". So the walk below `lstat`s every
 * entry and only ever recurses into a real directory. This is also why it does
 * not simply call `fs.rm(recursive: true)` — that would make the guarantee a
 * property of Node's rimraf internals rather than of this file.
 *
 * **Nothing here throws at a caller.** A workspace that will not delete is an
 * operations problem; failing a finished audit over it would charge a user for
 * our disk. Every failure is collected into the outcome and reported through
 * `onError`.
 */

import { lstat, readdir, realpath, rmdir, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { workspacePathFor } from '@webaudit/capability-sdk';
import { onTerminalTransition, type TerminalObserver } from '../orchestrator/state-machine.js';

/** The `Scan.workspacePath` writes this module needs, and nothing else. */
export interface WorkspaceStore {
  scan: {
    update(args: {
      where: { id: string };
      data: { workspacePath: string | null };
    }): Promise<unknown>;
  };
}

/**
 * The object-storage half of FR-090.
 *
 * Retained source and reports live in R2, not on this disk, and no R2 client
 * exists in this repository yet — T189 owns the object-key scheme. Rather than
 * invent one, the step is injectable: wire it and it runs, leave it and the
 * outcome says plainly that nothing was purged. See PROGRESS.md carried
 * correction 5.
 */
export type ArtifactPurgeStep = (input: {
  readonly scanId: string;
  readonly workspacePath: string;
}) => Promise<void>;

/** Injected so a test can make removal fail without making the disk fail. */
export type RemoveStep = (path: string) => Promise<void>;

export type TeardownRefusal = 'OUTSIDE_BASE' | 'BAD_SCAN_ID';

export interface TeardownOutcome {
  readonly scanId: string;
  /** Null when the path was refused before any I/O was attempted. */
  readonly path: string | null;
  /** True when nothing remains at the path. The SC-015 assertion. */
  readonly destroyed: boolean;
  /** True when there was nothing to destroy — normal on a second run. */
  readonly alreadyGone: boolean;
  readonly refused: TeardownRefusal | null;
  /** False when no purger is wired; object storage, if any, still holds source. */
  readonly artifactsPurged: boolean;
  readonly errors: readonly string[];
}

export interface TeardownOptions {
  /** The one directory scan workspaces may live under. The confinement root. */
  readonly baseDir: string;
  readonly scanId: string;
  /**
   * The recorded path, when there is one. Defaults to the derived
   * `<baseDir>/<scanId>` — derivation is preferred because a stored value is
   * input and can be wrong or hostile, and both are checked identically anyway.
   */
  readonly path?: string;
  readonly db?: WorkspaceStore;
  readonly owner?: WorkspaceCleanupOwner;
  readonly purgeArtifacts?: ArtifactPurgeStep;
  readonly remove?: RemoveStep;
  readonly onError?: (error: unknown, context: string) => void;
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function isMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Retry the small window Windows opens between a handle closing and the file
 * becoming deletable. Three attempts, not a loop for ever: a genuinely locked
 * file must surface as an error, not as a hung teardown.
 */
async function withRetry(action: () => Promise<void>): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await action();
      return;
    } catch (error) {
      if (isMissing(error)) return; // Someone else got there first. Success.
      const code = (error as { code?: string }).code;
      const transient = code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY';
      if (!transient || attempt >= 2) throw error;
      await new Promise((done) => setTimeout(done, 50 * (attempt + 1)));
    }
  }
}

/**
 * Remove one entry, and its contents when it is a real directory.
 *
 * `lstat`, never `stat`: the difference is whether a planted symlink is followed,
 * and following it is the whole vulnerability. A link — including a Windows
 * junction, which reports as a symlink here — is removed as a link, so its target
 * is untouched.
 */
async function removeEntry(path: string, errors: string[]): Promise<void> {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (isMissing(error)) return;
    errors.push(`${path}: ${describe(error)}`);
    return;
  }

  try {
    if (info.isSymbolicLink()) {
      // A directory junction on Windows refuses `unlink` with EPERM and needs
      // `rmdir`; either way only the link is removed, never what it points at.
      try {
        await withRetry(() => unlink(path));
      } catch {
        await withRetry(() => rmdir(path));
      }
      return;
    }

    if (info.isDirectory()) {
      const names = await readdir(path);
      for (const name of names) await removeEntry(join(path, name), errors);
      await withRetry(() => rmdir(path));
      return;
    }

    await withRetry(() => unlink(path));
  } catch (error) {
    if (isMissing(error)) return;
    errors.push(`${path}: ${describe(error)}`);
  }
}

/**
 * Is this path a workspace inside the configured base directory?
 *
 * Two checks, because either alone is defeated — the same pair `context.ts` uses
 * on the read side:
 *   1. Lexical containment, which rules out `..` and an unrelated absolute path
 *      before any I/O happens, and rules out the base directory itself. Deleting
 *      the base directory is never a scan teardown.
 *   2. Realpath of the *parent*, which catches a symlinked ancestor pointing out
 *      of the base. The candidate itself is deliberately not realpathed: if it is
 *      a link, `removeEntry` unlinks it without following it, and resolving it
 *      here would report the target's location instead of the link's.
 */
async function isInsideBase(baseDir: string, candidate: string): Promise<boolean> {
  let baseReal: string;
  try {
    baseReal = await realpath(baseDir);
  } catch {
    // No base directory means nothing can be inside it. Fail closed.
    return false;
  }

  const absolute = resolve(candidate);
  const lexical = relative(baseReal, absolute);
  if (lexical === '' || lexical.startsWith('..') || isAbsolute(lexical)) return false;

  try {
    const parentReal = await realpath(dirname(absolute));
    const viaParent = relative(baseReal, parentReal);
    if (viaParent.startsWith('..') || isAbsolute(viaParent)) return false;
  } catch (error) {
    // A parent that does not exist cannot contain a workspace; there is nothing
    // to delete, and the caller reports `alreadyGone`.
    if (!isMissing(error)) return false;
  }

  return true;
}

/**
 * Destroy one scan's workspace. Safe to call twice, safe to call on a scan that
 * never had one, and never throws.
 */
export async function destroyScanWorkspace(options: TeardownOptions): Promise<TeardownOutcome> {
  const report = options.onError ?? defaultOnError;
  const errors: string[] = [];

  let path: string;
  try {
    // `workspacePathFor` validates the scan id and is the single definition of
    // where a workspace lives — duplicating the layout here is how the two drift.
    path = options.path ?? workspacePathFor(options.baseDir, options.scanId);
  } catch (error) {
    report(error, `teardown: refusing scan id ${options.scanId}`);
    return {
      scanId: options.scanId,
      path: null,
      destroyed: false,
      alreadyGone: false,
      refused: 'BAD_SCAN_ID',
      artifactsPurged: false,
      errors: [describe(error)],
    };
  }

  if (!(await isInsideBase(options.baseDir, path))) {
    // Loud, and no I/O. A row pointing outside the base directory is either a
    // misconfiguration or an attempt to use us as a delete primitive; both need
    // an operator, and neither is a reason to delete anything.
    const message =
      `refused to destroy ${path} for scan ${options.scanId}: ` +
      `it does not resolve inside ${options.baseDir}`;
    report(new Error(message), 'teardown: confinement');
    return {
      scanId: options.scanId,
      path,
      destroyed: false,
      alreadyGone: false,
      refused: 'OUTSIDE_BASE',
      artifactsPurged: false,
      errors: [message],
    };
  }

  const existed = await pathExists(path);

  // Object storage first, disk second, the database last. Each step is only
  // reached when the one before it succeeded, so a partial teardown always
  // leaves the record that lets it be finished later — the same ordering
  // `deletion.service.ts` uses for FR-009, and for the same reason.
  let artifactsPurged = false;
  if (options.purgeArtifacts !== undefined) {
    try {
      await options.purgeArtifacts({ scanId: options.scanId, workspacePath: path });
      artifactsPurged = true;
    } catch (error) {
      report(error, `teardown: artifact purge for scan ${options.scanId}`);
      return {
        scanId: options.scanId,
        path,
        destroyed: false,
        alreadyGone: !existed,
        refused: null,
        artifactsPurged: false,
        errors: [describe(error)],
      };
    }
  }

  if (existed) {
    if (options.remove !== undefined) {
      try {
        await options.remove(path);
      } catch (error) {
        errors.push(describe(error));
      }
    } else {
      await removeEntry(path, errors);
    }
  }

  // Inspection, not optimism: SC-015 is a claim about what is on disk, so the
  // claim is made by looking rather than by counting successful unlinks.
  const destroyed = errors.length === 0 && !(await pathExists(path));
  for (const message of errors) report(new Error(message), 'teardown: removal');

  if (destroyed) {
    options.owner?.forget(options.scanId);
    if (options.db !== undefined) {
      try {
        // Only now. A nulled column with a live directory is an orphan nobody
        // can find; a stale column with no directory is merely untidy.
        await options.db.scan.update({
          where: { id: options.scanId },
          data: { workspacePath: null },
        });
      } catch (error) {
        report(error, `teardown: clearing workspacePath for scan ${options.scanId}`);
        errors.push(describe(error));
      }
    }
  }

  return {
    scanId: options.scanId,
    path,
    destroyed,
    alreadyGone: !existed,
    refused: null,
    artifactsPurged,
    errors,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

function defaultOnError(error: unknown, context: string): void {
  console.warn(`[workspace] ${context}: ${describe(error)}`);
}

/**
 * The cleanup owner FR-090's schema comment names: "the cleanup owner reads this
 * and destroys it on every exit path."
 *
 * It holds live workspaces in memory so teardown does not depend on a database
 * read that may itself be the thing that failed, and so a worker shutting down
 * can destroy what it still holds. It is a cache, not the record — the record is
 * `Scan.workspacePath`, which is what survives a restart and what
 * `sweepOrphanedWorkspaces` and FR-009 deletion read.
 */
export class WorkspaceCleanupOwner {
  private readonly live = new Map<string, { readonly baseDir: string; readonly path: string }>();

  register(scanId: string, baseDir: string, path: string): void {
    this.live.set(scanId, { baseDir, path });
  }

  forget(scanId: string): void {
    this.live.delete(scanId);
  }

  pathFor(scanId: string): string | undefined {
    return this.live.get(scanId)?.path;
  }

  baseDirFor(scanId: string): string | undefined {
    return this.live.get(scanId)?.baseDir;
  }

  get size(): number {
    return this.live.size;
  }

  /**
   * Destroy everything still held. For worker shutdown: a process that exits
   * with workspaces registered has leaked user source, and the next boot's sweep
   * is a slower and less certain answer than doing it here.
   */
  async destroyAll(
    options: Omit<TeardownOptions, 'baseDir' | 'scanId' | 'path'> = {},
  ): Promise<readonly TeardownOutcome[]> {
    const outcomes: TeardownOutcome[] = [];
    for (const [scanId, entry] of [...this.live]) {
      outcomes.push(
        await destroyScanWorkspace({
          ...options,
          baseDir: entry.baseDir,
          scanId,
          path: entry.path,
          owner: this,
        }),
      );
    }
    return outcomes;
  }
}

/** The owner a worker uses when it does not construct its own. */
export const processCleanupOwner = new WorkspaceCleanupOwner();

export interface InstallTeardownOptions {
  readonly baseDir: string;
  readonly db?: WorkspaceStore;
  readonly owner?: WorkspaceCleanupOwner;
  readonly purgeArtifacts?: ArtifactPurgeStep;
  readonly onError?: (error: unknown, context: string) => void;
  /** Injected only by tests, to prove a broken teardown cannot fail an audit. */
  readonly destroy?: (options: TeardownOptions) => Promise<TeardownOutcome>;
}

/**
 * Wire teardown to every terminal transition reachable from this process's own
 * state machine. Call once at worker boot.
 *
 * The observer runs after a terminal transition has actually moved the row, so
 * completion, failure, and timeout are all covered without any of them knowing
 * that a workspace exists. Cancellation is not — see the module note above: it
 * is written by `apps/api`'s own process and never reaches this observer. A
 * lost race does not fire it either — a stale job that thought the scan was
 * elsewhere must not delete a running audit's source.
 *
 * @returns an unregister function. Tests use it; production does not need it.
 */
export function installTerminalTeardown(options: InstallTeardownOptions): () => void {
  const owner = options.owner ?? processCleanupOwner;
  const destroy = options.destroy ?? destroyScanWorkspace;

  const observer: TerminalObserver = async ({ scanId }) => {
    const recorded = owner.pathFor(scanId);
    await destroy({
      baseDir: owner.baseDirFor(scanId) ?? options.baseDir,
      scanId,
      // Undefined derives `<baseDir>/<scanId>`, which is correct for a scan this
      // process never created — the case after a restart.
      ...(recorded === undefined ? {} : { path: recorded }),
      ...(options.db === undefined ? {} : { db: options.db }),
      owner,
      ...(options.purgeArtifacts === undefined ? {} : { purgeArtifacts: options.purgeArtifacts }),
      ...(options.onError === undefined ? {} : { onError: options.onError }),
    });
  };

  return onTerminalTransition(observer);
}

export interface OrphanSweepOptions {
  readonly baseDir: string;
  /**
   * Which of these scan ids are still running. Injected rather than queried here
   * so this module needs no opinion about the scan schema, and so the sweep is
   * testable without a database. Phase 3 supplies a `state NOT IN terminal`
   * lookup.
   */
  readonly liveScanIds: (candidates: readonly string[]) => Promise<ReadonlySet<string>>;
  readonly db?: WorkspaceStore;
  readonly owner?: WorkspaceCleanupOwner;
  readonly purgeArtifacts?: ArtifactPurgeStep;
  readonly onError?: (error: unknown, context: string) => void;
}

/**
 * The backstop for a worker that died mid-scan.
 *
 * The in-process hook covers every exit path the process lives to see. A SIGKILL
 * is not one of them, and FR-090 does not exempt a crash — so a directory whose
 * scan is no longer running is destroyed here. Anything still running is left
 * strictly alone: this sweep runs beside live audits, and deleting the source of
 * one of them would be a far worse bug than the leak it is fixing.
 */
export async function sweepOrphanedWorkspaces(
  options: OrphanSweepOptions,
): Promise<readonly TeardownOutcome[]> {
  let entries: string[];
  try {
    entries = await readdir(options.baseDir);
  } catch (error) {
    // No base directory yet is the normal state of a fresh worker, not a fault.
    if (!isMissing(error)) (options.onError ?? defaultOnError)(error, 'workspace sweep');
    return [];
  }

  if (entries.length === 0) return [];
  const live = await options.liveScanIds(entries);

  const outcomes: TeardownOutcome[] = [];
  for (const scanId of entries) {
    if (live.has(scanId)) continue;
    outcomes.push(
      await destroyScanWorkspace({
        baseDir: options.baseDir,
        scanId,
        ...(options.db === undefined ? {} : { db: options.db }),
        ...(options.owner === undefined ? {} : { owner: options.owner }),
        ...(options.purgeArtifacts === undefined ? {} : { purgeArtifacts: options.purgeArtifacts }),
        ...(options.onError === undefined ? {} : { onError: options.onError }),
      }),
    );
  }
  return outcomes;
}

/**
 * The filesystem half of FR-009's artifact purge (finding H4).
 *
 * `deleteAccount` in `apps/api` takes an injectable `ArtifactPurger` and warns
 * when none is wired; this satisfies its workspace-path half using the same
 * confined teardown, so account deletion cannot become a delete primitive
 * either — a path outside the base directory is refused and reported, not
 * obeyed. The R2 objects (reports, retained source) remain T189's, and no R2
 * client is invented here.
 *
 * Deliberately structural rather than an import: `apps/worker` and `apps/api` are
 * separate deployable units (R16) and neither depends on the other. Wiring this
 * into the API needs the type moved to `packages/`, which is Phase 3's call.
 */
export interface WorkspacePurgeResult {
  readonly purged: readonly string[];
  readonly refused: readonly string[];
}

export function createWorkspacePurger(options: {
  readonly baseDir: string;
  readonly onError?: (error: unknown, context: string) => void;
}): {
  purge(artifacts: {
    readonly userId: string;
    readonly workspacePaths: readonly string[];
  }): Promise<WorkspacePurgeResult>;
} {
  return {
    async purge(artifacts): Promise<WorkspacePurgeResult> {
      const purged: string[] = [];
      const refused: string[] = [];
      for (const path of artifacts.workspacePaths) {
        const outcome = await destroyScanWorkspace({
          baseDir: options.baseDir,
          // The scan id is not recoverable from a path once the row is gone, and
          // the path is what FR-009 collected. It is confinement-checked either
          // way, which is the property that matters here.
          scanId: artifacts.userId,
          path,
          ...(options.onError === undefined ? {} : { onError: options.onError }),
        });
        if (outcome.destroyed) purged.push(path);
        else refused.push(path);
      }
      return { purged, refused };
    },
  };
}
