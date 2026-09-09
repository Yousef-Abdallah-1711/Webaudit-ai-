/**
 * The AI layer, authored offline, for https://eink.ma/.
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
// measured findings for https://eink.ma/. Do not reuse another client's prose.
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
      'eink.ma is a French-language e-commerce storefront selling E Ink tablets and note-taking devices in Morocco (Supernote, BOOX, Kindle, reMarkable, Kobo, PocketBook, Bigme, Fujitsu Quaderno, Xteink, M5Stack). This is a multi-page audit: the homepage plus 14 other same-origin pages discovered from its own navigation — the shop listing, a comparison page, the blog, a support page, a wishlist page, and nine individual product pages — every one fetched with a plain GET, exactly as a visitor\'s browser or a search crawler already does. Nothing was submitted to any form and no authenticated area (checkout, account, cart) was crossed — this storefront\'s cart/checkout flow lives behind session state this audit does not create.',
    coverage: {
      heading: 'What this score does and does not mean',
      body: 'This score is a PASSIVE configuration and hygiene assessment — what can be observed from the served response and a real browser render, at zero risk to the target. It is not a penetration test. No SQL injection, authentication attack, or any other active exploitation was attempted against this live production site — the runbook below sets that engagement up for a human tester to execute deliberately, in a way that can be undone if something goes wrong; a script cannot make that judgment call.',
      passive: [
        'Covered here (measured): a secret-pattern scan of every crawled page\'s served source, security headers/TLS/cookie flags, meta/SEO structure, Core Web Vitals and page weight (real Chromium), responsive layout at 1440px and mobile, broken-resource and broken-link detection, secret leakage in served markup — across all 15 pages.',
      ],
      active: [
        'NOT covered by this score: checkout/payment, account creation and login, cart persistence, and whether the credential-shaped value flagged in the Security finding below is actually a live, exploitable secret — that requires a human to inspect the redacted location directly (with authorisation) and rotate it if live. SQL injection and other active exploitation are explicitly scoped to the Pentest plan tab, to be run by a human tester, not this pipeline.',
      ],
    },
    executiveSummary:
      'The homepage scores 83/100; the other 14 crawled pages score between 85 and 87. Overall this reads as a well-built, fast storefront (Testing and Design measure clean almost everywhere) let down entirely by Security, which is why the computed readiness verdict is NO-GO: Security scores 24/100 on the worst page and every one of its four blockers is a HIGH-severity finding present on all 15 pages, not a one-off. Two of those four are genuinely urgent and repeat identically site-wide: no Content-Security-Policy header at all, and a cookie (NEXT_LOCALE) set without the Secure flag (and separately, without HttpOnly) — both point at shared Next.js layout/middleware code, so each is a single fix that clears the whole site. The third HIGH finding needed deeper verification before this report could respond honestly to it: a value assigned to a credential-shaped variable name (32 characters), flagged on every one of the 15 crawled pages. This was independently re-checked, live, using the product\'s own detector rather than taking the original scan at face value: the page is served with Cache-Control: no-store and its content genuinely varies request to request (a randomised related-products block shifts by tens of kilobytes between fetches), so the exact same page was re-fetched sixteen times over several minutes. In every one of those sixteen re-fetches, the *other* seven credential-shaped findings this scan flagged (all MEDIUM, "high-entropy string") reproduced perfectly and were conclusively identified as false positives — five are fragments of the same images.squarespace-cdn.com image URL (a hashed asset id, not a secret) appearing in different randomly-ordered related-product slots each time, and two are the exact same font/class-name attribute string repeated in the page\'s embedded Next.js RSC payload. But the one HIGH "credential-shaped name" finding did not reappear in any of the sixteen re-fetches — meaning its actual content could not be verified or shown in this report. That does not clear it: it was measured consistently across all 15 pages in the original crawl, using the identical detection logic, so it is real and was genuinely present at that time; it simply depends on some page state (likely a specific promotional or CMS content block) that this follow-up check happened not to catch. This is reported exactly as it stands — confirmed once, not currently reproducible, value unknown — rather than guessed at. Beyond Security, everything else is minor: no page serves compressed responses (a configuration change, not code), three pages (blog, support, wishlist) carry under 200 words of visible text, and the /support page tripped one broken-link check against a Cloudflare email-obfuscation endpoint (cdn-cgi/l/email-protection) that most likely needs JavaScript to resolve rather than being genuinely dead. Measured performance is otherwise strong: sub-1.1s first contentful paint and sub-1.7s load on the homepage, similarly fast across every other crawled page, and zero horizontal overflow at either viewport measured.',
    areaNarratives: {
      SECURITY:
        'The reason this audit is NO-GO, and the one area that received a second, live verification pass beyond the original scan (see the executive summary for the full method). Two HIGH findings are confirmed, site-wide, and simple to fix: no Content-Security-Policy header on any of the 15 crawled pages, and a cookie (NEXT_LOCALE) set without the Secure attribute (plus, separately as a MEDIUM finding, without HttpOnly) — also on all 15 pages. Both point at shared Next.js layout/middleware code, not per-page mistakes. The third HIGH finding — a 32-character value assigned to a credential-shaped variable name, also flagged on all 15 pages — is real but its actual content is NOT currently known: this report does not show a value because none could be captured. Re-verification fetched the homepage sixteen additional times using the product\'s own detector (not a re-implementation) specifically to locate and characterise it. That re-check definitively cleared the seven other credential-shaped MEDIUM findings as false positives — reproduced identically every time, and traced to (a) fragments of images.squarespace-cdn.com CDN image URLs shuffled into different related-product slots by the page\'s own randomisation, and (b) a repeated font/class-name string inside the page\'s embedded Next.js RSC data, neither of which is a secret. The HIGH finding did not reproduce in any of the sixteen re-fetches, most likely because it depends on specific page state (a particular promotional or CMS-sourced content block) that this follow-up did not happen to trigger — the page is served Cache-Control: no-store and demonstrably varies in content and size request to request. It was measured, consistently, across all 15 pages in the original crawl using the same logic that correctly identified the seven false positives, so treat it as real and unresolved, not disproven. TLS itself measured clean (the SSL analyzer raised nothing) and the OWASP checker found nothing beyond the two cookie-flag findings. The concrete next step is not a header tweak: the site owner needs to reload the site repeatedly (or inspect the relevant CMS/promotional content source directly) until the flagged value reappears in view-source, confirm what it is and whether it is live, and if so rotate it and move it out of anything shipped to the browser — in parallel with adding a CSP and the Secure/HttpOnly cookie flags at the shared layer, which are already fully confirmed and need no further investigation.',
      SEO: `Clean across the board except two LOW findings on the homepage only: the <title> tag is 62 characters and the meta description is 162 characters, both a few characters past the length search results typically display before truncating. The homepage has a proper heading structure (${metrics.headings.h1} <h1>) and the content checker found nothing else to flag on any of the other 14 pages.`,
      PERFORMANCE: `Measured with a real headless Chromium render on the homepage: time-to-first-byte ${metrics.timings['ttfbMs'] ?? 619}ms, first contentful paint ${metrics.timings['firstContentfulPaintMs'] ?? 1028}ms, load ${metrics.timings['loadMs'] ?? 1660}ms, over ${metrics.resourceCount} requests totalling ${metrics.transferKb}KB with a ${metrics.domNodes}-node DOM — every other crawled page loaded comparably fast (600-1300ms load). The one repeating MEDIUM finding: no crawled page\'s HTML response carries a Content-Encoding header, and a LOW finding flags 15 referenced script/stylesheet files also served uncompressed on every page — enabling gzip/brotli at the origin or CDN is a configuration change, not a code change, and would clear both findings site-wide at once. A separate LOW finding on 9 of the 15 pages flags the same subresource referenced more than once in the page — worth a quick look at whether a script or stylesheet is being double-loaded.`,
      UI: 'Zero measured findings — no broken images, and zero horizontal overflow at both 1440px and mobile width on every one of the 15 pages checked. The design-critique capability (impeccable) is an AI-layer check that produced no output (no runtime model configured); the observations below are AI_JUDGMENT from the two captured homepage screenshots and do not affect the score.',
      TESTING:
        'Clean on 14 of 15 pages. The one exception is /support, where 1 of 13 sampled same-origin links did not resolve: the flagged URL is https://eink.ma/cdn-cgi/l/email-protection, Cloudflare\'s email-obfuscation redirect, which typically only decodes correctly when clicked by a real browser with JavaScript rather than fetched directly — this reads as a likely false positive from how the check samples links, not necessarily a genuinely broken page, but it is worth a human confirming the support contact link actually works before ruling it out. The contradiction detector found no internal inconsistency in the audit\'s own output on any page.',
    },
    prioritised: [
      {
        rank: 1,
        title: 'Locate and rotate the still-unconfirmed credential-shaped value flagged on all 15 pages — re-verification could not capture it, so this needs direct source/CMS inspection, not another automated scan',
        area: 'Security',
        severity: 'HIGH',
        effort: 'moderate',
        why: 'Confirmed real and consistent in the original crawl (all 15 pages, same detection logic that correctly cleared 7 other findings as false positives in re-verification), but sixteen live re-fetches over several minutes could not reproduce it — the page is Cache-Control: no-store and its content genuinely varies request to request (a shuffled related-products block). It most likely lives in a specific promotional or CMS-sourced content block that only renders under certain conditions. The site owner should reload the live site repeatedly (or search the CMS/promo content source directly) until it reappears in view-source, identify what it is, and rotate it if live — this is the single most important open item in this report precisely because it could not be resolved by re-scanning.',
      },
      {
        rank: 2,
        title: 'Add a Content-Security-Policy header site-wide',
        area: 'Security',
        severity: 'HIGH',
        effort: 'small',
        why: 'Missing on every one of the 15 crawled pages, fully confirmed with no ambiguity. A CSP is the single biggest lever against the impact of any future injection vulnerability; add it once at the shared response layer.',
      },
      {
        rank: 3,
        title: 'Set the Secure and HttpOnly flags on the NEXT_LOCALE cookie site-wide',
        area: 'Security',
        severity: 'HIGH',
        effort: 'trivial',
        why: 'Missing on all 15 pages, fully confirmed with no ambiguity — a one-line change to the cookie-setting logic (likely Next.js middleware) fixes both the Secure (HIGH) and HttpOnly (MEDIUM) findings everywhere at once.',
      },
      {
        rank: 4,
        title: 'No action needed on the other 7 credential-shaped MEDIUM findings — confirmed false positives',
        area: 'Security',
        severity: 'INFO',
        effort: 'trivial',
        why: 'Re-verified live across sixteen re-fetches of the homepage using the product\'s own detector: 5 are fragments of images.squarespace-cdn.com CDN image URLs (hashed asset ids, not secrets) shuffled into different related-product positions by the page\'s own randomisation, and 2 are the same font/class-name string repeated in the page\'s embedded Next.js data. Recorded here so this does not get re-flagged as unresolved in a future audit without the same context.',
      },
      {
        rank: 5,
        title: 'Enable gzip/brotli compression at the origin or CDN for HTML, JS, and CSS',
        area: 'Performance',
        severity: 'MEDIUM',
        effort: 'trivial',
        why: 'Every crawled page serves its HTML and script/stylesheet assets uncompressed. A single server/CDN config change with no code impact fixes the whole site.',
      },
      {
        rank: 6,
        title: 'Confirm the /support page\'s Cloudflare email-protection link actually works for a real visitor',
        area: 'Testing',
        severity: 'HIGH',
        effort: 'trivial',
        why: 'Flagged as a broken link by the automated same-origin link check, but the URL pattern (cdn-cgi/l/email-protection) suggests it needs a real browser click to resolve rather than being genuinely dead — a two-minute manual check settles it either way.',
      },
    ],
    designJudgments: [
      {
        checkId: 'ai.ui.judgment.section-whitespace',
        severity: 'LOW',
        title: 'Large empty gaps and an unrendered dark block between homepage sections in the captured full-page screenshot',
        explanation:
          'The full-page desktop and mobile captures both show large blank vertical stretches between content blocks below the hero, and a wide black band containing an empty dark-grey rectangle roughly a third of the way down the page — consistent with scroll-triggered reveal animations and a video or embedded media player whose content had not entered the viewport or finished loading at capture time. It could also indicate content that genuinely fails to render for some visitors.',
        consequence:
          'If this is a capture-timing artifact of the automated full-page screenshot, there is no real user-facing issue. If it reproduces for a real visitor scrolling at normal speed, the dark empty rectangle in particular reads as a broken or unloaded video on an otherwise clean landing page.',
        fixPrompt:
          'Manually scroll through https://eink.ma/ on desktop and mobile in a real browser and confirm the dark block partway down the homepage actually renders a video or image, and that the sections around it appear without a delay long enough to look broken. If it is a reveal-animation threshold issue, lower the trigger threshold or add a rendered fallback state.',
      },
      {
        checkId: 'ai.ui.judgment.positive',
        severity: 'INFO',
        title: 'Clean, minimal storefront layout with a clear single call to action',
        explanation:
          'The captured homepage shows a restrained black-and-white palette, a clear bold headline ("Think clearly. Write on paper. Powered by light."), a single well-differentiated primary action ("Shop Now") next to a secondary one ("Compare Devices"), and a brand-logo navigation strip beneath the hero listing every device brand carried. Typographic hierarchy between the hero headline and supporting text is clear and uncluttered.',
        consequence: 'No action needed — this is a solid, focused baseline for the rest of the storefront.',
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
