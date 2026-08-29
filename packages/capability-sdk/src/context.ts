/**
 * T072 — `CodeLayerContext`: "the capability's only door to the outside".
 *
 * The contract puts it plainly: "No `net`, `fs`, `child_process`, or provider
 * client is reachable from a capability. Everything a capability may do to the
 * outside world goes through this object, which is how FR-025's platform egress
 * restriction and FR-090's workspace confinement are enforced rather than
 * requested."
 *
 * Four doors, each narrowed to what a measurement needs:
 *
 *   - `fetch` is `safeFetch` and nothing else. No dispatcher, no policy, no
 *     agent — the four SSRF layers run on every call and every redirect (R6).
 *   - `withPage` is a callback, not a getter. A capability cannot hold a page
 *     past its own turn, so the pool can reclaim it and a leaked handle cannot
 *     outlive the scan.
 *   - `readFile` and `glob` are confined by **realpath**, not by string
 *     inspection. Checking for `..` in a path is defeated by a symlink; the only
 *     honest confinement check is where the path actually lands.
 *   - `logger` passes every line through `redactText`, because a capability that
 *     logs a response body must not put a credential in the platform's logs
 *     (FR-091).
 *
 * There is deliberately no `writeFile`. A capability observes; it does not
 * modify the user's source. That also keeps FR-090's destruction guarantee
 * simple — the workspace only ever shrinks.
 */

import { readFile as fsReadFile, realpath } from 'node:fs/promises';
import { glob as fsGlob } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { redactText } from '@webaudit/redaction';
import { safeFetch } from '@webaudit/safe-net';
import type {
  AuditPage,
  CodeLayerContext,
  Logger,
  SafeFetchInit,
  SafeResponse,
} from './contract.js';

/** Raised when a capability tries to read outside its scan workspace. */
export class WorkspaceEscapeError extends Error {
  override readonly name = 'WorkspaceEscapeError';
  constructor(
    readonly requested: string,
    readonly reason: string,
  ) {
    super(`Refused to read ${requested}: ${reason}`);
  }
}

/** Where a log line goes once it has been redacted. */
export type LogSink = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  fields: Readonly<Record<string, unknown>>,
) => void;

export interface ContextOptions {
  /**
   * Absolute path to this scan's workspace. Every read is confined to it. When
   * absent, `readFile` and `glob` refuse everything — which is correct for a URL
   * audit with no source attached, and better than a context that silently reads
   * the API process's own working directory.
   */
  readonly workspaceRoot?: string;
  /**
   * How a page is obtained. Injected because pages live in `probe-pool`, a
   * separate deployment (R16) — the API process must not be able to launch a
   * browser, and a capability must not be able to tell the difference.
   */
  readonly pageProvider?: <T>(fn: (page: AuditPage) => Promise<T>) => Promise<T>;
  readonly signal: AbortSignal;
  readonly sink?: LogSink;
  /** Prefixed to every log line so a line is attributable to a capability. */
  readonly capabilityId: string;
}

function defaultSink(): LogSink {
  return (level, message, fields) => {
    const suffix = Object.keys(fields).length === 0 ? '' : ` ${JSON.stringify(fields)}`;
    const line = `${message}${suffix}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    // debug and info are dropped by default: the platform's log level is a
    // deployment decision, and a capability should not be able to set it.
  };
}

/**
 * Redact the message and every field value.
 *
 * Fields matter as much as the message. `logger.info('fetched', { headers })` is
 * the realistic way a token reaches a log, and a redactor that only cleaned the
 * message would miss all of it.
 */
function redactFields(
  fields: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  if (fields === undefined) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] =
      typeof value === 'string' ? redactText(value) : redactText(JSON.stringify(value) ?? '');
  }
  return out;
}

function createLogger(capabilityId: string, sink: LogSink): Logger {
  const emit =
    (level: 'debug' | 'info' | 'warn' | 'error') =>
    (message: string, fields?: Readonly<Record<string, unknown>>): void => {
      sink(level, `[${capabilityId}] ${redactText(message)}`, redactFields(fields));
    };
  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') };
}

/**
 * Resolve a capability-supplied relative path inside the workspace.
 *
 * Two checks, because either alone is defeated:
 *
 *   1. Lexical — the joined path must stay under the root. Catches `../..` and
 *      absolute paths before any I/O happens.
 *   2. Realpath — the *resolved* path must stay under the resolved root. Catches
 *      a symlink inside the workspace pointing at `/etc/shadow`, which passes
 *      every lexical check ever written.
 *
 * The realpath check runs on the file when it exists and on its nearest existing
 * ancestor when it does not, so a missing file is refused as "not found" rather
 * than accidentally permitted.
 */
async function resolveInsideWorkspace(root: string, relPath: string): Promise<string> {
  if (isAbsolute(relPath)) {
    throw new WorkspaceEscapeError(relPath, 'absolute paths are not permitted');
  }
  if (relPath.includes('\0')) {
    throw new WorkspaceEscapeError(relPath, 'path contains a NUL byte');
  }

  const rootReal = await realpath(root);
  const candidate = resolve(rootReal, relPath);

  const lexical = relative(rootReal, candidate);
  if (lexical === '' || lexical.startsWith('..') || isAbsolute(lexical)) {
    throw new WorkspaceEscapeError(relPath, 'resolves outside the scan workspace');
  }

  // Walk up to the nearest path that exists, and realpath that.
  let probe = candidate;
  for (;;) {
    try {
      const real = await realpath(probe);
      const realRelative = relative(rootReal, real);
      if (realRelative !== '' && (realRelative.startsWith('..') || isAbsolute(realRelative))) {
        throw new WorkspaceEscapeError(relPath, 'a symlink on this path leaves the workspace');
      }
      break;
    } catch (error) {
      if (error instanceof WorkspaceEscapeError) throw error;
      const parent = resolve(probe, '..');
      if (parent === probe || parent.length < rootReal.length) break;
      probe = parent;
    }
  }

  return candidate;
}

/**
 * Build the context handed to one capability for one scan.
 *
 * Constructed per capability rather than shared: `capabilityId` is baked into
 * every log line, and a shared context would let one capability's abort cancel
 * another's work.
 */
export function createCodeLayerContext(options: ContextOptions): CodeLayerContext {
  const sink = options.sink ?? defaultSink();
  const logger = createLogger(options.capabilityId, sink);
  const root = options.workspaceRoot;

  return {
    fetch(url: string, init?: SafeFetchInit): Promise<SafeResponse> {
      // The capability's signal is merged in, so an abort stops in-flight
      // requests rather than waiting for them to finish being ignored.
      const merged =
        init?.signal === undefined
          ? options.signal
          : AbortSignal.any([options.signal, init.signal]);
      return safeFetch(url, { ...init, signal: merged });
    },

    withPage<T>(fn: (page: AuditPage) => Promise<T>): Promise<T> {
      if (options.pageProvider === undefined) {
        return Promise.reject(
          new Error('No browser pool is configured for this scan; withPage is unavailable.'),
        );
      }
      return options.pageProvider(fn);
    },

    async readFile(relPath: string): Promise<Buffer> {
      if (root === undefined) {
        throw new WorkspaceEscapeError(relPath, 'this scan has no attached source');
      }
      const absolute = await resolveInsideWorkspace(root, relPath);
      return fsReadFile(absolute);
    },

    async glob(pattern: string): Promise<readonly string[]> {
      if (root === undefined) {
        throw new WorkspaceEscapeError(pattern, 'this scan has no attached source');
      }
      if (isAbsolute(pattern) || pattern.includes('..')) {
        throw new WorkspaceEscapeError(pattern, 'a glob must stay inside the workspace');
      }
      const rootReal = await realpath(root);
      const matches: string[] = [];
      for await (const entry of fsGlob(pattern, { cwd: rootReal, withFileTypes: false })) {
        const asString = typeof entry === 'string' ? entry : String(entry);
        // A glob can follow a symlink out; confirm each result the same way a
        // read would be confirmed rather than trusting the walker.
        try {
          await resolveInsideWorkspace(rootReal, asString);
          matches.push(asString.split(sep).join('/'));
        } catch {
          // Silently dropped: a capability has no business knowing that a path
          // it cannot reach exists.
        }
      }
      return matches.sort();
    },

    logger,
    signal: options.signal,
  };
}

/** Where a workspace lives, given a scan id. One directory per scan (FR-090). */
export function workspacePathFor(baseDir: string, scanId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(scanId)) {
    throw new WorkspaceEscapeError(scanId, 'not a usable scan id');
  }
  return join(baseDir, scanId);
}
