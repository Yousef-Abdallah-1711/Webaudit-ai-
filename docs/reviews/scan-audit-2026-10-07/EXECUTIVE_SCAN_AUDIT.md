# Executive Scan Audit

Read-only architecture and capability audit of the Fahes / WebAudit AI scanning platform,
2026-10-07. Method: direct reading of every file cited across the eleven companion documents in
this folder, plus one independent cross-check (OpenAI Codex, `gpt-6-luna`, `--sandbox read-only`,
given the same questions with no shared context). Agreement between the two reads is the default;
the handful of points where the cross-check added precision or a correction are marked explicitly
in `CURRENT_SCAN_ARCHITECTURE.md`. A second planned cross-check (Kimi Code CLI) did not run — it
returned an account-level `403` usage-limit error before touching the repository, so the
security/performance/frontend/SEO/source capability matrices in the companion documents are
single-sourced (file-and-line evidenced, not independently cross-checked by a second model).

No file was modified, created in the repository's working set beyond this folder, deleted, or
committed in the course of this audit. See "Repository immutability" below.

## Companion documents

1. `CURRENT_SCAN_ARCHITECTURE.md` — full `/scan` pipeline, three input modes, infrastructure
2. `CURRENT_SECURITY_CAPABILITIES.md`
3. `CURRENT_PERFORMANCE_CAPABILITIES.md`
4. `CURRENT_FRONTEND_TESTING_CAPABILITIES.md`
5. `CURRENT_SOURCE_AND_TESTING_CAPABILITIES.md`
6. `CURRENT_SEO_CAPABILITIES.md`
7. `CURRENT_PRODUCTION_READINESS_ENGINE.md`
8. `CURRENT_SCAN_INFRASTRUCTURE.md`
9. `TARGET_CAPABILITY_GAP_MATRIX.md`
10. `SCAN_ARCHITECTURE_EVOLUTION_OPTIONS.md`
11. `SCAN_UI_CAPABILITY_MODEL.md`
12. This document

## Direct answers to the 55 driving questions

**1-3 — what happens on URL/repo/archive submission**: URL -> one SSRF-guarded HTTP fetch per
capability, no multi-page crawl, no real browser in any current deployment. Repository -> GitHub
OAuth-token-based **zipball fetch** (not `git clone`), no commit/branch ref currently passed through
so the default branch is always used, source read as a file listing, zero execution of customer
code. Archive -> ZIP-only, dual-budget decompression-bomb + zip-slip + symlink guard enforced before
any byte is written or credit charged, then the same regex/manifest-level checks as repo mode.

**4-8 — what each domain really tests**: Performance = response-header hygiene + a largely-inert
browser-dependent half (Core Web Vitals, render-blocking, page-weight all return nothing today) +
source-level bundle-size heuristics. Security = passive headers/cookies/version-disclosure/secrets/
an 8-entry hardcoded dependency-advisory table — zero active testing of any kind. Design = one
working check (broken `<img>` via HTTP) + an AI critique working off that reduced signal + source-
level CSS metrics; the rendering-dependent half (overflow, tap targets, screenshot liveness) is dead
today. Testing = broken same-origin links + an internal self-consistency check on the audit's own
scores — not any form of functional/unit/E2E/contract testing of the customer. Search visibility =
4 meta-tag presence checks + 3 content-structure checks — no robots.txt, no sitemap, no structured
data.

**9-11 — crawl / JS execution / real browser**: No full-site crawl exists for any capability — each
operates on one fetched page plus a bounded sample (<=15) of its direct sub-resources/links. No
capability executes customer JavaScript or runs a real browser against a customer target in current
deployments — the infrastructure for it (`apps/probe-pool`) exists as code but is not wired as a
running cross-process service.

**12-21 — SAST/DAST/injection/IDOR/rate-limit/auth/upload/SSRF/business-logic against the target**:
All **NO**. Nothing in the 16 vendored capabilities sends a crafted payload, authenticates to the
target, tests a workflow, or probes the target's own SSRF/upload handling. The platform's SSRF
(`packages/safe-net`) and archive (`packages/safe-archive`) protections defend *Fahes itself* from a
hostile target/upload, not the other way around — a distinct and frequently conflated thing.

**22-30 — load/stress/spike/soak, p50/p95/p99, CPU/RAM/DB/N+1/leaks**: All **NO** for customer
targets. A k6-based load-testing harness exists but is wired exclusively to Fahes's own
`/auth/login` and scan-creation endpoints with seeded internal test users — it has never been
pointed at a customer target and has no `ModuleType`/credit/UI presence. Backend metrics
(CPU/RAM/DB/N+1/leaks) are structurally unreachable from an external URL-only audit with no
telemetry-ingestion mechanism for customer infrastructure — a missing data source, not merely a
missing feature.

**31-38 — visual regression/responsive/states/a11y/RTL/cross-browser/offline/content-stress against
targets**: All **NO** for customer targets, and all share the same root blocker: no operative
browser pool. The code for several (layout overflow, tap targets) is already written and waiting on
that one piece of infrastructure.

**39-41 — authenticated apps / business workflows / safe customer-code execution**: No authenticated
scanning exists (no credential/session/token field anywhere in the scan request schema). No
workflow/scenario engine exists — Fahes understands pages and checks, not multi-step business
processes (register -> verify -> login -> checkout). Customer code is never executed — confirmed
directly from sandbox-runner's build-harness, which bundles and runs Fahes's own harness, never the
customer's scripts.

**42 — can the worker support long-running jobs**: Not without new plumbing. The queue architecture
generalizes, but `attempts:1`-with-refund-on-failure and short (15-minute scan-wide, AI-chain-
derived module-level) timeouts are tuned for short deterministic work; a multi-hour job needs its
own queue, timeout constant, and failure/recovery semantics — additive work, not a rewrite.

**43-44 — finding schema / report depth**: The `Issue.evidence: Json?` field is flexible enough to
hold arbitrary structured data, and `AiInvocation`/`CapabilityExecution` already meter cost/tokens/
latency per execution, but there is no typed support for time-series/percentile data, visual-diff
images, accessibility-tree nodes, or HTTP request/response pairs as first-class queryable fields —
everything beyond a flat finding would live inside the opaque JSON blob. No `IssueState` value
exists for false-positive/waiver/accepted-risk/suppression (`OPEN/ASSERTED_FIXED/RESOLVED/
UNVERIFIABLE/REOPENED` only) — a gap the original audit brief specifically anticipated as important
for future security testing, and it is confirmed absent.

**45 — can readiness aggregate future scanners**: Yes, with the ~5-file `ModuleType`-enum friction
noted in the gap matrix.

**46 — can credits support expensive scanners**: Partially. The metering primitive
(`CapabilityExecution.costMicros`) already exists for AI spend; the pricing function (`AREA_COST`)
is a flat constant that does not consume it yet. Extending pricing to be duration/resource-aware is
a real but bounded change.

**47 — is `/scan` extensible**: As a rendering surface, yes (the domain list is enum-driven, not
hardcoded markup). As a configuration surface, no — it has zero fields for anything the five fixed
domains don't already need.

**48-50 — what fits / needs extension / needs new engines**: Fits directly: queue skeleton, credit
mechanics, readiness aggregation, reverify pattern, capability-SDK contract, AI-layer assembly
design. Needs extension: `ModuleType` enum, pricing-to-metering wiring, the dependency-advisory
feed, staged-upload retention. Needs genuinely new engines: active/authenticated security testing,
untrusted-code execution sandboxing, customer-target load/capacity generation, a working browser-
pool service (prerequisite for several already-written capabilities), an authorization/scope/
environment/kill-switch data model.

**51 — current maturity per domain** (Level 0-5 scale defined below): Security L2 (structured,
passive). Performance L1-2 (operative half L1; specified-but-dead half would be L2). Frontend L1
(one operative check + one AI call on reduced signal). Accessibility L0 (no customer-target testing
exists). Testing L1 (link-checking + audit self-consistency). SEO L1-2. Source Analysis L1 (regex/
manifest metrics, no AST). Production Readiness L2 (config-driven thresholds + fingerprint
regression diff is a genuinely solid mechanism).

**52 — what's needed for Level 5**: Per-domain adversarial/authorized-staging capability, a real
browser-pool service, an authorization-and-scope data model with kill-switch/audit-log/environment-
classification, an untrusted-code sandbox, and a load-generation engine decoupled from Fahes's own
internal auth model — none of which exist today, several of which (readiness, reverify, capability-
SDK, credit metering primitive) provide a genuinely reusable foundation to build on top of.

**53-54 — is the vision realistic / realistic within the current architecture**: The vision is
technically realistic — nothing in it is exotic engineering. It is **not** reachable by
configuration changes to the current architecture. The current engine is a well-built, honestly-
scoped **passive, URL/source-metadata audit platform** with unusually careful safety engineering
(SSRF address classification, zip-slip/decompression-bomb defense, sandbox timeout/memory limits,
prompt-injection-resistant AI assembly) for the narrow thing it does. The gap to "authorized staging
pentest + load/capacity + authenticated workflow testing" is the **absence of several entire
execution systems** (active security, untrusted-code sandboxing, load generation, browser rendering
as a live service, an authorization/scope data model) that the current engine was never built to be
— it is not a depth problem inside existing capabilities.

**55 — what to preserve**: The capability-SDK contract and its vendored/installed trust split, the
fingerprint-based finding-identity model (readiness regression and reverify both depend on it and
both work well), the AI-layer's labelled-segment prompt-injection defense, the credit reservation/
refund discipline, and the "code layer measures, AI layer only interprets" separation (with the
caveat, confirmed independently, that AI output can also contribute its own judgment findings
layered on top — the separation is about primacy, not about AI never producing a finding at all).
These are structurally sound and should anchor whatever gets built next.

## Capability maturity scale (as defined by the audit brief, applied consistently above)

- **Level 0** — not present.
- **Level 1** — basic signal (e.g. checks one response header).
- **Level 2** — structured check (multiple deterministic checks with evidence).
- **Level 3** — deep automated assessment (browser/source/application-aware testing).
- **Level 4** — authenticated/stateful assessment (roles, sessions, workflows, customer test data).
- **Level 5** — adversarial/capacity assessment (authorized staging attack simulation, load/stress/
  soak, business-logic adversarial testing).

## Architecture fit decision

| Area | Verdict |
|---|---|
| Security | **NO — fundamental rearchitecture required.** No active-probing concept exists anywhere in the current engine. |
| Performance | **PARTIALLY.** Existing capabilities activate once the browser pool is wired (extension, not rewrite); load/capacity testing needs an entirely new engine. |
| Frontend / Accessibility | **PARTIALLY.** Same browser-pool dependency unlocks real gains cheaply; visual regression and accessibility still need new engines layered on top. |
| Source Analysis | **NO.** Regex/manifest metrics cannot become SAST or execution-based testing without new tooling (AST parsing, sandboxed execution of untrusted code). |
| Business Logic | **NO — fundamental rearchitecture required.** No scenario/workflow concept exists at all, at any layer. |
| Production Readiness | **YES — current architecture fits,** with mechanical extensions for new `ModuleType`s. |

## Repository immutability

```
git branch --show-current     -> main
git rev-parse HEAD             -> 2e1e3bbd6ce37afa062706f078c7c3123c7b0ce5
git rev-parse origin/main      -> 2e1e3bbd6ce37afa062706f078c7c3123c7b0ce5
```

No `Edit`, `Write`, or git-mutating command was issued against any existing repository file during
the investigation phase of this audit. A concurrent session was independently modifying several
auth/marketing files throughout (pre-existing diff at session start, which continued to grow during
the audit, plus one additional file appearing in the diff) — none of that activity originated from
this audit; it is flagged, not caused, here. The only files this audit created are the twelve
Markdown documents in this folder (`docs/reviews/scan-audit-2026-10-07/`), written after the
investigation concluded and at the user's explicit request, as untracked files — nothing has been
staged or committed.

**FINAL VERDICT: CURRENT SCAN ARCHITECTURE FULLY MAPPED — GAP ANALYSIS COMPLETE — NO EXISTING FILES
MODIFIED**
