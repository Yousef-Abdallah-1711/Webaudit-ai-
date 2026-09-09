# WebAudit AI — audit report

## Production readiness: 🛑 NOT READY TO SHIP

Computed from the worst score any single crawled page recorded per area, plus any HIGH/CRITICAL finding repeating across every page — an average score hides exactly the outlier this decision needs to see.

| Area | Worst observed | Threshold | |
|---|---|---|---|
| Security | 8 | 80 | 🛑 |
| Search visibility | 84 | 80 | ✅ |
| Performance | 81 | 80 | ✅ |
| Testing | 88 | 80 | ✅ |
| Design | 95 | 80 | ✅ |

**Blockers — fix these before this ships:**

- Security scores 8/100 on /contact — below the 80 bar.
- HIGH — "Credential in source: a value assigned to a credential-shaped name" found on all 11 crawled pages (Security) — points at shared code, not one page.
- HIGH — "Broken referenced resource" found on all 11 crawled pages (Performance) — points at shared code, not one page.

---

**Target** `https://trimora.sy/`  
**Completed** 2026-09-03 19:27:36 UTC · 9.5s  
**Overall score** 92 / 100 — mean of 5 scored areas (SECURITY, SEO, PERFORMANCE, TESTING, UI)  
**Findings** 7 — 0 critical, 2 high, 2 medium, 2 low, plus 1 AI design observations

| Area | State | Score |
|---|---|---|
| Security | COMPLETE | `██████████████████··` 88 |
| Search visibility | COMPLETE | `████████████████████` 98 |
| Performance | COMPLETE | `████████████████····` 81 |
| Testing | COMPLETE | `████████████████████` 100 |
| Design | COMPLETE | `███████████████████·` 95 |

---

## Pages audited

This is a **multi-page** audit — every page below was fetched and measured the same way as the primary page above (real capabilities, real browser render). Only same-origin GET requests were made; no form was submitted and no authenticated area was crossed.

| Page | Score | Critical | High | Medium | Low | Top finding |
|---|---|---|---|---|---|---|
| `/` | 92 | 0 | 2 | 2 | 2 | HIGH — Credential in source: a value assigned to a credential-shaped name |
| `/pricing` | 92 | 0 | 2 | 2 | 3 | HIGH — Credential in source: a value assigned to a credential-shaped name |
| `/salons` | 92 | 0 | 2 | 2 | 3 | HIGH — Credential in source: a value assigned to a credential-shaped name |
| `/about` | 92 | 0 | 2 | 2 | 2 | HIGH — Credential in source: a value assigned to a credential-shaped name |
| `/contact` | 74 | 0 | 3 | 18 | 3 | HIGH — Credential in source: a value assigned to a credential-shaped name |
| `/login` | 90 | 0 | 3 | 2 | 3 | HIGH — Credential in source: a value assigned to a credential-shaped name |
| `/salons/venera` | 92 | 0 | 2 | 2 | 2 | HIGH — Credential in source: a value assigned to a credential-shaped name |
| `/salons/shadi-hair-styles-2a0b12b7` | 92 | 0 | 2 | 2 | 3 | HIGH — Credential in source: a value assigned to a credential-shaped name |
| `/register` | 92 | 0 | 2 | 2 | 3 | HIGH — Credential in source: a value assigned to a credential-shaped name |
| `/privacy` | 90 | 0 | 3 | 2 | 2 | HIGH — Credential in source: a value assigned to a credential-shaped name |
| `/terms` | 90 | 0 | 3 | 2 | 2 | HIGH — Credential in source: a value assigned to a credential-shaped name |

Full per-page findings: `data/pages/<page>/audit.json`. Per-page screenshots (desktop + mobile): `data/pages/<page>/screenshot-*.png`.

---

## How this audit was produced

showcase-trimora standalone runner — real @webaudit/capabilities-vendored (13) + real module-runner + real safe-net + real Playwright browser pool

- **Browser:** real headless Chromium (Playwright)
- **AI layer:** NOT run at runtime (no LLM key). Executive summary, per-area narrative and prioritisation authored by Claude strictly from the measured findings below — labelled AI_NARRATIVE, distinct from the per-finding MEASURED / AI_JUDGMENT attribution the runner assigns.

The measurement layer is the product's own code, run for real:

- 13 capabilities from `packages/capabilities-vendored/*`, unmodified.
- `apps/worker/src/module-runner/*` for resolution, isolated concurrent execution, `globalThis.fetch` poisoning, per-area state and per-area scoring — imported, not re-implemented.
- `packages/safe-net` (`safeFetch`) is the only network door for `ctx.fetch`; `apps/probe-pool` (`createBrowserPool`) backs `ctx.withPage`.

## Executive summary

> Authored by the AI layer (Claude (Anthropic) acting as the WebAudit AI AI-layer — grounded only in the measured findings in this file; no runtime LLM call was made.)

The homepage scores 92/100 on the passive configuration audit; the other 10 crawled pages score between 74 and 92 (see "Pages audited"). The one finding that should be treated as urgent regardless of score: a value assigned to a credential-shaped variable name is embedded directly in the served HTML/JavaScript — and it appears on every single one of the 11 pages crawled, not just one. That pattern means it almost certainly lives in shared code (the Next.js layout or a globally-loaded chunk), not a one-off mistake on a single page — anything shipped to the browser is public by definition, so if this is a live key or token it should be rotated and moved server-side immediately across the whole app, not patched on one page. This report withholds the value itself and only confirms its shape and location on each page. The one genuine outlier is /contact, which scores 74 because the data-leak scanner additionally flagged 17 high-entropy strings there alone (Security dropped to 8/100 on that page specifically) — these read as a cluster of third-party integration keys (a contact form commonly embeds things like a reCAPTCHA site key, a maps key, or a form-service key), some of which are designed to be public and safe to expose and some of which are not; the scanner cannot tell the difference by pattern alone, so each one needs a human to check individually. Everything else is minor and repeats across most pages: the site's own logo, served through the Next.js image optimiser (/_next/image?url=%2Flogo.png), fails to load on every page that references it (both a Performance HIGH and a Design MEDIUM finding, same root cause), no response carries compression, and most pages are missing a canonical link. Measured performance itself is good throughout: sub-second first contentful paint and load on every page. Design and Testing measured clean otherwise; the layout is responsive with zero horizontal overflow at both 1440px and mobile width on every page checked.

### What this 92 does and does not mean

This score is a PASSIVE configuration and hygiene assessment — what can be observed from the served response and a real browser render, at zero risk to the target. It is not a penetration test. It says nothing about the booking flow, salon-owner accounts, payment handling, or multi-tenant data isolation once a user is signed in.

- ✅ Covered here (measured): a secret-pattern scan of the served page source, security headers/TLS, meta/SEO structure, Core Web Vitals and page weight (real Chromium), responsive layout at 1440px and mobile, broken-resource detection, secret leakage in served markup.
- ❌ NOT covered by the 92: the authenticated booking dashboard, salon-owner accounts, payment/billing flows, and whether the value flagged in the Security finding below is actually a live, exploitable credential — that requires a human to inspect the redacted location directly (with authorisation) and rotate it if live.

### Scope

trimora.sy is a salon-booking and salon-management SaaS platform serving Syria (site content is Arabic; a Next.js app). This is a multi-page audit: the homepage plus 10 other same-origin pages discovered from its own navigation and content — pricing, salons listing, two individual salon pages, about, contact, login, register, privacy, and terms (see "Pages audited" below) — every one fetched with a plain GET, exactly as a visitor's browser or a search crawler already does. Nothing was submitted to the login or register forms and no authenticated area was crossed; the product's own booking/management dashboard lives behind sign-in and is out of scope for this baseline (auditing it would mean holding customer credentials).

## Fix these first

| # | Action | Area | Severity | Effort | Why |
|---|---|---|---|---|---|
| 1 | Confirm and rotate the credential-shaped value found on every page; move it out of shared client-side code | Security | HIGH | small | Present identically on all 11 pages crawled, which means it is almost certainly in shared layout/bundle code, not a one-off. Anything in served HTML/JS is public — every visitor's browser already has it. If live, rotate it and move it server-side (an API route or backend call), not embedded client-side. |
| 2 | Manually review the 17 additional high-entropy strings flagged only on /contact | Security | MEDIUM | small | This page alone carries far more flagged strings than any other (Security scores 8/100 there specifically). Likely third-party integration keys (form service, maps, reCAPTCHA) — some may be intentionally public, but that needs a human to confirm one by one, not this scanner. |
| 3 | Fix the broken logo image served through the Next.js image optimiser | Performance | HIGH | trivial | One root cause producing two measured findings on every page that references it (a failed request and a visible broken-image gap). Likely a missing source file or a misconfigured next.config.js image domain/path — quick to isolate and fixes every page at once. |
| 4 | Enable gzip/brotli compression at the origin or CDN for HTML, JS, and CSS | Performance | MEDIUM | trivial | Every crawled page serves its HTML and script/stylesheet assets uncompressed. A single server/CDN config change with no code impact fixes the whole site. |
| 5 | Add a <link rel="canonical"> tag site-wide | Search visibility | LOW | trivial | Missing on most pages crawled; removes ambiguity for search engines about which URL variant to index. |

## Measured page load (real headless Chromium)

| Metric | Value |
|---|---|
| Time to first byte | 95 ms |
| DOM interactive | 521 ms |
| First contentful paint | 688 ms |
| DOMContentLoaded | 668 ms |
| Load | 668 ms |
| Transfer size | 2118.9 KB |
| Requests | 40 |
| DOM nodes | 296 |
| Rendered body text | 2376 chars |
| Rendered headings | h1×1, h2×7, h3×14 |
| Horizontal overflow | 0px @1440 · 0px @390 |

_Screenshots: `data/screenshot-desktop.png`, `data/screenshot-mobile.png`._

---

## Areas

### Security — COMPLETE · score 88/100

The highest-severity thing in this report, and it is site-wide: the data-leak scanner found a value assigned to a credential-shaped name in the page's own served source on every one of the 11 pages crawled (32 characters each time, redacted before this file — or any part of it — was ever seen by an AI provider, per this product's own redaction guarantee). Appearing identically on every page is itself informative — it points to shared layout/bundle code rather than a page-specific leak, so fixing it once at the source should clear it everywhere. Separately, /contact alone additionally trips 17 high-entropy-string findings not seen on any other page — likely a cluster of third-party integration keys on that one form, some possibly meant to be public. The header checker, SSL analyzer, and OWASP checker found nothing else on any page — TLS and response headers are otherwise clean site-wide. The action here is not a header tweak: someone needs to open the flagged locations in the actual page source, confirm whether each value is a live credential, and if so rotate it and move it out of anything shipped to the browser. This is a passive scan; it does not confirm exploitability, only presence.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `headers-checker` | CODE | 0 finding(s) · 535 ms |
| `ssl-analyzer` | CODE | 0 finding(s) · 513 ms |
| `data-leak-scanner` | CODE | 1 finding(s) · 481 ms |
| `owasp-checker` | CODE | 0 finding(s) · 503 ms |

#### HIGH · Credential in source: a value assigned to a credential-shaped name

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `da2229a9784b6a2030439df86f3363304ceb5697b9975e38e4c2f9e5aa576d3b` |
| Location | `https://trimora.sy` |

A value assigned to a credential-shaped name appears in https://trimora.sy/ at line 1, column 36824 (32 characters). The value has been withheld from this report and was replaced with [[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]] before any part of this file was sent to an AI provider.

**Why it matters.** If this is a live credential, anyone who can read this file can use it. Rotate it and move it to configuration the repository does not hold.

**Evidence.**

```json
{
  "kind": "GENERIC_SECRET_ASSIGNMENT",
  "path": "https://trimora.sy/",
  "segment": "fetched-page",
  "line": 1,
  "column": 36824,
  "length": 32,
  "placeholder": "[[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a value assigned to a credential-shaped name
What was measured: A value assigned to a credential-shaped name appears in https://trimora.sy/ at line 1, column 36824 (32 characters). The value has been withheld from this report and was replaced with [[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]] before any part of this file was sent to an AI provider.
Where: https://trimora.sy
Why it matters: If this is a live credential, anyone who can read this file can use it. Rotate it and move it to configuration the repository does not hold.
Evidence: {"kind":"GENERIC_SECRET_ASSIGNMENT","path":"https://trimora.sy/","segment":"fetched-page","line":1,"column":36824,"length":32,"placeholder":"[[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Search visibility — COMPLETE · score 98/100

One low-severity finding: no <link rel="canonical"> tag. The page does have a proper Arabic title and heading structure (one <h1>, seven <h2>s, fourteen <h3>s) and the content checker found nothing else to flag — this is a page a crawler can read and index reasonably well; the canonical link is the one gap.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `meta-checker` | CODE | 1 finding(s) · 287 ms |
| `content-checker` | CODE | 0 finding(s) · 326 ms |

#### LOW · Missing canonical link

| | |
|---|---|
| Attribution | MEASURED |
| Check | `meta.canonical-missing` |
| Fingerprint | `69bde376a142a1e26f367b820e3a7e7238710d79c37af7d20ce0fa92615396b7` |
| Location | `https://trimora.sy` |

No <link rel="canonical"> tag was found in the page.

**Why it matters.** Without a canonical link, search engines must guess which URL variant (with or without query parameters, trailing slash, etc.) is the authoritative one to index.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following seo issue.

Problem: Missing canonical link
What was measured: No <link rel="canonical"> tag was found in the page.
Where: https://trimora.sy
Why it matters: Without a canonical link, search engines must guess which URL variant (with or without query parameters, trailing slash, etc.) is the authoritative one to index.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Performance — COMPLETE · score 81/100

Measured with a real headless Chromium render: time-to-first-byte 95ms, first contentful paint 688ms, load 668ms, over 40 requests totalling 2118.9KB with a 296-node DOM. Those are solid numbers for a marketing page. The HIGH finding is a broken resource: the site's own logo image, requested through Next.js's built-in image optimisation endpoint, did not load — one broken image is also costing a wasted request on every page view. Separately, neither the main HTML response nor any of the 14 sampled JS/CSS bundles carry a Content-Encoding header, so every asset transfers uncompressed; enabling gzip/brotli at the origin or CDN is a configuration change, not a code change.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `lighthouse-analyzer` | CODE | 1 finding(s) · 5378 ms |
| `network-inspector` | CODE | 2 finding(s) · 1069 ms |
| `cwv-analyzer` | CODE | 0 finding(s) · 5046 ms |

#### HIGH · Broken referenced resource

| | |
|---|---|
| Attribution | MEASURED |
| Check | `network.broken-subresource` |
| Fingerprint | `e4ff93e9c6b2a4176210eddfbabef7a5d73e03a90fa50a158add5562d13b4d1d` |
| Location | `https://trimora.sy` |

1 of 15 sampled resource(s) referenced by the page did not load successfully.

**Why it matters.** A script, stylesheet, or image that fails to load can break page functionality or leave visible gaps in the rendered page.

**Evidence.**

```json
{
  "count": 1,
  "sample": [
    "https://trimora.sy/_next/image?url=%2Flogo.png&amp;w=3840&amp;q=75"
  ]
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following performance issue.

Problem: Broken referenced resource
What was measured: 1 of 15 sampled resource(s) referenced by the page did not load successfully.
Where: https://trimora.sy
Why it matters: A script, stylesheet, or image that fails to load can break page functionality or leave visible gaps in the rendered page.
Evidence: {"count":1,"sample":["https://trimora.sy/_next/image?url=%2Flogo.png&amp;w=3840&amp;q=75"]}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Response is not compressed

| | |
|---|---|
| Attribution | MEASURED |
| Check | `lighthouse.no-text-compression` |
| Fingerprint | `00414c63716f1fda48b5b7f92e98226d0547778238c8bec6b3161ba8c7b849de` |
| Location | `https://trimora.sy` |

The response carried no Content-Encoding header (gzip, br, or deflate).

**Why it matters.** Uncompressed text responses transfer more bytes than necessary, which slows the page down most for visitors on a constrained connection.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following performance issue.

Problem: Response is not compressed
What was measured: The response carried no Content-Encoding header (gzip, br, or deflate).
Where: https://trimora.sy
Why it matters: Uncompressed text responses transfer more bytes than necessary, which slows the page down most for visitors on a constrained connection.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · Uncompressed script or stylesheet

| | |
|---|---|
| Attribution | MEASURED |
| Check | `network.uncompressed-subresource` |
| Fingerprint | `8ef5eda69890556d7cc54f866e13d9499ff5cf3a1934765a8369f527b87842b5` |
| Location | `https://trimora.sy` |

14 referenced script/stylesheet resource(s) were served without a Content-Encoding header.

**Why it matters.** Uncompressed text assets transfer more bytes than necessary, adding to the time it takes the page to become interactive.

**Evidence.**

```json
{
  "count": 14,
  "sample": [
    "https://trimora.sy/_next/static/chunks/fd9d1056-3f1cf061ceaf1304.js",
    "https://trimora.sy/_next/static/chunks/7023-c9296403c74ef6ad.js",
    "https://trimora.sy/_next/static/chunks/main-app-bca890e9d62c0429.js",
    "https://trimora.sy/_next/static/chunks/231-379f643486f6d30a.js",
    "https://trimora.sy/_next/static/chunks/8059-90460b7a78fd84f5.js"
  ]
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following performance issue.

Problem: Uncompressed script or stylesheet
What was measured: 14 referenced script/stylesheet resource(s) were served without a Content-Encoding header.
Where: https://trimora.sy
Why it matters: Uncompressed text assets transfer more bytes than necessary, adding to the time it takes the page to become interactive.
Evidence: {"count":14,"sample":["https://trimora.sy/_next/static/chunks/fd9d1056-3f1cf061ceaf1304.js","https://trimora.sy/_next/static/chunks/7023-c9296403c74ef6ad.js","https://trimora.sy/_next/static/chunks/main-app-bca890e9d62c0429.js","https://trimora.sy/_next/static/chunks/231-379f643486f6d30a.js","https://trimora.sy/_next/static/chunks/8059-90460b7a78fd84f5.js"]}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Testing — COMPLETE · score 100/100

Both functional checks that do not require a scripted session passed cleanly: every same-origin link on the page resolves, and the contradiction detector found no internal inconsistency in the audit's own output. As with any marketing-page audit, the meaningful functional tests for this product — can a salon owner actually complete a booking, does availability update correctly, is one salon's data isolated from another's — all live behind authentication, which this audit does not cross.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `playwright-runner` | CODE | 0 finding(s) · 594 ms |
| `contradiction-detector` | CODE | 0 finding(s) · 0 ms |

_No defects measured in this area._

---

### Design — COMPLETE · score 95/100

One measured finding: the same broken logo image identified in Performance also shows up here as a visual defect (1 of 7 sampled <img> references failed to resolve) — expect a visible gap or a broken-image icon where the Trimora logo should render. Automated layout checks found zero horizontal overflow at both 1440px and mobile width, so the responsive grid itself holds. The design-critique capability (impeccable) is an AI-layer check that produced no output (no runtime model configured); the observations below are AI_JUDGMENT from the two captured screenshots and do not affect the score.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `screenshot-capture` | CODE | 1 finding(s) · 1538 ms |
| `impeccable` | AI | AI layer — prompt contribution only (no runtime model) |

#### MEDIUM · Image reference does not resolve to a real image

| | |
|---|---|
| Attribution | MEASURED |
| Check | `ui.broken-image` |
| Fingerprint | `687ce8fa18141c5d6f226134e2484ae8422a2338061e591265405305c67bdb7e` |
| Location | `https://trimora.sy` |

1 of 7 sampled <img> reference(s) either failed to load or did not return image content.

**Why it matters.** A broken image leaves a visible gap (or a browser’s default broken-image icon) where a visitor expected to see the picture.

**Evidence.**

```json
{
  "count": 1,
  "sample": [
    "https://trimora.sy/_next/image?url=%2Flogo.png&amp;w=3840&amp;q=75"
  ]
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following ui issue.

Problem: Image reference does not resolve to a real image
What was measured: 1 of 7 sampled <img> reference(s) either failed to load or did not return image content.
Where: https://trimora.sy
Why it matters: A broken image leaves a visible gap (or a browser’s default broken-image icon) where a visitor expected to see the picture.
Evidence: {"count":1,"sample":["https://trimora.sy/_next/image?url=%2Flogo.png&amp;w=3840&amp;q=75"]}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · Large empty gaps between homepage sections in the captured full-page screenshot

| | |
|---|---|
| Attribution | AI_JUDGMENT |
| Check | `ai.ui.judgment.section-whitespace` |
| Fingerprint | `ai.ui.judgment.section-whitespace` |
| Location | — |

The full-page desktop and mobile captures both show large blank vertical gaps between content blocks (e.g. between the hero/stats bar and the next section, and again before the salon showcase card). This is consistent with scroll-triggered reveal animations whose content had not entered the viewport at capture time, reserving layout height before rendering — a common pattern with Next.js/Framer-Motion-style entrance animations. It could also indicate content that genuinely fails to render for some visitors.

**Why it matters.** If this is an animation-timing artifact of automated full-page capture, there is no real user-facing issue. If it reproduces for a real visitor scrolling at normal speed, it reads as broken/unfinished sections on an otherwise polished landing page.

<details><summary>Paste-ready remediation prompt</summary>

```
Manually scroll through https://trimora.sy/ on desktop and mobile in a real browser and confirm every section between the hero and the salon showcase renders its content without a delay long enough to look broken. If it is a reveal-animation threshold issue, lower the trigger threshold or add a rendered fallback state.
```

</details>

#### INFO · Clear Arabic RTL layout with a coherent brand palette

| | |
|---|---|
| Attribution | AI_JUDGMENT |
| Check | `ai.ui.judgment.positive` |
| Fingerprint | `ai.ui.judgment.positive` |
| Location | — |

The captured screenshots show a well-executed right-to-left layout: consistent dark-green/cream brand palette, a clear hero message, a stats row (25 users, 82+ bookings, 85% satisfaction, 28+ active salons) that establishes credibility early, and a genuine customer testimonial with a named salon. Typographic hierarchy between the hero heading and supporting text is clear.

**Why it matters.** No action needed — this is a solid baseline for the rest of the marketing surface.

<details><summary>Paste-ready remediation prompt</summary>

```
No change required.
```

</details>

---

## Active penetration test — manual runbook

The audit above is passive configuration analysis. A full **manual penetration-test runbook** for a
human tester is a separate deliverable — `PENTEST-RUNBOOK.md` (and the dashboard's "Pentest plan" tab).
It covers **9 phases / 47 test cases**:

| Phase | Focus | Test cases |
|---|---|---|
| P0 — Recon & passive mapping | Build a complete picture of the attack surface before sending a single crafted request. Most of this is normal browsing plus OSINT. | 4 |
| P1 — Active mapping & content discovery | Turn the recon inventory into a confirmed, tested map of every reachable endpoint, method and parameter. | 4 |
| P2 — Authentication — register / login / reset | Break or weaken the ways a user proves who they are. This is the phase the client explicitly asked for. | 8 |
| P3 — Authorization — reach the admin dashboard & other tenants | As a normal user (or no user), read or do things you should not — vertical (admin) and horizontal (other tenants). Highest business impact for a multi-tenant chatbot SaaS. | 6 |
| P4 — Injection | Get the backend to execute attacker-controlled data as code/query/markup. Manual confirmation first, then careful tool-assisted exploitation in an authorised window. | 6 |
| P5 — Rate limiting, anti-automation & resource consumption | Systematically map every limit (or its absence) on every sensitive or expensive operation. The client asked for this explicitly. | 4 |
| P6 — The chatbot widget & multi-tenant API | The widget is the largest untrusted-input surface and the multi-tenant boundary is the largest blast radius. Treat data-chatbot-id as an auth claim and attack it. | 4 |
| P7 — Business logic & API (OWASP API Top 10) | Flaws that are not a single bad character but a bad sequence of otherwise-valid requests. | 5 |
| P8 — Transport, infrastructure & headers | The perimeter: TLS, HTTP security headers (done properly, with grading), cookies, clickjacking, information disclosure. | 6 |

It includes SQL/NoSQL injection, authentication (login / register / password-reset, incl. host-header
poisoning and reset-token race), rate limiting and brute-force with bypasses, reaching the admin dashboard,
IDOR and cross-tenant isolation, SSRF, XSS, JWT/session, the widget & prompt injection, business logic, and
transport/headers — each with steps, payloads, tools, evidence to capture, and remediation.

> Execute only under written authorisation and a signed scope. Nothing in it has been run.

## All findings, by severity

| Severity | Area | Title | Attribution | Fingerprint |
|---|---|---|---|---|
| HIGH | Security | Credential in source: a value assigned to a credential-shaped name | MEASURED | `da2229a9784b6a20` |
| HIGH | Performance | Broken referenced resource | MEASURED | `e4ff93e9c6b2a417` |
| MEDIUM | Performance | Response is not compressed | MEASURED | `00414c63716f1fda` |
| MEDIUM | Design | Image reference does not resolve to a real image | MEASURED | `687ce8fa18141c5d` |
| LOW | Search visibility | Missing canonical link | MEASURED | `69bde376a142a1e2` |
| LOW | Performance | Uncompressed script or stylesheet | MEASURED | `8ef5eda69890556d` |
| LOW | Design | Large empty gaps between homepage sections in the captured full-page screenshot | AI_JUDGMENT | `ai.ui.judgment.s` |
| INFO | Design | Clear Arabic RTL layout with a coherent brand palette | AI_JUDGMENT | `ai.ui.judgment.p` |

---

_Generated by `showcase-trimora`. Raw data: `data/audit.json`. Dashboard: `pnpm --filter showcase-trimora serve`._
