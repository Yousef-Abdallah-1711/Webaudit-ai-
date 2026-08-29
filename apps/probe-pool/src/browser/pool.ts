/**
 * T116 — browser page provisioning: the `pageProvider` a `CodeLayerContext`
 * needs to make `ctx.withPage` work (`packages/capability-sdk/src/
 * context.ts`'s own comment: "Requests the pool's traffic... No browser pool
 * is configured for this scan; withPage is unavailable" is exactly the gap
 * this file closes).
 *
 * **Scoped to the in-process pool module only — no cross-process transport
 * exists yet, and none is built here.** `apps/probe-pool` is its own
 * deployment (`WebAuditAI_ARCHITECTURE.md`'s five units, R16), which implies
 * a real deployment eventually calls into this over some transport rather
 * than importing it directly — but no task in the 250-task list builds that
 * transport, and inventing an HTTP/RPC layer with no consumer to prove it
 * correct is exactly the kind of ahead-of-signal work this sub-phase has
 * avoided elsewhere (the capability loader, the questionnaire trigger). What
 * this file provides is real and usable today: a `pageProvider` a caller in
 * the *same* process can pass into `createCodeLayerContext` — which is
 * already how the orchestrator would use it once capabilities exist to call
 * `ctx.withPage` (T119-124, still empty). The cross-process wiring is a
 * genuine, separate gap, recorded here rather than silently assumed away.
 *
 * **One browser, short-lived contexts.** A fresh `BrowserContext` per
 * `withPage` call isolates cookies/storage between capabilities without the
 * cost of a fresh browser process each time — the same trade-off Playwright's
 * own test runner makes between `browser` (session-scoped) and `context`
 * (test-scoped).
 */

import { chromium, type Browser } from '@playwright/test';
import type { AuditPage } from '@webaudit/capability-sdk';

export interface BrowserPool {
  /** Adapts a fresh, isolated page to `AuditPage` for the duration of `fn`. */
  withPage<T>(fn: (page: AuditPage) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface CreatePoolOptions {
  readonly headless?: boolean;
  /** Injected so a test can supply a fake without a real Chromium install. */
  readonly launch?: (options: { headless: boolean }) => Promise<Browser>;
}

export async function createBrowserPool(options: CreatePoolOptions = {}): Promise<BrowserPool> {
  const launch = options.launch ?? ((opts) => chromium.launch(opts));
  const browser = await launch({ headless: options.headless ?? true });

  return {
    async withPage<T>(fn: (page: AuditPage) => Promise<T>): Promise<T> {
      const context = await browser.newContext();
      const page = await context.newPage();

      const requests: { url: string; status: number; sizeBytes: number }[] = [];
      page.on('response', (response) => {
        void response
          .body()
          .then((body) => {
            requests.push({ url: response.url(), status: response.status(), sizeBytes: body.length });
          })
          // A response whose body cannot be read (redirect, aborted) still
          // happened; record it with a zero size rather than dropping it.
          .catch(() => {
            requests.push({ url: response.url(), status: response.status(), sizeBytes: 0 });
          });
      });

      const auditPage: AuditPage = {
        async goto(url, gotoOptions): Promise<void> {
          await page.goto(url, { waitUntil: gotoOptions?.waitUntil ?? 'load' });
        },
        content: () => page.content(),
        title: () => page.title(),
        evaluate: <T2>(script: string) => page.evaluate<T2>(script),
        async screenshot(screenshotOptions): Promise<Uint8Array> {
          const buffer = await page.screenshot({ fullPage: screenshotOptions?.fullPage ?? false });
          return new Uint8Array(buffer);
        },
        requests: () => Promise.resolve([...requests]),
      };

      try {
        return await fn(auditPage);
      } finally {
        // Isolation is per-context: closing it discards cookies, storage,
        // and this page's response listener without touching the browser
        // another concurrent `withPage` call may still be using.
        await context.close();
      }
    },
    close: () => browser.close(),
  };
}
