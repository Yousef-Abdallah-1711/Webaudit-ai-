# WebAudit AI — audit report

**Target** `https://app.esaalnybot.tech/`
**Completed** 2026-08-29 15:04:13 UTC · 2.6s
**Overall score** 87 / 100 — mean of 5 scored areas (SECURITY, SEO, PERFORMANCE, TESTING, UI)
**Findings** 17 — 0 critical, 2 high, 5 medium, 7 low, plus 3 AI design observations

| Area | State | Score |
|---|---|---|
| Security | COMPLETE | `█████████████·······` 67 |
| Search visibility | COMPLETE | `████████████████····` 79 |
| Performance | COMPLETE | `██████████████████··` 91 |
| Testing | COMPLETE | `████████████████████` 100 |
| Design | COMPLETE | `████████████████████` 100 |

---

## How this audit was produced

showcase-esaalnybot standalone runner — real @webaudit/capabilities-vendored (13) + real module-runner + real safe-net + real Playwright browser pool

- **Browser:** real headless Chromium (Playwright)
- **AI layer:** NOT run at runtime (no LLM key). Executive summary, per-area narrative and prioritisation authored by Claude strictly from the measured findings below — labelled AI_NARRATIVE, distinct from the per-finding MEASURED / AI_JUDGMENT attribution the runner assigns.

The measurement layer is the product's own code, run for real:

- 13 capabilities from `packages/capabilities-vendored/*`, unmodified.
- `apps/worker/src/module-runner/*` for resolution, isolated concurrent execution, `globalThis.fetch` poisoning, per-area state and per-area scoring — imported, not re-implemented.
- `packages/safe-net` (`safeFetch`) is the only network door for `ctx.fetch`; `apps/probe-pool` (`createBrowserPool`) backs `ctx.withPage`.

### Engine parity — cross-checked against the full production pipeline

The same audit was also run through the real `startApi` + `startWorker` stack (Express API, BullMQ queue, five-phase orchestrator, Postgres + Redis), creating a real `Scan` row and letting the orchestrator drive it to `COMPLETED`.

| Area | Standalone runner | Full pipeline | Match |
|---|---|---|---|
| Security | COMPLETE · 67 | COMPLETE · 67 | ✅ |
| Search visibility | COMPLETE · 79 | COMPLETE · 79 | ✅ |
| Performance | COMPLETE · 91 | COMPLETE · 91 | ✅ |
| Testing | COMPLETE · 100 | COMPLETE · 100 | ✅ |
| Design | COMPLETE · 100 | DEGRADED · 100 | ✅ |
| **Overall** | **87** | **87** | ✅ |

- Both engines run the same 13 vendored capabilities and the same module-runner. The standalone runner additionally wires a real Playwright browser pool; the product orchestrator does not (a documented product gap), so ctx.withPage checks are inert in the pipeline column.
- UI is DEGRADED in the pipeline because the fixture AI executor returns a canned response that does not satisfy the impeccable schema — an artifact of running with AI_MODE=fixtures rather than a real model, not a measurement difference. Score is unaffected (AI never moves a score).
- Every MEASURED finding and every per-area score is identical across the two engines.

## Executive summary

> Authored by the AI layer (Claude (Anthropic) acting as the WebAudit AI AI-layer — grounded only in the measured findings in this file; no runtime LLM call was made.)

app.esaalnybot.tech scores 87/100 on the passive configuration audit. That is a hygiene score, not a security clearance — the deep testing (injection, auth, rate limiting, tenant isolation) is the separate engagement in the Pentest plan tab and is mostly not yet run. On what was measured: nothing blocks a launch — there are no critical findings — but the site ships with none of the standard HTTP security headers, which is the single most valuable thing to fix and is almost entirely nginx configuration, not code. Security scores lowest (67): the response carries no Content-Security-Policy (HIGH), no HSTS, no X-Frame-Options, and no X-Content-Type-Options, and the Server header advertises its exact nginx version. Search visibility (79) is limited by the page being a client-rendered React shell — the HTML served to a crawler has no <h1>, no meta description, and almost no text; the rendered DOM does have an <h1> ("Sign in to your workspace"), so a JavaScript-executing crawler like Googlebot will see more than a simple one will, but the missing meta description is a real gap at any level. Performance (91) is genuinely good — first contentful paint measured 480ms and full load 579ms over 6 requests / 261KB with a 40-node DOM — held back only by the origin serving uncompressed responses with no cache-control headers. Design and Testing measured clean at 1440px and 390px: the layout is responsive with zero horizontal overflow at mobile width, and every same-origin link resolves. Bottom line for the client: this is a tidy, fast, well-built front end whose main weakness is that it was deployed without the security-header and compression configuration that a production nginx vhost should carry. Most of the report is a 30-minute change to one server config file.

### What this 87 does and does not mean

This score is a PASSIVE configuration and hygiene assessment — what can be observed from the served responses and a real browser render, at zero risk to the target. It is not a penetration test. It says nothing about whether login can be bypassed, whether one tenant can read another's chatbot data, whether the API is injectable, or whether rate limiting works. That work is a separate 47-case manual engagement in the "Pentest plan" tab, and — apart from seven non-intrusive checks already recorded there — it has not been run.

- ✅ Covered here (measured): security headers, HTTPS/HSTS, cookie flags, server-version disclosure, meta/SEO structure, Core Web Vitals and page weight (real Chromium), responsive layout, broken links, secret leakage in served markup.
- ❌ NOT covered by the 87 — see the Pentest plan tab: SQL/NoSQL injection, authentication (login / register / password-reset, incl. host-header poisoning and reset-token races), rate limiting and brute-force, reaching the admin dashboard, IDOR and cross-tenant isolation, SSRF, XSS, JWT/session, the chatbot widget and prompt injection, and business logic.
- ❌ Non-intrusive checks already recorded there flag: the missing security headers (same as Security below), the server-version disclosure, an HSTS gap on an otherwise-good TLS setup, and a CORS configuration smell on api.esaalnybot.tech (Access-Control-Allow-Credentials: true) that needs an active test to rate.

### Scope

The audited URL (app.esaalnybot.tech) is the sign-in screen of the Esaalny AI-chatbot platform. This audit covers the public, pre-authentication page a visitor and a search crawler actually see. The product itself lives behind the login; auditing behind a sign-in is deliberately out of scope for the WebAudit AI baseline (it would mean holding customer credentials), so the app dashboard is not covered here.

## Fix these first

| # | Action | Area | Severity | Effort | Why |
|---|---|---|---|---|---|
| 1 | Add the standard security headers in nginx (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) | Security | HIGH | small | One block in the nginx server{} config closes six of the seven security findings at once. CSP is the highest value because the page loads a third-party widget script. This is the single best return on effort in the whole report. |
| 2 | Enable gzip/brotli compression and set Cache-Control on /assets/* | Performance | MEDIUM | trivial | Content-hashed bundle names mean long-lived immutable caching is safe. Compression + caching is a few lines of nginx config and measurably cuts repeat-visit and slow-network load. |
| 3 | Add a <meta name="description"> (and ideally server-render or prerender the login page's <title>/<h1>/description) | Search visibility | MEDIUM | small | The meta description controls the search/social snippet and is missing entirely. Prerendering the shell would also give non-JS crawlers the <h1> and copy they currently never see. |
| 4 | Hide the nginx version (server_tokens off;) | Security | LOW | trivial | One directive. Removes a free reconnaissance signal. |
| 5 | Use a branded support address instead of a gmail.com address on the sign-in page | Design | LOW | small | helpesaalnybot@gmail.com on a paid B2B product's login screen reads as less established than support@esaalnybot.tech. Trust matters most at the auth boundary. |

## Measured page load (real headless Chromium)

| Metric | Value |
|---|---|
| Time to first byte | 56 ms |
| DOM interactive | 191 ms |
| First contentful paint | 480 ms |
| DOMContentLoaded | 494 ms |
| Load | 579 ms |
| Transfer size | 261 KB |
| Requests | 6 |
| DOM nodes | 40 |
| Rendered body text | 241 chars |
| Rendered headings | h1×1, h2×0, h3×0 |
| Horizontal overflow | 0px @1440 · 0px @390 |

_Screenshots: `data/screenshot-desktop.png`, `data/screenshot-mobile.png`._

---

## Areas

### Security — COMPLETE · score 67/100

Seven measured findings, all from the served HTTP response, none requiring source access. The page is served over HTTPS (good) but with no Strict-Transport-Security header, so a visitor who types the bare domain or follows an http:// link gets no browser-enforced upgrade. There is no Content-Security-Policy, which is the highest-value header to add for a page that loads a third-party widget script (api.esaalnybot.tech/widget.js) — a CSP is what bounds the blast radius if that script or any dependency is ever compromised. X-Frame-Options and X-Content-Type-Options are absent (clickjacking and MIME-sniffing protection), and Referrer-Policy / Permissions-Policy are absent (lower severity, but free to add). Finally the Server header returns the precise nginx build ("nginx/1.24.0 (Ubuntu)"), which hands an attacker a version to match against known CVEs for no operational benefit. The data-leak scanner found no secrets in the served markup — clean. Every one of these is an nginx `add_header` / `server_tokens off;` change; none is an application-code fix. Two things this passive layer can see but not score: TLS itself is actually well configured (1.2/1.3 only, strong ciphers, valid cert — only the HSTS header is missing), and api.esaalnybot.tech returns Access-Control-Allow-Credentials: true without reflecting an arbitrary origin — a CORS configuration that needs an active test (Pentest plan tab, MAP-04) to confirm as safe or exploitable. Everything else about the API and the authenticated product — injection, auth, tenant isolation, rate limiting — is the Pentest plan tab, not this score.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `headers-checker` | CODE | 5 finding(s) · 315 ms |
| `ssl-analyzer` | CODE | 1 finding(s) · 303 ms |
| `data-leak-scanner` | CODE | 0 finding(s) · 310 ms |
| `owasp-checker` | CODE | 1 finding(s) · 305 ms |

#### HIGH · Missing Content-Security-Policy header

| | |
|---|---|
| Attribution | MEASURED |
| Check | `headers.csp-missing` |
| Fingerprint | `bb1ba10556658a690d54116aa640081d9383b7df247fc730eaa313e6d2c7de3f` |
| Location | `https://app.esaalnybot.tech` |

The response carried no Content-Security-Policy header.

**Why it matters.** Without a CSP, the browser applies no restriction on which scripts, styles, or resources a page may load, which widens the impact of any injection vulnerability.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Missing Content-Security-Policy header
What was measured: The response carried no Content-Security-Policy header.
Where: https://app.esaalnybot.tech
Why it matters: Without a CSP, the browser applies no restriction on which scripts, styles, or resources a page may load, which widens the impact of any injection vulnerability.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Missing X-Frame-Options header

| | |
|---|---|
| Attribution | MEASURED |
| Check | `headers.frame-options-missing` |
| Fingerprint | `ebb7b4eb1cdfc0b945a0bd2b81ab635c1a8f1bbe25a78f3a78c018db30b41143` |
| Location | `https://app.esaalnybot.tech` |

The response carried no X-Frame-Options header.

**Why it matters.** Without it (and no frame-ancestors directive in a CSP), the page can be embedded in another site’s frame and used for clickjacking.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Missing X-Frame-Options header
What was measured: The response carried no X-Frame-Options header.
Where: https://app.esaalnybot.tech
Why it matters: Without it (and no frame-ancestors directive in a CSP), the page can be embedded in another site’s frame and used for clickjacking.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Missing X-Content-Type-Options header

| | |
|---|---|
| Attribution | MEASURED |
| Check | `headers.content-type-options-missing` |
| Fingerprint | `6bbdd40137edb56c09877ad7fb2acbfced4f8202207a88077c5c5241edfafea0` |
| Location | `https://app.esaalnybot.tech` |

The response carried no X-Content-Type-Options: nosniff header.

**Why it matters.** Without it, some browsers will MIME-sniff the response and may execute content that was not intended to run as a script.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Missing X-Content-Type-Options header
What was measured: The response carried no X-Content-Type-Options: nosniff header.
Where: https://app.esaalnybot.tech
Why it matters: Without it, some browsers will MIME-sniff the response and may execute content that was not intended to run as a script.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Missing Strict-Transport-Security header

| | |
|---|---|
| Attribution | MEASURED |
| Check | `ssl.hsts-missing` |
| Fingerprint | `eb5e2ba4cef56f2fa53303bcc1a11523a02369e11a959158001efd03bf42400f` |
| Location | `https://app.esaalnybot.tech` |

The HTTPS response carried no Strict-Transport-Security header.

**Why it matters.** Without HSTS, a visitor who types the bare domain or follows an http:// link is not told by the browser to upgrade automatically, leaving a window for a downgrade attack.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Missing Strict-Transport-Security header
What was measured: The HTTPS response carried no Strict-Transport-Security header.
Where: https://app.esaalnybot.tech
Why it matters: Without HSTS, a visitor who types the bare domain or follows an http:// link is not told by the browser to upgrade automatically, leaving a window for a downgrade attack.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · Missing Referrer-Policy header

| | |
|---|---|
| Attribution | MEASURED |
| Check | `headers.referrer-policy-missing` |
| Fingerprint | `0f84fbcf0da072cce8b9ed14307d321f83582e7b4d82fe485e56344a356fbb43` |
| Location | `https://app.esaalnybot.tech` |

The response carried no Referrer-Policy header.

**Why it matters.** Without it, the browser’s default referrer behaviour applies, which can leak the full URL (including any sensitive path or query data) to third-party destinations linked from the page.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Missing Referrer-Policy header
What was measured: The response carried no Referrer-Policy header.
Where: https://app.esaalnybot.tech
Why it matters: Without it, the browser’s default referrer behaviour applies, which can leak the full URL (including any sensitive path or query data) to third-party destinations linked from the page.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · Missing Permissions-Policy header

| | |
|---|---|
| Attribution | MEASURED |
| Check | `headers.permissions-policy-missing` |
| Fingerprint | `6c76a34c5e27096e9feb97d29b41cb5e3d1dae104f92b055313a3039e7c877dd` |
| Location | `https://app.esaalnybot.tech` |

The response carried no Permissions-Policy header.

**Why it matters.** Without it, embedded or loaded content is not restricted from requesting powerful browser features (camera, microphone, geolocation) it does not need.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Missing Permissions-Policy header
What was measured: The response carried no Permissions-Policy header.
Where: https://app.esaalnybot.tech
Why it matters: Without it, embedded or loaded content is not restricted from requesting powerful browser features (camera, microphone, geolocation) it does not need.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · Server header discloses a software version

| | |
|---|---|
| Attribution | MEASURED |
| Check | `owasp.server-version-disclosed` |
| Fingerprint | `15921e961bb545e6a669736abd53a2f85adf1a447251914e0576d6b918324a5e` |
| Location | `https://app.esaalnybot.tech` |

The response's server header is "nginx/1.24.0 (Ubuntu)", naming a specific software version.

**Why it matters.** Publishing a specific software version narrows an attacker’s search for a known vulnerability affecting that exact version.

**Evidence.**

```json
{
  "header": "server",
  "value": "nginx/1.24.0 (Ubuntu)"
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following security issue.

Problem: Server header discloses a software version
What was measured: The response's server header is "nginx/1.24.0 (Ubuntu)", naming a specific software version.
Where: https://app.esaalnybot.tech
Why it matters: Publishing a specific software version narrows an attacker’s search for a known vulnerability affecting that exact version.
Evidence: {"header":"server","value":"nginx/1.24.0 (Ubuntu)"}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Search visibility — COMPLETE · score 79/100

The core issue is architectural: the server sends an 859-byte HTML shell with an empty <div id="root"> and the page is built entirely in the browser by React. So the served HTML has no <h1> and no meta description, which the content and meta checkers correctly flag. After JavaScript runs, the rendered page does contain a single well-formed <h1> ("Sign in to your workspace") and ~240 characters of body copy — Google renders JS and will see this, but many other crawlers, link-preview bots, and older tooling will not. The missing meta description is the clearest win: it is a one-line tag and it controls the snippet shown in search results and social shares. A canonical link is also absent. "Thin content" is expected and acceptable for a login page — it is flagged for completeness, not because a sign-in screen should have an essay on it. The higher-leverage SEO move for this business is to have a real marketing/landing page (not the app subdomain) be the indexable entry point.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `meta-checker` | CODE | 2 finding(s) · 180 ms |
| `content-checker` | CODE | 2 finding(s) · 182 ms |

#### HIGH · Missing H1 heading

| | |
|---|---|
| Attribution | MEASURED |
| Check | `content.h1-missing` |
| Fingerprint | `aa72d53ff3e1c5b588ae1aef59c9add18421bde323db180d3ce53202d67ad87b` |
| Location | `https://app.esaalnybot.tech` |

No <h1> tag was found in the page.

**Why it matters.** Search engines and assistive technology both use the H1 as the page’s primary topic signal; without one there is no clear heading hierarchy to anchor either on.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following seo issue.

Problem: Missing H1 heading
What was measured: No <h1> tag was found in the page.
Where: https://app.esaalnybot.tech
Why it matters: Search engines and assistive technology both use the H1 as the page’s primary topic signal; without one there is no clear heading hierarchy to anchor either on.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### MEDIUM · Missing meta description

| | |
|---|---|
| Attribution | MEASURED |
| Check | `meta.description-missing` |
| Fingerprint | `e79a4e5dd62722c708eda19079abb3ae9149843d8f3f5d1b7e22412a88f8f4ae` |
| Location | `https://app.esaalnybot.tech` |

No non-empty <meta name="description"> tag was found in the page.

**Why it matters.** Without a meta description, search engines generate a snippet from arbitrary page text, which is less likely to match what a searcher is looking for.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following seo issue.

Problem: Missing meta description
What was measured: No non-empty <meta name="description"> tag was found in the page.
Where: https://app.esaalnybot.tech
Why it matters: Without a meta description, search engines generate a snippet from arbitrary page text, which is less likely to match what a searcher is looking for.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · Missing canonical link

| | |
|---|---|
| Attribution | MEASURED |
| Check | `meta.canonical-missing` |
| Fingerprint | `eeb8c682908aca67ebd414dc33cde07252de1f3d8199d10c0f0c04a741c7f93b` |
| Location | `https://app.esaalnybot.tech` |

No <link rel="canonical"> tag was found in the page.

**Why it matters.** Without a canonical link, search engines must guess which URL variant (with or without query parameters, trailing slash, etc.) is the authoritative one to index.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following seo issue.

Problem: Missing canonical link
What was measured: No <link rel="canonical"> tag was found in the page.
Where: https://app.esaalnybot.tech
Why it matters: Without a canonical link, search engines must guess which URL variant (with or without query parameters, trailing slash, etc.) is the authoritative one to index.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · Thin content

| | |
|---|---|
| Attribution | MEASURED |
| Check | `content.thin-content` |
| Fingerprint | `de71ed1e547899acdc2f4657a03c2100ab0138316bcba100dedd5b676108ba3f` |
| Location | `https://app.esaalnybot.tech` |

The page’s visible text is approximately 3 words, below the commonly cited 200-word threshold for substantive content.

**Why it matters.** Search engines tend to rank pages with very little unique text lower, since there is not much for them to determine relevance from.

**Evidence.**

```json
{
  "wordCount": 3
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following seo issue.

Problem: Thin content
What was measured: The page’s visible text is approximately 3 words, below the commonly cited 200-word threshold for substantive content.
Where: https://app.esaalnybot.tech
Why it matters: Search engines tend to rank pages with very little unique text lower, since there is not much for them to determine relevance from.
Evidence: {"wordCount":3}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Performance — COMPLETE · score 91/100

Measured with a real headless Chromium render: TTFB 56ms, DOM interactive 191ms, first contentful paint 480ms, load 579ms, 261KB transferred over 6 requests. Those are good numbers and the Core Web Vitals analyzer found nothing to flag. The two real findings are both origin configuration: responses are served without gzip/brotli compression, and no Cache-Control / Expires headers are set, so the JS and CSS bundles (which have content-hashed filenames and could be cached for a year) are re-fetched more than they need to be. The bundle filenames already carry a content hash, so "Cache-Control: public, max-age=31536000, immutable" on /assets/* is safe and should be added alongside compression.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `lighthouse-analyzer` | CODE | 2 finding(s) · 860 ms |
| `network-inspector` | CODE | 1 finding(s) · 744 ms |
| `cwv-analyzer` | CODE | 0 finding(s) · 881 ms |

#### MEDIUM · Response is not compressed

| | |
|---|---|
| Attribution | MEASURED |
| Check | `lighthouse.no-text-compression` |
| Fingerprint | `2e90d5038ef401608c20f96ef7d37ba5f20dddf26a356fab7c25712f9fe55b3d` |
| Location | `https://app.esaalnybot.tech` |

The response carried no Content-Encoding header (gzip, br, or deflate).

**Why it matters.** Uncompressed text responses transfer more bytes than necessary, which slows the page down most for visitors on a constrained connection.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following performance issue.

Problem: Response is not compressed
What was measured: The response carried no Content-Encoding header (gzip, br, or deflate).
Where: https://app.esaalnybot.tech
Why it matters: Uncompressed text responses transfer more bytes than necessary, which slows the page down most for visitors on a constrained connection.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · No caching headers set

| | |
|---|---|
| Attribution | MEASURED |
| Check | `lighthouse.no-cache-headers` |
| Fingerprint | `030c58483ed593c00574013703b1cddf9acdeab0bd69f77fb8c74a8c2f8de269` |
| Location | `https://app.esaalnybot.tech` |

The response carried neither a Cache-Control nor an Expires header.

**Why it matters.** Without a caching policy, a repeat visitor re-downloads the same response on every visit instead of reusing a cached copy.

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following performance issue.

Problem: No caching headers set
What was measured: The response carried neither a Cache-Control nor an Expires header.
Where: https://app.esaalnybot.tech
Why it matters: Without a caching policy, a repeat visitor re-downloads the same response on every visit instead of reusing a cached copy.

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

#### LOW · Uncompressed script or stylesheet

| | |
|---|---|
| Attribution | MEASURED |
| Check | `network.uncompressed-subresource` |
| Fingerprint | `837f62ba511fb0d682b63b13200010827bb9c538402849bab62900c591fd17dd` |
| Location | `https://app.esaalnybot.tech` |

3 referenced script/stylesheet resource(s) were served without a Content-Encoding header.

**Why it matters.** Uncompressed text assets transfer more bytes than necessary, adding to the time it takes the page to become interactive.

**Evidence.**

```json
{
  "count": 3,
  "sample": [
    "https://app.esaalnybot.tech/assets/index-BnuOJplz.js",
    "https://api.esaalnybot.tech/widget.js",
    "https://app.esaalnybot.tech/assets/index-11YUK2dq.css"
  ]
}
```

<details><summary>Paste-ready remediation prompt</summary>

```
Fix the following performance issue.

Problem: Uncompressed script or stylesheet
What was measured: 3 referenced script/stylesheet resource(s) were served without a Content-Encoding header.
Where: https://app.esaalnybot.tech
Why it matters: Uncompressed text assets transfer more bytes than necessary, adding to the time it takes the page to become interactive.
Evidence: {"count":3,"sample":["https://app.esaalnybot.tech/assets/index-BnuOJplz.js","https://api.esaalnybot.tech/widget.js","https://app.esaalnybot.tech/assets/index-11YUK2dq.css"]}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

</details>

---

### Testing — COMPLETE · score 100/100

The functional checks that are answerable without a scripted browser session both passed: every same-origin link on the page resolves (there are effectively none to fail — the page is a single form), and the contradiction detector — which cross-checks the audit's own output for internal inconsistency — found none. This area is thin because the meaningful functional tests for this product (can a user actually sign in, create an account, reach the dashboard) all live behind authentication, which this audit does not cross.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `playwright-runner` | CODE | 0 finding(s) · 193 ms |
| `contradiction-detector` | CODE | 0 finding(s) · 0 ms |

_No defects measured in this area._

---

### Design — COMPLETE · score 100/100

No automated rendering defect was measured. Full-page screenshots were captured at 1440px and 390px; horizontal overflow is 0px at both, so the responsive layout holds. The design-critique capability (impeccable) is an AI-layer check and contributes only to the prompt — with no runtime model it produced no output, so the observations below are AI-layer judgments from the captured screenshots, marked AI_JUDGMENT. They are opinions, not measurements, and do not affect the score.

**Capabilities run:**

| Capability | Layer | Result |
|---|---|---|
| `screenshot-capture` | CODE | 0 finding(s) · 669 ms |
| `impeccable` | AI | AI layer — prompt contribution only (no runtime model) |

#### LOW · Sign-in page uses a personal gmail.com support address

| | |
|---|---|
| Attribution | AI_JUDGMENT |
| Check | `ai.ui.judgment.support-address` |
| Fingerprint | `ai.ui.judgment.support-address` |
| Location | — |

The footer of the sign-in card reads "Need help? Contact helpesaalnybot@gmail.com". For a paid B2B chatbot platform, a free-mail support address on the authentication screen undercuts the otherwise professional presentation.

**Why it matters.** Prospects evaluating the product form a trust impression at the login screen; a gmail.com address signals a smaller / less established operation than the UI otherwise conveys.

<details><summary>Paste-ready remediation prompt</summary>

```
Replace the support contact on the sign-in page with an address on the product domain (e.g. support@esaalnybot.tech) and set up forwarding if a real mailbox does not exist yet.
```

</details>

#### LOW · Password field renders a dot-string placeholder that looks pre-filled

| | |
|---|---|
| Attribution | AI_JUDGMENT |
| Check | `ai.ui.judgment.password-placeholder` |
| Fingerprint | `ai.ui.judgment.password-placeholder` |
| Location | — |

The empty password input shows a row of bullet characters as its placeholder. At a glance the field looks already populated, which can make a returning user hesitate or click into it expecting to clear a value.

**Why it matters.** Minor friction at the most important conversion point on the site — the moment a user signs in.

<details><summary>Paste-ready remediation prompt</summary>

```
Give the password input a normal text placeholder (e.g. "Enter your password") or no placeholder at all, rather than a string of dots.
```

</details>

#### LOW · Low-contrast helper text below the form

| | |
|---|---|
| Attribution | AI_JUDGMENT |
| Check | `ai.ui.judgment.helper-text-contrast` |
| Fingerprint | `ai.ui.judgment.helper-text-contrast` |
| Location | — |

The "Don't have an account?" and "Need help?" lines are set in a light grey on white that appears to sit near or below the WCAG AA 4.5:1 contrast threshold for small text. The primary form elements themselves have good contrast.

**Why it matters.** Users with low vision or on dim/glare-affected screens may not see the account-creation and support links, which are the two secondary actions on the page.

<details><summary>Paste-ready remediation prompt</summary>

```
Darken the secondary helper text under the sign-in form to meet WCAG AA (4.5:1) contrast against the white card background; verify with a contrast checker.
```

</details>

#### INFO · Layout, hierarchy and responsiveness are well executed

| | |
|---|---|
| Attribution | AI_JUDGMENT |
| Check | `ai.ui.judgment.positive` |
| Fingerprint | `ai.ui.judgment.positive` |
| Location | — |

Noted for balance: the card is well-centred with generous, even whitespace; the eyebrow / H1 / subtext / form rhythm gives a clear reading order; there is exactly one primary action (the dark "Sign in" button) with no competing focal point; and the layout reflows cleanly to 390px with no horizontal scroll. This is a solid baseline to build the rest of the marketing surface on.

**Why it matters.** No action needed — this is what the rest of the public surface should match.

<details><summary>Paste-ready remediation prompt</summary>

```
No change required.
```

</details>

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
| HIGH | Security | Missing Content-Security-Policy header | MEASURED | `bb1ba10556658a69` |
| HIGH | Search visibility | Missing H1 heading | MEASURED | `aa72d53ff3e1c5b5` |
| MEDIUM | Security | Missing X-Frame-Options header | MEASURED | `ebb7b4eb1cdfc0b9` |
| MEDIUM | Security | Missing X-Content-Type-Options header | MEASURED | `6bbdd40137edb56c` |
| MEDIUM | Security | Missing Strict-Transport-Security header | MEASURED | `eb5e2ba4cef56f2f` |
| MEDIUM | Search visibility | Missing meta description | MEASURED | `e79a4e5dd62722c7` |
| MEDIUM | Performance | Response is not compressed | MEASURED | `2e90d5038ef40160` |
| LOW | Security | Missing Referrer-Policy header | MEASURED | `0f84fbcf0da072cc` |
| LOW | Security | Missing Permissions-Policy header | MEASURED | `6c76a34c5e27096e` |
| LOW | Security | Server header discloses a software version | MEASURED | `15921e961bb545e6` |
| LOW | Search visibility | Missing canonical link | MEASURED | `eeb8c682908aca67` |
| LOW | Search visibility | Thin content | MEASURED | `de71ed1e547899ac` |
| LOW | Performance | No caching headers set | MEASURED | `030c58483ed593c0` |
| LOW | Performance | Uncompressed script or stylesheet | MEASURED | `837f62ba511fb0d6` |
| LOW | Design | Sign-in page uses a personal gmail.com support address | AI_JUDGMENT | `ai.ui.judgment.s` |
| LOW | Design | Password field renders a dot-string placeholder that looks pre-filled | AI_JUDGMENT | `ai.ui.judgment.p` |
| LOW | Design | Low-contrast helper text below the form | AI_JUDGMENT | `ai.ui.judgment.h` |
| INFO | Design | Layout, hierarchy and responsiveness are well executed | AI_JUDGMENT | `ai.ui.judgment.p` |

---

_Generated by `showcase-esaalnybot`. Raw data: `data/audit.json`. Dashboard: `pnpm --filter showcase-esaalnybot serve`._
