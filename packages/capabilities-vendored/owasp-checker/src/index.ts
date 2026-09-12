/**
 * T122 — owasp-checker: two passive, OWASP-aligned checks reachable from a
 * single response's headers alone.
 *
 * **Cookie security flags** (OWASP A05:2021 Security Misconfiguration /
 * A07:2021 Identification and Authentication Failures). `SafeResponse.headers`
 * joins multiple `Set-Cookie` values into one comma-separated string
 * (`safe-fetch.ts`'s own `headerRecord`), and a naive split on `, ` breaks a
 * single cookie's own `Expires=Wed, 21 Oct ...` attribute apart. `splitSetCookie`
 * below splits only on a comma immediately followed by a new `name=value` pair,
 * so both the initial scan and `reverify` check every cookie individually: a
 * finding fires if *any* cookie is missing a flag, and `reverify` reports
 * PASSED only once *every* cookie carries it — matching what a fix actually
 * requires (2026-09-02 engineering review, Finding 1: the previous whole-string
 * substring match could report a still-vulnerable multi-cookie site as fixed).
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

/**
 * Splits a Set-Cookie header value joined by safe-fetch's `headerRecord` back
 * into individual cookies. A naive `split(',')` breaks a single cookie's own
 * `Expires=Wed, 21 Oct ...` attribute apart, so this only splits on a comma
 * immediately followed by the start of a new `name=value` pair.
 */
function splitSetCookie(value: string): string[] {
  return value
    .split(/,(?=\s*[^;,=\s]+=)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function cookieFindings(setCookie: string, url: string): CapabilityFinding[] {
  const cookies = splitSetCookie(setCookie);
  const isHttps = new URL(url).protocol === 'https:';
  const findings: CapabilityFinding[] = [];

  if (isHttps && cookies.some((c) => !/;\s*secure\b/i.test(c))) {
    findings.push({
      checkId: 'owasp.cookie-missing-secure',
      fingerprintParts: ['secure'],
      severity: 'HIGH',
      title: 'A cookie is set without the Secure flag',
      description: 'At least one Set-Cookie entry does not carry a Secure attribute.',
      location: url,
      consequence:
        'A cookie without Secure can be sent over an unencrypted connection if one is ever ' +
        'attempted, exposing it to interception.',
      evidence: { setCookie },
      fixable: true,
    });
  }
  if (cookies.some((c) => !/;\s*httponly\b/i.test(c))) {
    findings.push({
      checkId: 'owasp.cookie-missing-httponly',
      fingerprintParts: ['httponly'],
      severity: 'MEDIUM',
      title: 'A cookie is set without the HttpOnly flag',
      description: 'At least one Set-Cookie entry does not carry an HttpOnly attribute.',
      location: url,
      consequence:
        'A cookie without HttpOnly is readable from JavaScript, so a cross-site scripting ' +
        'vulnerability elsewhere on the page can steal it.',
      evidence: { setCookie },
      fixable: true,
    });
  }
  if (cookies.some((c) => !/;\s*samesite\s*=/i.test(c))) {
    findings.push({
      checkId: 'owasp.cookie-missing-samesite',
      fingerprintParts: ['samesite'],
      severity: 'LOW',
      title: 'A cookie is set without a SameSite attribute',
      description: 'At least one Set-Cookie entry does not carry a SameSite attribute.',
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
    if (setCookie === undefined) return { outcome: 'PASSED' }; // no cookie set any more
    const cookies = splitSetCookie(setCookie);
    const stillMissing = cookies.some((c) => !flagPattern.test(c));
    if (!stillMissing) return { outcome: 'PASSED' }; // every cookie now carries the flag
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
      evidence: {
        url: response.url,
        headers: Object.fromEntries(disclosing.map((h) => [h.header, h.value])),
      },
    };
  }

  return { outcome: 'UNVERIFIABLE', reason: `owasp-checker does not own ${issue.checkId}.` };
}

export const owaspChecker: AuditCapability = {
  id: 'owasp-checker',
  checkNamespaces: ['owasp'],
  module: 'SECURITY',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  runCodeLayer,
  reverify,
};

export default owaspChecker;
