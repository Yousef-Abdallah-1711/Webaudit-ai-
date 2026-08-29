/**
 * T102 — SC-015: "Zero audits retain user source after ending, verified by
 * inspection following normal completion, failure, timeout, and cancellation."
 *
 * FR-090 states the obligation: "store user source only for the duration of the
 * audit, and MUST destroy it when the audit ends, including on failure, timeout,
 * and cancellation." Four endings, and three of them are the ones that get
 * forgotten — a `finally` around the happy path satisfies exactly one.
 *
 * So this suite verifies by **inspection of the filesystem**, not by watching for
 * a call. Every path plants real files in a real directory and then asserts the
 * directory is gone. A mock that recorded `destroy()` was invoked would pass
 * against an implementation that unlinks nothing.
 *
 * Four things beyond the four paths are asserted here, because each is a way the
 * guarantee fails while looking green:
 *
 *   1. **A non-terminal transition destroys nothing.** An implementation that
 *      tears down on every transition passes all four path tests and deletes the
 *      source of every running audit at phase 1. This negative control is what
 *      separates "on every exit path" from "on every path".
 *   2. **A lost race destroys nothing.** `transition` returns `moved: false` when
 *      the scan is not where the caller thought. Tearing down anyway deletes a
 *      live audit's source because a stale job asked to fail it.
 *   3. **Teardown is idempotent.** The sweep runs on a schedule and a scan can be
 *      destroyed twice. Destroying a workspace that is already gone is success,
 *      not an error — FR-090 asks for absence, and absence is what a second run
 *      finds.
 *   4. **Teardown is confined.** A teardown that can be pointed anywhere is a
 *      remote delete primitive. The path comes from a database column, so it is
 *      treated as input: refused unless it realpaths inside the configured base
 *      directory, and links are unlinked rather than followed.
 */

import { lstat, mkdtemp, mkdir, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModuleType, ScanState } from '@webaudit/types';
import { transition } from '../../src/orchestrator/state-machine.js';
import { sweepTimedOutScans } from '../../src/orchestrator/timeout.js';
import { createScanWorkspace } from '../../src/workspace/create.js';
import {
  createWorkspacePurger,
  destroyScanWorkspace,
  installTerminalTeardown,
  sweepOrphanedWorkspaces,
  WorkspaceCleanupOwner,
} from '../../src/workspace/teardown.js';

/** A junction stands in for a symlink on Windows, where a link needs elevation. */
const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';

const SCAN_ID = 'scan_ck7j9zx1q0000abcd';

let base: string;
let outside: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'webaudit-ws-'));
  outside = await mkdtemp(join(tmpdir(), 'webaudit-outside-'));
  // The sentinel every confinement assertion checks for. If teardown ever
  // becomes a delete primitive, this is the file that disappears.
  await writeFile(join(outside, 'do-not-delete.txt'), 'host file', 'utf8');
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

/** Does anything at all remain at this path? SC-015 is a question about absence. */
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Plant a realistic uploaded source tree: nested directories, a lockfile, and
 * something that looks like a credential. The credential is the point — SC-015
 * is a retention guarantee, and "we left node_modules behind" is a leak.
 */
async function plantSource(root: string): Promise<readonly string[]> {
  const files = [
    'package.json',
    'src/index.ts',
    'src/deep/nested/again/component.tsx',
    '.env',
    'node_modules/.package-lock.json',
  ];
  for (const relative of files) {
    const absolute = join(root, relative);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI-EXAMPLEKEY', 'utf8');
  }
  return files.map((relative) => join(root, relative));
}

interface Row {
  id: string;
  state: ScanState;
  workspacePath: string | null;
  quotedCredits: number;
  chargedCredits: number;
  requestedModules: readonly ModuleType[];
  moduleResults: readonly { module: ModuleType; state: string }[];
  extra: Record<string, unknown>;
}

function row(state: ScanState, overrides: Partial<Row> = {}): Row {
  return {
    id: SCAN_ID,
    state,
    workspacePath: null,
    quotedCredits: 4,
    chargedCredits: 4,
    requestedModules: ['UI', 'SEO', 'PERFORMANCE', 'SECURITY'],
    moduleResults: [],
    extra: {},
    ...overrides,
  };
}

/**
 * A scan store guarded exactly as Prisma's `updateMany` is: the update matches
 * only while the row is still in the state the caller named. Every lost-race
 * assertion below depends on this fake being faithful on that one point.
 */
function fakeDb(rows: Row[]) {
  let nulled = 0;
  const db = {
    scan: {
      updateMany: (args: {
        where: { id: string; state: ScanState };
        data: Record<string, unknown>;
      }): Promise<{ count: number }> => {
        const found = rows.find((r) => r.id === args.where.id && r.state === args.where.state);
        if (found === undefined) return Promise.resolve({ count: 0 });
        const { state, ...rest } = args.data;
        found.state = state as ScanState;
        found.extra = { ...found.extra, ...rest };
        return Promise.resolve({ count: 1 });
      },
      findUnique: (args: {
        where: { id: string };
        select: { state: true };
      }): Promise<{ state: ScanState } | null> => {
        const found = rows.find((r) => r.id === args.where.id);
        return Promise.resolve(found === undefined ? null : { state: found.state });
      },
      update: (args: {
        where: { id: string };
        data: { workspacePath: string | null };
      }): Promise<unknown> => {
        const found = rows.find((r) => r.id === args.where.id);
        if (found === undefined) return Promise.reject(new Error('no such scan'));
        if (args.data.workspacePath === null) nulled += 1;
        found.workspacePath = args.data.workspacePath;
        return Promise.resolve(found);
      },
      findMany: (_args: unknown): Promise<readonly never[]> =>
        Promise.resolve(rows.map((r) => ({ ...r })) as never[]),
    },
  };
  return {
    db,
    rows,
    get nulled() {
      return nulled;
    },
  };
}

/** An emitter that records instead of reaching Redis. */
function recordingEmitter() {
  const events: unknown[] = [];
  return {
    events,
    emitterFor: () => ({
      emit: async (event: unknown, persist: () => Promise<void>) => {
        await persist();
        events.push(event);
        return { persisted: true as const, published: true };
      },
    }),
  };
}

describe('SC-015 — the scan workspace is destroyed on every exit path', () => {
  describe('creation (T103)', () => {
    it('creates one directory per scan under the configured base and records it', async () => {
      const store = fakeDb([row('QUEUED')]);
      const workspace = await createScanWorkspace({
        baseDir: base,
        scanId: SCAN_ID,
        db: store.db,
      });

      expect(workspace.path).toBe(join(base, SCAN_ID));
      expect((await stat(workspace.path)).isDirectory()).toBe(true);
      expect(await readdir(base)).toEqual([SCAN_ID]);
      // The column is how the cleanup owner finds the workspace after a worker
      // restart. Without it, a crash leaks the source for ever.
      expect(store.rows[0]?.workspacePath).toBe(workspace.path);
    });

    it('registers the workspace with a cleanup owner', async () => {
      const owner = new WorkspaceCleanupOwner();
      const workspace = await createScanWorkspace({ baseDir: base, scanId: SCAN_ID, owner });
      expect(owner.pathFor(SCAN_ID)).toBe(workspace.path);
    });

    it('refuses a scan id that is not a scan id', async () => {
      for (const bad of ['../escape', '..', 'a/b', 'x'.repeat(65), '', 'has space']) {
        await expect(createScanWorkspace({ baseDir: base, scanId: bad })).rejects.toThrow();
      }
      // Nothing was created on the way to being refused.
      expect(await readdir(base)).toEqual([]);
    });
  });

  describe('the four exit paths (FR-090)', () => {
    /**
     * Table-driven for the three a caller drives directly. The transition itself
     * is the trigger — no test reaches for teardown, because production code will
     * not either.
     */
    const paths: readonly {
      readonly name: string;
      readonly from: ScanState;
      readonly to: ScanState;
    }[] = [
      { name: 'normal completion', from: 'RUNNING_DOCS', to: 'COMPLETED' },
      { name: 'failure', from: 'RUNNING_PHASE_2', to: 'FAILED' },
      { name: 'cancellation', from: 'RUNNING_PHASE_1', to: 'CANCELLED' },
    ];

    for (const path of paths) {
      it(`destroys the workspace after ${path.name}`, async () => {
        const store = fakeDb([row(path.from)]);
        const owner = new WorkspaceCleanupOwner();
        const uninstall = installTerminalTeardown({ baseDir: base, db: store.db, owner });
        try {
          const workspace = await createScanWorkspace({
            baseDir: base,
            scanId: SCAN_ID,
            db: store.db,
            owner,
          });
          const planted = await plantSource(workspace.path);
          expect(await exists(planted[0] ?? '')).toBe(true);

          const outcome = await transition(store.db, {
            scanId: SCAN_ID,
            from: path.from,
            to: path.to,
          });
          expect(outcome.moved).toBe(true);

          // Inspection, as SC-015 words it.
          for (const file of planted) expect(await exists(file)).toBe(false);
          expect(await exists(workspace.path)).toBe(false);
          expect(await readdir(base)).toEqual([]);
          // And the record of it is gone, so no sweep tries again for ever.
          expect(store.rows[0]?.workspacePath).toBeNull();
          expect(owner.pathFor(SCAN_ID)).toBeUndefined();
        } finally {
          uninstall();
        }
      });
    }

    it('destroys the workspace after a timeout', async () => {
      const store = fakeDb([row('RUNNING_PHASE_2')]);
      const owner = new WorkspaceCleanupOwner();
      const uninstall = installTerminalTeardown({ baseDir: base, db: store.db, owner });
      const emitter = recordingEmitter();
      try {
        const workspace = await createScanWorkspace({
          baseDir: base,
          scanId: SCAN_ID,
          db: store.db,
          owner,
        });
        const planted = await plantSource(workspace.path);

        // The real timeout path, not a synthetic transition: FR-038's sweep is
        // what ends a scan that ran too long, and it must take the workspace with
        // it.
        const outcomes = await sweepTimedOutScans({
          db: store.db,
          emitterFor: emitter.emitterFor,
          refund: () => Promise.resolve(),
          maxDurationMs: 1,
        });

        expect(outcomes.map((o) => o.timedOut)).toEqual([true]);
        for (const file of planted) expect(await exists(file)).toBe(false);
        expect(await exists(workspace.path)).toBe(false);
      } finally {
        uninstall();
      }
    });
  });

  describe('what must NOT be destroyed', () => {
    it('leaves the workspace alone on a non-terminal transition', async () => {
      const store = fakeDb([row('QUEUED')]);
      const owner = new WorkspaceCleanupOwner();
      const uninstall = installTerminalTeardown({ baseDir: base, db: store.db, owner });
      try {
        const workspace = await createScanWorkspace({
          baseDir: base,
          scanId: SCAN_ID,
          db: store.db,
          owner,
        });
        const planted = await plantSource(workspace.path);

        const moved = await transition(store.db, {
          scanId: SCAN_ID,
          from: 'QUEUED',
          to: 'RUNNING_PHASE_1',
        });
        expect(moved.moved).toBe(true);

        // The audit is running. Its source is what it is auditing.
        for (const file of planted) expect(await exists(file)).toBe(true);
      } finally {
        uninstall();
      }
    });

    it('leaves the workspace alone when the transition lost the race', async () => {
      // The row is running phase 1; a stale job believes it is in phase 2 and
      // tries to fail it. The guard refuses. Tearing down anyway would delete a
      // live audit's source on the strength of a stale belief.
      const store = fakeDb([row('RUNNING_PHASE_1')]);
      const owner = new WorkspaceCleanupOwner();
      const uninstall = installTerminalTeardown({ baseDir: base, db: store.db, owner });
      try {
        const workspace = await createScanWorkspace({
          baseDir: base,
          scanId: SCAN_ID,
          db: store.db,
          owner,
        });
        const planted = await plantSource(workspace.path);

        const lost = await transition(store.db, {
          scanId: SCAN_ID,
          from: 'RUNNING_PHASE_2',
          to: 'FAILED',
        });
        expect(lost.moved).toBe(false);

        for (const file of planted) expect(await exists(file)).toBe(true);
      } finally {
        uninstall();
      }
    });
  });

  describe('idempotence', () => {
    it('destroying an already-destroyed workspace succeeds', async () => {
      const store = fakeDb([row('RUNNING_DOCS')]);
      const workspace = await createScanWorkspace({
        baseDir: base,
        scanId: SCAN_ID,
        db: store.db,
      });
      await plantSource(workspace.path);

      const first = await destroyScanWorkspace({ baseDir: base, scanId: SCAN_ID, db: store.db });
      const second = await destroyScanWorkspace({ baseDir: base, scanId: SCAN_ID, db: store.db });

      expect(first.destroyed).toBe(true);
      expect(first.alreadyGone).toBe(false);
      expect(second.destroyed).toBe(true);
      expect(second.alreadyGone).toBe(true);
      expect(second.errors).toEqual([]);
    });

    it('destroying a workspace that never existed is success, not an error', async () => {
      const outcome = await destroyScanWorkspace({ baseDir: base, scanId: SCAN_ID });
      expect(outcome.destroyed).toBe(true);
      expect(outcome.alreadyGone).toBe(true);
      expect(outcome.refused).toBeNull();
    });

    it('two concurrent teardowns of the same scan both report success', async () => {
      const workspace = await createScanWorkspace({ baseDir: base, scanId: SCAN_ID });
      await plantSource(workspace.path);
      const [a, b] = await Promise.all([
        destroyScanWorkspace({ baseDir: base, scanId: SCAN_ID }),
        destroyScanWorkspace({ baseDir: base, scanId: SCAN_ID }),
      ]);
      expect(a?.destroyed).toBe(true);
      expect(b?.destroyed).toBe(true);
      expect(await exists(workspace.path)).toBe(false);
    });
  });

  describe('teardown is not a delete primitive', () => {
    it('refuses a stored path outside the configured base directory', async () => {
      const outcome = await destroyScanWorkspace({
        baseDir: base,
        scanId: SCAN_ID,
        path: outside,
      });
      expect(outcome.refused).toBe('OUTSIDE_BASE');
      expect(outcome.destroyed).toBe(false);
      expect(await exists(join(outside, 'do-not-delete.txt'))).toBe(true);
    });

    it('refuses a stored path that traverses out of the base directory', async () => {
      const outcome = await destroyScanWorkspace({
        baseDir: base,
        scanId: SCAN_ID,
        path: join(base, '..', 'webaudit-elsewhere'),
      });
      expect(outcome.refused).toBe('OUTSIDE_BASE');
      expect(outcome.destroyed).toBe(false);
    });

    it('refuses the base directory itself', async () => {
      await createScanWorkspace({ baseDir: base, scanId: SCAN_ID });
      const outcome = await destroyScanWorkspace({ baseDir: base, scanId: SCAN_ID, path: base });
      expect(outcome.refused).toBe('OUTSIDE_BASE');
      expect(await exists(base)).toBe(true);
    });

    it('unlinks a link planted inside the workspace instead of following it', async () => {
      // A hostile archive can contain a symlink. If teardown recurses through it,
      // extracting an archive becomes arbitrary host deletion.
      const workspace = await createScanWorkspace({ baseDir: base, scanId: SCAN_ID });
      await plantSource(workspace.path);
      await symlink(outside, join(workspace.path, 'vendor'), LINK_TYPE);

      const outcome = await destroyScanWorkspace({ baseDir: base, scanId: SCAN_ID });

      expect(outcome.destroyed).toBe(true);
      expect(await exists(workspace.path)).toBe(false);
      expect(await exists(join(outside, 'do-not-delete.txt'))).toBe(true);
    });

    it('does not follow a workspace root that is itself a link out', async () => {
      const link = join(base, SCAN_ID);
      await symlink(outside, link, LINK_TYPE);

      const outcome = await destroyScanWorkspace({ baseDir: base, scanId: SCAN_ID });

      // The link itself may be removed — it is inside the base directory — but
      // what it pointed at must survive.
      expect(await exists(join(outside, 'do-not-delete.txt'))).toBe(true);
      expect(outcome.errors).toEqual([]);
    });
  });

  describe('a teardown failure never fails an audit', () => {
    it('reports a filesystem failure instead of throwing', async () => {
      const workspace = await createScanWorkspace({ baseDir: base, scanId: SCAN_ID });
      await plantSource(workspace.path);
      const seen: unknown[] = [];

      const outcome = await destroyScanWorkspace({
        baseDir: base,
        scanId: SCAN_ID,
        onError: (error) => seen.push(error),
        remove: () => Promise.reject(new Error('EBUSY: device or resource busy')),
      });

      expect(outcome.destroyed).toBe(false);
      expect(outcome.errors.length).toBeGreaterThan(0);
      expect(seen.length).toBeGreaterThan(0);
      // Left in place on purpose: a path we failed to destroy must stay
      // discoverable, so the sweep and FR-009 deletion find it again.
      expect(await exists(workspace.path)).toBe(true);
    });

    it('does not fail the transition when teardown throws', async () => {
      const store = fakeDb([row('RUNNING_DOCS')]);
      const uninstall = installTerminalTeardown({
        baseDir: base,
        db: store.db,
        // The pathological case: the teardown hook itself is broken.
        destroy: () => Promise.reject(new Error('teardown exploded')),
      });
      try {
        const outcome = await transition(store.db, {
          scanId: SCAN_ID,
          from: 'RUNNING_DOCS',
          to: 'COMPLETED',
        });
        // The state moved and stayed moved. An audit that finished is finished
        // even if the cleanup of its scratch directory failed.
        expect(outcome.moved).toBe(true);
        expect(store.rows[0]?.state).toBe('COMPLETED');
      } finally {
        uninstall();
      }
    });

    it('leaves the recorded path in place when destruction failed', async () => {
      const store = fakeDb([row('RUNNING_DOCS')]);
      await createScanWorkspace({ baseDir: base, scanId: SCAN_ID, db: store.db });
      const outcome = await destroyScanWorkspace({
        baseDir: base,
        scanId: SCAN_ID,
        db: store.db,
        remove: () => Promise.reject(new Error('EPERM')),
      });
      expect(outcome.destroyed).toBe(false);
      expect(store.nulled).toBe(0);
      expect(store.rows[0]?.workspacePath).not.toBeNull();
    });

    it('nulls the recorded path once destruction succeeded', async () => {
      const store = fakeDb([row('RUNNING_DOCS')]);
      await createScanWorkspace({ baseDir: base, scanId: SCAN_ID, db: store.db });
      const outcome = await destroyScanWorkspace({ baseDir: base, scanId: SCAN_ID, db: store.db });
      expect(outcome.destroyed).toBe(true);
      expect(store.nulled).toBe(1);
    });
  });

  describe('the object-storage half of FR-090', () => {
    it('runs an injected artifact purge before the directory is removed', async () => {
      const order: string[] = [];
      const workspace = await createScanWorkspace({ baseDir: base, scanId: SCAN_ID });
      await plantSource(workspace.path);

      const outcome = await destroyScanWorkspace({
        baseDir: base,
        scanId: SCAN_ID,
        purgeArtifacts: async () => {
          // Ordered first deliberately: if object storage refuses, the local
          // record survives and the purge can be retried.
          order.push(`purge:${String(await exists(workspace.path))}`);
        },
      });

      expect(order).toEqual(['purge:true']);
      expect(outcome.artifactsPurged).toBe(true);
      expect(await exists(workspace.path)).toBe(false);
    });

    it('reports that nothing was purged when no purger is wired', async () => {
      await createScanWorkspace({ baseDir: base, scanId: SCAN_ID });
      const outcome = await destroyScanWorkspace({ baseDir: base, scanId: SCAN_ID });
      expect(outcome.artifactsPurged).toBe(false);
    });

    it('does not remove the directory when the artifact purge fails', async () => {
      const workspace = await createScanWorkspace({ baseDir: base, scanId: SCAN_ID });
      await plantSource(workspace.path);
      const outcome = await destroyScanWorkspace({
        baseDir: base,
        scanId: SCAN_ID,
        purgeArtifacts: () => Promise.reject(new Error('R2 unavailable')),
      });
      expect(outcome.destroyed).toBe(false);
      expect(await exists(workspace.path)).toBe(true);
    });
  });

  describe('the backstop for a worker that died mid-scan', () => {
    it('sweeps a workspace whose scan is no longer running', async () => {
      const dead = 'scan_deadworker000';
      await createScanWorkspace({ baseDir: base, scanId: dead });
      const live = await createScanWorkspace({ baseDir: base, scanId: SCAN_ID });
      await plantSource(live.path);

      const outcomes = await sweepOrphanedWorkspaces({
        baseDir: base,
        liveScanIds: () => Promise.resolve(new Set([SCAN_ID])),
      });

      expect(outcomes.map((o) => o.scanId)).toEqual([dead]);
      expect(await exists(join(base, dead))).toBe(false);
      // The running scan keeps its source.
      expect(await exists(live.path)).toBe(true);
    });

    it('sweeps nothing when the base directory does not exist', async () => {
      const outcomes = await sweepOrphanedWorkspaces({
        baseDir: join(base, 'never-created'),
        liveScanIds: () => Promise.resolve(new Set<string>()),
      });
      expect(outcomes).toEqual([]);
    });

    it('destroys every workspace the owner still holds', async () => {
      const owner = new WorkspaceCleanupOwner();
      const a = await createScanWorkspace({ baseDir: base, scanId: 'scan_aaaa0000', owner });
      const b = await createScanWorkspace({ baseDir: base, scanId: 'scan_bbbb0000', owner });
      await plantSource(a.path);
      await plantSource(b.path);

      const outcomes = await owner.destroyAll();

      expect(outcomes.every((o) => o.destroyed)).toBe(true);
      expect(await exists(a.path)).toBe(false);
      expect(await exists(b.path)).toBe(false);
      expect(owner.size).toBe(0);
    });
  });

  describe('FR-009 deletion reuses the same confined teardown', () => {
    it('purges only the workspace paths that live under the base directory', async () => {
      const mine = await createScanWorkspace({ baseDir: base, scanId: SCAN_ID });
      await plantSource(mine.path);

      const purger = createWorkspacePurger({ baseDir: base });
      const result = await purger.purge({
        userId: 'user_1',
        workspacePaths: [mine.path, outside, '/etc'],
      });

      expect(await exists(mine.path)).toBe(false);
      expect(await exists(join(outside, 'do-not-delete.txt'))).toBe(true);
      expect(result.refused).toEqual([outside, '/etc']);
    });
  });
});
