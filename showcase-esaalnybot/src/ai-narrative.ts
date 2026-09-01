/**
 * The AI layer, authored offline.
 *
 * WebAudit AI's design (Principle III / FR-030) is: the code layer measures,
 * the AI layer *explains and prioritises what was measured* — it never invents
 * an observation. No runtime LLM key is configured for this showcase, so this
 * file is that AI layer, written by Claude strictly from the measured findings
 * in `data/audit.json`.
 *
 * Everything here is labelled `AI_NARRATIVE` (prose) or, for the design
 * observations that have no code-layer check behind them, `AI_JUDGMENT` — the
 * exact attribution the product's module runner would stamp on an AI-layer
 * finding. None of it moves a score: per-area scores come only from MEASURED
 * findings, as in the real `packages/scoring`.
 *
 * Run after `runner.ts`; merges into `data/audit.json`.
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

function build(metrics: {
  timings: Record<string, number>;
  transferKb: number;
  resourceCount: number;
  domNodes: number;
  textLength: number;
  headings: { h1: number };
}): Narrative {
  const fcp = metrics.timings['firstContentfulPaintMs'] ?? 0;
  const load = metrics.timings['loadMs'] ?? 0;

  return {
    authoredBy:
      'Claude (Anthropic) acting as the WebAudit AI AI-layer — grounded only in the measured findings in this file; no runtime LLM call was made.',
    scopeNote:
      'The audited URL (app.esaalnybot.tech) is the sign-in screen of the Esaalny AI-chatbot platform. This audit covers the public, pre-authentication page a visitor and a search crawler actually see. The product itself lives behind the login; auditing behind a sign-in is deliberately out of scope for the WebAudit AI baseline (it would mean holding customer credentials), so the app dashboard is not covered here.',

    coverage: {
      heading: 'What this 87 does and does not mean',
      body:
        'This score is a PASSIVE configuration and hygiene assessment — what can be observed from the served responses and a real browser render, at zero risk to the target. It is not a penetration test. It says nothing about whether login can be bypassed, whether one tenant can read another\'s chatbot data, whether the API is injectable, or whether rate limiting works. That work is a separate 47-case manual engagement in the "Pentest plan" tab, and — apart from seven non-intrusive checks already recorded there — it has not been run.',
      passive: [
        'Covered here (measured): security headers, HTTPS/HSTS, cookie flags, server-version disclosure, meta/SEO structure, Core Web Vitals and page weight (real Chromium), responsive layout, broken links, secret leakage in served markup.',
      ],
      active: [
        'NOT covered by the 87 — see the Pentest plan tab: SQL/NoSQL injection, authentication (login / register / password-reset, incl. host-header poisoning and reset-token races), rate limiting and brute-force, reaching the admin dashboard, IDOR and cross-tenant isolation, SSRF, XSS, JWT/session, the chatbot widget and prompt injection, and business logic.',
        'Non-intrusive checks already recorded there flag: the missing security headers (same as Security below), the server-version disclosure, an HSTS gap on an otherwise-good TLS setup, and a CORS configuration smell on api.esaalnybot.tech (Access-Control-Allow-Credentials: true) that needs an active test to rate.',
      ],
    },

    executiveSummary:
      `app.esaalnybot.tech scores 87/100 on the passive configuration audit. That is a hygiene score, not a security clearance — the deep testing (injection, auth, rate limiting, tenant isolation) is the separate engagement in the Pentest plan tab and is mostly not yet run. On what was measured: nothing blocks a launch — there are no critical findings — but the site ships with none of the standard HTTP security headers, which is the single most valuable thing to fix and is almost entirely nginx configuration, not code. ` +
      `Security scores lowest (67): the response carries no Content-Security-Policy (HIGH), no HSTS, no X-Frame-Options, and no X-Content-Type-Options, and the Server header advertises its exact nginx version. Search visibility (79) is limited by the page being a client-rendered React shell — the HTML served to a crawler has no <h1>, no meta description, and almost no text; the rendered DOM does have an <h1> ("Sign in to your workspace"), so a JavaScript-executing crawler like Googlebot will see more than a simple one will, but the missing meta description is a real gap at any level. ` +
      `Performance (91) is genuinely good — first contentful paint measured ${fcp}ms and full load ${load}ms over ${metrics.resourceCount} requests / ${metrics.transferKb}KB with a ${metrics.domNodes}-node DOM — held back only by the origin serving uncompressed responses with no cache-control headers. Design and Testing measured clean at 1440px and 390px: the layout is responsive with zero horizontal overflow at mobile width, and every same-origin link resolves. ` +
      `Bottom line for the client: this is a tidy, fast, well-built front end whose main weakness is that it was deployed without the security-header and compression configuration that a production nginx vhost should carry. Most of the report is a 30-minute change to one server config file.`,

    areaNarratives: {
      SECURITY:
        'Seven measured findings, all from the served HTTP response, none requiring source access. The page is served over HTTPS (good) but with no Strict-Transport-Security header, so a visitor who types the bare domain or follows an http:// link gets no browser-enforced upgrade. There is no Content-Security-Policy, which is the highest-value header to add for a page that loads a third-party widget script (api.esaalnybot.tech/widget.js) — a CSP is what bounds the blast radius if that script or any dependency is ever compromised. X-Frame-Options and X-Content-Type-Options are absent (clickjacking and MIME-sniffing protection), and Referrer-Policy / Permissions-Policy are absent (lower severity, but free to add). Finally the Server header returns the precise nginx build ("nginx/1.24.0 (Ubuntu)"), which hands an attacker a version to match against known CVEs for no operational benefit. The data-leak scanner found no secrets in the served markup — clean. Every one of these is an nginx `add_header` / `server_tokens off;` change; none is an application-code fix. ' +
        'Two things this passive layer can see but not score: TLS itself is actually well configured (1.2/1.3 only, strong ciphers, valid cert — only the HSTS header is missing), and api.esaalnybot.tech returns Access-Control-Allow-Credentials: true without reflecting an arbitrary origin — a CORS configuration that needs an active test (Pentest plan tab, MAP-04) to confirm as safe or exploitable. Everything else about the API and the authenticated product — injection, auth, tenant isolation, rate limiting — is the Pentest plan tab, not this score.',
      SEO:
        'The core issue is architectural: the server sends an 859-byte HTML shell with an empty <div id="root"> and the page is built entirely in the browser by React. So the served HTML has no <h1> and no meta description, which the content and meta checkers correctly flag. After JavaScript runs, the rendered page does contain a single well-formed <h1> ("Sign in to your workspace") and ~240 characters of body copy — Google renders JS and will see this, but many other crawlers, link-preview bots, and older tooling will not. The missing meta description is the clearest win: it is a one-line tag and it controls the snippet shown in search results and social shares. A canonical link is also absent. "Thin content" is expected and acceptable for a login page — it is flagged for completeness, not because a sign-in screen should have an essay on it. The higher-leverage SEO move for this business is to have a real marketing/landing page (not the app subdomain) be the indexable entry point.',
      PERFORMANCE:
        `Measured with a real headless Chromium render: TTFB ${metrics.timings['ttfbMs'] ?? '-'}ms, DOM interactive ${metrics.timings['domInteractiveMs'] ?? '-'}ms, first contentful paint ${fcp}ms, load ${load}ms, ${metrics.transferKb}KB transferred over ${metrics.resourceCount} requests. Those are good numbers and the Core Web Vitals analyzer found nothing to flag. The two real findings are both origin configuration: responses are served without gzip/brotli compression, and no Cache-Control / Expires headers are set, so the JS and CSS bundles (which have content-hashed filenames and could be cached for a year) are re-fetched more than they need to be. The bundle filenames already carry a content hash, so "Cache-Control: public, max-age=31536000, immutable" on /assets/* is safe and should be added alongside compression.`,
      UI:
        'No automated rendering defect was measured. Full-page screenshots were captured at 1440px and 390px; horizontal overflow is 0px at both, so the responsive layout holds. The design-critique capability (impeccable) is an AI-layer check and contributes only to the prompt — with no runtime model it produced no output, so the observations below are AI-layer judgments from the captured screenshots, marked AI_JUDGMENT. They are opinions, not measurements, and do not affect the score.',
      TESTING:
        'The functional checks that are answerable without a scripted browser session both passed: every same-origin link on the page resolves (there are effectively none to fail — the page is a single form), and the contradiction detector — which cross-checks the audit\'s own output for internal inconsistency — found none. This area is thin because the meaningful functional tests for this product (can a user actually sign in, create an account, reach the dashboard) all live behind authentication, which this audit does not cross.',
    },

    prioritised: [
      {
        rank: 1,
        title: 'Add the standard security headers in nginx (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)',
        area: 'Security',
        severity: 'HIGH',
        effort: 'small',
        why: 'One block in the nginx server{} config closes six of the seven security findings at once. CSP is the highest value because the page loads a third-party widget script. This is the single best return on effort in the whole report.',
      },
      {
        rank: 2,
        title: 'Enable gzip/brotli compression and set Cache-Control on /assets/*',
        area: 'Performance',
        severity: 'MEDIUM',
        effort: 'trivial',
        why: 'Content-hashed bundle names mean long-lived immutable caching is safe. Compression + caching is a few lines of nginx config and measurably cuts repeat-visit and slow-network load.',
      },
      {
        rank: 3,
        title: 'Add a <meta name="description"> (and ideally server-render or prerender the login page\'s <title>/<h1>/description)',
        area: 'Search visibility',
        severity: 'MEDIUM',
        effort: 'small',
        why: 'The meta description controls the search/social snippet and is missing entirely. Prerendering the shell would also give non-JS crawlers the <h1> and copy they currently never see.',
      },
      {
        rank: 4,
        title: 'Hide the nginx version (server_tokens off;)',
        area: 'Security',
        severity: 'LOW',
        effort: 'trivial',
        why: 'One directive. Removes a free reconnaissance signal.',
      },
      {
        rank: 5,
        title: 'Use a branded support address instead of a gmail.com address on the sign-in page',
        area: 'Design',
        severity: 'LOW',
        effort: 'small',
        why: 'helpesaalnybot@gmail.com on a paid B2B product\'s login screen reads as less established than support@esaalnybot.tech. Trust matters most at the auth boundary.',
      },
    ],

    designJudgments: [
      {
        checkId: 'ai.ui.judgment.support-address',
        severity: 'LOW',
        title: 'Sign-in page uses a personal gmail.com support address',
        explanation:
          'The footer of the sign-in card reads "Need help? Contact helpesaalnybot@gmail.com". For a paid B2B chatbot platform, a free-mail support address on the authentication screen undercuts the otherwise professional presentation.',
        consequence:
          'Prospects evaluating the product form a trust impression at the login screen; a gmail.com address signals a smaller / less established operation than the UI otherwise conveys.',
        fixPrompt:
          'Replace the support contact on the sign-in page with an address on the product domain (e.g. support@esaalnybot.tech) and set up forwarding if a real mailbox does not exist yet.',
      },
      {
        checkId: 'ai.ui.judgment.password-placeholder',
        severity: 'LOW',
        title: 'Password field renders a dot-string placeholder that looks pre-filled',
        explanation:
          'The empty password input shows a row of bullet characters as its placeholder. At a glance the field looks already populated, which can make a returning user hesitate or click into it expecting to clear a value.',
        consequence:
          'Minor friction at the most important conversion point on the site — the moment a user signs in.',
        fixPrompt:
          'Give the password input a normal text placeholder (e.g. "Enter your password") or no placeholder at all, rather than a string of dots.',
      },
      {
        checkId: 'ai.ui.judgment.helper-text-contrast',
        severity: 'LOW',
        title: 'Low-contrast helper text below the form',
        explanation:
          'The "Don\'t have an account?" and "Need help?" lines are set in a light grey on white that appears to sit near or below the WCAG AA 4.5:1 contrast threshold for small text. The primary form elements themselves have good contrast.',
        consequence:
          'Users with low vision or on dim/glare-affected screens may not see the account-creation and support links, which are the two secondary actions on the page.',
        fixPrompt:
          'Darken the secondary helper text under the sign-in form to meet WCAG AA (4.5:1) contrast against the white card background; verify with a contrast checker.',
      },
      {
        checkId: 'ai.ui.judgment.positive',
        severity: 'INFO',
        title: 'Layout, hierarchy and responsiveness are well executed',
        explanation:
          'Noted for balance: the card is well-centred with generous, even whitespace; the eyebrow / H1 / subtext / form rhythm gives a clear reading order; there is exactly one primary action (the dark "Sign in" button) with no competing focal point; and the layout reflows cleanly to 390px with no horizontal scroll. This is a solid baseline to build the rest of the marketing surface on.',
        consequence:
          'No action needed — this is what the rest of the public surface should match.',
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
