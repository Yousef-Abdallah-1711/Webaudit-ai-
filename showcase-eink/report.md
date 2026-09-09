# WebAudit AI — audit report

## Production readiness: 🛑 NOT READY TO SHIP

Computed from the worst score any single crawled page recorded per area, plus any HIGH/CRITICAL finding repeating across every page — an average score hides exactly the outlier this decision needs to see.

| Area | Worst observed | Threshold | |
|---|---|---|---|
| Security | 24 | 80 | 🛑 |
| Search visibility | 96 | 80 | ✅ |
| Performance | 91 | 80 | ✅ |
| Testing | 88 | 80 | ✅ |
| Design | 100 | 80 | ✅ |

**Blockers — fix these before this ships:**

- Security scores 24/100 on the homepage — below the 80 bar.
- HIGH — "Missing Content-Security-Policy header" found on all 15 crawled pages (Security) — points at shared code, not one page.
- HIGH — "Credential in source: a value assigned to a credential-shaped name" found on all 15 crawled pages (Security) — points at shared code, not one page.
- HIGH — "A cookie is set without the Secure flag" found on all 15 crawled pages (Security) — points at shared code, not one page.

---

**Target** `https://eink.ma/`  
**Completed** 2026-09-08 18:01:02 UTC · 16.7s  
**Overall score** 83 / 100 — mean of 5 scored areas (SECURITY, SEO, PERFORMANCE, TESTING, UI)  
**Findings** 16 — 0 critical, 3 high, 9 medium, 3 low, plus 1 AI design observations

| Area | State | Score |
|---|---|---|
| Security | COMPLETE | `█████···············` 24 |
| Search visibility | COMPLETE | `███████████████████·` 96 |
| Performance | COMPLETE | `███████████████████·` 93 |
| Testing | COMPLETE | `████████████████████` 100 |
| Design | COMPLETE | `████████████████████` 100 |

---

## Pages audited

This is a **multi-page** audit — every page below was fetched and measured the same way as the primary page above (real capabilities, real browser render). Only same-origin GET requests were made; no form was submitted and no authenticated area was crossed.

| Page | Score | Critical | High | Medium | Low | Top finding |
|---|---|---|---|---|---|---|
| `/` | 83 | 0 | 3 | 9 | 3 | HIGH — Missing Content-Security-Policy header |
| `/shop` | 86 | 0 | 3 | 6 | 1 | HIGH — Missing Content-Security-Policy header |
| `/compare` | 87 | 0 | 3 | 5 | 1 | HIGH — Missing Content-Security-Policy header |
| `/blog` | 87 | 0 | 3 | 5 | 2 | HIGH — Missing Content-Security-Policy header |
| `/support` | 85 | 0 | 4 | 5 | 2 | HIGH — Missing Content-Security-Policy header |
| `/wishlist` | 87 | 0 | 3 | 5 | 2 | HIGH — Missing Content-Security-Policy header |
| `/product/supernote-a6-x2-nomad` | 87 | 0 | 3 | 5 | 2 | HIGH — Missing Content-Security-Policy header |
| `/product/kindle-scribe` | 87 | 0 | 3 | 5 | 2 | HIGH — Missing Content-Security-Policy header |
| `/product/remarkable-paper-pro` | 87 | 0 | 3 | 5 | 2 | HIGH — Missing Content-Security-Policy header |
| `/product/kobo-elipsa-2e` | 87 | 0 | 3 | 5 | 2 | HIGH — Missing Content-Security-Policy header |
| `/product/bigme-galy-2` | 87 | 0 | 3 | 5 | 2 | HIGH — Missing Content-Security-Policy header |
| `/product/boox-note-air5-c` | 87 | 0 | 3 | 5 | 2 | HIGH — Missing Content-Security-Policy header |
| `/product/boox-go-10-3-gen-ii-lumi` | 87 | 0 | 3 | 5 | 2 | HIGH — Missing Content-Security-Policy header |
| `/product/boox-go-7` | 87 | 0 | 3 | 5 | 2 | HIGH — Missing Content-Security-Policy header |
| `/product/boox-go-6-gen-ii` | 87 | 0 | 3 | 5 | 2 | HIGH — Missing Content-Security-Policy header |

Full per-page findings: `data/pages/<page>/audit.json`. Per-page screenshots (desktop + mobile): `data/pages/<page>/screenshot-*.png`.

---

## How this audit was produced

showcase-eink standalone runner — real @webaudit/capabilities-vendored (13) + real module-runner + real safe-net + real Playwright browser pool

- **Browser:** real headless Chromium (Playwright)
- **AI layer:** NOT run at runtime (no LLM key). Executive summary, per-area narrative and prioritisation authored by Claude strictly from the measured findings below — labelled AI_NARRATIVE, distinct from the per-finding MEASURED / AI_JUDGMENT attribution the runner assigns.

The measurement layer is the product's own code, run for real:

- 13 capabilities from `packages/capabilities-vendored/*`, unmodified.
- `apps/worker/src/module-runner/*` for resolution, isolated concurrent execution, `globalThis.fetch` poisoning, per-area state and per-area scoring — imported, not re-implemented.
- `packages/safe-net` (`safeFetch`) is the only network door for `ctx.fetch`; `apps/probe-pool` (`createBrowserPool`) backs `ctx.withPage`.

## Executive summary

> Authored by the AI layer (Claude (Anthropic) acting as the WebAudit AI AI-layer — grounded only in the measured findings in this file; no runtime LLM call was made.)

The homepage scores 83/100; the other 14 crawled pages score between 85 and 87. Overall this reads as a well-built, fast storefront (Testing and Design measure clean almost everywhere) let down entirely by Security, which is why the computed readiness verdict is NO-GO: Security scores 24/100 on the worst page and every one of its four blockers is a HIGH-severity finding present on all 15 pages, not a one-off. Two of those four are genuinely urgent and repeat identically site-wide: no Content-Security-Policy header at all, and a cookie (NEXT_LOCALE) set without the Secure flag (and separately, without HttpOnly) — both point at shared Next.js layout/middleware code, so each is a single fix that clears the whole site. The third HIGH finding needed deeper verification before this report could respond honestly to it: a value assigned to a credential-shaped variable name (32 characters), flagged on every one of the 15 crawled pages. This was independently re-checked, live, using the product's own detector rather than taking the original scan at face value: the page is served with Cache-Control: no-store and its content genuinely varies request to request (a randomised related-products block shifts by tens of kilobytes between fetches), so the exact same page was re-fetched sixteen times over several minutes. In every one of those sixteen re-fetches, the *other* seven credential-shaped findings this scan flagged (all MEDIUM, "high-entropy string") reproduced perfectly and were conclusively identified as false positives — five are fragments of the same images.squarespace-cdn.com image URL (a hashed asset id, not a secret) appearing in different randomly-ordered related-product slots each time, and two are the exact same font/class-name attribute string repeated in the page's embedded Next.js RSC payload. But the one HIGH "credential-shaped name" finding did not reappear in any of the sixteen re-fetches — meaning its actual content could not be verified or shown in this report. That does not clear it: it was measured consistently across all 15 pages in the original crawl, using the identical detection logic, so it is real and was genuinely present at that time; it simply depends on some page state (likely a specific promotional or CMS content block) that this follow-up check happened not to catch. This is reported exactly as it stands — confirmed once, not currently reproducible, value unknown — rather than guessed at. Beyond Security, everything else is minor: no page serves compressed responses (a configuration change, not code), three pages (blog, support, wishlist) carry under 200 words of visible text, and the /support page tripped one broken-link check against a Cloudflare email-obfuscation endpoint (cdn-cgi/l/email-protection) that most likely needs JavaScript to resolve rather than being genuinely dead. Measured performance is otherwise strong: sub-1.1s first contentful paint and sub-1.7s load on the homepage, similarly fast across every other crawled page, and zero horizontal overflow at either viewport measured.

### What this score does and does not mean

This score is a PASSIVE configuration and hygiene assessment — what can be observed from the served response and a real browser render, at zero risk to the target. It is not a penetration test. No SQL injection, authentication attack, or any other active exploitation was attempted against this live production site — the runbook below sets that engagement up for a human tester to execute deliberately, in a way that can be undone if something goes wrong; a script cannot make that judgment call.

- ✅ Covered here (measured): a secret-pattern scan of every crawled page's served source, security headers/TLS/cookie flags, meta/SEO structure, Core Web Vitals and page weight (real Chromium), responsive layout at 1440px and mobile, broken-resource and broken-link detection, secret leakage in served markup — across all 15 pages.
- ❌ NOT covered by this score: checkout/payment, account creation and login, cart persistence, and whether the credential-shaped value flagged in the Security finding below is actually a live, exploitable secret — that requires a human to inspect the redacted location directly (with authorisation) and rotate it if live. SQL injection and other active exploitation are explicitly scoped to the Pentest plan tab, to be run by a human tester, not this pipeline.

### Scope

eink.ma is a French-language e-commerce storefront selling E Ink tablets and note-taking devices in Morocco (Supernote, BOOX, Kindle, reMarkable, Kobo, PocketBook, Bigme, Fujitsu Quaderno, Xteink, M5Stack). This is a multi-page audit: the homepage plus 14 other same-origin pages discovered from its own navigation — the shop listing, a comparison page, the blog, a support page, a wishlist page, and nine individual product pages — every one fetched with a plain GET, exactly as a visitor's browser or a search crawler already does. Nothing was submitted to any form and no authenticated area (checkout, account, cart) was crossed — this storefront's cart/checkout flow lives behind session state this audit does not create.

## Fix these first

| # | Action | Area | Severity | Effort | Why |
|---|---|---|---|---|---|
| 1 | Locate and rotate the still-unconfirmed credential-shaped value flagged on all 15 pages — re-verification could not capture it, so this needs direct source/CMS inspection, not another automated scan | Security | HIGH | moderate | Confirmed real and consistent in the original crawl (all 15 pages, same detection logic that correctly cleared 7 other findings as false positives in re-verification), but sixteen live re-fetches over several minutes could not reproduce it — the page is Cache-Control: no-store and its content genuinely varies request to request (a shuffled related-products block). It most likely lives in a specific promotional or CMS-sourced content block that only renders under certain conditions. The site owner should reload the live site repeatedly (or search the CMS/promo content source directly) until it reappears in view-source, identify what it is, and rotate it if live — this is the single most important open item in this report precisely because it could not be resolved by re-scanning. |
| 2 | Add a Content-Security-Policy header site-wide | Security | HIGH | small | Missing on every one of the 15 crawled pages, fully confirmed with no ambiguity. A CSP is the single biggest lever against the impact of any future injection vulnerability; add it once at the shared response layer. |
| 3 | Set the Secure and HttpOnly flags on the NEXT_LOCALE cookie site-wide | Security | HIGH | trivial | Missing on all 15 pages, fully confirmed with no ambiguity — a one-line change to the cookie-setting logic (likely Next.js middleware) fixes both the Secure (HIGH) and HttpOnly (MEDIUM) findings everywhere at once. |
| 4 | No action needed on the other 7 credential-shaped MEDIUM findings — confirmed false positives | Security | INFO | trivial | Re-verified live across sixteen re-fetches of the homepage using the product's own detector: 5 are fragments of images.squarespace-cdn.com CDN image URLs (hashed asset ids, not secrets) shuffled into different related-product positions by the page's own randomisation, and 2 are the same font/class-name string repeated in the page's embedded Next.js data. Recorded here so this does not get re-flagged as unresolved in a future audit without the same context. |
| 5 | Enable gzip/brotli compression at the origin or CDN for HTML, JS, and CSS | Performance | MEDIUM | trivial | Every crawled page serves its HTML and script/stylesheet assets uncompressed. A single server/CDN config change with no code impact fixes the whole site. |
| 6 | Confirm the /support page's Cloudflare email-protection link actually works for a real visitor | Testing | HIGH | trivial | Flagged as a broken link by the automated same-origin link check, but the URL pattern (cdn-cgi/l/email-protection) suggests it needs a real browser click to resolve rather than being genuinely dead — a two-minute manual check settles it either way. |

## Measured page load (real headless Chromium)

| Metric | Value |
|---|---|
| Time to first byte | 619 ms |
| DOM interactive | 818 ms |
| First contentful paint | 1028 ms |
| DOMContentLoaded | 1083 ms |
| Load | 1660 ms |
| Transfer size | 3028.5 KB |
| Requests | 60 |
| DOM nodes | 792 |
| Rendered body text | 5447 chars |
| Rendered headings | h1×1, h2×7, h3×0 |
| Horizontal overflow | 0px @1440 · 0px @390 |

_Screenshots: `data/screenshot-desktop.png`, `data/screenshot-mobile.png`._

---

## Areas

### Security — COMPLETE · score 24/100

The reason this audit is NO-GO, and the one area that received a second, live verification pass beyond the original scan (see the executive summary for the full method). Two HIGH findings are confirmed, site-wide, and simple to fix: no Content-Security-Policy header on any of the 15 crawled pages, and a cookie (NEXT_LOCALE) set without the Secure attribute (plus, separately as a MEDIUM finding, without HttpOnly) — also on all 15 pages. Both point at shared Next.js layout/middleware code, not per-page mistakes. The third HIGH finding — a 32-character value assigned to a credential-shaped variable name, also flagged on all 15 pages — is real but its actual content is NOT currently known: this report does not show a value because none could be captured. Re-verification fetched the homepage sixteen additional times using the product's own detector (not a re-implementation) specifically to locate and characterise it. That re-check definitively cleared the seven other credential-shaped MEDIUM findings as false positives — reproduced identically every time, and traced to (a) fragments of images.squarespace-cdn.com CDN image URLs shuffled into different related-product slots by the page's own randomisation, and (b) a repeated font/class-name string inside the page's embedded Next.js RSC data, neither of which is a secret. The HIGH finding did not reproduce in any of the sixteen re-fetches, most likely because it depends on specific page state (a particular promotional or CMS-sourced content block) that this follow-up did not happen to trigger — the page is served Cache-Control: no-store and demonstrably varies in content and size request to request. It was measured, consistently, across all 15 pages in the original crawl using the same logic that correctly identified the seven false positives, so treat it as real and unresolved, not disproven. TLS itself measured clean (the SSL analyzer raised nothing) and the OWASP checker found nothing beyond the two cookie-flag findings. The concrete next step is not a header tweak: the site owner needs to reload the site repeatedly (or inspect the relevant CMS/promotional content source directly) until the flagged value reappears in view-source, confirm what it is and whether it is live, and if so rotate it and move it out of anything shipped to the browser — in parallel with adding a CSP and the Secure/HttpOnly cookie flags at the shared layer, which are already fully confirmed and need no further investigation.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `headers-checker` | CODE | 1 finding(s) · 1432 ms |
| `ssl-analyzer` | CODE | 0 finding(s) · 1324 ms |
| `data-leak-scanner` | CODE | 8 finding(s) · 1321 ms |
| `owasp-checker` | CODE | 2 finding(s) · 1459 ms |

#### HIGH · Missing Content-Security-Policy header

| | |
|---|---|
| Attribution | MEASURED |
| Check | `headers.csp-missing` |
| Fingerprint | `5b04585037cc92b9d8dc62d0efe2e5e7063430880b2505bcc6d9814f3e5cee25` |
| Location | `https://eink.ma` |

The response carried no Content-Security-Policy header.

**Why it matters.** Without a CSP, the browser applies no restriction on which scripts, styles, or resources a page may load, which widens the impact of any injection vulnerability.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Missing Content-Security-Policy header
What was measured: The response carried no Content-Security-Policy header.
Where: https://eink.ma
Why it matters: Without a CSP, the browser applies no restriction on which scripts, styles, or resources a page may load, which widens the impact of any injection vulnerability.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### HIGH · Credential in source: a value assigned to a credential-shaped name

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `47a03bd9d9fead0901515c7180d371771b7ce0571b670f76464698c5fe579fbb` |
| Location | `https://eink.ma` |

A value assigned to a credential-shaped name appears in https://eink.ma/ at line 1, column 390744 (32 characters). The value has been withheld from this report and was replaced with [[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]] before any part of this file was sent to an AI provider.

**Why it matters.** If this is a live credential, anyone who can read this file can use it. Rotate it and move it to configuration the repository does not hold.

**Evidence.**

```json
{
  "kind": "GENERIC_SECRET_ASSIGNMENT",
  "path": "https://eink.ma/",
  "segment": "fetched-page",
  "line": 1,
  "column": 390744,
  "length": 32,
  "placeholder": "[[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a value assigned to a credential-shaped name
What was measured: A value assigned to a credential-shaped name appears in https://eink.ma/ at line 1, column 390744 (32 characters). The value has been withheld from this report and was replaced with [[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]] before any part of this file was sent to an AI provider.
Where: https://eink.ma
Why it matters: If this is a live credential, anyone who can read this file can use it. Rotate it and move it to configuration the repository does not hold.
Evidence: {"kind":"GENERIC_SECRET_ASSIGNMENT","path":"https://eink.ma/","segment":"fetched-page","line":1,"column":390744,"length":32,"placeholder":"[[REDACTED:GENERIC_SECRET_ASSIGNMENT:1]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### HIGH · A cookie is set without the Secure flag

| | |
|---|---|
| Attribution | MEASURED |
| Check | `owasp.cookie-missing-secure` |
| Fingerprint | `638ad6e6ea593d011bb11d62b05d718cf9672f36573991ef592ce8a4f4a5f59e` |
| Location | `https://eink.ma` |

At least one Set-Cookie entry does not carry a Secure attribute.

**Why it matters.** A cookie without Secure can be sent over an unencrypted connection if one is ever attempted, exposing it to interception.

**Evidence.**

```json
{
  "setCookie": "NEXT_LOCALE=en; Path=/; Expires=Wed, 08 Sep 2027 17:59:54 GMT; Max-Age=31536000; SameSite=lax"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: A cookie is set without the Secure flag
What was measured: At least one Set-Cookie entry does not carry a Secure attribute.
Where: https://eink.ma
Why it matters: A cookie without Secure can be sent over an unencrypted connection if one is ever attempted, exposing it to interception.
Evidence: {"setCookie":"NEXT_LOCALE=en; Path=/; Expires=Wed, 08 Sep 2027 17:59:54 GMT; Max-Age=31536000; SameSite=lax"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Credential in source: a high-entropy string consistent with a credential

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `bae8678233f2e8bbcbce2ec81ace29ccc6bce5987c975a15fd98821241d3ed75` |
| Location | `https://eink.ma` |

A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 49 (39 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:3]] before any part of this file was sent to an AI provider.

**Why it matters.** This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.

**Evidence.**

```json
{
  "kind": "HIGH_ENTROPY_STRING",
  "path": "https://eink.ma/",
  "segment": "fetched-page",
  "line": 1,
  "column": 49,
  "length": 39,
  "placeholder": "[[REDACTED:HIGH_ENTROPY_STRING:3]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a high-entropy string consistent with a credential
What was measured: A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 49 (39 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:3]] before any part of this file was sent to an AI provider.
Where: https://eink.ma
Why it matters: This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.
Evidence: {"kind":"HIGH_ENTROPY_STRING","path":"https://eink.ma/","segment":"fetched-page","line":1,"column":49,"length":39,"placeholder":"[[REDACTED:HIGH_ENTROPY_STRING:3]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Credential in source: a high-entropy string consistent with a credential

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `ed35cce76c3210ed4a8bc994ff0d69f9cdd7efe28376bfd73180675ac2de1dd2` |
| Location | `https://eink.ma` |

A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 593 (83 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.

**Why it matters.** This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.

**Evidence.**

```json
{
  "kind": "HIGH_ENTROPY_STRING",
  "path": "https://eink.ma/",
  "segment": "fetched-page",
  "line": 1,
  "column": 593,
  "length": 83,
  "placeholder": "[[REDACTED:HIGH_ENTROPY_STRING:2]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a high-entropy string consistent with a credential
What was measured: A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 593 (83 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.
Where: https://eink.ma
Why it matters: This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.
Evidence: {"kind":"HIGH_ENTROPY_STRING","path":"https://eink.ma/","segment":"fetched-page","line":1,"column":593,"length":83,"placeholder":"[[REDACTED:HIGH_ENTROPY_STRING:2]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Credential in source: a high-entropy string consistent with a credential

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `03bf5a70056855e6261b08345212f6cff76e2fee252d51984006d5c2a9e876c0` |
| Location | `https://eink.ma` |

A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 35955 (83 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.

**Why it matters.** This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.

**Evidence.**

```json
{
  "kind": "HIGH_ENTROPY_STRING",
  "path": "https://eink.ma/",
  "segment": "fetched-page",
  "line": 1,
  "column": 35955,
  "length": 83,
  "placeholder": "[[REDACTED:HIGH_ENTROPY_STRING:2]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a high-entropy string consistent with a credential
What was measured: A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 35955 (83 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.
Where: https://eink.ma
Why it matters: This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.
Evidence: {"kind":"HIGH_ENTROPY_STRING","path":"https://eink.ma/","segment":"fetched-page","line":1,"column":35955,"length":83,"placeholder":"[[REDACTED:HIGH_ENTROPY_STRING:2]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Credential in source: a high-entropy string consistent with a credential

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `26a10554d9013e81044a4f4b1e68bec520f4665663185aaa93ceed12bc7682f0` |
| Location | `https://eink.ma` |

A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 114925 (39 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:3]] before any part of this file was sent to an AI provider.

**Why it matters.** This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.

**Evidence.**

```json
{
  "kind": "HIGH_ENTROPY_STRING",
  "path": "https://eink.ma/",
  "segment": "fetched-page",
  "line": 1,
  "column": 114925,
  "length": 39,
  "placeholder": "[[REDACTED:HIGH_ENTROPY_STRING:3]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a high-entropy string consistent with a credential
What was measured: A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 114925 (39 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:3]] before any part of this file was sent to an AI provider.
Where: https://eink.ma
Why it matters: This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.
Evidence: {"kind":"HIGH_ENTROPY_STRING","path":"https://eink.ma/","segment":"fetched-page","line":1,"column":114925,"length":39,"placeholder":"[[REDACTED:HIGH_ENTROPY_STRING:3]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Credential in source: a high-entropy string consistent with a credential

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `1a4883248cff2a31eadbfd554b7c1c092c14afa8d08cb297e988d0049011032c` |
| Location | `https://eink.ma` |

A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 317778 (83 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.

**Why it matters.** This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.

**Evidence.**

```json
{
  "kind": "HIGH_ENTROPY_STRING",
  "path": "https://eink.ma/",
  "segment": "fetched-page",
  "line": 1,
  "column": 317778,
  "length": 83,
  "placeholder": "[[REDACTED:HIGH_ENTROPY_STRING:2]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a high-entropy string consistent with a credential
What was measured: A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 317778 (83 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.
Where: https://eink.ma
Why it matters: This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.
Evidence: {"kind":"HIGH_ENTROPY_STRING","path":"https://eink.ma/","segment":"fetched-page","line":1,"column":317778,"length":83,"placeholder":"[[REDACTED:HIGH_ENTROPY_STRING:2]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Credential in source: a high-entropy string consistent with a credential

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `22b7f0cc4d333946162524fae076d885c20d8b9e4d61703a2a8a087322ec0be8` |
| Location | `https://eink.ma` |

A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 379188 (83 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.

**Why it matters.** This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.

**Evidence.**

```json
{
  "kind": "HIGH_ENTROPY_STRING",
  "path": "https://eink.ma/",
  "segment": "fetched-page",
  "line": 1,
  "column": 379188,
  "length": 83,
  "placeholder": "[[REDACTED:HIGH_ENTROPY_STRING:2]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a high-entropy string consistent with a credential
What was measured: A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 379188 (83 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.
Where: https://eink.ma
Why it matters: This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.
Evidence: {"kind":"HIGH_ENTROPY_STRING","path":"https://eink.ma/","segment":"fetched-page","line":1,"column":379188,"length":83,"placeholder":"[[REDACTED:HIGH_ENTROPY_STRING:2]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Credential in source: a high-entropy string consistent with a credential

| | |
|---|---|
| Attribution | MEASURED |
| Check | `redaction.secret-in-source` |
| Fingerprint | `531d26255368f21495de6ddab489e8e18dbce0c4e76e5bbb061678946b86bcb0` |
| Location | `https://eink.ma` |

A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 381303 (83 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.

**Why it matters.** This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.

**Evidence.**

```json
{
  "kind": "HIGH_ENTROPY_STRING",
  "path": "https://eink.ma/",
  "segment": "fetched-page",
  "line": 1,
  "column": 381303,
  "length": 83,
  "placeholder": "[[REDACTED:HIGH_ENTROPY_STRING:2]]"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Credential in source: a high-entropy string consistent with a credential
What was measured: A high-entropy string consistent with a credential appears in https://eink.ma/ at line 1, column 381303 (83 characters). The value has been withheld from this report and was replaced with [[REDACTED:HIGH_ENTROPY_STRING:2]] before any part of this file was sent to an AI provider.
Where: https://eink.ma
Why it matters: This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.
Evidence: {"kind":"HIGH_ENTROPY_STRING","path":"https://eink.ma/","segment":"fetched-page","line":1,"column":381303,"length":83,"placeholder":"[[REDACTED:HIGH_ENTROPY_STRING:2]]"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · A cookie is set without the HttpOnly flag

| | |
|---|---|
| Attribution | MEASURED |
| Check | `owasp.cookie-missing-httponly` |
| Fingerprint | `9eb2daa027cb58efa4dbb8772d3f53332e9afdb1a8f779d7d5f20c1676d22904` |
| Location | `https://eink.ma` |

At least one Set-Cookie entry does not carry an HttpOnly attribute.

**Why it matters.** A cookie without HttpOnly is readable from JavaScript, so a cross-site scripting vulnerability elsewhere on the page can steal it.

**Evidence.**

```json
{
  "setCookie": "NEXT_LOCALE=en; Path=/; Expires=Wed, 08 Sep 2027 17:59:54 GMT; Max-Age=31536000; SameSite=lax"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: A cookie is set without the HttpOnly flag
What was measured: At least one Set-Cookie entry does not carry an HttpOnly attribute.
Where: https://eink.ma
Why it matters: A cookie without HttpOnly is readable from JavaScript, so a cross-site scripting vulnerability elsewhere on the page can steal it.
Evidence: {"setCookie":"NEXT_LOCALE=en; Path=/; Expires=Wed, 08 Sep 2027 17:59:54 GMT; Max-Age=31536000; SameSite=lax"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Search visibility — COMPLETE · score 96/100

Clean across the board except two LOW findings on the homepage only: the <title> tag is 62 characters and the meta description is 162 characters, both a few characters past the length search results typically display before truncating. The homepage has a proper heading structure (1 <h1>) and the content checker found nothing else to flag on any of the other 14 pages.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `meta-checker` | CODE | 2 finding(s) · 857 ms |
| `content-checker` | CODE | 0 finding(s) · 827 ms |

#### LOW · Page title is longer than typically displayed

| | |
|---|---|
| Attribution | MEASURED |
| Check | `meta.title-too-long` |
| Fingerprint | `f1fed092dd701b069a99352e6a79ed76394106e255626998bc5ff7f046c0999b` |
| Location | `https://eink.ma` |

The <title> tag is 62 characters, past the roughly 60 characters most search results display before truncating.

**Why it matters.** A truncated title in search results can cut off the most important words, which reduces click-through from that result.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following seo issue.

Problem: Page title is longer than typically displayed
What was measured: The <title> tag is 62 characters, past the roughly 60 characters most search results display before truncating.
Where: https://eink.ma
Why it matters: A truncated title in search results can cut off the most important words, which reduces click-through from that result.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · Meta description is longer than typically displayed

| | |
|---|---|
| Attribution | MEASURED |
| Check | `meta.description-too-long` |
| Fingerprint | `512ddfc5c35becb6f22ca76dbb1f9432b17fa0c74b141af3d29479fa49f6be05` |
| Location | `https://eink.ma` |

The meta description is 162 characters, past the roughly 160 characters most search results display before truncating.

**Why it matters.** A truncated description in search results can cut off the call to action or the most relevant detail.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following seo issue.

Problem: Meta description is longer than typically displayed
What was measured: The meta description is 162 characters, past the roughly 160 characters most search results display before truncating.
Where: https://eink.ma
Why it matters: A truncated description in search results can cut off the call to action or the most relevant detail.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Performance — COMPLETE · score 93/100

Measured with a real headless Chromium render on the homepage: time-to-first-byte 619ms, first contentful paint 1028ms, load 1660ms, over 60 requests totalling 3028.5KB with a 792-node DOM — every other crawled page loaded comparably fast (600-1300ms load). The one repeating MEDIUM finding: no crawled page's HTML response carries a Content-Encoding header, and a LOW finding flags 15 referenced script/stylesheet files also served uncompressed on every page — enabling gzip/brotli at the origin or CDN is a configuration change, not a code change, and would clear both findings site-wide at once. A separate LOW finding on 9 of the 15 pages flags the same subresource referenced more than once in the page — worth a quick look at whether a script or stylesheet is being double-loaded.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `lighthouse-analyzer` | CODE | 1 finding(s) · 5322 ms |
| `network-inspector` | CODE | 1 finding(s) · 1500 ms |
| `cwv-analyzer` | CODE | 0 finding(s) · 5442 ms |

#### MEDIUM · Response is not compressed

| | |
|---|---|
| Attribution | MEASURED |
| Check | `lighthouse.no-text-compression` |
| Fingerprint | `6ede9011f928fbea7f754c5cbf6576f7f63583b054bb44c85ce1869af9d358fb` |
| Location | `https://eink.ma` |

The response carried no Content-Encoding header (gzip, br, or deflate).

**Why it matters.** Uncompressed text responses transfer more bytes than necessary, which slows the page down most for visitors on a constrained connection.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following performance issue.

Problem: Response is not compressed
What was measured: The response carried no Content-Encoding header (gzip, br, or deflate).
Where: https://eink.ma
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
| Fingerprint | `067eec69d34a747a3b70287f0328d6f60e4e9ff8b3415d39d6455fa80456b5db` |
| Location | `https://eink.ma` |

15 referenced script/stylesheet resource(s) were served without a Content-Encoding header.

**Why it matters.** Uncompressed text assets transfer more bytes than necessary, adding to the time it takes the page to become interactive.

**Evidence.**

```json
{
  "count": 15,
  "sample": [
    "https://eink.ma/_next/static/chunks/2i51e627rllld.js",
    "https://eink.ma/_next/static/chunks/064zbffocu64f.js",
    "https://eink.ma/_next/static/chunks/33wmmxu2kkyqh.js",
    "https://eink.ma/_next/static/chunks/0fy4h0ngk1igg.js",
    "https://eink.ma/_next/static/chunks/turbopack-3gkqdqz0d0s-c.js"
  ]
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following performance issue.

Problem: Uncompressed script or stylesheet
What was measured: 15 referenced script/stylesheet resource(s) were served without a Content-Encoding header.
Where: https://eink.ma
Why it matters: Uncompressed text assets transfer more bytes than necessary, adding to the time it takes the page to become interactive.
Evidence: {"count":15,"sample":["https://eink.ma/_next/static/chunks/2i51e627rllld.js","https://eink.ma/_next/static/chunks/064zbffocu64f.js","https://eink.ma/_next/static/chunks/33wmmxu2kkyqh.js","https://eink.ma/_next/static/chunks/0fy4h0ngk1igg.js","https://eink.ma/_next/static/chunks/turbopack-3gkqdqz0d0s-c.js"]}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Testing — COMPLETE · score 100/100

Clean on 14 of 15 pages. The one exception is /support, where 1 of 13 sampled same-origin links did not resolve: the flagged URL is https://eink.ma/cdn-cgi/l/email-protection, Cloudflare's email-obfuscation redirect, which typically only decodes correctly when clicked by a real browser with JavaScript rather than fetched directly — this reads as a likely false positive from how the check samples links, not necessarily a genuinely broken page, but it is worth a human confirming the support contact link actually works before ruling it out. The contradiction detector found no internal inconsistency in the audit's own output on any page.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `playwright-runner` | CODE | 0 finding(s) · 5601 ms |
| `contradiction-detector` | CODE | 0 finding(s) · 2 ms |

_No defects measured in this area._

---

### Design — COMPLETE · score 100/100

Zero measured findings — no broken images, and zero horizontal overflow at both 1440px and mobile width on every one of the 15 pages checked. The design-critique capability (impeccable) is an AI-layer check that produced no output (no runtime model configured); the observations below are AI_JUDGMENT from the two captured homepage screenshots and do not affect the score.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `screenshot-capture` | CODE | 0 finding(s) · 2571 ms |
| `impeccable` | AI | AI layer — prompt contribution only (no runtime model) |

#### LOW · Large empty gaps and an unrendered dark block between homepage sections in the captured full-page screenshot

| | |
|---|---|
| Attribution | AI_JUDGMENT |
| Check | `ai.ui.judgment.section-whitespace` |
| Fingerprint | `ai.ui.judgment.section-whitespace` |
| Location | — |

The full-page desktop and mobile captures both show large blank vertical stretches between content blocks below the hero, and a wide black band containing an empty dark-grey rectangle roughly a third of the way down the page — consistent with scroll-triggered reveal animations and a video or embedded media player whose content had not entered the viewport or finished loading at capture time. It could also indicate content that genuinely fails to render for some visitors.

**Why it matters.** If this is a capture-timing artifact of the automated full-page screenshot, there is no real user-facing issue. If it reproduces for a real visitor scrolling at normal speed, the dark empty rectangle in particular reads as a broken or unloaded video on an otherwise clean landing page.

<details><summary>Paste-ready remediation prompt</summary>

```
Manually scroll through https://eink.ma/ on desktop and mobile in a real browser and confirm the dark block partway down the homepage actually renders a video or image, and that the sections around it appear without a delay long enough to look broken. If it is a reveal-animation threshold issue, lower the trigger threshold or add a rendered fallback state.
```

</details>

#### INFO · Clean, minimal storefront layout with a clear single call to action

| | |
|---|---|
| Attribution | AI_JUDGMENT |
| Check | `ai.ui.judgment.positive` |
| Fingerprint | `ai.ui.judgment.positive` |
| Location | — |

The captured homepage shows a restrained black-and-white palette, a clear bold headline ("Think clearly. Write on paper. Powered by light."), a single well-differentiated primary action ("Shop Now") next to a secondary one ("Compare Devices"), and a brand-logo navigation strip beneath the hero listing every device brand carried. Typographic hierarchy between the hero headline and supporting text is clear and uncluttered.

**Why it matters.** No action needed — this is a solid, focused baseline for the rest of the storefront.

<details><summary>Paste-ready remediation prompt</summary>

```
No change required.
```

</details>

---

## Active penetration test — manual runbook

The audit above is passive configuration analysis. A full **manual penetration-test runbook** for a
human tester is a separate deliverable — `PENTEST-RUNBOOK.md` (and the dashboard's "Pentest plan" tab).
It covers **8 phases / 38 test cases** across app, api and the chatbot widget:

| Phase | Focus | Test cases |
|---|---|---|
| P0 — Recon & passive mapping | Build a complete picture of the attack surface before sending a single crafted request. Most of this is normal browsing plus OSINT. | 4 |
| P1 — Active mapping & content discovery | Turn the recon inventory into a confirmed, tested map of every reachable endpoint, method and parameter. | 4 |
| P2 — Authentication — the operator login at /admin/login | Break or weaken the one confirmed way a human proves who they are on this site. Passive recon found no public customer register/login/reset flow at the obvious paths (/login, /register, /account all 404) — /admin/login (email + password, confirmed by GET) is the only real target for this phase. RECON-01 must confirm or rule out a customer-facing auth system before ATHN-cases below are treated as "the whole auth surface" in the report; if one exists, apply the same cases to it too. | 4 |
| P3 — Authorization — reach the admin surface & other customers' data | As a normal visitor (or no user at all), read or do things you should not. eink.ma is single-tenant (one storefront, one operator surface at /admin), not the multi-tenant SaaS the original engagement template assumed — the highest business impact here is compromising the single admin account or reading another customer's order/checkout data, not cross-tenant isolation. RECON-01 must confirm the real backend shape (Server Actions vs REST) before most of this phase can be executed precisely. | 5 |
| P4 — Injection | Get the backend to execute attacker-controlled data as code/query/markup. Manual confirmation first, then careful tool-assisted exploitation in an authorised window. | 6 |
| P5 — Rate limiting, anti-automation & resource consumption | Systematically map every limit (or its absence) on every sensitive or expensive operation. The client asked for this explicitly. | 4 |
| P6 — Business logic & API (OWASP API Top 10) | Flaws that are not a single bad character but a bad sequence of otherwise-valid requests. | 5 |
| P7 — Transport, infrastructure & headers | The perimeter: TLS, HTTP security headers (done properly, with grading), cookies, clickjacking, information disclosure. Passive recon already found this site's header posture better than the runbook template originally assumed — verify each case rather than assuming the worst. | 6 |

It includes SQL/NoSQL injection, authentication (login / register / password-reset, incl. host-header
poisoning and reset-token race), rate limiting and brute-force with bypasses, reaching the admin dashboard,
IDOR and cross-tenant isolation, SSRF, XSS, JWT/session, the widget & prompt injection, business logic, and
transport/headers — each with steps, payloads, tools, evidence to capture, and remediation.

> Execute only under written authorisation and a signed scope. Nothing in it has been run.

## All findings, by severity

| Severity | Area | Title | Attribution | Fingerprint |
|---|---|---|---|---|
| HIGH | Security | Missing Content-Security-Policy header | MEASURED | `5b04585037cc92b9` |
| HIGH | Security | Credential in source: a value assigned to a credential-shaped name | MEASURED | `47a03bd9d9fead09` |
| HIGH | Security | A cookie is set without the Secure flag | MEASURED | `638ad6e6ea593d01` |
| MEDIUM | Security | Credential in source: a high-entropy string consistent with a credential | MEASURED | `bae8678233f2e8bb` |
| MEDIUM | Security | Credential in source: a high-entropy string consistent with a credential | MEASURED | `ed35cce76c3210ed` |
| MEDIUM | Security | Credential in source: a high-entropy string consistent with a credential | MEASURED | `03bf5a70056855e6` |
| MEDIUM | Security | Credential in source: a high-entropy string consistent with a credential | MEASURED | `26a10554d9013e81` |
| MEDIUM | Security | Credential in source: a high-entropy string consistent with a credential | MEASURED | `1a4883248cff2a31` |
| MEDIUM | Security | Credential in source: a high-entropy string consistent with a credential | MEASURED | `22b7f0cc4d333946` |
| MEDIUM | Security | Credential in source: a high-entropy string consistent with a credential | MEASURED | `531d26255368f214` |
| MEDIUM | Security | A cookie is set without the HttpOnly flag | MEASURED | `9eb2daa027cb58ef` |
| MEDIUM | Performance | Response is not compressed | MEASURED | `6ede9011f928fbea` |
| LOW | Search visibility | Page title is longer than typically displayed | MEASURED | `f1fed092dd701b06` |
| LOW | Search visibility | Meta description is longer than typically displayed | MEASURED | `512ddfc5c35becb6` |
| LOW | Performance | Uncompressed script or stylesheet | MEASURED | `067eec69d34a747a` |
| LOW | Design | Large empty gaps and an unrendered dark block between homepage sections in the captured full-page screenshot | AI_JUDGMENT | `ai.ui.judgment.s` |
| INFO | Design | Clean, minimal storefront layout with a clear single call to action | AI_JUDGMENT | `ai.ui.judgment.p` |

---

_Generated by `showcase-eink`. Raw data: `data/audit.json`. Dashboard: `pnpm --filter showcase-eink serve`._
