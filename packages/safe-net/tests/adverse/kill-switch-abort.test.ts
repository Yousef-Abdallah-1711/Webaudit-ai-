/**
 * SPEC 008 T023 / research R6 — a kill-switch `AbortSignal` handed to the guarded
 * fetch interrupts a request that is already in flight, instead of the work only
 * being skipped at the next discrete step. The composed signal is
 * `AbortSignal.any([options.signal, deadline])` in `safe-fetch.ts`.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { guardedFetch } from '../../src/safe-fetch.js';
import type { AddressPolicy } from '../../src/policy.js';
import { startFixture, type FixtureServer } from '../helpers/http-fixture.js';

const LOOPBACK: AddressPolicy = { allowLoopback: true };
const servers: FixtureServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

describe('kill-switch signal composed into the guarded fetch', () => {
  it('aborts a slow in-flight request promptly, long before its own deadline', async () => {
    const server = await startFixture(() => {
      /* never respond: the request hangs until something aborts it */
    });
    servers.push(server);
    const controller = new AbortController();
    const started = Date.now();
    const pending = guardedFetch(`${server.origin}/slow`, {
      policy: LOOPBACK,
      timeoutMs: 30_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 150);
    await expect(pending).rejects.toBeDefined();
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it('an already-aborted signal sends nothing at all', async () => {
    const server = await startFixture((_req, res) => res.end('ok'));
    servers.push(server);
    const controller = new AbortController();
    controller.abort();
    await expect(
      guardedFetch(`${server.origin}/x`, {
        policy: LOOPBACK,
        timeoutMs: 5_000,
        signal: controller.signal,
      }),
    ).rejects.toBeDefined();
    expect(server.requests).toHaveLength(0);
  });
});
