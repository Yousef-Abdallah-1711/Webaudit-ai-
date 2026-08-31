/**
 * T122 — owasp-checker: two passive, OWASP-aligned checks reachable from a
 * single response's headers alone.
 *
 * **Cookie security flags** (OWASP A05:2021 Security Misconfiguration /
 * A07:2021 Identification and Authentication Failures). `SafeResponse.headers`
 * joins multiple `Set-Cookie` values into one comma-separated string
 * (`safe-fetch.ts`'s own `headerRecord`, matching `Headers.get`'s standard
 * behaviour) — and a naive split on `, ` breaks a single cookie's own
 * `Expires=Wed, 21 Oct ...` attribute apart. Rather than guess where one
 * cookie ends and the next begins, this checks the *whole* header value for
 * the presence of each flag: if not one of the cookies set carries
 * `Secure`/`HttpOnly`/`SameSite` anywhere in the string, that is a real
 * gap worth reporting even though it cannot attribute the gap to one
 * specific cookie by name. Coarser than per-cookie attribution, and stated
 * as such rather than pretending precision the header shape does not allow.
 *
 * **Server version disclosure** (CWE-200 / OWASP A05:2021). `Server` and
 * `X-Powered-By` are read only when they contain a version-shaped substring
 * (digits with a dot), so `Server: nginx` alone is not flagged but
 * `Server: nginx/1.18.0` is — the version number is what actually narrows
 * an attacker's search for known vulnerabilities.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
  CodeLayerContext,
  ReverifyRequest,
  ReverifyResult,
} from '@webaudit/capability-sdk';

const VERSION_PATTERN = /\d+\.\d+/;
const VERSION_HEADERS = ['server', 'x-powered-by'] as const;

function cookieFindings(setCookie: string, url: string): CapabilityFinding[] {
  const findings: CapabilityFinding[] = [];
  const isHttps = new URL(url).protocol === 'https:';

  if (isHttps && !/;\s*secure\b/i.test(setCookie)) {
    findings.push({
      checkId: 'owasp.cookie-missing-secure',
      fingerprintParts: ['secure'],
      severity: 'HIGH',
      title: 'A cookie is set without the Secure flag',
      description: 'The Set-Cookie header does not carry a Secure attribute on every cookie it sets.',
      location: url,
      consequence:
        'A cookie without Secure can be sent over an unencrypted connection if one is ever ' +
        'attempted, exposing it to interception.',
      evidence: { setCookie },
      fixable: true,
    });
  }
  if (!/;\s*httponly\b/i.test(setCookie)) {
    findings.push({
      checkId: 'owasp.cookie-missing-httponly',
      fingerprintParts: ['httponly'],
      severity: 'MEDIUM',
      title: 'A cookie is set without the HttpOnly flag',
      description: 'The Set-Cookie header does not carry an HttpOnly attribute on every cookie it sets.',
      location: url,
      consequence:
        'A cookie without HttpOnly is readable from JavaScript, so a cross-site scripting ' +
        'vulnerability elsewhere on the page can steal it.',
      evidence: { setCookie },
      fixable: true,
    });
  }
  if (!/;\s*samesite\s*=/i.test(setCookie)) {
    findings.push({
      checkId: 'owasp.cookie-missing-samesite',
      fingerprintParts: ['samesite'],
      severity: 'LOW',
      title: 'A cookie is set without a SameSite attribute',
      description: 'The Set-Cookie header does not carry a SameSite attribute on every cookie it sets.',
      location: url,
      consequence:
        'Without SameSite, the cookie is sent on cross-site requests by default in older ' +
        'browsers, widening the surface for cross-site request forgery.',
      evidence: { setCookie },
      fixable: true,
    });
  }
  return findings;
}

async function runCodeLayer(
  input: CapabilityInput,
  ctx: CodeLayerContext,
): Promise<CapabilityFinding[]> {
  const response = await ctx.fetch(input.targetUrl!, { signal: ctx.signal });
  const findings: CapabilityFinding[] = [];

  const setCookie = response.headers['set-cookie'];
  if (setCookie !== undefined) {
    findings.push(...cookieFindings(setCookie, response.url));
  }

  for (const header of VERSION_HEADERS) {
    const value = response.headers[header];
    if (value !== undefined && VERSION_PATTERN.test(value)) {
      findings.push({
        checkId: 'owasp.server-version-disclosed',
        fingerprintParts: [header],
        severity: 'LOW',
        title: `${header === 'server' ? 'Server' : 'X-Powered-By'} header discloses a software version`,
        description: `The response's ${header} header is "${value}", naming a specific software version.`,
        location: response.url,
        consequence:
          'Publishing a specific software version narrows an attacker’s search for a known ' +
          'vulnerability affecting that exact version.',
        evidence: { header, value },
        fixable: true,
      });
    }
  }

  return findings;
}

const COOKIE_FLAG_PATTERNS: Readonly<Record<string, RegExp>> = {
  'owasp.cookie-missing-secure': /;\s*secure\b/i,
  'owasp.cookie-missing-httponly': /;\s*httponly\b/i,
  'owasp.cookie-missing-samesite': /;\s*samesite\s*=/i,
};

/**
 * T153 — the narrow re-check. Fetches the recorded URL once and asks only the
 * question the issue's `checkId` names.
 *
 *   owasp.cookie-missing-*      → does the Set-Cookie header now carry the flag
 *                                 (or is no cookie set at all)?
 *   owasp.server-version-disclosed → do Server / X-Powered-By still name a version?
 */
async function reverify(issue: ReverifyRequest, ctx: CodeLayerContext): Promise<ReverifyResult> {
  if (issue.location === undefined) {
    return { outcome: 'UNVERIFIABLE', reason: 'owasp-checker needs the recorded URL to re-check.' };
  }
  const response = await ctx.fetch(issue.location, { signal: ctx.signal });

  const flagPattern = COOKIE_FLAG_PATTERNS[issue.checkId];
  if (flagPattern !== undefined) {
    const setCookie = response.headers['set-cookie'];
    // No cookie set any more, or every cookie carries the flag: the gap is closed.
    if (setCookie === undefined || flagPattern.test(setCookie)) return { outcome: 'PASSED' };
    return {
      outcome: 'FAILED',
      evidence: { url: response.url, setCookie, missingFlag: issue.checkId },
    };
  }

  if (issue.checkId === 'owasp.server-version-disclosed') {
    const disclosing = VERSION_HEADERS.map((header) => ({
      header,
      value: response.headers[header],
    })).filter((h) => h.value !== undefined && VERSION_PATTERN.test(h.value));
    if (disclosing.length === 0) return { outcome: 'PASSED' };
    return {
      outcome: 'FAILED',
      evidence: { url: response.url, headers: Object.fromEntries(disclosing.map((h) => [h.header, h.value])) },
    };
  }

  return { outcome: 'UNVERIFIABLE', reason: `owasp-checker does not own ${issue.checkId}.` };
}

export const owaspChecker: AuditCapability = {
  id: 'owasp-checker',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  runCodeLayer,
  reverify,
};

export default owaspChecker;
