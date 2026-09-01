/**
 * Supplementary browser capture for the showcase report/dashboard.
 *
 * The `screenshot-capture` capability deliberately discards its bytes (it uses
 * them only as a liveness signal — see its module note). For a client-facing
 * report we want the actual rendered page and a few real page-load metrics, so
 * this drives the same real Playwright browser pool separately and saves:
 *
 *   data/screenshot-desktop.png   1440-wide, full page
 *   data/screenshot-mobile.png    390-wide, full page
 *   data/page-metrics.json        real navigation + paint timings, DOM stats
 *
 * These are measured facts about the live page, gathered with a real browser.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const TARGET = process.argv[2] ?? 'https://app.esaalnybot.tech/';

interface Metrics {
  target: string;
  capturedAt: string;
  timings: Record<string, number>;
  transferKb: number;
  resourceCount: number;
  domNodes: number;
  scripts: number;
  stylesheets: number;
  images: number;
  title: string;
  textLength: number;
  headings: { h1: number; h2: number; h3: number };
  viewportOverflowPx: { desktop: number; mobile: number };
}

async function main(): Promise<void> {
  await mkdir(DATA, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  let transferBytes = 0;
  let resourceCount = 0;

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  page.on('response', (r) => {
    resourceCount += 1;
    void r
      .body()
      .then((b) => {
        transferBytes += b.length;
      })
      .catch(() => undefined);
  });

  await page.goto(TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200); // let the SPA settle

  await page.screenshot({ path: join(DATA, 'screenshot-desktop.png'), fullPage: true });

  // Passed as a STRING: tsx/esbuild rewrites arrow functions with a `__name`
  // helper that is undefined inside the page. A string body sidesteps that.
  const raw = (await page.evaluate(`(() => {
    var nav = performance.getEntriesByType('navigation')[0];
    var paints = performance.getEntriesByType('paint');
    var fcpEntry = paints.filter(function(p){return p.name==='first-contentful-paint';})[0];
    var fcp = fcpEntry ? fcpEntry.startTime : 0;
    var r = Math.round;
    return {
      timings: {
        ttfbMs: r(nav ? nav.responseStart - nav.requestStart : 0),
        domContentLoadedMs: r(nav ? nav.domContentLoadedEventEnd - nav.startTime : 0),
        loadMs: r(nav ? nav.loadEventEnd - nav.startTime : 0),
        firstContentfulPaintMs: r(fcp),
        domInteractiveMs: r(nav ? nav.domInteractive - nav.startTime : 0)
      },
      domNodes: document.getElementsByTagName('*').length,
      scripts: document.scripts.length,
      stylesheets: document.querySelectorAll('link[rel="stylesheet"],style').length,
      images: document.images.length,
      title: document.title,
      textLength: ((document.body && document.body.innerText) || '').replace(/\\s+/g,' ').trim().length,
      headings: {
        h1: document.querySelectorAll('h1').length,
        h2: document.querySelectorAll('h2').length,
        h3: document.querySelectorAll('h3').length
      },
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
    };
  })()`)) as {
    timings: Record<string, number>;
    domNodes: number;
    scripts: number;
    stylesheets: number;
    images: number;
    title: string;
    textLength: number;
    headings: { h1: number; h2: number; h3: number };
    overflow: number;
  };

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mpage = await mobile.newPage();
  await mpage.goto(TARGET, { waitUntil: 'networkidle' });
  await mpage.waitForTimeout(1200);
  await mpage.screenshot({ path: join(DATA, 'screenshot-mobile.png'), fullPage: true });
  const mobileOverflow = (await mpage.evaluate(
    `Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)`,
  )) as number;

  await browser.close();

  const metrics: Metrics = {
    target: TARGET,
    capturedAt: new Date().toISOString(),
    timings: raw.timings,
    transferKb: Math.round((transferBytes / 1024) * 10) / 10,
    resourceCount,
    domNodes: raw.domNodes,
    scripts: raw.scripts,
    stylesheets: raw.stylesheets,
    images: raw.images,
    title: raw.title,
    textLength: raw.textLength,
    headings: raw.headings,
    viewportOverflowPx: { desktop: raw.overflow, mobile: mobileOverflow },
  };

  await writeFile(join(DATA, 'page-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `  captured: screenshot-desktop.png, screenshot-mobile.png, page-metrics.json\n` +
      `  FCP ${metrics.timings.firstContentfulPaintMs}ms · load ${metrics.timings.loadMs}ms · ` +
      `${metrics.transferKb}KB over ${metrics.resourceCount} requests · ${metrics.domNodes} DOM nodes\n`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
