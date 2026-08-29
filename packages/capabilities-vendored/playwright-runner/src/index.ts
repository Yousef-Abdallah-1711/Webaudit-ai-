/**
 * T141 — playwright-runner: functional link-integrity check.
 *
 * **Named for the tool class, scoped to what is reachable today** — the same
 * judgment call recorded for `ssl-analyzer` (T120), `lighthouse-analyzer`
 * (T136), and `network-inspector` (T137). A real Playwright-driven
 * functional test suite would click through user flows in a live browser;
 * `ctx.withPage` is currently unreachable in any deployment (T116's own
 * note — no cross-process browser-pool transport exists yet), so the
 * functional check this capability performs today is the one genuinely
 * answerable through `ctx.fetch` alone: does every same-origin link the
 * page itself declares actually resolve. That is a real functional defect
 * class — "clicking this takes you nowhere" — not a placeholder.
 *
 * **Same-origin only.** A page can link to arbitrary external sites; testing
 * whether *their* servers answer is not this site's functional health, and
 * would turn an audit into unsolicited traffic against third parties this
 * capability's target never asked to be probed. `ctx.fetch` is SSRF-guarded
 * regardless, but the origin filter is this capability's own scope
 * decision, not a safety mechanism.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
} from '@webaudit/capability-sdk';

const MAX_LINKS = 15;
const SKIPPED_SCHEMES = new Set(['mailto:', 'tel:', 'javascript:', 'data:']);

function extractSameOriginLinks(html: string, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const urls: string[] = [];

  for (const match of html.matchAll(/<a\s[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const raw = match[1];
    if (raw === undefined || raw.trim() === '' || raw.trim().startsWith('#')) continue;

    let resolved: URL;
    try {
      resolved = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (SKIPPED_SCHEMES.has(resolved.protocol)) continue;
    if (resolved.origin !== origin) continue;

    // Fragment-only differences are the same resource for link-integrity
    // purposes.
    resolved.hash = '';
    urls.push(resolved.toString());
  }

  return [...new Set(urls)];
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const targetUrl = input.targetUrl!;
  const response = await ctx.fetch(targetUrl, { signal: ctx.signal });
  const links = extractSameOriginLinks(response.text(), response.url).slice(0, MAX_LINKS);
  if (links.length === 0) return [];

  const results = await Promise.all(
    links.map(async (url) => {
      try {
        const linkResponse = await ctx.fetch(url, { signal: ctx.signal });
        return { url, status: linkResponse.status };
      } catch {
        return { url, status: 0 };
      }
    }),
  );

  const broken = results.filter((r) => r.status === 0 || r.status >= 400);
  if (broken.length === 0) return [];

  return [
    {
      checkId: 'testing.broken-link',
      fingerprintParts: ['testing.broken-link'],
      severity: 'HIGH',
      title: 'Broken internal link',
      description:
        `${String(broken.length)} of ${String(links.length)} sampled same-origin link(s) did ` +
        'not resolve successfully.',
      consequence:
        'A visitor who follows a broken link reaches an error page instead of the content or ' +
        'action they expected, and search engines treat broken internal links as a quality signal.',
      location: response.url,
      fixable: true,
      evidence: { count: broken.length, sample: broken.slice(0, 5).map((r) => r.url) },
    },
  ];
}

export const playwrightRunner: AuditCapability = {
  id: 'playwright-runner',
  module: 'TESTING',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  runCodeLayer,
};

export default playwrightRunner;
