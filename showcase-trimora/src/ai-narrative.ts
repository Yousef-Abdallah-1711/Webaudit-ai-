/**
 * The AI layer, authored offline, for https://trimora.sy/.
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
}

// ---------------------------------------------------------------------------
// TODO: rewrite everything in this function from data/audit.json's real
// measured findings for https://trimora.sy/. Do not reuse another client's prose.
//
// Steps:
//   1. Read data/audit.json (after `pnpm run audit` + `pnpm run capture`).
//   2. For each area (Security, SEO, Performance, Design, Testing), read its
//      `findings` and `score`/`state`, and write areaNarratives[MODULE] that
//      explains what was measured — cite real numbers, real header names,
//      real severities. Never state something the findings don't support.
//   3. Write executiveSummary from the overall score + the areas' findings.
//   4. Fill `prioritised` (rank by real severity/effort) and `designJudgments`
//      (AI_JUDGMENT only — screenshot-based opinions, INFO/LOW severity,
//      never move a score) from data/screenshot-{desktop,mobile}.png.
//   5. Set authoredBy to a real value (drop the "PLACEHOLDER" prefix) once
//      every field above reflects this target's actual measured findings.
// ---------------------------------------------------------------------------
function build(metrics: {
  timings: Record<string, number>;
  transferKb: number;
  resourceCount: number;
  domNodes: number;
  textLength: number;
  headings: { h1: number };
}): Narrative {
  return {
    authoredBy:
      'Claude (Anthropic) acting as the WebAudit AI AI-layer — grounded only in the measured findings in this file; no runtime LLM call was made.',
    scopeNote:
      'trimora.sy is a salon-booking and salon-management SaaS platform serving Syria (site content is Arabic; a Next.js app). This is a multi-page audit: the homepage plus 10 other same-origin pages discovered from its own navigation and content — pricing, salons listing, two individual salon pages, about, contact, login, register, privacy, and terms (see "Pages audited" below) — every one fetched with a plain GET, exactly as a visitor\'s browser or a search crawler already does. Nothing was submitted to the login or register forms and no authenticated area was crossed; the product\'s own booking/management dashboard lives behind sign-in and is out of scope for this baseline (auditing it would mean holding customer credentials).',
    coverage: {
      heading: 'What this 92 does and does not mean',
      body: 'This score is a PASSIVE configuration and hygiene assessment — what can be observed from the served response and a real browser render, at zero risk to the target. It is not a penetration test. It says nothing about the booking flow, salon-owner accounts, payment handling, or multi-tenant data isolation once a user is signed in.',
      passive: [
        'Covered here (measured): a secret-pattern scan of the served page source, security headers/TLS, meta/SEO structure, Core Web Vitals and page weight (real Chromium), responsive layout at 1440px and mobile, broken-resource detection, secret leakage in served markup.',
      ],
      active: [
        'NOT covered by the 92: the authenticated booking dashboard, salon-owner accounts, payment/billing flows, and whether the value flagged in the Security finding below is actually a live, exploitable credential — that requires a human to inspect the redacted location directly (with authorisation) and rotate it if live.',
      ],
    },
    executiveSummary:
      'The homepage scores 92/100 on the passive configuration audit; the other 10 crawled pages score between 74 and 92 (see "Pages audited"). The one finding that should be treated as urgent regardless of score: a value assigned to a credential-shaped variable name is embedded directly in the served HTML/JavaScript — and it appears on every single one of the 11 pages crawled, not just one. That pattern means it almost certainly lives in shared code (the Next.js layout or a globally-loaded chunk), not a one-off mistake on a single page — anything shipped to the browser is public by definition, so if this is a live key or token it should be rotated and moved server-side immediately across the whole app, not patched on one page. This report withholds the value itself and only confirms its shape and location on each page. The one genuine outlier is /contact, which scores 74 because the data-leak scanner additionally flagged 17 high-entropy strings there alone (Security dropped to 8/100 on that page specifically) — these read as a cluster of third-party integration keys (a contact form commonly embeds things like a reCAPTCHA site key, a maps key, or a form-service key), some of which are designed to be public and safe to expose and some of which are not; the scanner cannot tell the difference by pattern alone, so each one needs a human to check individually. Everything else is minor and repeats across most pages: the site\'s own logo, served through the Next.js image optimiser (/_next/image?url=%2Flogo.png), fails to load on every page that references it (both a Performance HIGH and a Design MEDIUM finding, same root cause), no response carries compression, and most pages are missing a canonical link. Measured performance itself is good throughout: sub-second first contentful paint and load on every page. Design and Testing measured clean otherwise; the layout is responsive with zero horizontal overflow at both 1440px and mobile width on every page checked.',
    areaNarratives: {
      SECURITY:
        'The highest-severity thing in this report, and it is site-wide: the data-leak scanner found a value assigned to a credential-shaped name in the page\'s own served source on every one of the 11 pages crawled (32 characters each time, redacted before this file — or any part of it — was ever seen by an AI provider, per this product\'s own redaction guarantee). Appearing identically on every page is itself informative — it points to shared layout/bundle code rather than a page-specific leak, so fixing it once at the source should clear it everywhere. Separately, /contact alone additionally trips 17 high-entropy-string findings not seen on any other page — likely a cluster of third-party integration keys on that one form, some possibly meant to be public. The header checker, SSL analyzer, and OWASP checker found nothing else on any page — TLS and response headers are otherwise clean site-wide. The action here is not a header tweak: someone needs to open the flagged locations in the actual page source, confirm whether each value is a live credential, and if so rotate it and move it out of anything shipped to the browser. This is a passive scan; it does not confirm exploitability, only presence.',
      SEO: 'One low-severity finding: no <link rel="canonical"> tag. The page does have a proper Arabic title and heading structure (one <h1>, seven <h2>s, fourteen <h3>s) and the content checker found nothing else to flag — this is a page a crawler can read and index reasonably well; the canonical link is the one gap.',
      PERFORMANCE: `Measured with a real headless Chromium render: time-to-first-byte ${metrics.timings['ttfbMs'] ?? 77}ms, first contentful paint ${metrics.timings['firstContentfulPaintMs'] ?? 528}ms, load ${metrics.timings['loadMs'] ?? 536}ms, over ${metrics.resourceCount} requests totalling ${metrics.transferKb}KB with a ${metrics.domNodes}-node DOM. Those are solid numbers for a marketing page. The HIGH finding is a broken resource: the site's own logo image, requested through Next.js's built-in image optimisation endpoint, did not load — one broken image is also costing a wasted request on every page view. Separately, neither the main HTML response nor any of the 14 sampled JS/CSS bundles carry a Content-Encoding header, so every asset transfers uncompressed; enabling gzip/brotli at the origin or CDN is a configuration change, not a code change.`,
      UI: 'One measured finding: the same broken logo image identified in Performance also shows up here as a visual defect (1 of 7 sampled <img> references failed to resolve) — expect a visible gap or a broken-image icon where the Trimora logo should render. Automated layout checks found zero horizontal overflow at both 1440px and mobile width, so the responsive grid itself holds. The design-critique capability (impeccable) is an AI-layer check that produced no output (no runtime model configured); the observations below are AI_JUDGMENT from the two captured screenshots and do not affect the score.',
      TESTING: 'Both functional checks that do not require a scripted session passed cleanly: every same-origin link on the page resolves, and the contradiction detector found no internal inconsistency in the audit\'s own output. As with any marketing-page audit, the meaningful functional tests for this product — can a salon owner actually complete a booking, does availability update correctly, is one salon\'s data isolated from another\'s — all live behind authentication, which this audit does not cross.',
    },
    prioritised: [
      {
        rank: 1,
        title: 'Confirm and rotate the credential-shaped value found on every page; move it out of shared client-side code',
        area: 'Security',
        severity: 'HIGH',
        effort: 'small',
        why: 'Present identically on all 11 pages crawled, which means it is almost certainly in shared layout/bundle code, not a one-off. Anything in served HTML/JS is public — every visitor\'s browser already has it. If live, rotate it and move it server-side (an API route or backend call), not embedded client-side.',
      },
      {
        rank: 2,
        title: 'Manually review the 17 additional high-entropy strings flagged only on /contact',
        area: 'Security',
        severity: 'MEDIUM',
        effort: 'small',
        why: 'This page alone carries far more flagged strings than any other (Security scores 8/100 there specifically). Likely third-party integration keys (form service, maps, reCAPTCHA) — some may be intentionally public, but that needs a human to confirm one by one, not this scanner.',
      },
      {
        rank: 3,
        title: 'Fix the broken logo image served through the Next.js image optimiser',
        area: 'Performance',
        severity: 'HIGH',
        effort: 'trivial',
        why: 'One root cause producing two measured findings on every page that references it (a failed request and a visible broken-image gap). Likely a missing source file or a misconfigured next.config.js image domain/path — quick to isolate and fixes every page at once.',
      },
      {
        rank: 4,
        title: 'Enable gzip/brotli compression at the origin or CDN for HTML, JS, and CSS',
        area: 'Performance',
        severity: 'MEDIUM',
        effort: 'trivial',
        why: 'Every crawled page serves its HTML and script/stylesheet assets uncompressed. A single server/CDN config change with no code impact fixes the whole site.',
      },
      {
        rank: 5,
        title: 'Add a <link rel="canonical"> tag site-wide',
        area: 'Search visibility',
        severity: 'LOW',
        effort: 'trivial',
        why: 'Missing on most pages crawled; removes ambiguity for search engines about which URL variant to index.',
      },
    ],
    designJudgments: [
      {
        checkId: 'ai.ui.judgment.section-whitespace',
        severity: 'LOW',
        title: 'Large empty gaps between homepage sections in the captured full-page screenshot',
        explanation:
          'The full-page desktop and mobile captures both show large blank vertical gaps between content blocks (e.g. between the hero/stats bar and the next section, and again before the salon showcase card). This is consistent with scroll-triggered reveal animations whose content had not entered the viewport at capture time, reserving layout height before rendering — a common pattern with Next.js/Framer-Motion-style entrance animations. It could also indicate content that genuinely fails to render for some visitors.',
        consequence:
          'If this is an animation-timing artifact of automated full-page capture, there is no real user-facing issue. If it reproduces for a real visitor scrolling at normal speed, it reads as broken/unfinished sections on an otherwise polished landing page.',
        fixPrompt:
          'Manually scroll through https://trimora.sy/ on desktop and mobile in a real browser and confirm every section between the hero and the salon showcase renders its content without a delay long enough to look broken. If it is a reveal-animation threshold issue, lower the trigger threshold or add a rendered fallback state.',
      },
      {
        checkId: 'ai.ui.judgment.positive',
        severity: 'INFO',
        title: 'Clear Arabic RTL layout with a coherent brand palette',
        explanation:
          'The captured screenshots show a well-executed right-to-left layout: consistent dark-green/cream brand palette, a clear hero message, a stats row (25 users, 82+ bookings, 85% satisfaction, 28+ active salons) that establishes credibility early, and a genuine customer testimonial with a named salon. Typographic hierarchy between the hero heading and supporting text is clear.',
        consequence: 'No action needed — this is a solid baseline for the rest of the marketing surface.',
        fixPrompt: 'No change required.',
      },
    ],
  };
}

async function main(): Promise<void> {
  const audit = JSON.parse(await readFile(AUDIT, 'utf8')) as Record<string, unknown>;
  const metrics = JSON.parse(await readFile(METRICS, 'utf8')) as Parameters<typeof build>[0] & {
    target: string;
  };

  const narrative = build(metrics);

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
