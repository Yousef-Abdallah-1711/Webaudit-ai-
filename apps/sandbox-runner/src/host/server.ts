/**
 * T223 — the sandbox protocol host: the platform's single inbound channel
 * to `sandbox-runner` (`contracts/realtime-and-internal.md` §3), and the
 * per-request orchestrator tying every other piece in this directory
 * together — build the harness once, then for each request: fork a fresh
 * child (T220) under the process boundary, arm the wall-clock timeout
 * (T221), classify an abnormal exit against the memory ceiling (T222),
 * and translate whatever happens into one `SandboxResponse`.
 *
 * **The `--allow-fs-read` scope, and why it is what it is.** The child
 * needs to read exactly three things to boot at all: the pre-built harness
 * bundle itself (`build-harness.ts` — self-contained, no `@webaudit/*`
 * import left unresolved), and two `node_modules` trees for the one
 * dependency deliberately left un-bundled (`undici`, see that file's own
 * note) — this package's own `node_modules` (where its symlink lives) and
 * the repo root's (where pnpm's real store the symlink resolves to
 * actually is; confirmed empirically that Node's permission model checks
 * the *resolved* path, not the symlink's own). No `--allow-fs-write`, no
 * `--allow-child-process`, no `--allow-worker`, ever — nothing the
 * trusted harness code does at runtime needs any of them. The untrusted
 * capability inside the `vm.Context` (`child-harness/load.ts`) cannot read
 * any of this regardless of what the process permits: it never has a
 * `require`/`fetch`/`fs` reference to begin with.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHarnessBundle } from './build-harness.js';
import { memoryExecArgv, isMemoryExceededExit } from '../limits/memory.js';
import { armTimeout } from '../limits/timeout.js';
import type { ChildResponseMessage, SandboxRequest, SandboxResponse } from '../protocol.js';

export interface SandboxHost {
  readonly port: number;
  close(): Promise<void>;
}

export interface CreateSandboxHostOptions {
  /** 0 lets the OS pick a free port — what every test in this package uses. */
  readonly port?: number;
  /**
   * T225 — defaults to `'127.0.0.1'`, exactly what every existing caller
   * already got before this option existed, so every test in this package
   * that omits it keeps behaving identically. Only `serve.ts` (the real
   * process entrypoint) ever passes something else, and only because a
   * deployed instance needs to accept connections from `apps/api`'s
   * deployment rather than only from itself.
   */
  readonly host?: string;
}

interface WireSandboxRequest extends Omit<SandboxRequest, 'capabilityBundle'> {
  /** Base64 — `Uint8Array` is not JSON-representable, so the wire body carries it this way. */
  readonly capabilityBundle: string;
}

function badRequest(res: ServerResponse, message: string): void {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

export class RequestTooLargeError extends Error {
  override readonly name = 'RequestTooLargeError';
}

/**
 * An adversarial review of this task found `readJsonBody` had no bound at
 * all — a 20 MB body was accepted and fully buffered before anything
 * downstream even looked at it. Unlike a hostile capability's own attempts
 * (contained by the process/language boundaries once forked), this is a
 * host-level memory-exhaustion risk against the one process this whole
 * design exists to keep alive, reachable before any child is even spawned.
 * 16 MB is generous for a bundle of JS source (this session's own bundle
 * format, `load.ts`'s module note) plus JSON overhead, while still bounding
 * the worst case.
 */
const MAX_REQUEST_BODY_BYTES = 16 * 1024 * 1024;

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_REQUEST_BODY_BYTES) {
      // Deliberately does NOT call `req.destroy()` here — that tears down
      // the shared underlying socket before the 413 response below can
      // ever be written, so the caller sees a raw connection reset instead
      // of a clean HTTP error (confirmed the hard way: this session's own
      // first attempt at this fix produced exactly that). Just stop
      // reading and let the caller finish writing a real response; Node's
      // own `http.Server` reclaims the now-unconsumed stream once the
      // response ends.
      throw new RequestTooLargeError(
        `request body exceeds ${String(MAX_REQUEST_BODY_BYTES)} bytes`,
      );
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text === '' ? undefined : JSON.parse(text);
}

/** T251 — absent is valid (RUN_CODE_LAYER/REVERIFY never send one); present must be well-shaped. */
function isWellShapedManifestField(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return typeof m['name'] === 'string' && typeof m['version'] === 'string';
}

function isWireSandboxRequest(value: unknown): value is WireSandboxRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['requestId'] === 'string' &&
    typeof v['capabilityBundle'] === 'string' &&
    (v['operation'] === 'CONFORMANCE' ||
      v['operation'] === 'RUN_CODE_LAYER' ||
      v['operation'] === 'REVERIFY') &&
    typeof v['input'] === 'object' &&
    v['input'] !== null &&
    typeof v['limits'] === 'object' &&
    v['limits'] !== null &&
    typeof (v['limits'] as Record<string, unknown>)['wallClockMs'] === 'number' &&
    typeof (v['limits'] as Record<string, unknown>)['memoryMb'] === 'number' &&
    isWellShapedManifestField(v['manifest'])
  );
}

/** Runs exactly one `SandboxRequest` to completion in a fresh child process. */
async function executeOne(
  request: SandboxRequest,
  bundlePath: string,
  readAllowlist: readonly string[],
): Promise<SandboxResponse> {
  return new Promise((resolve) => {
    const execArgv = [
      '--permission',
      ...readAllowlist.map((dir) => `--allow-fs-read=${dir}${path.sep}*`),
      ...memoryExecArgv(request.limits.memoryMb),
    ];

    let child: ChildProcess;
    try {
      child = fork(bundlePath, [], {
        execArgv,
        env: {},
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
    } catch (error) {
      resolve({
        requestId: request.requestId,
        ok: false,
        reason: 'CRASHED',
        detail: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    let settled = false;
    let stderr = '';
    let killedForTimeout = false;

    // An adversarial review of this task found that a *successful* response
    // never killed its child at all — only the TIMEOUT path did (via
    // `armTimeout`'s own `SIGKILL`). Every other outcome (`ok: true`,
    // `FORBIDDEN_ACCESS`, `CONTRACT_VIOLATION`, `BUNDLE_INVALID`) left a
    // live child behind, its `process.on('message', ...)` IPC listener
    // holding its event loop open forever — confirmed directly: 7
    // sequential requests against one host left 7 orphaned `node` processes
    // running minutes later. On real, sustained, entirely benign traffic
    // this guarantees unbounded process/heap/file-descriptor growth until
    // the host can no longer `fork()` at all — a certain host-level failure
    // requiring zero attacker cooperation. `finish` now always kills the
    // child once a response is ready, unconditionally — `ChildProcess.kill()`
    // on an already-exited process is a documented no-op, so this is safe
    // to call even on the TIMEOUT/CRASHED/MEMORY_EXCEEDED paths where the
    // child is already gone.
    const finish = (response: SandboxResponse): void => {
      if (settled) return;
      settled = true;
      timeout.cancel();
      child.removeAllListeners();
      child.kill('SIGKILL');
      resolve(response);
    };

    const timeout = armTimeout(child, request.limits.wallClockMs, () => {
      killedForTimeout = true;
      finish({ requestId: request.requestId, ok: false, reason: 'TIMEOUT' });
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('message', (message: ChildResponseMessage) => {
      // `log` messages have no producer today — `context.ts`'s sandboxed
      // `CodeLayerContext` discards `logger` calls entirely rather than
      // forwarding them (a live host-realm forwarding callback would
      // itself be exactly the kind of cross-realm value this whole
      // redesign exists to never hand a capability — see that file's own
      // module note). The branch stays here as the honest shape of the
      // wire protocol, not as evidence anything currently sends one.
      if (message.kind === 'result') finish(message.response);
    });

    child.on('error', (error) => {
      finish({ requestId: request.requestId, ok: false, reason: 'CRASHED', detail: error.message });
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      if (killedForTimeout) return; // already resolved by armTimeout's callback
      if (isMemoryExceededExit({ code, signal, stderr })) {
        finish({ requestId: request.requestId, ok: false, reason: 'MEMORY_EXCEEDED' });
        return;
      }
      finish({
        requestId: request.requestId,
        ok: false,
        reason: 'CRASHED',
        detail: `child exited unexpectedly (code=${String(code)}, signal=${String(signal)})`,
      });
    });

    child.send({ kind: 'execute', request });
  });
}

export async function createSandboxHost(
  options: CreateSandboxHostOptions = {},
): Promise<SandboxHost> {
  const bundlePath = await buildHarnessBundle();
  const bundleDir = path.dirname(bundlePath);
  // This file lives at apps/sandbox-runner/src/host/server.ts: two levels
  // up is apps/sandbox-runner itself (this package's own node_modules,
  // where the un-bundled `undici` dependency's symlink lives); four levels
  // up is the repo root (where pnpm's real store — what that symlink
  // resolves to — actually is; Node's permission model checks the
  // *resolved* path, confirmed empirically, not the symlink's own).
  const packageDir = fileURLToPath(new URL('../../', import.meta.url));
  const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  const readAllowlist = [
    bundleDir,
    path.join(packageDir, 'node_modules'),
    path.join(repoRoot, 'node_modules'),
  ];

  const server: Server = createServer((req, res) => {
    // T225 — a plain liveness probe, ahead of the `/execute` check so it is
    // never shadowed by it. No auth, no body, nothing that could fail: an
    // orchestrator's health check must not depend on anything this process
    // could ever be missing.
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/execute') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    readJsonBody(req)
      .then(async (body) => {
        if (!isWireSandboxRequest(body)) {
          badRequest(res, 'malformed SandboxRequest');
          return;
        }

        const request: SandboxRequest = {
          requestId: body.requestId,
          capabilityBundle: Buffer.from(body.capabilityBundle, 'base64'),
          operation: body.operation,
          input: body.input,
          limits: body.limits,
          ...(body.manifest === undefined ? {} : { manifest: body.manifest }),
        };

        const response = await executeOne(request, bundlePath, readAllowlist);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      })
      .catch((error: unknown) => {
        if (error instanceof RequestTooLargeError) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
          return;
        }
        badRequest(res, error instanceof Error ? error.message : String(error));
      });
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : (options.port ?? 0);

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

/** Present only so a request id doesn't need to be caller-supplied everywhere this module is used. */
export function newRequestId(): string {
  return randomUUID();
}
