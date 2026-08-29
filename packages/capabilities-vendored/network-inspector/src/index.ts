/**
 * T137 — network-inspector: request-pattern findings, without a browser.
 *
 * **Deliberately scoped to what `ctx.fetch` alone can prove**, the same
 * judgment call `ssl-analyzer` (T120) and `lighthouse-analyzer` (T136)
 * already made explicit: `ctx.withPage` currently has no browser pool wired
 * in any deployment (T116's own note — the cross-process transport is a
 * separate, unbuilt gap), so a capability whose *only* door is `withPage`
 * would report nothing at all today. Instead, this capability does its own
 * small crawl: fetch the page once, extract the `<script src>`,
 * `<link rel="stylesheet" href>`, and `<img src>` references its own markup
 * declares, resolve each to an absolute same-origin-or-not URL, and fetch a
 * bounded sample of them — genuinely exercising "request-pattern findings"
 * today, rather than waiting on infrastructure this task does not build.
 *
 * Capped at `MAX_SUBRESOURCES` fetches so a page with hundreds of assets
 * does not turn one capability's run into a load generator against the
 * target — SSRF-guarded by `ctx.fetch` either way, but bounded on request
 * count as its own courtesy.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
} from '@webaudit/capability-sdk';

const MAX_SUBRESOURCES = 15;
const MAX_REDIRECTS_OK = 3;

interface SubresourceRef {
  readonly url: string;
  readonly kind: 'script' | 'stylesheet' | 'image';
}

function extractRefs(html: string, baseUrl: string): SubresourceRef[] {
  const refs: SubresourceRef[] = [];
  const push = (raw: string | undefined, kind: SubresourceRef['kind']): void => {
    if (raw === undefined || raw.trim() === '') return;
    try {
      refs.push({ url: new URL(raw, baseUrl).toString(), kind });
    } catch {
      // Not a resolvable URL (e.g. a data: URI with odd characters) — skip it.
    }
  };

  for (const match of html.matchAll(/<script\s[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    push(match[1], 'script');
  }
  for (const match of html.matchAll(
    /<link\s[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']|<link\s[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']stylesheet["']/gi,
  )) {
    push(match[1] ?? match[2], 'stylesheet');
  }
  for (const match of html.matchAll(/<img\s[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    push(match[1], 'image');
  }

  return refs;
}

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
    fixable: true,
    evidence,
  };
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const targetUrl = input.targetUrl!;
  const response = await ctx.fetch(targetUrl, { signal: ctx.signal });
  const findings: CapabilityFinding[] = [];

  if (response.redirects.length > MAX_REDIRECTS_OK) {
    findings.push(
      finding(
        'network.excessive-redirects',
        'LOW',
        'Excessive redirect chain',
        `Loading the page followed ${String(response.redirects.length)} redirects before ` +
          'reaching a final response.',
        'Each hop in a redirect chain adds a full round trip before the page can start ' +
          'loading, which visitors experience as extra delay before anything appears.',
        response.url,
        { redirectCount: response.redirects.length, chain: response.redirects },
      ),
    );
  }

  const refs = extractRefs(response.text(), response.url);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref.url)) duplicates.add(ref.url);
    seen.add(ref.url);
  }

  const sample = [...seen].slice(0, MAX_SUBRESOURCES);
  const refByUrl = new Map(refs.map((ref) => [ref.url, ref]));

  const results = await Promise.all(
    sample.map(async (url) => {
      try {
        const subResponse = await ctx.fetch(url, { signal: ctx.signal });
        return { url, status: subResponse.status, headers: subResponse.headers };
      } catch {
        // A fetch that could not complete at all (network error, SSRF
        // refusal on a third-party host) is reported the same as a broken
        // reference — either way, a visitor's request for it would not
        // succeed either.
        return { url, status: 0, headers: {} };
      }
    }),
  );

  const broken = results.filter((r) => r.status === 0 || r.status >= 400);
  if (broken.length > 0) {
    findings.push(
      finding(
        'network.broken-subresource',
        'HIGH',
        'Broken referenced resource',
        `${String(broken.length)} of ${String(sample.length)} sampled resource(s) referenced ` +
          'by the page did not load successfully.',
        'A script, stylesheet, or image that fails to load can break page functionality or ' +
          'leave visible gaps in the rendered page.',
        response.url,
        { count: broken.length, sample: broken.slice(0, 5).map((r) => r.url) },
      ),
    );
  }

  const uncompressed = results.filter((r) => {
    const ref = refByUrl.get(r.url);
    return (
      ref !== undefined &&
      (ref.kind === 'script' || ref.kind === 'stylesheet') &&
      r.status > 0 &&
      r.status < 400 &&
      r.headers['content-encoding'] === undefined
    );
  });
  if (uncompressed.length > 0) {
    findings.push(
      finding(
        'network.uncompressed-subresource',
        'LOW',
        'Uncompressed script or stylesheet',
        `${String(uncompressed.length)} referenced script/stylesheet resource(s) were served ` +
          'without a Content-Encoding header.',
        'Uncompressed text assets transfer more bytes than necessary, adding to the time it ' +
          'takes the page to become interactive.',
        response.url,
        { count: uncompressed.length, sample: uncompressed.slice(0, 5).map((r) => r.url) },
      ),
    );
  }

  if (duplicates.size > 0) {
    findings.push(
      finding(
        'network.duplicate-subresource-reference',
        'LOW',
        'Same resource referenced more than once',
        `${String(duplicates.size)} resource URL(s) are referenced by more than one tag on ` +
          'the page.',
        'Referencing the same script, stylesheet, or image more than once cannot make the ' +
          'browser request it twice, but it is a sign of markup that has drifted from what the ' +
          'page actually needs.',
        response.url,
        { count: duplicates.size, sample: [...duplicates].slice(0, 5) },
      ),
    );
  }

  return findings;
}

export const networkInspector: AuditCapability = {
  id: 'network-inspector',
  module: 'PERFORMANCE',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  runCodeLayer,
};

export default networkInspector;
