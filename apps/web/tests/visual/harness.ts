/**
 * T246 — the visual-comparison harness.
 *
 * Compares a rendered `apps/web` route against its
 * `design-system/reference-pages/` counterpart at 1440 and 390, per
 * CLAUDE.md's "≤0.5% diff at both viewports" gate.
 *
 * **The reference pages are not static images.** Each `.html` file under
 * `design-system/reference-pages/` is a self-contained "bundler" document: an
 * SVG placeholder shown behind a loading indicator, plus every script, style,
 * and font the real page needs, embedded and unpacked client-side. The
 * unpacking script's last act is `document.documentElement.replaceWith(...)`
 * — the *entire* original tree, placeholder included, is swapped for the
 * real rendered page. `screenshotReferencePage` below waits for exactly that:
 * `#__bundler_thumbnail` detaching from the DOM is the signal the swap
 * happened, not a fixed delay or a network-idle heuristic (the embedded
 * scripts load from client-minted blob URLs, so "network idle" would be true
 * from the first frame and prove nothing).
 *
 * **Comparison, not exact match.** `pixelmatch`'s own `threshold` absorbs
 * anti-aliasing and sub-pixel rendering differences between two independent
 * browser paints of what should be identical layout; `MAX_DIFF_RATIO` is the
 * product-level tolerance CLAUDE.md states, applied after that.
 */
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface Viewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** The two viewports CLAUDE.md names as designed and measured. */
export const VIEWPORTS: readonly Viewport[] = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
];

/** CLAUDE.md: "pnpm test:visual (≤0.5% diff at both viewports)". */
export const MAX_DIFF_RATIO = 0.005;

/**
 * How long a reference page's client-side unpacking is given before the
 * comparison gives up and reports it rather than hanging the suite. Generous:
 * the unpack step re-creates and awaits every embedded `<script src>` in
 * order (React, ReactDOM, Babel, then the JSX sources), and CI hardware is
 * not this machine's.
 */
const UNPACK_TIMEOUT_MS = 30_000;

export type DiffResult =
  | {
      readonly ok: true;
      readonly diffRatio: number;
      readonly diffPixelCount: number;
      readonly totalPixelCount: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'dimension-mismatch';
      readonly a: { readonly width: number; readonly height: number };
      readonly b: { readonly width: number; readonly height: number };
    };

export interface ServerHandle {
  readonly url: string;
  close(): void;
}

const SERVER_READY_TIMEOUT_MS = 30_000;
const SERVER_POLL_INTERVAL_MS = 300;

/**
 * Starts a built `apps/web` (`next build` must already have run) as a real
 * OS child process — `next start`, not Next's programmatic server API.
 *
 * That API's own `NextServer.close()` was tried first and crashes the whole
 * Node process on Windows with a native libuv assertion
 * (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`), reproduced
 * both against a dev server and a production one; confirmed as a Next.js/
 * Windows defect, not anything specific to this app, while building this
 * function. A real child process sidesteps it entirely: teardown here kills
 * the OS process (and its tree, via `taskkill` on Windows, since `next
 * start` spawns further child processes `child.kill()` alone would leave
 * behind), never calling back into Next's own close path.
 */
export async function startServer(dir: string, port: number): Promise<ServerHandle> {
  const nextCli = path.join(dir, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextCli, 'start', '-p', String(port)], {
    cwd: dir,
    stdio: 'ignore',
  });

  const close = (): void => {
    if (child.pid === undefined) return;
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${String(child.pid)} /T /F`, { stdio: 'ignore' });
      } catch {
        // already exited
      }
    } else {
      child.kill('SIGKILL');
    }
  };

  const url = `http://localhost:${String(port)}`;
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  let ready = false;
  while (!ready && Date.now() < deadline) {
    await new Promise((resolve) => {
      setTimeout(resolve, SERVER_POLL_INTERVAL_MS);
    });
    try {
      const res = await fetch(url);
      ready = res.ok;
    } catch {
      // not listening yet
    }
  }

  if (!ready) {
    close();
    throw new Error(
      `apps/web did not become ready on ${url} within ${String(SERVER_READY_TIMEOUT_MS)}ms`,
    );
  }

  return { url, close };
}

/** Screenshot a live `apps/web` route at the given viewport. */
export async function screenshotUrl(
  browser: Browser,
  url: string,
  viewport: Viewport,
): Promise<Buffer> {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    // Same reasoning as `screenshotReferencePage`: `next/font`'s `display:
    // swap` means the fallback face paints first and the real face swaps in
    // asynchronously, reflowing text width — waiting for the real signal
    // avoids the same flaky-width failure mode on this side of the diff too.
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ fullPage: true });
  } finally {
    await page.close();
  }
}

/** Screenshot a `design-system/reference-pages/` bundler file once it has unpacked. */
export async function screenshotReferencePage(
  browser: Browser,
  htmlPath: string,
  viewport: Viewport,
): Promise<Buffer> {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'domcontentloaded' });
    // `waitForSelector(..., { state: 'detached' })` rather than
    // `waitForFunction`: the wait condition is plain DOM state, and this way
    // nothing here needs the `dom` lib just to type-check a browser-context
    // callback in a file that otherwise runs entirely in Node.
    await page.waitForSelector('#__bundler_thumbnail', {
      state: 'detached',
      timeout: UNPACK_TIMEOUT_MS,
    });
    // The swap is synchronous; fonts finishing their own async load are not.
    // Waiting on the real signal (`document.fonts.ready`) rather than a fixed
    // delay: a fixed wait raced the font swap often enough to make the
    // content-size read below flaky between runs (the same text reflows
    // narrower/wider as the fallback face is replaced), which a longer fixed
    // delay only makes less frequent, not impossible.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);

    // `document.documentElement.replaceWith(...)` swaps in a whole new
    // document element; Playwright's `fullPage: true` capture-beyond-viewport
    // sizing (backed by CDP's layout metrics) does not reliably pick up the
    // replaced tree's real scroll size afterwards and silently clips to the
    // original viewport instead of the page's actual content — reproduced
    // against every reference page tried, not just one. Reading the real
    // size directly from the swapped-in DOM and resizing the viewport to it
    // before the shot sidesteps whatever CDP's metrics cache is missing;
    // `fullPage: true` still works fine on a page that was never swapped
    // (`screenshotUrl`'s own use of it), which is what pointed at the swap
    // itself as the trigger rather than `fullPage` being unreliable outright.
    const contentSize = await page.evaluate(() => ({
      width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    }));
    await page.setViewportSize({
      width: Math.max(viewport.width, Math.ceil(contentSize.width)),
      height: Math.max(viewport.height, Math.ceil(contentSize.height)),
    });
    return await page.screenshot({ fullPage: true });
  } finally {
    await page.close();
  }
}

/** Diff two screenshots. Dimension mismatch is reported, never guessed past. */
export function diffScreenshots(a: Buffer, b: Buffer): DiffResult {
  const imgA = PNG.sync.read(a);
  const imgB = PNG.sync.read(b);

  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return {
      ok: false,
      reason: 'dimension-mismatch',
      a: { width: imgA.width, height: imgA.height },
      b: { width: imgB.width, height: imgB.height },
    };
  }

  const { width, height } = imgA;
  const totalPixelCount = width * height;
  const diffPixelCount = pixelmatch(imgA.data, imgB.data, undefined, width, height, {
    threshold: 0.1,
  });

  return {
    ok: true,
    diffRatio: totalPixelCount === 0 ? 0 : diffPixelCount / totalPixelCount,
    diffPixelCount,
    totalPixelCount,
  };
}
