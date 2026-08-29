/**
 * T136 — lighthouse-analyzer: performance signals inspired by Lighthouse's
 * own audit categories (`uses-text-compression`, `uses-long-cache-ttl`,
 * `render-blocking-resources`, `total-byte-weight`), not a vendored copy of
 * the `lighthouse` package itself.
 *
 * **Deliberately scoped, by explicit decision, same shape as `ssl-analyzer`'s
 * (T120).** Real Lighthouse drives Chrome over the DevTools Protocol — trace
 * events, coverage, throttled network profiles — none of which `AuditPage`
 * exposes (T072's own note: "widening this is a security change. Add a
 * method only with a reason"), and `plan.md`'s own `probe-pool/src/
 * lighthouse/` directory does not exist yet, only `browser/` (T116). Building
 * a CDP-inspection door or a probe-pool Lighthouse runner is a real,
 * separate piece of infrastructure — out of scope for "implement a
 * capability" against the SDK as it stands today.
 *
 * So this capability checks what is actually reachable: two response-header
 * signals via `ctx.fetch` (compression, caching — always available, and
 * exactly the kind of thing Lighthouse's own header-based audits check), plus
 * two `ctx.withPage`-based signals (render-blocking scripts, total page
 * weight) that degrade to silently absent findings — never a thrown error —
 * when no browser pool is configured, which is the *current* state of every
 * deployment until the cross-process wiring T116's own note describes is
 * built. That gap is not introduced here; it is inherited and handled the
 * way the contract requires: `ctx.withPage` rejects, this capability
 * catches it, and the header-based checks still run.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
} from '@webaudit/capability-sdk';

const LARGE_PAGE_WEIGHT_BYTES = 3_000_000;

interface RenderBlockingResult {
  readonly renderBlockingScripts: number;
}

const RENDER_BLOCKING_SCRIPT = `() => {
  const head = document.head;
  if (!head) return { renderBlockingScripts: 0 };
  const scripts = Array.from(head.querySelectorAll('script[src]'));
  const blocking = scripts.filter((el) => !el.hasAttribute('async') && !el.hasAttribute('defer') && el.getAttribute('type') !== 'module');
  return { renderBlockingScripts: blocking.length };
}`;

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

/** The header checks. Always available — the only door here is `ctx.fetch`. */
async function headerFindings(
  targetUrl: string,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const response = await ctx.fetch(targetUrl, { signal: ctx.signal });
  const findings: CapabilityFinding[] = [];

  if (response.headers['content-encoding'] === undefined) {
    findings.push(
      finding(
        'lighthouse.no-text-compression',
        'MEDIUM',
        'Response is not compressed',
        'The response carried no Content-Encoding header (gzip, br, or deflate).',
        'Uncompressed text responses transfer more bytes than necessary, which slows the page ' +
          'down most for visitors on a constrained connection.',
        response.url,
      ),
    );
  }

  if (
    response.headers['cache-control'] === undefined &&
    response.headers['expires'] === undefined
  ) {
    findings.push(
      finding(
        'lighthouse.no-cache-headers',
        'LOW',
        'No caching headers set',
        'The response carried neither a Cache-Control nor an Expires header.',
        'Without a caching policy, a repeat visitor re-downloads the same response on every ' +
          'visit instead of reusing a cached copy.',
        response.url,
      ),
    );
  }

  return findings;
}

/**
 * The page-based checks. Best-effort: a missing browser pool is not this
 * capability's failure to report, so a rejection here yields no findings
 * rather than propagating — see the module note.
 */
async function pageFindings(
  targetUrl: string,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  try {
    return await ctx.withPage(async (page) => {
      await page.goto(targetUrl, { waitUntil: 'load' });
      const findings: CapabilityFinding[] = [];

      const { renderBlockingScripts } = await page.evaluate<RenderBlockingResult>(
        RENDER_BLOCKING_SCRIPT,
      );
      if (renderBlockingScripts > 0) {
        findings.push(
          finding(
            'lighthouse.render-blocking-scripts',
            'MEDIUM',
            'Render-blocking scripts in <head>',
            `${String(renderBlockingScripts)} <script> tag(s) in <head> load without async, ` +
              'defer, or type="module".',
            'A render-blocking script delays the first paint until it has downloaded and run, ' +
              'which visitors experience as a blank page for longer than necessary.',
            targetUrl,
            { count: renderBlockingScripts },
          ),
        );
      }

      const requests = await page.requests();
      const totalBytes = requests.reduce((sum, req) => sum + req.sizeBytes, 0);
      if (totalBytes > LARGE_PAGE_WEIGHT_BYTES) {
        findings.push(
          finding(
            'lighthouse.large-page-weight',
            'MEDIUM',
            'Page transfers an unusually large amount of data',
            `The page and its sub-resources transferred approximately ` +
              `${String(Math.round(totalBytes / 1_000_000))}MB, above the ` +
              `${String(LARGE_PAGE_WEIGHT_BYTES / 1_000_000)}MB threshold.`,
            'A heavy page takes longer to become usable, and costs more for visitors on a ' +
              'metered connection.',
            targetUrl,
            { totalBytes },
          ),
        );
      }

      return findings;
    });
  } catch {
    // No browser pool configured for this scan (or the navigation itself
    // failed). Not this capability's failure to report — the header checks
    // above still ran and still stand.
    ctx.logger.debug('page-based checks unavailable; reporting header checks only');
    return [];
  }
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const targetUrl = input.targetUrl!;
  const [fromHeaders, fromPage] = await Promise.all([
    headerFindings(targetUrl, ctx),
    pageFindings(targetUrl, ctx),
  ]);
  return [...fromHeaders, ...fromPage];
}

export const lighthouseAnalyzer: AuditCapability = {
  id: 'lighthouse-analyzer',
  module: 'PERFORMANCE',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  runCodeLayer,
};

export default lighthouseAnalyzer;
