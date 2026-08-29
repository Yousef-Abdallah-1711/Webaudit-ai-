/**
 * T139 — screenshot-capture: broken-image detection today, rendered-layout
 * checks (and the screenshot itself) once a browser page is available.
 *
 * **Two tiers, on purpose.** Whether an `<img src>` resolves to a real image
 * is answerable from `ctx.fetch` alone (status and Content-Type), so that
 * check runs unconditionally and produces real findings in every deployment
 * today. Whether the page *overflows its viewport* or renders *tap targets
 * too small to hit* is a layout question — genuinely rendering-dependent,
 * answerable only through `ctx.withPage`, and currently unreachable in any
 * deployment for the same reason `cwv-analyzer` (T138) documents: no
 * cross-process browser-pool transport exists yet (T116's own note). Those
 * checks, and the screenshot capture itself (kept as a liveness signal — an
 * implausibly tiny capture means the page rendered essentially nothing, not
 * that nothing was visually wrong), degrade to no findings rather than a
 * thrown error when the pool is unavailable.
 *
 * Image alt-text (missing attribute, a static markup fact) is
 * `content-checker`'s territory (T124, SEO); this capability's
 * `ui.broken-image` is a different fact entirely — the reference resolves,
 * but what came back cannot actually be decoded as an image.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
} from '@webaudit/capability-sdk';

const MAX_IMAGES = 15;
const TINY_TARGET_PX = 24;
const BLANK_SCREENSHOT_BYTES = 200;
/** A little slack over the exact viewport width absorbs sub-pixel rounding. */
const OVERFLOW_TOLERANCE_PX = 5;

interface OverflowResult {
  readonly scrollWidth: number;
  readonly clientWidth: number;
}

const OVERFLOW_SCRIPT = `() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
})`;

const TINY_TARGET_SCRIPT = `() => {
  const els = Array.from(document.querySelectorAll('a, button'));
  let count = 0;
  for (const el of els) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (rect.width < ${String(TINY_TARGET_PX)} || rect.height < ${String(TINY_TARGET_PX)})) {
      count += 1;
    }
  }
  return count;
}`;

function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/<img\s[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const raw = match[1];
    if (raw === undefined || raw.trim() === '') continue;
    try {
      urls.push(new URL(raw, baseUrl).toString());
    } catch {
      // Not a resolvable URL — skip it.
    }
  }
  return [...new Set(urls)];
}

function finding(
  checkId: string,
  severity: CapabilityFinding['severity'],
  title: string,
  description: string,
  consequence: string,
  location: string,
  evidence?: Readonly<Record<string, unknown>>,
): CapabilityFinding {
  return {
    checkId,
    fingerprintParts: [checkId],
    severity,
    title,
    description,
    consequence,
    location,
    fixable: true,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

async function brokenImageFindings(
  targetUrl: string,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const response = await ctx.fetch(targetUrl, { signal: ctx.signal });
  const urls = extractImageUrls(response.text(), response.url).slice(0, MAX_IMAGES);
  if (urls.length === 0) return [];

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const imgResponse = await ctx.fetch(url, { signal: ctx.signal });
        const contentType = imgResponse.headers['content-type'] ?? '';
        return { url, ok: imgResponse.status < 400 && contentType.startsWith('image/') };
      } catch {
        return { url, ok: false };
      }
    }),
  );

  const broken = results.filter((r) => !r.ok);
  if (broken.length === 0) return [];

  return [
    finding(
      'ui.broken-image',
      'MEDIUM',
      'Image reference does not resolve to a real image',
      `${String(broken.length)} of ${String(urls.length)} sampled <img> reference(s) either ` +
        'failed to load or did not return image content.',
      'A broken image leaves a visible gap (or a browser’s default broken-image icon) where a ' +
        'visitor expected to see the picture.',
      response.url,
      { count: broken.length, sample: broken.slice(0, 5).map((r) => r.url) },
    ),
  ];
}

async function renderedLayoutFindings(
  targetUrl: string,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  try {
    return await ctx.withPage(async (page) => {
      await page.goto(targetUrl, { waitUntil: 'load' });
      const findings: CapabilityFinding[] = [];

      const { scrollWidth, clientWidth } = await page.evaluate<OverflowResult>(OVERFLOW_SCRIPT);
      if (scrollWidth > clientWidth + OVERFLOW_TOLERANCE_PX) {
        findings.push(
          finding(
            'ui.horizontal-overflow',
            'MEDIUM',
            'Page content overflows the viewport horizontally',
            `The document is ${String(scrollWidth)}px wide against a ${String(clientWidth)}px ` +
              'viewport, which forces horizontal scrolling.',
            'Unintended horizontal scroll is one of the most common mobile usability complaints ' +
              '— content or controls end up partly or fully off-screen.',
            targetUrl,
            { scrollWidth, clientWidth },
          ),
        );
      }

      const tinyTargets = await page.evaluate<number>(TINY_TARGET_SCRIPT);
      if (tinyTargets > 0) {
        findings.push(
          finding(
            'ui.tiny-tap-target',
            'LOW',
            'Interactive elements smaller than a comfortable tap target',
            `${String(tinyTargets)} link(s) or button(s) render smaller than ` +
              `${String(TINY_TARGET_PX)}px in at least one dimension.`,
            'Small tap targets are harder to hit accurately on a touchscreen, which increases ' +
              'mis-taps especially for visitors with limited dexterity.',
            targetUrl,
            { count: tinyTargets },
          ),
        );
      }

      const screenshot = await page.screenshot({ fullPage: true });
      if (screenshot.length < BLANK_SCREENSHOT_BYTES) {
        findings.push(
          finding(
            'ui.blank-page-render',
            'HIGH',
            'Page rendered little or nothing visible',
            `A full-page screenshot was only ${String(screenshot.length)} bytes, which is ` +
              'consistent with an effectively blank render.',
            'A visitor arriving at a page that renders nothing sees a blank screen — whatever ' +
              'the cause, nothing on the page is usable from that state.',
            targetUrl,
          ),
        );
      }

      return findings;
    });
  } catch {
    // No browser pool configured for this scan — see the module note.
    ctx.logger.debug('rendered-layout checks unavailable; reporting broken-image checks only');
    return [];
  }
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const targetUrl = input.targetUrl!;
  const [fromImages, fromLayout] = await Promise.all([
    brokenImageFindings(targetUrl, ctx),
    renderedLayoutFindings(targetUrl, ctx),
  ]);
  return [...fromImages, ...fromLayout];
}

export const screenshotCapture: AuditCapability = {
  id: 'screenshot-capture',
  module: 'UI',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  runCodeLayer,
};

export default screenshotCapture;
