/**
 * T109's `SAFE_NET_ALLOW_TARGETS` escape hatch — see `src/index.ts`'s own
 * doc comment for why it exists and why it is not the same thing as
 * `policy.ts`'s `allowLoopback`.
 *
 * Every test restores both env vars in `finally`, since they are read from
 * `process.env` directly (module-global state) rather than injected —
 * leaving one set would poison whichever test runs next in this file, or
 * worse, the real adverse SSRF suite if vitest ever ran them in the same
 * worker.
 */

import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { assertPublicTarget, safeFetch } from '../../src/index.js';

const SAVED_ALLOW = process.env['SAFE_NET_ALLOW_TARGETS'];
const SAVED_NODE_ENV = process.env['NODE_ENV'];

afterEach(() => {
  if (SAVED_ALLOW === undefined) delete process.env['SAFE_NET_ALLOW_TARGETS'];
  else process.env['SAFE_NET_ALLOW_TARGETS'] = SAVED_ALLOW;
  if (SAVED_NODE_ENV === undefined) delete process.env['NODE_ENV'];
  else process.env['NODE_ENV'] = SAVED_NODE_ENV;
});

describe('SAFE_NET_ALLOW_TARGETS', () => {
  it('is inert by default: a loopback target is still refused', async () => {
    delete process.env['SAFE_NET_ALLOW_TARGETS'];
    await expect(assertPublicTarget('http://127.0.0.1:1/')).rejects.toMatchObject({
      name: 'SsrfRefusedError',
      addressClass: 'LOOPBACK',
    });
  });

  it('permits an exact listed origin', async () => {
    process.env['SAFE_NET_ALLOW_TARGETS'] = 'http://127.0.0.1:4173, http://127.0.0.1:9999';
    const result = await assertPublicTarget('http://127.0.0.1:4173/some/page?x=1');
    expect(result.origin).toBe('http://127.0.0.1:4173');
    expect(result.hostname).toBe('127.0.0.1');
  });

  it('still refuses a loopback origin that is not on the list', async () => {
    process.env['SAFE_NET_ALLOW_TARGETS'] = 'http://127.0.0.1:4173';
    await expect(assertPublicTarget('http://127.0.0.1:9999/')).rejects.toMatchObject({
      name: 'SsrfRefusedError',
      addressClass: 'LOOPBACK',
    });
  });

  it('still refuses every other disallowed class regardless of the list', async () => {
    process.env['SAFE_NET_ALLOW_TARGETS'] = 'http://127.0.0.1:4173';
    await expect(
      assertPublicTarget('http://169.254.169.254/latest/meta-data/'),
    ).rejects.toMatchObject({ name: 'SsrfRefusedError', addressClass: 'METADATA' });
  });

  it('refuses to start rather than silently opening the hole in production', async () => {
    process.env['SAFE_NET_ALLOW_TARGETS'] = 'http://127.0.0.1:4173';
    process.env['NODE_ENV'] = 'production';
    await expect(assertPublicTarget('http://127.0.0.1:4173/')).rejects.toThrow(
      /SAFE_NET_ALLOW_TARGETS.*production/,
    );
  });
});

/**
 * Regression coverage for a real gap found wiring T119-124: the allowlist
 * only ever reached `assertPublicTarget` (target *submission*), never
 * `safeFetch` (what a capability's `ctx.fetch` calls at *execution* time) —
 * invisible until a real capability first called `ctx.fetch` against a
 * loopback fixture and every call was refused regardless of the env var.
 * `assertPublicTarget`'s tests above cannot catch this: they never call
 * `safeFetch`.
 */
describe('SAFE_NET_ALLOW_TARGETS — safeFetch', () => {
  let server: Server;
  let origin: string;

  const start = (): Promise<void> =>
    new Promise((resolve) => {
      server = createServer((_req, res) => res.end('ok'));
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') throw new Error('no port');
        origin = `http://127.0.0.1:${String(address.port)}`;
        resolve();
      });
    });
  const stop = (): Promise<void> => new Promise((resolve) => server.close(() => resolve()));

  it('is inert by default: safeFetch still refuses a loopback target', async () => {
    await start();
    try {
      delete process.env['SAFE_NET_ALLOW_TARGETS'];
      await expect(safeFetch(`${origin}/`)).rejects.toMatchObject({
        name: 'SsrfRefusedError',
        addressClass: 'LOOPBACK',
      });
    } finally {
      await stop();
    }
  });

  it('lets safeFetch actually reach a listed origin', async () => {
    await start();
    try {
      process.env['SAFE_NET_ALLOW_TARGETS'] = origin;
      const response = await safeFetch(`${origin}/`);
      expect(response.status).toBe(200);
      expect(response.text()).toBe('ok');
    } finally {
      await stop();
    }
  });

  it('still refuses a loopback target safeFetch would reach but which is not listed', async () => {
    await start();
    try {
      process.env['SAFE_NET_ALLOW_TARGETS'] = 'http://127.0.0.1:1';
      await expect(safeFetch(`${origin}/`)).rejects.toMatchObject({
        name: 'SsrfRefusedError',
        addressClass: 'LOOPBACK',
      });
    } finally {
      await stop();
    }
  });
});
