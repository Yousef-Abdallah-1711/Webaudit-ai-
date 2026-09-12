/**
 * P2-SSRF-1 — real end-to-end integration: does a genuine Chromium instance,
 * launched through `createBrowserPool()` with the SSRF proxy wired in,
 * actually refuse navigation to a disallowed address, and does it still load
 * a legitimate public page without regression?
 *
 * The disallowed-address scenario uses a well-known literal IP (a cloud
 * metadata address) rather than a fake hostname + injected resolver, so no
 * DNS trickery is needed — `browser-proxy.test.ts` (packages/safe-net)
 * already covers the resolver-based/redirect/loopback scenarios thoroughly
 * with real local servers; this file's job is only to prove the actual
 * wiring works with a real browser, not to re-prove the proxy's own logic
 * (specs/003-fix-browser-pool-ssrf/research.md, Decision 4).
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { Browser } from '@playwright/test';
import { createBrowserPool, type BrowserPool } from '../../src/browser/pool.js';

let pool: BrowserPool | undefined;

afterEach(async () => {
  await pool?.close();
  pool = undefined;
});

describe('P2-SSRF-1 — the real browser pool enforces SSRF protection end-to-end', () => {
  it('loads a legitimate public URL successfully (no regression for the one real consumer pattern)', async () => {
    pool = await createBrowserPool();
    const content = await pool.withPage(async (page) => {
      await page.goto('https://example.com/');
      return page.content();
    });
    expect(content).toContain('Example Domain');
  }, 30_000);

  it('refuses navigation to a well-known disallowed literal address (cloud metadata) visibly, not silently', async () => {
    pool = await createBrowserPool();
    await expect(
      pool.withPage(async (page) => {
        await page.goto('http://169.254.169.254/latest/meta-data/');
      }),
    ).rejects.toThrow();
  }, 30_000);

  it('wires a `proxy` option pointing at the started proxy into chromium.launch()', async () => {
    let capturedProxy: { server: string } | undefined;
    const fakeBrowser = {
      newContext: () =>
        Promise.resolve({
          newPage: () =>
            Promise.resolve({
              on: () => undefined,
              goto: () => Promise.resolve(),
              content: () => Promise.resolve(''),
              title: () => Promise.resolve(''),
              evaluate: () => Promise.resolve(undefined),
              screenshot: () => Promise.resolve(Buffer.alloc(0)),
            }),
          close: () => Promise.resolve(),
        }),
      close: () => Promise.resolve(),
    } as unknown as Browser;

    pool = await createBrowserPool({
      launch: (opts) => {
        capturedProxy = opts.proxy;
        return Promise.resolve(fakeBrowser);
      },
    });

    expect(capturedProxy).toBeDefined();
    expect(capturedProxy?.server).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
