/**
 * T138 — cwv-analyzer: Core Web Vitals (LCP, FCP, CLS), read from a real
 * rendered page's own Performance Timeline.
 *
 * **Genuinely requires a browser — there is no honest fetch-only
 * approximation.** Unlike `lighthouse-analyzer` (T136) and
 * `network-inspector` (T137), Core Web Vitals are rendering and layout
 * metrics with no equivalent in raw response headers; inventing a
 * byte-count-based proxy for "does the user perceive this as fast" would be
 * a worse answer than an honest gap. So this capability is entirely
 * `ctx.withPage`-based, and — until the cross-process browser-pool wiring
 * T116's own note describes exists — it currently reports no findings in
 * any deployment, the same documented gap `lighthouse-analyzer`'s
 * page-based checks and `screenshot-capture`'s rendered-layout checks share.
 * `ctx.withPage` rejecting is caught and yields an empty result rather than
 * a thrown error, exactly as the contract requires.
 *
 * `performance.getEntriesByType('largest-contentful-paint')` and
 * `('layout-shift')` are read directly rather than through a
 * `PerformanceObserver` — both entry types are buffered by the browser from
 * navigation start regardless of whether anything ever subscribed to them
 * (same as `'paint'` and `'resource'`), so a single read after `load` sees
 * everything that already happened.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
} from '@webaudit/capability-sdk';

/** Google's own "poor" thresholds: https://web.dev/articles/cwv (LCP, CLS). FCP's commonly cited poor line is 3s. */
const LCP_POOR_MS = 2500;
const FCP_POOR_MS = 3000;
const CLS_POOR = 0.25;

interface VitalsResult {
  readonly fcp: number | null;
  readonly lcp: number | null;
  readonly cls: number;
}

const VITALS_SCRIPT = `() => {
  const paintEntries = performance.getEntriesByType('paint');
  const fcpEntry = paintEntries.find((e) => e.name === 'first-contentful-paint');
  const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
  const lcpEntry = lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1] : null;
  const clsEntries = performance.getEntriesByType('layout-shift');
  let cls = 0;
  for (const entry of clsEntries) {
    if (!entry.hadRecentInput) cls += entry.value;
  }
  return {
    fcp: fcpEntry ? fcpEntry.startTime : null,
    lcp: lcpEntry ? lcpEntry.startTime : null,
    cls,
  };
}`;

function finding(
  checkId: string,
  severity: CapabilityFinding['severity'],
  title: string,
  description: string,
  consequence: string,
  location: string,
  evidence: Readonly<Record<string, unknown>>,
): CapabilityFinding {
  return {
    checkId,
    fingerprintParts: [checkId],
    severity,
    title,
    description,
    consequence,
    location,
    fixable: false,
    evidence,
  };
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const targetUrl = input.targetUrl!;

  try {
    return await ctx.withPage(async (page) => {
      await page.goto(targetUrl, { waitUntil: 'load' });
      const vitals = await page.evaluate<VitalsResult>(VITALS_SCRIPT);
      const findings: CapabilityFinding[] = [];

      if (vitals.lcp !== null && vitals.lcp > LCP_POOR_MS) {
        findings.push(
          finding(
            'cwv.lcp-poor',
            'HIGH',
            'Largest Contentful Paint is slow',
            `LCP measured ${String(Math.round(vitals.lcp))}ms, above the ${String(LCP_POOR_MS)}ms ` +
              'threshold Core Web Vitals considers "poor".',
            'LCP approximates when the page’s main content finished loading. A slow LCP is ' +
              'the single largest driver of a visitor perceiving a page as slow.',
            targetUrl,
            { lcpMs: Math.round(vitals.lcp) },
          ),
        );
      }

      if (vitals.fcp !== null && vitals.fcp > FCP_POOR_MS) {
        findings.push(
          finding(
            'cwv.fcp-poor',
            'MEDIUM',
            'First Contentful Paint is slow',
            `FCP measured ${String(Math.round(vitals.fcp))}ms, above the ${String(FCP_POOR_MS)}ms ` +
              'commonly cited threshold.',
            'FCP marks when the browser first renders anything at all. A slow FCP leaves a ' +
              'visitor looking at a blank page for longer than they will tolerate.',
            targetUrl,
            { fcpMs: Math.round(vitals.fcp) },
          ),
        );
      }

      if (vitals.cls > CLS_POOR) {
        findings.push(
          finding(
            'cwv.cls-poor',
            'MEDIUM',
            'High cumulative layout shift',
            `CLS measured ${vitals.cls.toFixed(3)}, above the ${String(CLS_POOR)} threshold Core ` +
              'Web Vitals considers "poor".',
            'A high CLS means visible content moves around as the page loads, which can cause ' +
              'a visitor to click the wrong thing entirely.',
            targetUrl,
            { cls: Number(vitals.cls.toFixed(3)) },
          ),
        );
      }

      return findings;
    });
  } catch {
    // No browser pool configured for this scan — see the module note. Not a
    // finding in itself; Core Web Vitals simply were not measurable.
    ctx.logger.debug('Core Web Vitals unavailable: no browser page for this scan');
    return [];
  }
}

export const cwvAnalyzer: AuditCapability = {
  id: 'cwv-analyzer',
  module: 'PERFORMANCE',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  runCodeLayer,
};

export default cwvAnalyzer;
