/**
 * T120 — ssl-analyzer: HTTPS/HSTS, scoped to what a single response's
 * headers can show.
 *
 * **Deliberately scoped, by explicit decision.** `ctx.fetch` (the only
 * network door a capability gets) exposes URL/status/headers/redirects —
 * `SafeResponse` carries no TLS handshake metadata (protocol version,
 * cipher suite, certificate chain, expiry), and there is no other sanctioned
 * way to reach one: `node:tls`/`node:https` are unreachable both by the
 * contract's own words ("no raw client exists") and by
 * `eslint.config.js`'s `no-restricted-imports` for this directory. Widening
 * `CodeLayerContext` with a TLS-inspection door is a security-relevant SDK
 * change with its own design questions (egress-guarding a raw socket the
 * way `ctx.fetch` guards HTTP) — out of scope for "implement a capability."
 * So this capability checks exactly what a response's own headers already
 * say about the connection, and no more.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
} from '@webaudit/capability-sdk';

/** RFC 6797's minimum recommendation is commonly cited as six months. */
const MIN_RECOMMENDED_MAX_AGE_SECONDS = 15_552_000;

function parseMaxAge(hsts: string): number | null {
  const match = /max-age\s*=\s*(\d+)/i.exec(hsts);
  if (match?.[1] === undefined) return null;
  return Number.parseInt(match[1], 10);
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const targetUrl = input.targetUrl!;
  const findings: CapabilityFinding[] = [];
  const isHttps = new URL(targetUrl).protocol === 'https:';

  if (!isHttps) {
    findings.push({
      checkId: 'ssl.not-https',
      fingerprintParts: ['scheme'],
      severity: 'HIGH',
      title: 'Site is not served over HTTPS',
      description: `The target URL uses http:// rather than https://: ${targetUrl}`,
      location: targetUrl,
      consequence:
        'Traffic to and from this site is not encrypted and can be read or altered by anyone ' +
        'on the network path between the visitor and the server.',
      fixable: true,
    });
    // Nothing HSTS-related to check without HTTPS.
    return findings;
  }

  const response = await ctx.fetch(targetUrl, { signal: ctx.signal });
  const hsts = response.headers['strict-transport-security'];

  if (hsts === undefined) {
    findings.push({
      checkId: 'ssl.hsts-missing',
      fingerprintParts: ['hsts'],
      severity: 'MEDIUM',
      title: 'Missing Strict-Transport-Security header',
      description: 'The HTTPS response carried no Strict-Transport-Security header.',
      location: response.url,
      consequence:
        'Without HSTS, a visitor who types the bare domain or follows an http:// link is not ' +
        'told by the browser to upgrade automatically, leaving a window for a downgrade attack.',
      fixable: true,
    });
    return findings;
  }

  const maxAge = parseMaxAge(hsts);
  if (maxAge === null || maxAge < MIN_RECOMMENDED_MAX_AGE_SECONDS) {
    findings.push({
      checkId: 'ssl.hsts-max-age-low',
      fingerprintParts: ['hsts-max-age'],
      severity: 'LOW',
      title: 'Strict-Transport-Security max-age is too low',
      description:
        maxAge === null
          ? `The Strict-Transport-Security header has no readable max-age: "${hsts}"`
          : `Strict-Transport-Security max-age is ${String(maxAge)} seconds, below the commonly ` +
            `recommended minimum of ${String(MIN_RECOMMENDED_MAX_AGE_SECONDS)} (about six months).`,
      location: response.url,
      consequence:
        'A short max-age means the browser stops enforcing HTTPS-only access for this site ' +
        'sooner, re-opening the downgrade window HSTS exists to close.',
      fixable: true,
    });
  }

  return findings;
}

export const sslAnalyzer: AuditCapability = {
  id: 'ssl-analyzer',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  runCodeLayer,
};

export default sslAnalyzer;
