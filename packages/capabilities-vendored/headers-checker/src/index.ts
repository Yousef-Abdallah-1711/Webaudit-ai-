/**
 * T119 — headers-checker: missing security response headers.
 *
 * Passive only — one `ctx.fetch` of the target, read the response headers.
 * No active probing, no second request per header. `SafeResponse.headers`
 * keys are already lowercased (`safe-fetch.ts`'s own `headerRecord`), so
 * every check below reads a lowercase key.
 *
 * Five headers, each independently absent-or-present, each its own finding
 * so the report can say exactly which are missing rather than one bundled
 * "headers are bad" issue nobody can act on individually.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
  ReverifyRequest,
  ReverifyResult,
} from '@webaudit/capability-sdk';

interface HeaderCheck {
  readonly header: string;
  readonly checkId: string;
  readonly severity: CapabilityFinding['severity'];
  readonly title: string;
  readonly description: string;
  readonly consequence: string;
}

const CHECKS: readonly HeaderCheck[] = [
  {
    header: 'content-security-policy',
    checkId: 'headers.csp-missing',
    severity: 'HIGH',
    title: 'Missing Content-Security-Policy header',
    description: 'The response carried no Content-Security-Policy header.',
    consequence:
      'Without a CSP, the browser applies no restriction on which scripts, styles, or ' +
      'resources a page may load, which widens the impact of any injection vulnerability.',
  },
  {
    header: 'x-frame-options',
    checkId: 'headers.frame-options-missing',
    severity: 'MEDIUM',
    title: 'Missing X-Frame-Options header',
    description: 'The response carried no X-Frame-Options header.',
    consequence:
      'Without it (and no frame-ancestors directive in a CSP), the page can be embedded in ' +
      'another site’s frame and used for clickjacking.',
  },
  {
    header: 'x-content-type-options',
    checkId: 'headers.content-type-options-missing',
    severity: 'MEDIUM',
    title: 'Missing X-Content-Type-Options header',
    description: 'The response carried no X-Content-Type-Options: nosniff header.',
    consequence:
      'Without it, some browsers will MIME-sniff the response and may execute content that was ' +
      'not intended to run as a script.',
  },
  {
    header: 'referrer-policy',
    checkId: 'headers.referrer-policy-missing',
    severity: 'LOW',
    title: 'Missing Referrer-Policy header',
    description: 'The response carried no Referrer-Policy header.',
    consequence:
      'Without it, the browser’s default referrer behaviour applies, which can leak the full ' +
      'URL (including any sensitive path or query data) to third-party destinations linked from the page.',
  },
  {
    header: 'permissions-policy',
    checkId: 'headers.permissions-policy-missing',
    severity: 'LOW',
    title: 'Missing Permissions-Policy header',
    description: 'The response carried no Permissions-Policy header.',
    consequence:
      'Without it, embedded or loaded content is not restricted from requesting powerful browser ' +
      'features (camera, microphone, geolocation) it does not need.',
  },
];

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  // canRun already guarantees targetUrl is present; the runner never calls
  // runCodeLayer for an input canRun refused.
  const response = await ctx.fetch(input.targetUrl!, { signal: ctx.signal });

  const findings: CapabilityFinding[] = [];
  for (const check of CHECKS) {
    if (response.headers[check.header] !== undefined) continue;
    findings.push({
      checkId: check.checkId,
      fingerprintParts: [check.header],
      severity: check.severity,
      title: check.title,
      description: check.description,
      location: response.url,
      consequence: check.consequence,
      fixable: true,
    });
  }
  return findings;
}

/**
 * T153 — the narrow re-check. Fetches the recorded location once and asks the
 * single question this issue's `checkId` names: is that one header present now?
 * A present header is `PASSED`; an absent one is `FAILED` with the current
 * evidence (FR-061). Never re-runs the other four checks.
 */
async function reverify(issue: ReverifyRequest, ctx: CodeLayerContext): Promise<ReverifyResult> {
  const check = CHECKS.find((c) => c.checkId === issue.checkId);
  if (check === undefined || issue.location === undefined) {
    return {
      outcome: 'UNVERIFIABLE',
      reason: `headers-checker cannot re-verify ${issue.checkId} without a recorded URL.`,
    };
  }

  const response = await ctx.fetch(issue.location, { signal: ctx.signal });
  const value = response.headers[check.header];
  if (value !== undefined) return { outcome: 'PASSED' };

  return {
    outcome: 'FAILED',
    evidence: {
      url: response.url,
      header: check.header,
      observed: null,
      note: `The ${check.header} header is still absent from the response.`,
    },
  };
}

export const headersChecker: AuditCapability = {
  id: 'headers-checker',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  runCodeLayer,
  reverify,
};

export default headersChecker;
