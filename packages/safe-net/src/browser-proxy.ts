/**
 * P2-SSRF-1 — a minimal local forward proxy that gives a real browser
 * (Chromium via Playwright) the same connect-time SSRF guarantee `safe-fetch.ts`
 * already gives `fetch()`, via a mechanism appropriate to a full browser
 * rather than reusing the undici-specific connector (`connect-guard.ts`).
 *
 * Chromium manages its own network stack — there is no way to plug a custom
 * connector into it the way undici allows. Instead, Chromium is launched with
 * `proxy: { server: 'http://127.0.0.1:<port>' }` (a real, documented
 * Playwright option), so every request it makes — the initial navigation,
 * every redirect, every sub-resource — becomes an independent request through
 * this proxy's CONNECT/plain-HTTP handling (`browser-proxy-handlers.ts`). One
 * mechanism covers all four SSRF layers by construction: there is no
 * per-connection "trust" carried from one request to the next, so a redirect
 * to a disallowed address is refused exactly the same way a disallowed
 * initial navigation is.
 *
 * Reuses this package's existing address-classification
 * (`address-rules.ts`) and DNS-resolution (`resolve-guard.ts`) logic
 * unchanged — see specs/003-fix-browser-pool-ssrf/research.md, Decision 1.
 *
 * Belt-and-suspenders (Decision 2): after resolving+validating a hostname and
 * connecting directly to that literal, validated IP (never re-resolving the
 * hostname — this is what closes the DNS-rebinding TOCTOU window), the actual
 * socket's `remoteAddress` is re-classified before any byte is relayed,
 * mirroring `connect-guard.ts`'s own "destroy first, call back second"
 * discipline.
 *
 * Public API surface (Decision 3): only `resolver` is exposed to callers
 * outside this package (via `index.ts`) — never `policy`/`allowLoopback`.
 * Supplying a resolver cannot make a disallowed address allowed; it only
 * chooses which hostname maps to which (still fully checked) address. This
 * package's own tests import this module directly to get the full internal
 * option surface, including `policy: { allowLoopback: true }`, exactly the
 * way `ssrf.redirect.test.ts`/`ssrf.rebinding.test.ts` already do for
 * `connect-guard.ts`/`resolve-guard.ts`.
 */

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { systemResolver, type AddressResolver } from './resolve-guard.js';
import { DEFAULT_POLICY, type AddressPolicy } from './policy.js';
import { handleConnect, handlePlainRequest } from './browser-proxy-handlers.js';

export interface SafeBrowserProxy {
  readonly port: number;
  close(): Promise<void>;
}

/** Full internal option surface — see this module's own header for why
 *  `policy` never reaches the public re-export in `index.ts`. */
export interface CreateSafeBrowserProxyInternalOptions {
  readonly resolver?: AddressResolver;
  readonly policy?: AddressPolicy;
}

export async function createSafeBrowserProxyInternal(
  options: CreateSafeBrowserProxyInternalOptions = {},
): Promise<SafeBrowserProxy> {
  const resolver = options.resolver ?? systemResolver;
  const policy = options.policy ?? DEFAULT_POLICY;

  const server = createServer((req, res) => {
    void handlePlainRequest(req, res, resolver, policy);
  });
  server.on('connect', (req, clientSocket, head) => {
    void handleConnect(req, clientSocket, head, resolver, policy);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = server.address() as AddressInfo;

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
