/**
 * A capability's detached callback must not be able to take the worker process
 * down with it.
 *
 * `containCapabilityCall` contains everything a capability's *returned promise*
 * can do. It structurally cannot contain a callback the capability scheduled
 * and then detached from that promise — `setTimeout`, a fire-and-forget async
 * IIFE — because that callback throws after the wrapper has already returned
 * its result. There is no promise left to race against. It becomes a bare Node
 * `uncaughtException`/`unhandledRejection`, and Node's default action for
 * either is to terminate the process, taking every concurrently-running scan
 * with it.
 *
 * The conformance suite's own docstring used to claim "an unhandled rejection"
 * was caught by the same containment wrapper — true for one the capability's
 * own code leaves unhandled before it gets back to us, false for one that fires
 * later from a detached callback. A four-line capability that does the latter
 * passes `throwing-is-contained` and then kills the process anyway, seconds
 * after the report said it was fine. That gap can only be closed at the process
 * boundary, which is what this suite proves: without `installProcessGuards`,
 * the process dies; with it installed, the process survives and the incident is
 * attributed to the right capability.
 *
 * A real process crash cannot be observed from inside the test process that
 * would also die — so this spawns a child `tsx` process for each case and
 * inspects its exit behaviour and stderr from the outside.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..', '..');

/**
 * A `file://` URL, not a raw path string. On Windows a bare `C:\...\x.js`
 * embedded as an import specifier is not a legal ESM specifier at all —
 * `pathToFileURL` is the only correct way to turn a filesystem path into one,
 * on every platform.
 */
function moduleUrl(...segments: string[]): string {
  return pathToFileURL(join(...segments)).href;
}

// Relative paths, not the package specifiers: pnpm's isolated node_modules
// only resolve `@webaudit/*` from inside a package that declares the
// dependency, and the child script here runs from a scratch temp directory
// outside any workspace package.
const PROCESS_GUARDS_MODULE = moduleUrl(HERE, '..', '..', 'src', 'process-guards.js');
const CAPABILITY_CONTEXT_MODULE = moduleUrl(
  REPO_ROOT,
  'packages',
  'capability-sdk',
  'src',
  'capability-context.js',
);

// `node` directly against tsx's CLI entry, not the `.bin` shim: on Windows the
// shim is a `.CMD`/`.ps1` wrapper that `child_process.spawn` cannot exec
// without a shell, and shelling out is one more thing to get right across
// platforms for no benefit here.
const TSX_CLI = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

let scratch: string | undefined;
afterEach(async () => {
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

interface ChildResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

async function runChild(script: string): Promise<ChildResult> {
  scratch = await mkdtemp(join(tmpdir(), 'webaudit-process-guard-'));
  const scriptPath = join(scratch, 'child.ts');
  await writeFile(scriptPath, script, 'utf8');

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, scriptPath], { cwd: REPO_ROOT, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

/**
 * A minimal, faithful stand-in for what a real capability's `runCodeLayer`
 * detached callback looks like: it returns cleanly, then something it
 * scheduled throws after the fact.
 */
const DETACHED_THROW = `
  setTimeout(() => {
    throw new Error('capability-under-test misbehaving in a detached callback');
  }, 20);
`;

describe('a detached throw is fatal without the guard', () => {
  it('kills the process (this is the vulnerability, asserted as a baseline)', async () => {
    const result = await runChild(`
      console.log('BEFORE');
      ${DETACHED_THROW}
      // Keep the event loop alive long enough for the timer to fire.
      setTimeout(() => console.log('SHOULD NOT PRINT'), 200);
    `);

    // Node's default action for an uncaught exception is a non-zero exit.
    // Confirming this is the point: it is what makes the fix necessary.
    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain('BEFORE');
    expect(result.stdout).not.toContain('SHOULD NOT PRINT');
    expect(result.stderr).toContain('capability-under-test misbehaving');
  }, 10_000);
});

describe('installProcessGuards keeps the process alive', () => {
  it('survives a detached throw and attributes it to the running capability', async () => {
    const result = await runChild(`
      import { installProcessGuards } from '${PROCESS_GUARDS_MODULE}';
      import { runAsCapability } from '${CAPABILITY_CONTEXT_MODULE}';

      installProcessGuards();

      runAsCapability('the-offending-capability', () => {
        ${DETACHED_THROW}
      });

      setTimeout(() => {
        console.log('STILL ALIVE');
        process.exit(0);
      }, 200);
    `);

    // The whole point: a non-crashing exit, and everything scheduled after the
    // detached throw still ran.
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('STILL ALIVE');
    // Attributed, not anonymous — an operator reading this can act on it.
    expect(result.stderr).toContain('the-offending-capability');
    expect(result.stderr).toContain('capability-under-test misbehaving');
  }, 10_000);

  it('survives a detached rejection the same way', async () => {
    const result = await runChild(`
      import { installProcessGuards } from '${PROCESS_GUARDS_MODULE}';
      import { runAsCapability } from '${CAPABILITY_CONTEXT_MODULE}';

      installProcessGuards();

      runAsCapability('rejecting-capability', () => {
        void Promise.reject(new Error('detached rejection, never awaited'));
      });

      setTimeout(() => {
        console.log('STILL ALIVE');
        process.exit(0);
      }, 200);
    `);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('STILL ALIVE');
    expect(result.stderr).toContain('rejecting-capability');
  }, 10_000);

  it('still logs an incident with no capability attributed, outside any context', async () => {
    const result = await runChild(`
      import { installProcessGuards } from '${PROCESS_GUARDS_MODULE}';

      installProcessGuards();
      ${DETACHED_THROW}

      setTimeout(() => {
        console.log('STILL ALIVE');
        process.exit(0);
      }, 200);
    `);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain('unattributed');
  }, 10_000);
});

describe('installProcessGuards returns a working uninstaller', () => {
  it('restores the crash-on-throw default once uninstalled', async () => {
    const result = await runChild(`
      import { installProcessGuards } from '${PROCESS_GUARDS_MODULE}';

      const uninstall = installProcessGuards();
      uninstall();
      console.log('BEFORE');
      ${DETACHED_THROW}
      setTimeout(() => console.log('SHOULD NOT PRINT'), 200);
    `);

    // A worker instance that has shut down must not leave the process
    // permanently immune to crashes — the next thing running in it (a test
    // runner reusing the process, say) gets Node's ordinary behaviour back.
    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain('BEFORE');
    expect(result.stdout).not.toContain('SHOULD NOT PRINT');
  }, 10_000);
});
