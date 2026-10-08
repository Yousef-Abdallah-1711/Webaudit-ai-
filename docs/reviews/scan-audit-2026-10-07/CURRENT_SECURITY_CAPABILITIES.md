# Current Security Capabilities

Read-only audit, 2026-10-07. All claims evidenced against `packages/capabilities-vendored/*`
source read in full (not sampled).

## Full scanner inventory — SECURITY module (5 capabilities, all `layer: CODE`)

| Capability | File | Mechanism | What it measures | Pass/fail logic | Reverify |
|---|---|---|---|---|---|
| `headers-checker` | `headers-checker/src/index.ts` | One `ctx.fetch` | Presence of CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy | Header absent -> finding, independently per header (5 possible findings, not 1 bundled one) | Yes, re-fetches, checks the one header |
| `owasp-checker` | `owasp-checker/src/index.ts` | One `ctx.fetch` | Cookie flags (Secure/HttpOnly/SameSite), checked per-cookie via a comma-split that respects `Expires=` internal commas; `Server`/`X-Powered-By` version disclosure via regex `\d+\.\d+` | Any cookie missing a flag -> finding (fires only on HTTPS for Secure); version-shaped header value -> finding | Yes |
| `ssl-analyzer` | `ssl-analyzer/src/index.ts` | One `ctx.fetch` | Scheme is https; HSTS header present; HSTS `max-age` >= 15,552,000s (6mo) | Deliberately scoped to header-visible facts only — `SafeResponse` carries no TLS handshake metadata, `node:tls` is ESLint-blocked for this directory by explicit design decision | Yes |
| `data-leak-scanner` | `data-leak-scanner/src/index.ts` | Source (<=200 files, <=256KB each) or fetched page | Credential-shaped strings, delegated entirely to `@webaudit/redaction`'s pattern matcher (not reimplemented here) | Any secret match -> finding | Yes, kind-granular not instance-granular (never reports PASSED while any matching-kind credential remains) |
| `dependency-scanner` | `dependency-scanner/src/index.ts` | Source only (`package.json` + lockfiles) | No lockfile beside a manifest; floating version specifiers (`*`,`latest`,`^`,`~`,bare `x`); exact-pinned version matched against an **8-entry hardcoded advisory table** (`advisories.ts`, 149 lines); deprecated-package list | Any of the four conditions -> finding | Yes, re-reads manifest; returns UNVERIFIABLE if source was destroyed (FR-090) |

No capability in this module sends a crafted payload of any kind, authenticates to the target, or tests a workflow. All five are read-only passive observers of one HTTP response or one file listing.

## Security capability matrix

| Category | Status | Evidence | Confidence |
|---|---|---|---|
| Transport headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) | IMPLEMENTED (passive presence check only) | `headers-checker` | HIGH |
| CORS misconfiguration testing | NOT IMPLEMENTED | no capability reads/evaluates `Access-Control-*` headers | HIGH |
| Cookie flags (Secure/HttpOnly/SameSite) | IMPLEMENTED | `owasp-checker` | HIGH |
| TLS configuration (protocol version, cipher suite, cert chain/expiry) | NOT IMPLEMENTED | `ssl-analyzer`'s own module comment explicitly disclaims this as out of scope by design | HIGH |
| SQL / NoSQL / command / template / LDAP / XPath / header / CRLF injection | NOT IMPLEMENTED | zero payload-sending code anywhere in the 5 capabilities | HIGH |
| Reflected / Stored / DOM / SVG XSS | NOT IMPLEMENTED | same | HIGH |
| IDOR / BOLA / privilege escalation / multi-tenant isolation **of the target** | NOT IMPLEMENTED | requires authenticated multi-account testing; no capability authenticates to the target | HIGH |
| Auth: brute force, rate-limit testing, account enumeration, session fixation, JWT validation, MFA/OTP, password-reset tokens | NOT IMPLEMENTED | no auth-flow interaction with the target exists | HIGH |
| CSRF / Origin validation / webhook verification **of the target** | PARTIAL (SameSite cookie flag only) | `owasp-checker` | HIGH |
| SSRF — platform's own outbound fetch (Fahes protecting itself) | IMPLEMENTED, unusually thorough | `packages/safe-net` (4-layer address classifier, DNS-rebinding defense, redirect revalidation) | HIGH |
| SSRF — testing whether the **customer's app** is vulnerable | NOT IMPLEMENTED | no capability sends SSRF-probe payloads to the target | HIGH |
| File upload / zip-slip / symlink / decompression bomb — platform's own upload handling | IMPLEMENTED, unusually thorough | `packages/safe-archive` | HIGH |
| File-upload vulnerability **of the customer's app** | NOT IMPLEMENTED | no capability tests the target's own upload handling | HIGH |
| Business logic (mass assignment, race conditions, price/coupon manipulation, workflow bypass) | NOT IMPLEMENTED | no workflow/scenario-aware testing exists anywhere in the codebase | HIGH |
| Data exposure: secrets/tokens in responses, stack traces, debug endpoints | PARTIAL — secrets via `data-leak-scanner`; stack traces and debug endpoints unchecked | — | HIGH |
| Data exposure: published source maps | IMPLEMENTED | `bundle-analyzer`'s `bundle.source-map-published` (PERFORMANCE module, not SECURITY — a labeling quirk) | HIGH |
| Dependency vulnerability scanning (live/current) | PARTIAL, weak | `dependency-scanner` ships an 8-entry hardcoded advisory table, not a live OSV/npm-audit/Snyk feed call — will go stale from the day it's written | HIGH |
| Secret scanning | IMPLEMENTED | `data-leak-scanner` via `@webaudit/redaction` | HIGH |
| SAST (real static analysis for vulnerability classes) | NOT IMPLEMENTED | everything is regex/manifest metrics; no AST, no dataflow, no taint tracking anywhere in `capabilities-vendored` (confirmed: no HTML/CSS/JS parser dependency exists in any of the 16 vendored packages) | HIGH |

## Marketing label vs. actual capability vs. likely user assumption

**CURRENTLY SUPPORTS**: passive HTTP response-header hygiene, cookie-flag correctness, server-version-disclosure detection, credential-pattern string matching in source or fetched markup, and a narrow static dependency-manifest check against a tiny hardcoded advisory list.

**DOES NOT CURRENTLY SUPPORT**: any active probing, authenticated testing, injection testing of any kind, access-control testing, business-logic testing, or a current/live vulnerability database.

**LIKELY USER ASSUMPTION**: a user paying 20 credits for "Security" alongside "Performance," "Design," "Testing," and "Search visibility" would reasonably expect something in the neighborhood of a vulnerability scanner or a lightweight penetration test. The actual deliverable is a passive configuration-hygiene check — closer to what `securityheaders.com` or `observatory.mozilla.org` already provide for free than to a DAST/SAST tool. This gap between label and substance is the single largest "trap" the source audit (§43 of the original brief) warns against falling into.
