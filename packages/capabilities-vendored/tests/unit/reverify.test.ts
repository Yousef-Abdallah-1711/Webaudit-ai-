/**
 * T153 — the `reverify` entry point on each of the six first-slice
 * capabilities. Same fake-`ctx.fetch` approach as `capabilities.test.ts`: a
 * pure logic test, no fixture server, no `SAFE_NET_ALLOW_TARGETS`.
 *
 * Each capability's `reverify` must:
 *   - re-run exactly the one check its `checkId` names (never the others);
 *   - return PASSED when the defect is gone and FAILED (with evidence) when it
 *     is not;
 *   - return UNVERIFIABLE for a `checkId` it does not own.
 */

import { describe, expect, it } from 'vitest';
import type { CodeLayerContext, ReverifyRequest, SafeResponse } from '@webaudit/capability-sdk';
import headersChecker from '@webaudit/capability-headers-checker';
import sslAnalyzer from '@webaudit/capability-ssl-analyzer';
import owaspChecker from '@webaudit/capability-owasp-checker';
import metaChecker from '@webaudit/capability-meta-checker';
import contentChecker from '@webaudit/capability-content-checker';
import dataLeakScanner from '@webaudit/capability-data-leak-scanner';

function ctxReturning(
  responses: SafeResponse | readonly SafeResponse[],
): CodeLayerContext {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const one = Array.isArray(responses) ? undefined : (responses as SafeResponse);
  return {
    fetch: () => Promise.resolve(one ?? queue.shift() ?? queue[queue.length - 1]!),
    withPage: () => Promise.reject(new Error('no page')),
    readFile: () => Promise.reject(new Error('no fs')),
    glob: () => Promise.reject(new Error('no fs')),
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    signal: new AbortController().signal,
  };
}

function res(overrides: Partial<SafeResponse> & { body?: string } = {}): SafeResponse {
  const body = overrides.body ?? '<html><head><title>Home</title></head><body><h1>Hi</h1></body></html>';
  return {
    url: overrides.url ?? 'https://example.com/',
    status: overrides.status ?? 200,
    headers: overrides.headers ?? {},
    redirects: overrides.redirects ?? [],
    bytes: () => new TextEncoder().encode(body),
    text: () => body,
  };
}

const at = (checkId: string, extra: Partial<ReverifyRequest> = {}): ReverifyRequest => ({
  checkId,
  location: 'https://example.com/',
  ...extra,
});

describe('headers-checker.reverify', () => {
  it('PASSED when the header is present now', async () => {
    const r = await headersChecker.reverify!(
      at('headers.csp-missing'),
      ctxReturning(res({ headers: { 'content-security-policy': "default-src 'self'" } })),
    );
    expect(r.outcome).toBe('PASSED');
  });
  it('FAILED with evidence when it is still absent', async () => {
    const r = await headersChecker.reverify!(at('headers.csp-missing'), ctxReturning(res()));
    expect(r.outcome).toBe('FAILED');
    if (r.outcome === 'FAILED') expect(r.evidence).toMatchObject({ header: 'content-security-policy' });
  });
  it('UNVERIFIABLE for a checkId it does not own', async () => {
    const r = await headersChecker.reverify!(at('ssl.hsts-missing'), ctxReturning(res()));
    expect(r.outcome).toBe('UNVERIFIABLE');
  });
});

describe('ssl-analyzer.reverify', () => {
  it('ssl.hsts-missing PASSED when HSTS present', async () => {
    const r = await sslAnalyzer.reverify!(
      at('ssl.hsts-missing'),
      ctxReturning(res({ headers: { 'strict-transport-security': 'max-age=31536000' } })),
    );
    expect(r.outcome).toBe('PASSED');
  });
  it('ssl.hsts-max-age-low FAILED when max-age still too low', async () => {
    const r = await sslAnalyzer.reverify!(
      at('ssl.hsts-max-age-low'),
      ctxReturning(res({ headers: { 'strict-transport-security': 'max-age=60' } })),
    );
    expect(r.outcome).toBe('FAILED');
  });
  it('ssl.not-https PASSED when the final URL is https', async () => {
    const r = await sslAnalyzer.reverify!(
      at('ssl.not-https', { location: 'http://example.com/' }),
      ctxReturning(res({ url: 'https://example.com/' })),
    );
    expect(r.outcome).toBe('PASSED');
  });
});

describe('owasp-checker.reverify', () => {
  it('cookie-missing-secure PASSED when no cookie is set now', async () => {
    const r = await owaspChecker.reverify!(at('owasp.cookie-missing-secure'), ctxReturning(res()));
    expect(r.outcome).toBe('PASSED');
  });
  it('cookie-missing-httponly FAILED when the flag is still missing', async () => {
    const r = await owaspChecker.reverify!(
      at('owasp.cookie-missing-httponly'),
      ctxReturning(res({ headers: { 'set-cookie': 'sid=abc; Path=/' } })),
    );
    expect(r.outcome).toBe('FAILED');
  });
  it('server-version-disclosed PASSED when no version header', async () => {
    const r = await owaspChecker.reverify!(
      at('owasp.server-version-disclosed'),
      ctxReturning(res({ headers: { server: 'nginx' } })),
    );
    expect(r.outcome).toBe('PASSED');
  });
});

describe('meta-checker.reverify', () => {
  it('meta.title-missing PASSED when a title exists', async () => {
    const r = await metaChecker.reverify!(
      at('meta.title-missing'),
      ctxReturning(res({ body: '<title>A real title</title>' })),
    );
    expect(r.outcome).toBe('PASSED');
  });
  it('meta.description-missing FAILED when still absent', async () => {
    const r = await metaChecker.reverify!(
      at('meta.description-missing'),
      ctxReturning(res({ body: '<title>t</title>' })),
    );
    expect(r.outcome).toBe('FAILED');
  });
});

describe('content-checker.reverify', () => {
  it('content.h1-missing PASSED when an h1 exists', async () => {
    const r = await contentChecker.reverify!(
      at('content.h1-missing'),
      ctxReturning(res({ body: '<h1>Present</h1>' })),
    );
    expect(r.outcome).toBe('PASSED');
  });
  it('content.images-missing-alt FAILED when images still lack alt', async () => {
    const r = await contentChecker.reverify!(
      at('content.images-missing-alt'),
      ctxReturning(res({ body: '<img src="a.png"><img src="b.png">' })),
    );
    expect(r.outcome).toBe('FAILED');
    if (r.outcome === 'FAILED') expect(r.evidence).toMatchObject({ imagesMissingAlt: 2 });
  });
});

describe('data-leak-scanner.reverify', () => {
  it('PASSED when the page is clean of secrets now', async () => {
    const r = await dataLeakScanner.reverify!(
      at('redaction.secret-in-source', { location: 'https://example.com/app.js:12:4' }),
      ctxReturning(res({ body: 'const config = { region: "us-east-1" };' })),
    );
    expect(r.outcome).toBe('PASSED');
  });
  it('FAILED when a credential of the same kind is still present', async () => {
    const r = await dataLeakScanner.reverify!(
      at('redaction.secret-in-source', {
        location: 'https://example.com/app.js:12:4',
        evidence: { kind: 'AWS_ACCESS_KEY_ID' },
      }),
      ctxReturning(res({ body: 'const k = "AKIAIOSFODNN7EXAMPLE";' })),
    );
    expect(r.outcome).toBe('FAILED');
  });
  it('UNVERIFIABLE for a checkId it does not own', async () => {
    const r = await dataLeakScanner.reverify!(at('headers.csp-missing'), ctxReturning(res()));
    expect(r.outcome).toBe('UNVERIFIABLE');
  });
});
