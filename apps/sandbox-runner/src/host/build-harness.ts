/**
 * T220/T223 — builds the child-process entry point into one flat,
 * dependency-free `.js` file, once, before any child is ever forked.
 *
 * **Why this exists at all.** The rest of this monorepo runs TypeScript
 * source directly via `tsx` (`node --import tsx src/index.ts` — see
 * `apps/api`/`apps/worker`'s own `start` scripts) — no build step,
 * anywhere else. That convention does not survive contact with
 * `--permission`: `tsx`'s own bootstrap needs filesystem *write* access
 * (its on-disk transform cache) and, on this platform, spawns a worker
 * thread inside `esbuild`'s Node API for the transform itself — the
 * second one is fatal, because `--allow-worker` is exactly one of the four
 * process-boundary permissions this whole service exists to deny (R1).
 * Confirmed empirically, not assumed: running `--import tsx` inside a
 * `--permission --allow-worker`-less child throws `ERR_ACCESS_DENIED:
 * WorkerThreads` from inside `esbuild`'s own transform path, before the
 * harness's own code — trusted or not — ever runs.
 *
 * So the harness is compiled **once, by the unrestricted host process**
 * (which has every permission — it is not the process running untrusted
 * code) into a single self-contained bundle with every import inlined,
 * cached on disk. Each forked child then runs that flat file directly with
 * plain `node` — no loader, no compiler, no worker thread, nothing further
 * to resolve. The `--allow-fs-read` a child needs to boot at all narrows
 * to exactly the one bundle file (or its containing directory), not the
 * whole monorepo — a real, meaningful narrowing this design earns by not
 * needing `tsx`/`esbuild` inside the restricted process at all.
 */
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const HARNESS_ENTRY = fileURLToPath(new URL('../child-harness/harness.ts', import.meta.url));
const BUILD_DIR = fileURLToPath(new URL('../../.sandbox-build/', import.meta.url));
const BUNDLE_PATH = path.join(BUILD_DIR, 'harness.bundle.mjs');

async function isFresh(): Promise<boolean> {
  try {
    const [bundleStat, entryStat] = await Promise.all([stat(BUNDLE_PATH), stat(HARNESS_ENTRY)]);
    return bundleStat.mtimeMs >= entryStat.mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Builds (or reuses a fresh cached copy of) the harness bundle, returning
 * its absolute path. Idempotent and safe to call once per host process —
 * `host/server.ts` does so at startup, before accepting any request.
 */
export async function buildHarnessBundle(): Promise<string> {
  if (await isFresh()) return BUNDLE_PATH;

  await mkdir(BUILD_DIR, { recursive: true });
  await build({
    entryPoints: [HARNESS_ENTRY],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: BUNDLE_PATH,
    // `@webaudit/*` workspace packages ship raw `.ts` source with `.js`
    // import specifiers (this monorepo's own NodeNext convention) that
    // plain `node` cannot resolve without a loader — those get bundled by
    // `bundle: true`'s default. `undici` is marked external instead of
    // bundled: it uses a dynamic `require('node:assert')` internally that
    // esbuild's CJS-in-ESM interop cannot statically resolve, and unlike
    // the workspace packages it is a real, already-installed npm package
    // plain `node` resolves on its own — no loader needed for this one.
    external: ['undici'],
    logLevel: 'silent',
  });

  // Sanity check the bundle is genuinely self-contained before any child
  // ever depends on it — a build that silently emitted an external import
  // would fail inside the restricted child in a much more confusing way.
  const contents = await readFile(BUNDLE_PATH, 'utf8');
  if (/from\s+["']@webaudit\//.test(contents) || /require\(["']@webaudit\//.test(contents)) {
    throw new Error('harness bundle unexpectedly references an unbundled @webaudit/* import');
  }

  return BUNDLE_PATH;
}
