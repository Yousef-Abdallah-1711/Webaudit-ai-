/**
 * T051 — the boundary is the guarantee, so it gets a test.
 *
 * `guardedFetch` takes an address policy and a DNS resolver, because the adverse
 * suites need to serve hops from loopback and script a rebinding resolver. If
 * either ever became reachable from outside this package, every SC-018 assertion
 * would still pass and the guarantee would be gone — a capability could ask for
 * `{ allowLoopback: true }` and read the metadata service.
 *
 * So this asserts the shape of the door, not the behaviour behind it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import * as publicSurface from '../../src/index.js';
import { ok, startFixture, type FixtureServer } from '../helpers/http-fixture.js';

interface PackageManifest {
  readonly exports: Record<string, string>;
  readonly dependencies?: Record<string, string>;
}

const manifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as PackageManifest;

describe('the package entry point', () => {
  it('is the only path other packages can import', () => {
    // A subpath export, or a wildcard, would expose policy.ts and safe-fetch.ts.
    expect(Object.keys(manifest.exports)).toEqual(['.']);
    expect(manifest.exports['.']).toBe('./src/index.ts');
  });

  it('exports the guarded fetch, the browser proxy, the refusal, and nothing else', () => {
    // `createSafeBrowserProxy` (P2-SSRF-1) is the one deliberate addition to
    // this list since T051 — its own signature accepts no `policy`/
    // `allowLoopback` (see the dedicated smuggling test below), so it does
    // not reopen the gap this test exists to catch.
    expect(Object.keys(publicSurface).sort()).toEqual([
      'SsrfRefusedError',
      'assertPublicTarget',
      'createSafeBrowserProxy',
      'safeFetch',
    ]);
  });

  it('ignores a policy smuggled past its signature', async () => {
    // The type system stops this at compile time. This is the runtime half: a
    // caller reaching for `guardedFetch`'s shape through the public function
    // gets the default policy anyway, so loopback stays refused.
    const smuggle = publicSurface.safeFetch as unknown as (
      url: string,
      init: unknown,
      extra?: unknown,
    ) => Promise<unknown>;

    await expect(
      smuggle('http://127.0.0.1:1/', { policy: { allowLoopback: true } }, { allowLoopback: true }),
    ).rejects.toMatchObject({
      name: 'SsrfRefusedError',
      reason: 'LITERAL_ADDRESS_DISALLOWED',
      addressClass: 'LOOPBACK',
    });
  });

  it('gives assertPublicTarget no policy seam either', async () => {
    const smuggle = publicSurface.assertPublicTarget as unknown as (
      url: string,
      extra?: unknown,
    ) => Promise<unknown>;

    await expect(
      smuggle('http://127.0.0.1/', { policy: { allowLoopback: true } }),
    ).rejects.toMatchObject({ name: 'SsrfRefusedError', addressClass: 'LOOPBACK' });
  });

  it('gives createSafeBrowserProxy no policy seam either (P2-SSRF-1)', async () => {
    // Same shape of test as the two above: a caller reaching for the
    // internal implementation's shape through the public function still
    // gets the default policy, so loopback stays refused through the proxy
    // too — smuggling `policy`/`allowLoopback` through the public export has
    // no effect. A real local server stands in for the disallowed target,
    // so a leak would be observable as its content actually arriving.
    let victim: FixtureServer | undefined;
    let proxy: { port: number; close(): Promise<void> } | undefined;
    try {
      victim = await startFixture(ok('LOOPBACK-MUST-NOT-LEAK'));
      const smuggle = publicSurface.createSafeBrowserProxy as unknown as (
        options?: unknown,
      ) => Promise<{ port: number; close(): Promise<void> }>;
      proxy = await smuggle({ policy: { allowLoopback: true }, resolver: undefined });

      const tunneled = await new Promise<{ status: number }>((resolve, reject) => {
        const req = httpRequest({
          host: '127.0.0.1',
          port: proxy!.port,
          method: 'CONNECT',
          path: `127.0.0.1:${String(victim!.port)}`,
        });
        req.on('connect', (res, socket) => {
          resolve({ status: res.statusCode ?? 0 });
          socket.destroy();
        });
        req.on('error', reject);
        req.end();
      });

      expect(tunneled.status).not.toBe(200);
      expect(victim.requests).toHaveLength(0);
    } finally {
      await victim?.close();
      await proxy?.close();
    }
  });

  it('reaches the network through undici only', () => {
    // Principle IV's sibling: one HTTP client, in one package, behind one guard.
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(['undici']);
  });
});
