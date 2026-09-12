/**
 * P2-SSRF-1 — the browser pool's local forward proxy, tested directly against
 * its own internal option surface (real loopback test servers,
 * `policy: { allowLoopback: true }`), matching the existing precedent
 * `ssrf.redirect.test.ts`/`ssrf.rebinding.test.ts` already set for the fetch
 * guard: the relaxation cannot leak out of this file because
 * `createSafeBrowserProxyInternal` is imported here via a same-package
 * relative path, never through `index.ts`'s public, restricted export
 * (specs/003-fix-browser-pool-ssrf/research.md, Decision 3/4).
 *
 * A raw HTTP `CONNECT` client stands in for what Chromium's own network stack
 * does when given a proxy — proving the proxy's own logic doesn't need a real
 * browser to validate.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { request as httpRequest } from 'node:http';
import type { Socket } from 'node:net';
import { createSafeBrowserProxyInternal, type SafeBrowserProxy } from '../../src/browser-proxy.js';
import { systemResolver, type AddressResolver } from '../../src/resolve-guard.js';
import { ok, startFixture, type FixtureServer } from '../helpers/http-fixture.js';

const ALLOW_LOOPBACK_FOR_TEST = { allowLoopback: true };

interface TunnelResult {
  readonly status: number;
  readonly body: string;
}

/** Tunnels through the proxy exactly the way a real HTTP client (or
 *  Chromium, via Playwright's `proxy` launch option) does: issue a `CONNECT`
 *  for the target, then speak plain HTTP over the resulting tunnel. */
async function connectThroughProxy(
  proxy: SafeBrowserProxy,
  targetHostPort: string,
): Promise<TunnelResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port: proxy.port,
      method: 'CONNECT',
      path: targetHostPort,
    });
    req.on('connect', (res, socket: Socket) => {
      if (res.statusCode !== 200) {
        resolve({ status: res.statusCode ?? 0, body: '' });
        socket.destroy();
        return;
      }
      const host = targetHostPort.split(':')[0];
      socket.write(`GET / HTTP/1.1\r\nHost: ${host ?? ''}\r\nConnection: close\r\n\r\n`);
      const chunks: Buffer[] = [];
      socket.on('data', (chunk: Buffer) => chunks.push(chunk));
      socket.on('end', () =>
        resolve({ status: 200, body: Buffer.concat(chunks).toString('utf8') }),
      );
      socket.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

const servers: FixtureServer[] = [];
const proxies: SafeBrowserProxy[] = [];

async function fixture(): Promise<FixtureServer> {
  const server = await startFixture(ok('REAL-CONTENT-VIA-TUNNEL'));
  servers.push(server);
  return server;
}

async function proxy(
  options: Parameters<typeof createSafeBrowserProxyInternal>[0],
): Promise<SafeBrowserProxy> {
  const p = await createSafeBrowserProxyInternal(options);
  proxies.push(p);
  return p;
}

/** Maps fixed test hostnames to fixed addresses, so a test can name a
 *  hostname without needing real DNS or real internal infrastructure — any
 *  hostname not in the map (e.g. a literal IP like `127.0.0.1`) falls
 *  through to the real system resolver unchanged. */
function fakeResolver(map: Record<string, string>): AddressResolver {
  return (hostname: string) => {
    const address = map[hostname];
    if (address === undefined) return systemResolver(hostname);
    return Promise.resolve([{ address, family: 4 as const }]);
  };
}

beforeEach(() => {
  servers.length = 0;
  proxies.length = 0;
});

afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  await Promise.all(proxies.map((p) => p.close()));
});

describe('P2-SSRF-1 — the browser proxy refuses disallowed addresses before relaying anything', () => {
  it('refuses a private-range address, never opening a real connection', async () => {
    const resolver = fakeResolver({ 'private.test': '10.1.2.3' });
    const p = await proxy({ resolver });

    const result = await connectThroughProxy(p, 'private.test:80');
    expect(result.status).not.toBe(200);
  });

  it('refuses a cloud-metadata address', async () => {
    const resolver = fakeResolver({ 'metadata.test': '169.254.169.254' });
    const p = await proxy({ resolver });

    const result = await connectThroughProxy(p, 'metadata.test:80');
    expect(result.status).not.toBe(200);
  });

  it('refuses loopback under the default policy (no allowance configured)', async () => {
    const server = await fixture();
    const p = await proxy({}); // default policy — no allowLoopback

    const result = await connectThroughProxy(p, `127.0.0.1:${String(server.port)}`);
    expect(result.status).not.toBe(200);
    expect(server.requests).toHaveLength(0); // refused before any byte reached it
  });

  it('a resolver answering with a disallowed address is refused — the classification acts on the real resolved address, not the hostname string', async () => {
    const resolver = fakeResolver({ 'looks-fine.test': '169.254.169.254' });
    const p = await proxy({ resolver });

    const result = await connectThroughProxy(p, 'looks-fine.test:80');
    expect(result.status).not.toBe(200);
  });
});

describe('P2-SSRF-1 — a legitimate, allowed request tunnels real content end-to-end', () => {
  it('delivers the real response body through the tunnel for an allowed test target', async () => {
    const server = await fixture();
    const p = await proxy({ policy: ALLOW_LOOPBACK_FOR_TEST });

    const result = await connectThroughProxy(p, `127.0.0.1:${String(server.port)}`);
    expect(result.status).toBe(200);
    expect(result.body).toContain('REAL-CONTENT-VIA-TUNNEL');
  });
});

describe('P2-SSRF-1 — no trust carried across requests (the "redirect" requirement at the proxy layer)', () => {
  it('refuses a second, independent request to a disallowed target through the same proxy instance, even immediately after an allowed one succeeded', async () => {
    const allowedServer = await fixture();
    const resolver = fakeResolver({ 'disallowed-second-hop.test': '169.254.169.254' });
    const p = await proxy({ policy: ALLOW_LOOPBACK_FOR_TEST, resolver });

    const first = await connectThroughProxy(p, `127.0.0.1:${String(allowedServer.port)}`);
    expect(first.status).toBe(200);

    const second = await connectThroughProxy(p, 'disallowed-second-hop.test:80');
    expect(second.status).not.toBe(200);
  });
});
