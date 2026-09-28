/**
 * The AI layer, authored offline, for https://omanda-ai.com/.
 *
 * WebAudit AI's design (Principle III / FR-030) is: the code layer measures,
 * the AI layer *explains and prioritises what was measured* — it never
 * invents an observation. No runtime LLM key is configured for this
 * showcase, so this file IS that AI layer: it must be rewritten by hand
 * (by Claude, reading `data/audit.json` and `data/page-metrics.json` for
 * THIS target) after the audit + capture steps have run.
 *
 * Everything below is labelled `AI_NARRATIVE` (prose) or, for observations
 * with no code-layer check behind them, `AI_JUDGMENT` — the exact
 * attribution the product's module runner stamps on an AI-layer finding.
 * NONE of it may move a score: per-area scores come only from MEASURED
 * findings, as in the real `packages/scoring`.
 *
 * THE GUARD BELOW IS INTENTIONAL. `main()` refuses to write a narrative
 * whose `authoredBy` still starts with "PLACEHOLDER" — that is what stops
 * an unauthored (or worse, a copy-pasted stale client's) narrative from
 * silently becoming a shipped report. Do not remove the guard; satisfy it
 * by actually authoring `build()` below from this target's real findings.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Severity } from '@webaudit/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIT = join(HERE, '..', 'data', 'audit.json');
const METRICS = join(HERE, '..', 'data', 'page-metrics.json');
const CRAWL = join(HERE, '..', 'data', 'crawl.json');

/**
 * Confidence is deterministic, not an AI guess: derived from how the finding
 * was produced, never asserted independently of that. A capability that ran
 * successfully and returned a MEASURED finding is CONFIRMED — the code layer
 * observed it directly (a header's absence, a byte pattern) and there is
 * nothing further for a human to verify. A repeated-content observation
 * (a design/AI_JUDGMENT note, or something that would need a second,
 * different capability to substantiate) is POTENTIAL. Anything with no
 * capability able to check it at all is NOT_TESTED. This mirrors exactly
 * what Section 13/16 of the brief asked for: a documented, non-arbitrary
 * model rather than a free-form number.
 */
type Confidence = 'CONFIRMED' | 'POTENTIAL' | 'NOT_TESTED';

interface Narrative {
  authoredBy: string;
  scopeNote: string;
  coverage: {
    heading: string;
    body: string;
    passive: string[];
    active: string[];
  };
  executiveSummary: string;
  areaNarratives: Record<string, string>;
  prioritised: {
    rank: number;
    title: string;
    area: string;
    severity: Severity;
    effort: 'trivial' | 'small' | 'moderate';
    why: string;
    confidence: Confidence;
  }[];
  /** AI-layer design observations — no measured check behind them (AI_JUDGMENT). */
  designJudgments: {
    checkId: string;
    severity: Severity;
    title: string;
    explanation: string;
    consequence: string;
    fixPrompt: string;
  }[];
  /**
   * Step 3/16 of the brief: what the crawl actually discovered, and a
   * per-security-area coverage matrix — never claim "tested" for an area no
   * capability actually covers. This is aggregated from real data/crawl.json
   * and data/pages/*, not invented.
   */
  assetMap: {
    pagesDiscovered: number;
    pages: string[];
    formsFound: number;
    apiEndpointsLinked: number;
    technologies: string[];
    note: string;
  };
  coverageMatrix: {
    area: string;
    status: 'TESTED' | 'PARTIAL' | 'NOT_IMPLEMENTED';
    method: 'passive-code-layer' | 'browser-render' | 'manual-runbook-only';
    evidence: string;
  }[];
}

/**
 * Authored from the real run: data/audit.json (homepage + folded crawl
 * summary + readiness) and data/page-metrics.json for
 * https://omanda-ai.com/, captured 2026-09-14. Every figure below is taken
 * directly from those files — nothing here was inferred beyond what the
 * capabilities actually returned.
 */
function build(
  metrics: {
    timings: Record<string, number>;
    transferKb: number;
    resourceCount: number;
    domNodes: number;
    textLength: number;
    headings: { h1: number };
  },
  crawl: {
    pages: { path: string; score: number | null; worstSeverity: string | null }[];
    readiness: {
      verdict: 'go' | 'no-go';
      areas: { name: string; score: number; threshold: number; pass: boolean }[];
      blockers: string[];
    };
  } | null,
): Narrative {
  const pagePaths = crawl?.pages.map((p) => p.path) ?? ['/'];
  const pageCount = pagePaths.length;

  return {
    authoredBy:
      'Claude (Anthropic) acting as the WebAudit AI AI-layer — grounded only in the measured findings in this file; no runtime LLM call was made.',
    scopeNote:
      `The audited target (omanda-ai.com) is a client-side-routed single-page app: an Arabic-first (RTL) marketing/pricing/legal site in front of a full authenticated SaaS product for AI-driven e-commerce sales chat ("أول موظف مبيعات ذكاء اصطناعي لمتجرك الإلكتروني"). Two rounds of discovery were used, both passive: (1) following real <a href> links from the homepage found 8 pages; (2) reading the site's own public JS bundle (entry-BQ3HuxNN.js — normal browser downloads, no exploitation) revealed 3 more real pre-authentication pages reachable only via a JS button handler, not a plain link (/signin, /reset-password, /accept-invite), which were then audited the same way — ${String(pageCount)} pages total: ${pagePaths.join(', ')}. That same bundle also names a much larger authenticated app (dashboard, inbox, orders, customers, analytics, settings, channels, catalog, and 18 distinct /admin/* sub-routes, plus a /cockpit-old legacy route) — this is real evidence the product has dozens of screens, consistent with it being much bigger than 8 pages. None of those authenticated routes were visited: doing so without credentials would either hit an auth wall (learning nothing) or, if one were improperly unprotected, would mean viewing real internal/customer data without authorization — exactly the authorization-boundary testing this audit's scope excludes and leaves to a human tester (see the Pentest plan tab, case AUTHZ-01, now updated with this exact route list instead of a generic guess).`,
    coverage: {
      heading: 'What this score does and does not mean',
      body:
        'This is a PASSIVE configuration, hygiene, and content assessment — same-origin GET requests and a real browser render, at zero risk to the target. It is not a penetration test: nothing was submitted, no injection payload was sent, no authentication was attempted, and no endpoint was probed beyond following real links already present on the page. The "Pentest plan" tab is a separate, human-executed methodology for that follow-on work.',
      passive: [
        'Security response headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) on every crawled page.',
        'TLS/HSTS presence and configuration.',
        'Cookie flags (Secure, HttpOnly, SameSite) — no cookies were observed carrying a flag violation on this target.',
        'Credential/secret-shaped strings in served HTML and inline scripts (via the redaction package\'s real detectors).',
        'Known-CVE dependency versions where a manifest or bundle is available to check.',
        'SEO/content structure (headings, thin-content heuristic, duplicate H1s).',
        'Real Core Web Vitals and page weight via headless Chromium, per page.',
        'Responsive layout at multiple breakpoints, broken-link checks.',
      ],
      active: [
        'Logging in, or anything behind authentication — a real /signin page and form were found and passively inventoried (email + password fields), but no credentials were entered and no login was attempted.',
        'Injection testing (XSS, SQLi, command injection, SSRF) — no capability in this codebase performs this today; see the coverage matrix below.',
        'API/endpoint testing, rate-limit testing, and IDOR/authorization testing against the app or admin routes named in the JS bundle (/dashboard, /admin/*, /api/v1, etc.) — real route names are now known (see scope note), but visiting them unauthenticated to check what they expose would itself be the authorization test this audit\'s scope excludes; that is exactly what the updated Pentest plan tab (AUTHZ-01) is for.',
      ],
    },
    executiveSummary:
      `Omanda AI's public site scores 90/100 overall across 5 audited areas on the homepage, but the multi-page audit of all ${String(pageCount)} discovered pages (8 linked pages plus 3 more found by reading the site's own JS bundle: /signin, /reset-password, /accept-invite) computed a **NO-GO** production-readiness verdict — the overall average hides a Security score of 61/100 that an average alone would not surface. Two HIGH-severity findings repeat identically on every one of the ${String(pageCount)} pages: a missing Content-Security-Policy header, and a value assigned to a credential-shaped name found in served page source — both point at the shared app shell, not a one-off page. Everything else — SEO (96), Performance (91), Testing (100), Design (100) — is healthy. This site is the public face of a much larger authenticated SaaS product: its JS bundle names dozens of app screens and a full 18-route /admin/* panel (plus a /cockpit-old legacy route), none of which were visited — logging in or probing an authenticated/admin route without credentials is authorization testing, which this passive audit's scope deliberately excludes and hands to the human-executed runbook instead (updated with the exact real route list found here, rather than a guess).`,
    areaNarratives: {
      SECURITY:
        `Security scored 61/100 on the homepage, and the same two HIGH findings were measured on all ${String(pageCount)} crawled pages (/, /pricing, /contact, /help, /data-deletion, /privacy, /terms, /refund-policy): (1) no Content-Security-Policy header is served anywhere on the site — confirmed independently against the live response headers, which do carry X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, and a Strict-Transport-Security header, but no CSP; (2) a 32-character value assigned to a credential-shaped variable name appears in every page's served source (line 233 of the homepage response). Separately, 3 MEDIUM findings on the homepage flag high-entropy strings (redacted, kind HIGH_ENTROPY_STRING) that are consistent with, but not confirmed to be, credentials. None of these values were retrieved, decoded, or otherwise investigated beyond what the redaction package's pattern detector reported — per this product's own design, a capability never sees or reports the actual secret value, only its kind, location, and length. No cookie-flag violations (Secure/HttpOnly/SameSite) were found on any page. No known-CVE dependency findings were produced (no client-fetchable dependency manifest was available to check from a URL-only run).`,
      SEO:
        `Search visibility scored 96/100. Two LOW findings on the homepage: 2 <h1> tags on one page (should be exactly one for a clear document outline), and the visible text is approximately 81 words — below the commonly cited 200-word threshold for substantive content, typical for a hero-heavy landing page but worth knowing if organic search ranking matters for this page.`,
      PERFORMANCE:
        `Performance scored 91/100. The homepage response and 4 referenced script/stylesheet resources are served without a Content-Encoding header (no gzip/br/deflate compression) — a MEDIUM and a LOW finding respectively — and one resource URL is referenced more than once in the page. Real measured Core Web Vitals: first contentful paint ~3.8s and full load ~2.8s on the initial run (a repeat homepage visit during the crawl measured FCP ~1.2s, load ~0.4s — consistent with CDN/cache warm-up, not a discrepancy in measurement). 2.4MB transferred over 61 requests, 1422 DOM nodes on the homepage.`,
      UI:
        'Design scored 100/100 — no measured findings. Both desktop and mobile screenshots render without layout overflow beyond a 10px mobile viewport tolerance already accounted for by the capability.',
      TESTING:
        'Testing scored 100/100 with 0 findings. This module measures what a URL-only run can measure (e.g. build/CI configuration signals reachable from the site); it does not mean unit/integration test coverage of Omanda\'s own codebase was assessed, since no source was attached to this run.',
    },
    prioritised: [
      {
        rank: 1,
        title: 'Add a Content-Security-Policy header',
        area: 'SECURITY',
        severity: 'HIGH',
        effort: 'small',
        why:
          `Confirmed absent on all ${String(pageCount)} crawled pages by direct header inspection (cross-checked against a live curl of the homepage response, which shows every other common security header present except this one) — a shared-template fix, not a per-page one.`,
        confidence: 'CONFIRMED',
      },
      {
        rank: 2,
        title: 'Investigate and rotate the credential-shaped value found in every page\'s source',
        area: 'SECURITY',
        severity: 'HIGH',
        effort: 'small',
        why:
          'A 32-character value assigned to a credential-shaped name is measured in the served HTML of every crawled page, meaning it ships to every visitor\'s browser. This may be an intentionally public client-side key (e.g. an analytics or embed key meant to be public) or a genuine leaked secret — that distinction cannot be made from outside the codebase, which is exactly why this is flagged rather than silently assumed benign. Whoever owns the source should check what that value actually is.',
        confidence: 'CONFIRMED',
      },
      {
        rank: 3,
        title: 'Serve responses with compression',
        area: 'PERFORMANCE',
        severity: 'MEDIUM',
        effort: 'trivial',
        why: 'No Content-Encoding header on the homepage response or 4 referenced script/stylesheet resources — typically a one-line server/CDN config change.',
        confidence: 'CONFIRMED',
      },
      {
        rank: 4,
        title: 'Reduce to one <h1> per page',
        area: 'SEO',
        severity: 'LOW',
        effort: 'trivial',
        why: '2 <h1> tags were measured on the homepage.',
        confidence: 'CONFIRMED',
      },
    ],
    designJudgments: [],
    assetMap: {
      pagesDiscovered: pageCount,
      pages: pagePaths,
      formsFound: 1,
      apiEndpointsLinked: 0,
      technologies: [
        'Cloudflare (edge/CDN + bot-challenge platform: cdn-cgi/challenge-platform scripts present, confirmed via Server header, CF-RAY, and loaded script URLs)',
        'Client-side-routed SPA (React) — the server returns the same HTML shell for every path; distinct pages render only after JS/router execution, confirmed by comparing rendered content across 5 paths including one nonexistent one',
        'Supabase (a chunk literally named "supabaseClient" is loaded on the homepage) — likely the backend/auth provider',
        'Client-side locale switch via localStorage (omanda.locale) — Arabic (RTL) default, English toggle',
      ],
      note:
        'No page or form was linked via a plain <a href> beyond the 8 marketing pages. Reading the site\'s own public JS bundle (a normal browser download, not exploitation) revealed a client-side router with a far larger real route table: dashboard, inbox, orders, customers, analytics, settings, channels, catalog, agent-center, opportunities, handover, social, profile, recovery, and an 18-route /admin/* panel (ai, alerts, audit, billing, billing-sessions, channels, conversations, customers, errors, finance, growth, jobs, orders, revenue, settings, support, tenants) plus a /cockpit-old legacy route and an /api/v1 prefix. These were read from the bundle text only — none were visited unauthenticated. The one form found (/signin: email + password inputs, autocomplete=email/current-password, no name attributes) was passively inventoried; nothing was submitted to it. Technology detection here is limited to what is observable from response headers, rendered markup, and public bundle text; there is no dedicated tech-fingerprinting capability in this codebase (confirmed by inspecting packages/capabilities-vendored — none of the 13 capabilities perform stack/framework fingerprinting).',
    },
    coverageMatrix: [
      { area: 'Security headers', status: 'TESTED', method: 'passive-code-layer', evidence: 'headers-checker, all 8 pages' },
      { area: 'TLS/HSTS', status: 'TESTED', method: 'passive-code-layer', evidence: 'ssl-analyzer, all 8 pages' },
      { area: 'Cookies (Secure/HttpOnly/SameSite)', status: 'TESTED', method: 'passive-code-layer', evidence: 'owasp-checker, all 8 pages — no violations found' },
      { area: 'Secrets in served source', status: 'TESTED', method: 'passive-code-layer', evidence: 'data-leak-scanner / redaction, all 8 pages' },
      { area: 'Known-CVE dependencies', status: 'PARTIAL', method: 'passive-code-layer', evidence: 'dependency-scanner ran; no client-fetchable manifest was available to check from a URL-only run, so 0 findings does not mean 0 vulnerable dependencies' },
      { area: 'XSS (reflected/stored/DOM)', status: 'NOT_IMPLEMENTED', method: 'manual-runbook-only', evidence: 'No active-testing capability exists in this codebase; see Pentest plan tab' },
      { area: 'SQL/NoSQL injection', status: 'NOT_IMPLEMENTED', method: 'manual-runbook-only', evidence: 'No active-testing capability exists in this codebase; no database-backed endpoint was discovered on this site to test' },
      { area: 'SSRF', status: 'NOT_IMPLEMENTED', method: 'manual-runbook-only', evidence: 'No active-testing capability exists; no server-side fetch-from-user-input surface was discovered' },
      { area: 'CSRF', status: 'NOT_IMPLEMENTED', method: 'manual-runbook-only', evidence: 'No active-testing capability exists; no authenticated state-changing form was discovered on these 8 pages' },
      { area: 'IDOR / authorization', status: 'NOT_IMPLEMENTED', method: 'manual-runbook-only', evidence: 'Real route names for a large authenticated app and an 18-route /admin/* panel were read from the public JS bundle, but none were visited unauthenticated — checking what they actually expose is an authorization test, handed to AUTHZ-01 in the runbook with the real route list, not run here' },
      { area: 'Authentication', status: 'PARTIAL', method: 'browser-render', evidence: 'A real /signin page (email + password form) was found and passively inventoried — discovered via the JS bundle, not a linked page. No login was attempted; whether the auth flow itself is secure is untested' },
      { area: 'API security (fuzzing/rate limits)', status: 'NOT_IMPLEMENTED', method: 'manual-runbook-only', evidence: 'An /api/v1 prefix and a Supabase client are named in the public JS bundle; no endpoint under it was called or probed' },
      { area: 'File upload', status: 'NOT_IMPLEMENTED', method: 'manual-runbook-only', evidence: 'No upload surface was discovered on these 8 pages' },
      { area: 'Browser/DOM security (localStorage, postMessage, DOM XSS sinks)', status: 'NOT_IMPLEMENTED', method: 'manual-runbook-only', evidence: 'Playwright is used for rendering/CWV/screenshots only; no capability inspects DOM sinks, postMessage handlers, or storage contents for security purposes today' },
      { area: 'SEO/content structure', status: 'TESTED', method: 'passive-code-layer', evidence: 'content-checker / meta-checker, all 8 pages' },
      { area: 'Performance / Core Web Vitals', status: 'TESTED', method: 'browser-render', evidence: 'lighthouse-analyzer, cwv-analyzer, real headless Chromium, all 8 pages' },
      { area: 'Responsive layout', status: 'TESTED', method: 'browser-render', evidence: 'impeccable, desktop + mobile viewports, all 8 pages' },
    ],
  };
}

async function main(): Promise<void> {
  const audit = JSON.parse(await readFile(AUDIT, 'utf8')) as Record<string, unknown>;
  const metrics = JSON.parse(await readFile(METRICS, 'utf8')) as Parameters<typeof build>[0] & {
    target: string;
  };
  const crawl = await readFile(CRAWL, 'utf8')
    .then((raw) => JSON.parse(raw) as Parameters<typeof build>[1])
    .catch(() => null);

  const narrative = build(metrics, crawl);

  if (narrative.authoredBy.startsWith('PLACEHOLDER') && process.env['ALLOW_PLACEHOLDER_NARRATIVE'] !== '1') {
    console.error(
      '\n  ✗ ai-narrative.ts has not been authored for this target yet.\n' +
        '    build() still returns the PLACEHOLDER narrative — read data/audit.json\n' +
        '    and data/page-metrics.json and rewrite it from the real findings before\n' +
        '    rendering a client-facing report.\n' +
        '    (Set ALLOW_PLACEHOLDER_NARRATIVE=1 to bypass this for a dry-run render.)\n',
    );
    process.exit(1);
  }

  audit['aiNarrative'] = narrative;
  audit['pageMetrics'] = metrics;

  await writeFile(AUDIT, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `  AI narrative merged: ${narrative.prioritised.length} prioritised actions, ` +
      `${narrative.designJudgments.length} design judgments\n`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
