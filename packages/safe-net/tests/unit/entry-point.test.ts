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
import * as publicSurface from '../../src/index.js';

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

  it('exports the guarded fetch and the refusal, and nothing else', () => {
    expect(Object.keys(publicSurface).sort()).toEqual([
      'SsrfRefusedError',
      'assertPublicTarget',
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

  it('reaches the network through undici only', () => {
    // Principle IV's sibling: one HTTP client, in one package, behind one guard.
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(['undici']);
  });
});
