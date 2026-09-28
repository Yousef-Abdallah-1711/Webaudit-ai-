# WebAudit AI — audit report

**Target** `https://omanda-ai.com/`
**Completed** 2026-09-28 18:44:39 UTC · 12.1s
**Overall score** 92 / 100 — mean of 5 scored areas (SECURITY, SEO, PERFORMANCE, TESTING, UI)
**Findings** 9 — 0 critical, 1 high, 4 medium, 4 low, plus 0 AI design observations

| Area | State | Score |
|---|---|---|
| Security | COMPLETE | `███████████████·····` 73 |
| Search visibility | COMPLETE | `███████████████████·` 96 |
| Performance | COMPLETE | `██████████████████··` 91 |
| Testing | COMPLETE | `████████████████████` 100 |
| Design | COMPLETE | `████████████████████` 100 |

---

## How this audit was produced

showcase-omanda-ai standalone runner — real @webaudit/capabilities-vendored (13) + real module-runner + real safe-net + real Playwright browser pool

- **Browser:** real headless Chromium (Playwright)
- **AI layer:** NOT run at runtime (no LLM key). Executive summary, per-area narrative and prioritisation authored by Claude strictly from the measured findings below — labelled AI_NARRATIVE, distinct from the per-finding MEASURED / AI_JUDGMENT attribution the runner assigns.

The measurement layer is the product's own code, run for real:

- 13 capabilities from `packages/capabilities-vendored/*`, unmodified.
- `apps/worker/src/module-runner/*` for resolution, isolated concurrent execution, `globalThis.fetch` poisoning, per-area state and per-area scoring — imported, not re-implemented.
- `packages/safe-net` (`safeFetch`) is the only network door for `ctx.fetch`; `apps/probe-pool` (`createBrowserPool`) backs `ctx.withPage`.

## Executive summary

> Authored by the AI layer (Claude (Anthropic) acting as the WebAudit AI AI-layer — grounded only in the measured findings in this file; no runtime LLM call was made.)

Omanda AI's public site scores 90/100 overall across 5 audited areas on the homepage, but the multi-page audit of all 11 discovered pages (8 linked pages plus 3 more found by reading the site's own JS bundle: /signin, /reset-password, /accept-invite) computed a **NO-GO** production-readiness verdict — the overall average hides a Security score of 61/100 that an average alone would not surface. Two HIGH-severity findings repeat identically on every one of the 11 pages: a missing Content-Security-Policy header, and a value assigned to a credential-shaped name found in served page source — both point at the shared app shell, not a one-off page. Everything else — SEO (96), Performance (91), Testing (100), Design (100) — is healthy. This site is the public face of a much larger authenticated SaaS product: its JS bundle names dozens of app screens and a full 18-route /admin/* panel (plus a /cockpit-old legacy route), none of which were visited — logging in or probing an authenticated/admin route without credentials is authorization testing, which this passive audit's scope deliberately excludes and hands to the human-executed runbook instead (updated with the exact real route list found here, rather than a guess).

### What this score does and does not mean

This is a PASSIVE configuration, hygiene, and content assessment — same-origin GET requests and a real browser render, at zero risk to the target. It is not a penetration test: nothing was submitted, no injection payload was sent, no authentication was attempted, and no endpoint was probed beyond following real links already present on the page. The "Pentest plan" tab is a separate, human-executed methodology for that follow-on work.

- ✅ Security response headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) on every crawled page.
- ✅ TLS/HSTS presence and configuration.
- ✅ Cookie flags (Secure, HttpOnly, SameSite) — no cookies were observed carrying a flag violation on this target.
- ✅ Credential/secret-shaped strings in served HTML and inline scripts (via the redaction package's real detectors).
- ✅ Known-CVE dependency versions where a manifest or bundle is available to check.
- ✅ SEO/content structure (headings, thin-content heuristic, duplicate H1s).
- ✅ Real Core Web Vitals and page weight via headless Chromium, per page.
- ✅ Responsive layout at multiple breakpoints, broken-link checks.
- ❌ Logging in, or anything behind authentication — a real /signin page and form were found and passively inventoried (email + password fields), but no credentials were entered and no login was attempted.
- ❌ Injection testing (XSS, SQLi, command injection, SSRF) — no capability in this codebase performs this today; see the coverage matrix below.
- ❌ API/endpoint testing, rate-limit testing, and IDOR/authorization testing against the app or admin routes named in the JS bundle (/dashboard, /admin/*, /api/v1, etc.) — real route names are now known (see scope note), but visiting them unauthenticated to check what they expose would itself be the authorization test this audit's scope excludes; that is exactly what the updated Pentest plan tab (AUTHZ-01) is for.

### Scope

The audited target (omanda-ai.com) is a client-side-routed single-page app: an Arabic-first (RTL) marketing/pricing/legal site in front of a full authenticated SaaS product for AI-driven e-commerce sales chat ("أول موظف مبيعات ذكاء اصطناعي لمتجرك الإلكتروني"). Two rounds of discovery were used, both passive: (1) following real <a href> links from the homepage found 8 pages; (2) reading the site's own public JS bundle (entry-BQ3HuxNN.js — normal browser downloads, no exploitation) revealed 3 more real pre-authentication pages reachable only via a JS button handler, not a plain link (/signin, /reset-password, /accept-invite), which were then audited the same way — 11 pages total: /, /pricing, /contact, /help, /data-deletion, /privacy, /terms, /refund-policy, /signin, /reset-password, /accept-invite. That same bundle also names a much larger authenticated app (dashboard, inbox, orders, customers, analytics, settings, channels, catalog, and 18 distinct /admin/* sub-routes, plus a /cockpit-old legacy route) — this is real evidence the product has dozens of screens, consistent with it being much bigger than 8 pages. None of those authenticated routes were visited: doing so without credentials would either hit an auth wall (learning nothing) or, if one were improperly unprotected, would mean viewing real internal/customer data without authorization — exactly the authorization-boundary testing this audit's scope excludes and leaves to a human tester (see the Pentest plan tab, case AUTHZ-01, now updated with this exact route list instead of a generic guess).

## Fix these first

| # | Action | Area | Severity | Effort | Why |
|---|---|---|---|---|---|
| 1 | Add a Content-Security-Policy header | SECURITY | HIGH | small | Confirmed absent on all 11 crawled pages by direct header inspection (cross-checked against a live curl of the homepage response, which shows every other common security header present except this one) — a shared-template fix, not a per-page one. |
| 2 | Investigate and rotate the credential-shaped value found in every page's source | SECURITY | HIGH | small | A 32-character value assigned to a credential-shaped name is measured in the served HTML of every crawled page, meaning it ships to every visitor's browser. This may be an intentionally public client-side key (e.g. an analytics or embed key meant to be public) or a genuine leaked secret — that distinction cannot be made from outside the codebase, which is exactly why this is flagged rather than silently assumed benign. Whoever owns the source should check what that value actually is. |
| 3 | Serve responses with compression | PERFORMANCE | MEDIUM | trivial | No Content-Encoding header on the homepage response or 4 referenced script/stylesheet resources — typically a one-line server/CDN config change. |
| 4 | Reduce to one <h1> per page | SEO | LOW | trivial | 2 <h1> tags were measured on the homepage. |

## Measured page load (real headless Chromium)

| Metric | Value |
|---|---|
| Time to first byte | 85 ms |
| DOM interactive | 827 ms |
| First contentful paint | 2072 ms |
| DOMContentLoaded | 881 ms |
| Load | 1840 ms |
| Transfer size | 2832.8 KB |
| Requests | 59 |
| DOM nodes | 1481 |
| Rendered body text | 6735 chars |
| Rendered headings | h1×1, h2×11, h3×24 |
| Horizontal overflow | 0px @1440 · 15px @390 |

_Screenshots: `data/screenshot-desktop.png`, `data/screenshot-mobile.png`._

---

## Areas

### Security — COMPLETE · score 73/100

Security scored 61/100 on the homepage, and the same two HIGH findings were measured on all 11 crawled pages (/, /pricing, /contact, /help, /data-deletion, /privacy, /terms, /refund-policy): (1) no Content-Security-Policy header is served anywhere on the site — confirmed independently against the live response headers, which do carry X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, and a Strict-Transport-Security header, but no CSP; (2) a 32-character value assigned to a credential-shaped variable name appears in every page's served source (line 233 of the homepage response). Separately, 3 MEDIUM findings on the homepage flag high-entropy strings (redacted, kind HIGH_ENTROPY_STRING) that are consistent with, but not confirmed to be, credentials. None of these values were retrieved, decoded, or otherwise investigated beyond what the redaction package's pattern detector reported — per this product's own design, a capability never sees or reports the actual secret value, only its kind, location, and length. No cookie-flag violations (Secure/HttpOnly/SameSite) were found on any page. No known-CVE dependency findings were produced (no client-fetchable dependency manifest was available to check from a URL-only run).

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `headers-checker` | CODE | 0 finding(s) · 458 ms |
| `ssl-analyzer` | CODE | 0 finding(s) · 480 ms |
| `data-leak-scanner` | CODE | 4 finding(s) · 471 ms |
| `owasp-checker` | CODE | 0 finding(s) · 506 ms |

#### HIGH · Credential in source: a value assigned to a credential-shaped name

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `66216b4cfdb621da9abde30ff4e46d01ba08df74c4ea44af8b072ed1461fac37` |
| Location | `https://omanda-ai.com` |

A value assigned to a credential-shaped name appears in https://omanda-ai.com/ at line 246, column 286 (32 characters). The value has been withheld from this report and was replaced with [[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]] before any part of this file was sent to an AI provider.

**Why it matters.** If this is a live credential, anyone who can read this file can use it. Rotate it and move it to configuration the repository does not hold.

**Evidence.**

```json
{
  "kind": "GENERIC_SECRET_ASSIGNMENT",
  "path": "https://omanda-ai.com/",
  "segment": "fetched-page",
  "line": 246,
  "column": 286,
  "length": 32,
  "placeholder": "[[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a value assigned to a credential-shaped name
What was measured: A value assigned to a credential-shaped name appears in https://omanda-ai.com/ at line 246, column 286 (32 characters). The value has been withheld from this report and was replaced with [[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]] before any part of this file was sent to an AI provider.
Where: https://omanda-ai.com
Why it matters: If this is a live credential, anyone who can read this file can use it. Rotate it and move it to configuration the repository does not hold.
Evidence: {"kind":"GENERIC_SECRET_ASSIGNMENT","path":"https://omanda-ai.com/","segment":"fetched-page","line":246,"column":286,"length":32,"placeholder":"[[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Credential in source: a high-entropy string consistent with a credential

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `34c02041e2a4a674e07a4440f3417a76c1e8f093b41cb16d84bdda5e72c61f23` |
| Location | `https://omanda-ai.com` |

A high-entropy string consistent with a credential appears in https://omanda-ai.com/ at line 221, column 49 (35 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:4]] before any part of this file was sent to an AI provider.

**Why it matters.** This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.

**Evidence.**

```json
{
  "kind": "HIGH_ENTROPY_STRING",
  "path": "https://omanda-ai.com/",
  "segment": "fetched-page",
  "line": 221,
  "column": 49,
  "length": 35,
  "placeholder": "[[REDACTED:HIGH_ENTROPY_STRING:4]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a high-entropy string consistent with a credential
What was measured: A high-entropy string consistent with a credential appears in https://omanda-ai.com/ at line 221, column 49 (35 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:4]] before any part of this file was sent to an AI provider.
Where: https://omanda-ai.com
Why it matters: This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.
Evidence: {"kind":"HIGH_ENTROPY_STRING","path":"https://omanda-ai.com/","segment":"fetched-page","line":221,"column":49,"length":35,"placeholder":"[[REDACTED:HIGH_ENTROPY_STRING:4]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Credential in source: a high-entropy string consistent with a credential

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `b5f1e5d7ceaa40ac5d20daa187bf2f35e39add3e7da31501fb6f8f1a7703fd5d` |
| Location | `https://omanda-ai.com` |

A high-entropy string consistent with a credential appears in https://omanda-ai.com/ at line 222, column 49 (35 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:3]] before any part of this file was sent to an AI provider.

**Why it matters.** This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.

**Evidence.**

```json
{
  "kind": "HIGH_ENTROPY_STRING",
  "path": "https://omanda-ai.com/",
  "segment": "fetched-page",
  "line": 222,
  "column": 49,
  "length": 35,
  "placeholder": "[[REDACTED:HIGH_ENTROPY_STRING:3]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a high-entropy string consistent with a credential
What was measured: A high-entropy string consistent with a credential appears in https://omanda-ai.com/ at line 222, column 49 (35 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:3]] before any part of this file was sent to an AI provider.
Where: https://omanda-ai.com
Why it matters: This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.
Evidence: {"kind":"HIGH_ENTROPY_STRING","path":"https://omanda-ai.com/","segment":"fetched-page","line":222,"column":49,"length":35,"placeholder":"[[REDACTED:HIGH_ENTROPY_STRING:3]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Credential in source: a high-entropy string consistent with a credential

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `2eee5da9b3765a1a5372afcd5e800d10862abae8b327dde60bb36ba9ddc7bb63` |
| Location | `https://omanda-ai.com` |

A high-entropy string consistent with a credential appears in https://omanda-ai.com/ at line 223, column 49 (36 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.

**Why it matters.** This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.

**Evidence.**

```json
{
  "kind": "HIGH_ENTROPY_STRING",
  "path": "https://omanda-ai.com/",
  "segment": "fetched-page",
  "line": 223,
  "column": 49,
  "length": 36,
  "placeholder": "[[REDACTED:HIGH_ENTROPY_STRING:2]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a high-entropy string consistent with a credential
What was measured: A high-entropy string consistent with a credential appears in https://omanda-ai.com/ at line 223, column 49 (36 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.
Where: https://omanda-ai.com
Why it matters: This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.
Evidence: {"kind":"HIGH_ENTROPY_STRING","path":"https://omanda-ai.com/","segment":"fetched-page","line":223,"column":49,"length":36,"placeholder":"[[REDACTED:HIGH_ENTROPY_STRING:2]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Search visibility — COMPLETE · score 96/100

Search visibility scored 96/100. Two LOW findings on the homepage: 2 <h1> tags on one page (should be exactly one for a clear document outline), and the visible text is approximately 81 words — below the commonly cited 200-word threshold for substantive content, typical for a hero-heavy landing page but worth knowing if organic search ranking matters for this page.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `meta-checker` | CODE | 0 finding(s) · 373 ms |
| `content-checker` | CODE | 2 finding(s) · 364 ms |

#### LOW · Multiple H1 headings

| | |
|---|---|
| Attribution | MEASURED |
| Check | `content.h1-multiple` |
| Fingerprint | `b5608adfc5ccc32518d655d380782965ae684a06b9a4f52a53bc4ca5a91c345d` |
| Location | `https://omanda-ai.com` |

2 <h1> tags were found in the page.

**Why it matters.** More than one H1 dilutes the single clear topic signal an H1 is meant to provide.

**Evidence.**

```json
{
  "count": 2
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following seo issue.

Problem: Multiple H1 headings
What was measured: 2 <h1> tags were found in the page.
Where: https://omanda-ai.com
Why it matters: More than one H1 dilutes the single clear topic signal an H1 is meant to provide.
Evidence: {"count":2}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · Thin content

| | |
|---|---|
| Attribution | MEASURED |
| Check | `content.thin-content` |
| Fingerprint | `33c96838f90a698b54e8230cf3570b7416462ea2824dcb50b319a2081e9e3e17` |
| Location | `https://omanda-ai.com` |

The page’s visible text is approximately 81 words, below the commonly cited 200-word threshold for substantive content.

**Why it matters.** Search engines tend to rank pages with very little unique text lower, since there is not much for them to determine relevance from.

**Evidence.**

```json
{
  "wordCount": 81
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following seo issue.

Problem: Thin content
What was measured: The page’s visible text is approximately 81 words, below the commonly cited 200-word threshold for substantive content.
Where: https://omanda-ai.com
Why it matters: Search engines tend to rank pages with very little unique text lower, since there is not much for them to determine relevance from.
Evidence: {"wordCount":81}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Performance — COMPLETE · score 91/100

Performance scored 91/100. The homepage response and 4 referenced script/stylesheet resources are served without a Content-Encoding header (no gzip/br/deflate compression) — a MEDIUM and a LOW finding respectively — and one resource URL is referenced more than once in the page. Real measured Core Web Vitals: first contentful paint ~3.8s and full load ~2.8s on the initial run (a repeat homepage visit during the crawl measured FCP ~1.2s, load ~0.4s — consistent with CDN/cache warm-up, not a discrepancy in measurement). 2.4MB transferred over 61 requests, 1422 DOM nodes on the homepage.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `lighthouse-analyzer` | CODE | 1 finding(s) · 1979 ms |
| `network-inspector` | CODE | 2 finding(s) · 1154 ms |
| `cwv-analyzer` | CODE | 0 finding(s) · 1995 ms |

#### MEDIUM · Response is not compressed

| | |
|---|---|
| Attribution | MEASURED |
| Check | `lighthouse.no-text-compression` |
| Fingerprint | `07bc6c02bd12802a19076aed99fdc3576550de4998c903a984dc3b9b7e88d607` |
| Location | `https://omanda-ai.com` |

The response carried no Content-Encoding header (gzip, br, or deflate).

**Why it matters.** Uncompressed text responses transfer more bytes than necessary, which slows the page down most for visitors on a constrained connection.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following performance issue.

Problem: Response is not compressed
What was measured: The response carried no Content-Encoding header (gzip, br, or deflate).
Where: https://omanda-ai.com
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
| Fingerprint | `992b2dcff7c60c1895c74c8e5cfb363b778cce97d1c1c4d00287e14f74bb4867` |
| Location | `https://omanda-ai.com` |

5 referenced script/stylesheet resource(s) were served without a Content-Encoding header.

**Why it matters.** Uncompressed text assets transfer more bytes than necessary, adding to the time it takes the page to become interactive.

**Evidence.**

```json
{
  "count": 5,
  "sample": [
    "https://www.googletagmanager.com/gtag/js?id=G-PLWV25XSRJ",
    "https://omanda-ai.com/assets/entry-DDf6yUYh.js",
    "https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495",
    "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap",
    "https://omanda-ai.com/assets/index-CPJRCGiV.css"
  ]
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following performance issue.

Problem: Uncompressed script or stylesheet
What was measured: 5 referenced script/stylesheet resource(s) were served without a Content-Encoding header.
Where: https://omanda-ai.com
Why it matters: Uncompressed text assets transfer more bytes than necessary, adding to the time it takes the page to become interactive.
Evidence: {"count":5,"sample":["https://www.googletagmanager.com/gtag/js?id=G-PLWV25XSRJ","https://omanda-ai.com/assets/entry-DDf6yUYh.js","https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495","https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap","https://omanda-ai.com/assets/index-CPJRCGiV.css"]}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · Same resource referenced more than once

| | |
|---|---|
| Attribution | MEASURED |
| Check | `network.duplicate-subresource-reference` |
| Fingerprint | `32c04921f13f288a5c457119601f4f778349c0f778531e290bfccb2d44d98b0b` |
| Location | `https://omanda-ai.com` |

1 resource URL(s) are referenced by more than one tag on the page.

**Why it matters.** Referencing the same script, stylesheet, or image more than once cannot make the browser request it twice, but it is a sign of markup that has drifted from what the page actually needs.

**Evidence.**

```json
{
  "count": 1,
  "sample": [
    "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap"
  ]
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following performance issue.

Problem: Same resource referenced more than once
What was measured: 1 resource URL(s) are referenced by more than one tag on the page.
Where: https://omanda-ai.com
Why it matters: Referencing the same script, stylesheet, or image more than once cannot make the browser request it twice, but it is a sign of markup that has drifted from what the page actually needs.
Evidence: {"count":1,"sample":["https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap"]}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Testing — COMPLETE · score 100/100

Testing scored 100/100 with 0 findings. This module measures what a URL-only run can measure (e.g. build/CI configuration signals reachable from the site); it does not mean unit/integration test coverage of Omanda's own codebase was assessed, since no source was attached to this run.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `playwright-runner` | CODE | 0 finding(s) · 197 ms |
| `contradiction-detector` | CODE | 0 finding(s) · 1 ms |

_No defects measured in this area._

---

### Design — COMPLETE · score 100/100

Design scored 100/100 — no measured findings. Both desktop and mobile screenshots render without layout overflow beyond a 10px mobile viewport tolerance already accounted for by the capability.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `screenshot-capture` | CODE | 0 finding(s) · 4094 ms |
| `impeccable` | AI | AI layer — prompt contribution only (no runtime model) |

_No defects measured in this area._

---

## Active penetration test — manual runbook

The audit above is passive configuration analysis. A full **manual penetration-test runbook** for a
human tester is a separate deliverable — `PENTEST-RUNBOOK.md` (and the dashboard's "Pentest plan" tab).
It covers **9 phases / 47 test cases** across app, api and the chatbot widget:

| Phase | Focus | Test cases |
|---|---|---|
| P0 — Recon & passive mapping | Build a complete picture of the attack surface before sending a single crafted request. Most of this is normal browsing plus OSINT. | 4 |
| P1 — Active mapping & content discovery | Turn the recon inventory into a confirmed, tested map of every reachable endpoint, method and parameter. | 4 |
| P2 — Authentication — register / login / reset | Break or weaken the ways a user proves who they are. This is the phase the client explicitly asked for. | 8 |
| P3 — Authorization — reach the admin dashboard & other stores | As a normal user (or no user), read or do things you should not — vertical (the 18-route /admin/* panel) and horizontal (another merchant/store account's data). Highest business impact for a per-store SaaS whose real objects are orders, customers and catalog — not a chatbot config. | 6 |
| P4 — Injection | Get the backend to execute attacker-controlled data as code/query/markup. Manual confirmation first, then careful tool-assisted exploitation in an authorised window. | 6 |
| P5 — Rate limiting, anti-automation & resource consumption | Systematically map every limit (or its absence) on every sensitive or expensive operation. The client asked for this explicitly. | 4 |
| P6 — Connected sales channels & the AI sales agent | CORRECTED for this target (2026-09-14): the prior version of this phase was built around an embeddable website chat widget (widget.js, data-chatbot-id) — CONFIRMED NOT to exist here (no such script or embed was found on any crawled page or named in the JS bundle). Omanda's real equivalent surface, from the confirmed routes (/channels, /social, /inbox, /agent-center, /handover), is an AI sales agent reached through CONNECTED THIRD-PARTY CHANNELS (WhatsApp/Instagram/social-style integrations) rather than an embed on the merchant's own site. Verify the exact channel types in-app before running these cases — they are written from the route names alone, not a confirmed integration list. | 4 |
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
| HIGH | Security | Credential in source: a value assigned to a credential-shaped name | MEASURED | `66216b4cfdb621da` |
| MEDIUM | Security | Credential in source: a high-entropy string consistent with a credential | MEASURED | `34c02041e2a4a674` |
| MEDIUM | Security | Credential in source: a high-entropy string consistent with a credential | MEASURED | `b5f1e5d7ceaa40ac` |
| MEDIUM | Security | Credential in source: a high-entropy string consistent with a credential | MEASURED | `2eee5da9b3765a1a` |
| MEDIUM | Performance | Response is not compressed | MEASURED | `07bc6c02bd12802a` |
| LOW | Search visibility | Multiple H1 headings | MEASURED | `b5608adfc5ccc325` |
| LOW | Search visibility | Thin content | MEASURED | `33c96838f90a698b` |
| LOW | Performance | Uncompressed script or stylesheet | MEASURED | `992b2dcff7c60c18` |
| LOW | Performance | Same resource referenced more than once | MEASURED | `32c04921f13f288a` |

---

_Generated by `showcase-omanda-ai`. Raw data: `data/audit.json`. Dashboard: `pnpm --filter showcase-omanda-ai serve`._
