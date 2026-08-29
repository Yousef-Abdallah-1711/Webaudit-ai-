/**
 * Per-capability behavioural unit tests for T119-124 and T136-142, against
 * an injected fake `CodeLayerContext` rather than a live fixture server —
 * faster, and exercises each check's own logic directly rather than only
 * proving the capability is conformant (`../conformance.test.ts`'s job). A
 * fake `ctx.fetch` also avoids depending on `SAFE_NET_ALLOW_TARGETS`/real
 * Redis for what is otherwise a pure logic test, matching the guidance
 * already recorded for `data-leak-scanner`/`headers-checker`-style checks.
 *
 * **T136-142 addendum.** The shared conformance suite currently supplies no
 * `pageProvider` (no deployment has one wired yet — see
 * `capability-loader.ts`'s note), so it cannot exercise any `ctx.withPage`
 * -based logic. `fakePage`/`fakeContextWithPage` below are what actually
 * prove that logic correct: a fake `AuditPage` whose `evaluate` returns
 * pre-queued canned values in call order, standing in for a real rendered
 * page until the cross-process transport exists to use a real one.
 */

import { describe, expect, it } from 'vitest';
import type {
  AuditPage,
  CapabilityInput,
  CodeLayerContext,
  SafeResponse,
} from '@webaudit/capability-sdk';
import headersChecker from '@webaudit/capability-headers-checker';
import sslAnalyzer from '@webaudit/capability-ssl-analyzer';
import dataLeakScanner from '@webaudit/capability-data-leak-scanner';
import owaspChecker from '@webaudit/capability-owasp-checker';
import metaChecker from '@webaudit/capability-meta-checker';
import contentChecker from '@webaudit/capability-content-checker';
import lighthouseAnalyzer from '@webaudit/capability-lighthouse-analyzer';
import networkInspector from '@webaudit/capability-network-inspector';
import cwvAnalyzer from '@webaudit/capability-cwv-analyzer';
import screenshotCapture from '@webaudit/capability-screenshot-capture';
import impeccable from '@webaudit/capability-impeccable';
import playwrightRunner from '@webaudit/capability-playwright-runner';
import contradictionDetector from '@webaudit/capability-contradiction-detector';

function fakeResponse(overrides: Partial<SafeResponse> & { readonly body?: string } = {}): SafeResponse {
  const body = overrides.body ?? '';
  return {
    url: overrides.url ?? 'https://example.com/',
    status: overrides.status ?? 200,
    headers: overrides.headers ?? {},
    redirects: overrides.redirects ?? [],
    bytes: () => new TextEncoder().encode(body),
    text: () => body,
  };
}

function fakeContext(response: SafeResponse): CodeLayerContext {
  return {
    fetch: () => Promise.resolve(response),
    withPage: () => Promise.reject(new Error('withPage is not available in this test')),
    readFile: () => Promise.reject(new Error('readFile is not available in this test')),
    glob: () => Promise.reject(new Error('glob is not available in this test')),
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    signal: new AbortController().signal,
  };
}

function input(targetUrl = 'https://example.com/'): CapabilityInput {
  return { targetUrl, priorModuleResults: {}, controlLevel: 'NONE' };
}

function checkIds(findings: { readonly checkId: string }[]): string[] {
  return findings.map((f) => f.checkId).sort();
}

function fakePage(
  options: {
    readonly evaluateResponses?: readonly unknown[];
    readonly requests?: readonly { readonly url: string; readonly status: number; readonly sizeBytes: number }[];
    readonly screenshotBytes?: number;
  } = {},
): AuditPage {
  const responses = [...(options.evaluateResponses ?? [])];
  return {
    goto: () => Promise.resolve(),
    content: () => Promise.resolve(''),
    title: () => Promise.resolve(''),
    evaluate: <T>(): Promise<T> => Promise.resolve(responses.shift() as T),
    screenshot: () => Promise.resolve(new Uint8Array(options.screenshotBytes ?? 5000)),
    requests: () => Promise.resolve([...(options.requests ?? [])]),
  };
}

/** A context whose `withPage` hands back a real (fake) page instead of rejecting. */
function fakeContextWithPage(
  page: AuditPage,
  fetchImpl: (url: string) => Promise<SafeResponse> = () =>
    Promise.reject(new Error('fetch is not stubbed in this test')),
): CodeLayerContext {
  return {
    fetch: (url) => fetchImpl(url),
    withPage: (fn) => fn(page),
    readFile: () => Promise.reject(new Error('readFile is not available in this test')),
    glob: () => Promise.reject(new Error('glob is not available in this test')),
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    signal: new AbortController().signal,
  };
}

/** A context whose `ctx.fetch` answers differently per URL, `withPage` unavailable. */
function fakeMultiFetchContext(handler: (url: string) => SafeResponse): CodeLayerContext {
  return {
    fetch: (url) => Promise.resolve(handler(url)),
    withPage: () => Promise.reject(new Error('withPage is not available in this test')),
    readFile: () => Promise.reject(new Error('readFile is not available in this test')),
    glob: () => Promise.reject(new Error('glob is not available in this test')),
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    signal: new AbortController().signal,
  };
}

describe('headers-checker', () => {
  it('flags every missing security header', async () => {
    const findings = await headersChecker.runCodeLayer!(input(), fakeContext(fakeResponse()));
    expect(checkIds(findings)).toEqual(
      [
        'headers.content-type-options-missing',
        'headers.csp-missing',
        'headers.frame-options-missing',
        'headers.permissions-policy-missing',
        'headers.referrer-policy-missing',
      ].sort(),
    );
  });

  it('reports nothing when every header is present', async () => {
    const findings = await headersChecker.runCodeLayer!(
      input(),
      fakeContext(
        fakeResponse({
          headers: {
            'content-security-policy': "default-src 'self'",
            'x-frame-options': 'DENY',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
            'permissions-policy': 'geolocation=()',
          },
        }),
      ),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('ssl-analyzer', () => {
  it('flags a plain http target without ever fetching it', async () => {
    const findings = await sslAnalyzer.runCodeLayer!(
      input('http://example.com/'),
      fakeContext(fakeResponse()),
    );
    expect(checkIds(findings)).toEqual(['ssl.not-https']);
  });

  it('flags a missing HSTS header on an https target', async () => {
    const findings = await sslAnalyzer.runCodeLayer!(input(), fakeContext(fakeResponse()));
    expect(checkIds(findings)).toEqual(['ssl.hsts-missing']);
  });

  it('flags an HSTS max-age below the recommended minimum', async () => {
    const findings = await sslAnalyzer.runCodeLayer!(
      input(),
      fakeContext(fakeResponse({ headers: { 'strict-transport-security': 'max-age=3600' } })),
    );
    expect(checkIds(findings)).toEqual(['ssl.hsts-max-age-low']);
  });

  it('reports nothing for https with a strong HSTS header', async () => {
    const findings = await sslAnalyzer.runCodeLayer!(
      input(),
      fakeContext(
        fakeResponse({
          headers: { 'strict-transport-security': 'max-age=31536000; includeSubDomains' },
        }),
      ),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('data-leak-scanner', () => {
  it('finds a credential-shaped string in the fetched page', async () => {
    const findings = await dataLeakScanner.runCodeLayer!(
      input(),
      fakeContext(fakeResponse({ body: '<script>const key="AKIAABCDEFGHIJKLMNOP";</script>' })),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.checkId === 'redaction.secret-in-source')).toBe(true);
  });

  it('finds nothing in a page with no secret-shaped text', async () => {
    const findings = await dataLeakScanner.runCodeLayer!(
      input(),
      fakeContext(fakeResponse({ body: '<p>hello</p>' })),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('owasp-checker', () => {
  it('flags a cookie missing every security flag', async () => {
    const findings = await owaspChecker.runCodeLayer!(
      input(),
      fakeContext(fakeResponse({ headers: { 'set-cookie': 'session=abc123' } })),
    );
    expect(checkIds(findings)).toEqual(
      ['owasp.cookie-missing-httponly', 'owasp.cookie-missing-samesite', 'owasp.cookie-missing-secure'].sort(),
    );
  });

  it('does not flag a fully-flagged cookie', async () => {
    const findings = await owaspChecker.runCodeLayer!(
      input(),
      fakeContext(
        fakeResponse({
          headers: { 'set-cookie': 'session=abc123; Secure; HttpOnly; SameSite=Strict' },
        }),
      ),
    );
    expect(findings).toHaveLength(0);
  });

  it('flags a server header that discloses a version', async () => {
    const findings = await owaspChecker.runCodeLayer!(
      input(),
      fakeContext(fakeResponse({ headers: { server: 'nginx/1.18.0' } })),
    );
    expect(checkIds(findings)).toEqual(['owasp.server-version-disclosed']);
  });

  it('does not flag a server header with no version number', async () => {
    const findings = await owaspChecker.runCodeLayer!(
      input(),
      fakeContext(fakeResponse({ headers: { server: 'nginx' } })),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('meta-checker', () => {
  it('flags a page missing title, description, viewport, and canonical', async () => {
    const findings = await metaChecker.runCodeLayer!(
      input(),
      fakeContext(fakeResponse({ body: '<html><head></head><body></body></html>' })),
    );
    expect(checkIds(findings)).toEqual(
      [
        'meta.canonical-missing',
        'meta.description-missing',
        'meta.title-missing',
        'meta.viewport-missing',
      ].sort(),
    );
  });

  it('reports nothing for a well-formed head', async () => {
    const body =
      '<html><head>' +
      '<title>A perfectly reasonable title</title>' +
      '<meta name="description" content="A perfectly reasonable description of this page.">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<link rel="canonical" href="https://example.com/">' +
      '</head><body></body></html>';
    const findings = await metaChecker.runCodeLayer!(input(), fakeContext(fakeResponse({ body })));
    expect(findings).toHaveLength(0);
  });
});

describe('content-checker', () => {
  it('flags a page missing H1, lang, alt text, and with thin content', async () => {
    const findings = await contentChecker.runCodeLayer!(
      input(),
      fakeContext(fakeResponse({ body: '<html><body><img src="x.png"><p>short</p></body></html>' })),
    );
    expect(checkIds(findings)).toEqual(
      ['content.h1-missing', 'content.images-missing-alt', 'content.lang-missing', 'content.thin-content'].sort(),
    );
  });

  it('flags multiple H1 tags', async () => {
    const findings = await contentChecker.runCodeLayer!(
      input(),
      fakeContext(fakeResponse({ body: '<html lang="en"><body><h1>One</h1><h1>Two</h1></body></html>' })),
    );
    expect(checkIds(findings)).toContain('content.h1-multiple');
  });

  it('reports nothing for a well-structured, substantial page', async () => {
    const words = Array.from({ length: 250 }, (_v, i) => `word${String(i)}`).join(' ');
    const body =
      `<html lang="en"><body><h1>Title</h1><img src="x.png" alt="a picture"><p>${words}</p></body></html>`;
    const findings = await contentChecker.runCodeLayer!(input(), fakeContext(fakeResponse({ body })));
    expect(findings).toHaveLength(0);
  });
});

describe('lighthouse-analyzer', () => {
  it('flags missing compression and cache headers, and degrades cleanly with no browser page', async () => {
    const findings = await lighthouseAnalyzer.runCodeLayer!(input(), fakeContext(fakeResponse()));
    expect(checkIds(findings)).toEqual(
      ['lighthouse.no-cache-headers', 'lighthouse.no-text-compression'].sort(),
    );
  });

  it('reports nothing for compressed, cacheable headers with no browser page', async () => {
    const findings = await lighthouseAnalyzer.runCodeLayer!(
      input(),
      fakeContext(
        fakeResponse({ headers: { 'content-encoding': 'gzip', 'cache-control': 'max-age=3600' } }),
      ),
    );
    expect(findings).toHaveLength(0);
  });

  it('flags render-blocking scripts and page weight when a browser page is available', async () => {
    const ctx = fakeContextWithPage(
      fakePage({
        evaluateResponses: [{ renderBlockingScripts: 2 }],
        requests: [{ url: 'https://example.com/a.js', status: 200, sizeBytes: 4_000_000 }],
      }),
      () =>
        Promise.resolve(
          fakeResponse({ headers: { 'content-encoding': 'gzip', 'cache-control': 'max-age=3600' } }),
        ),
    );
    const findings = await lighthouseAnalyzer.runCodeLayer!(input(), ctx);
    expect(checkIds(findings)).toEqual(
      ['lighthouse.large-page-weight', 'lighthouse.render-blocking-scripts'].sort(),
    );
  });
});

describe('network-inspector', () => {
  it('flags a broken, uncompressed, and duplicated referenced resource', async () => {
    const html =
      '<html><head>' +
      '<script src="/a.js"></script>' +
      '<link rel="stylesheet" href="/b.css">' +
      '<script src="/a.js"></script>' +
      '</head><body><img src="/c.png"></body></html>';
    const ctx = fakeMultiFetchContext((url) => {
      if (url === 'https://example.com/') return fakeResponse({ url, body: html });
      if (url.endsWith('/a.js')) return fakeResponse({ url, status: 404 });
      if (url.endsWith('/b.css')) return fakeResponse({ url, status: 200 });
      return fakeResponse({ url, status: 200 });
    });
    const findings = await networkInspector.runCodeLayer!(input(), ctx);
    expect(checkIds(findings)).toEqual(
      [
        'network.broken-subresource',
        'network.uncompressed-subresource',
        'network.duplicate-subresource-reference',
      ].sort(),
    );
  });

  it('flags an excessive redirect chain', async () => {
    const ctx = fakeMultiFetchContext((url) =>
      fakeResponse({
        url,
        body: '<html><body></body></html>',
        redirects: ['https://example.com/1', 'https://example.com/2', 'https://example.com/3', 'https://example.com/4'],
      }),
    );
    const findings = await networkInspector.runCodeLayer!(input(), ctx);
    expect(checkIds(findings)).toEqual(['network.excessive-redirects']);
  });

  it('reports nothing for a page with no broken, uncompressed, or duplicated resources', async () => {
    const ctx = fakeMultiFetchContext((url) => fakeResponse({ url, body: '<html><body></body></html>' }));
    const findings = await networkInspector.runCodeLayer!(input(), ctx);
    expect(findings).toHaveLength(0);
  });
});

describe('cwv-analyzer', () => {
  it('flags poor LCP, FCP, and CLS when a browser page is available', async () => {
    const ctx = fakeContextWithPage(fakePage({ evaluateResponses: [{ fcp: 3500, lcp: 3000, cls: 0.3 }] }));
    const findings = await cwvAnalyzer.runCodeLayer!(input(), ctx);
    expect(checkIds(findings)).toEqual(['cwv.cls-poor', 'cwv.fcp-poor', 'cwv.lcp-poor'].sort());
  });

  it('reports nothing for good vitals', async () => {
    const ctx = fakeContextWithPage(fakePage({ evaluateResponses: [{ fcp: 500, lcp: 800, cls: 0.01 }] }));
    const findings = await cwvAnalyzer.runCodeLayer!(input(), ctx);
    expect(findings).toHaveLength(0);
  });

  it('degrades to no findings, not a rejection, with no browser page', async () => {
    const findings = await cwvAnalyzer.runCodeLayer!(input(), fakeContext(fakeResponse()));
    expect(findings).toHaveLength(0);
  });
});

describe('screenshot-capture', () => {
  it('flags an image reference that does not resolve to real image content', async () => {
    const html = '<html><body><img src="/x.png"></body></html>';
    const ctx = fakeMultiFetchContext((url) => {
      if (url === 'https://example.com/') return fakeResponse({ url, body: html });
      return fakeResponse({ url, status: 200, headers: { 'content-type': 'text/html' } });
    });
    const findings = await screenshotCapture.runCodeLayer!(input(), ctx);
    expect(checkIds(findings)).toEqual(['ui.broken-image']);
  });

  it('reports nothing when every image resolves to real image content', async () => {
    const html = '<html><body><img src="/x.png"></body></html>';
    const ctx = fakeMultiFetchContext((url) => {
      if (url === 'https://example.com/') return fakeResponse({ url, body: html });
      return fakeResponse({ url, status: 200, headers: { 'content-type': 'image/png' } });
    });
    const findings = await screenshotCapture.runCodeLayer!(input(), ctx);
    expect(findings).toHaveLength(0);
  });

  it('flags overflow, tiny tap targets, and a near-blank render when a browser page is available', async () => {
    const ctx = fakeContextWithPage(
      fakePage({
        evaluateResponses: [{ scrollWidth: 800, clientWidth: 400 }, 5],
        screenshotBytes: 50,
      }),
      (url) => Promise.resolve(fakeResponse({ url, body: '<html><body></body></html>' })),
    );
    const findings = await screenshotCapture.runCodeLayer!(input(), ctx);
    expect(checkIds(findings)).toEqual(
      ['ui.blank-page-render', 'ui.horizontal-overflow', 'ui.tiny-tap-target'].sort(),
    );
  });
});

describe('impeccable', () => {
  it('contributes design-critique instructions', () => {
    const addition = impeccable.getSystemPromptAddition!();
    expect(addition).toContain('Spacing');
    expect(addition).toContain('Typographic hierarchy');
  });

  it('summarises measured UI findings and stated design intent', () => {
    const context = impeccable.getContextData!(
      [
        {
          checkId: 'ui.horizontal-overflow',
          fingerprintParts: ['ui.horizontal-overflow'],
          severity: 'MEDIUM',
          title: 'Page content overflows the viewport horizontally',
          description: 'The document is wider than its viewport.',
          fixable: true,
        },
      ],
      { targetUrl: 'https://example.com/', priorModuleResults: {}, controlLevel: 'NONE', designIntent: { audience: 'small business owners', tone: 'friendly' } },
    );
    expect(context).toContain('Page content overflows the viewport horizontally');
    expect(context).toContain('audience: small business owners');
    expect(context).toContain('tone: friendly');
  });

  it('says plainly when nothing was measured and no design intent was given', () => {
    const context = impeccable.getContextData!([], input());
    expect(context).toContain('No automated rendering issues were measured');
    expect(context).not.toContain('design intent');
  });
});

describe('playwright-runner', () => {
  it('flags a same-origin link that does not resolve, ignoring external links and fragments', async () => {
    const html =
      '<html><body>' +
      '<a href="/ok">ok</a>' +
      '<a href="/broken">broken</a>' +
      '<a href="https://external.example.com/x">external</a>' +
      '<a href="#frag">fragment only</a>' +
      '</body></html>';
    const ctx = fakeMultiFetchContext((url) => {
      if (url === 'https://example.com/') return fakeResponse({ url, body: html });
      if (url.endsWith('/broken')) return fakeResponse({ url, status: 404 });
      return fakeResponse({ url, status: 200 });
    });
    const findings = await playwrightRunner.runCodeLayer!(input(), ctx);
    expect(checkIds(findings)).toEqual(['testing.broken-link']);
    expect(findings[0]?.evidence?.['sample']).toEqual(['https://example.com/broken']);
  });

  it('reports nothing for a page with no same-origin links', async () => {
    const ctx = fakeMultiFetchContext((url) =>
      fakeResponse({ url, body: '<html><body><p>no links here</p></body></html>' }),
    );
    const findings = await playwrightRunner.runCodeLayer!(input(), ctx);
    expect(findings).toHaveLength(0);
  });
});

describe('contradiction-detector', () => {
  it('does not apply when no prior module results are available', () => {
    expect(contradictionDetector.canRun(input())).toBe(false);
  });

  it('flags each internally-inconsistent module result', async () => {
    const withPriors: CapabilityInput = {
      ...input(),
      priorModuleResults: {
        SECURITY: { state: 'COMPLETE', score: 80, findingCount: 2, worstSeverity: null },
        SEO: { state: 'COMPLETE', score: 95, findingCount: 1, worstSeverity: 'HIGH' },
        UI: { state: 'FAILED', score: null, findingCount: 3, worstSeverity: 'MEDIUM' },
      },
    };
    expect(contradictionDetector.canRun(withPriors)).toBe(true);
    const findings = await contradictionDetector.runCodeLayer!(
      withPriors,
      fakeContext(fakeResponse()),
    );
    expect(checkIds(findings)).toEqual(
      [
        'contradiction.severity-missing-with-findings',
        'contradiction.high-score-despite-severe-finding',
        'contradiction.failed-state-with-findings',
      ].sort(),
    );
  });

  it('reports nothing for internally-consistent module results', async () => {
    const withPriors: CapabilityInput = {
      ...input(),
      priorModuleResults: {
        SECURITY: { state: 'COMPLETE', score: 92, findingCount: 0, worstSeverity: null },
        SEO: { state: 'DEGRADED', score: 60, findingCount: 3, worstSeverity: 'LOW' },
      },
    };
    const findings = await contradictionDetector.runCodeLayer!(
      withPriors,
      fakeContext(fakeResponse()),
    );
    expect(findings).toHaveLength(0);
  });
});
