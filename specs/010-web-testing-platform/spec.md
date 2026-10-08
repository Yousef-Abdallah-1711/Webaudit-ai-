# Feature Specification: Web / UI / Accessibility / Functional Web / SEO Testing Platform
(consolidates E10 + E11 + D22 + D23 + the web-facing portion of D24 + D25)

**Feature Branch**: `010-web-testing-platform`

**Created**: 2026-10-07

**Status**: Planning complete — frozen for downstream specs, following a dedicated closure pass
(2026-10-08) that corrected a genuine data-model defect found in the original draft (`VisualBaseline`
persistence, `data-model.md`'s own Closure Finding CF-1), closed the Domain Check Registry's
recursion/idempotency lifecycle, resolved F01's navigation-vs-subresource scope semantics against
F01's own frozen text, closed crawler budget/dedup race conditions, and confirmed one additional
product-policy decision (approved-baseline retention, FR-026a). `/speckit-implement` and
`/speckit-converge` are **not** run against this feature. No application code, Prisma migration,
queue, or production behavior changes.

**Downstream contract freeze** (mirroring 009's own identical header-level block): every future
Engine spec and product-testing spec that performs web-facing testing — most directly SPEC 012
(Security/Auth/API/Business-Logic, when it needs to drive a browser against an authenticated
session) and SPEC 013 (Performance/Load/Capacity/Observability, when it consumes this platform's
navigation/resource-timing Evidence) — MUST consume this spec's frozen contracts (`BrowserMatrixEntry`/
`PageIdentity`/the Domain Check Registry's `WebCheckDefinition` shape/the six-value coverage
taxonomy/the `IdempotentClaim`+`CrawlBudgetCounter` idempotency primitives) rather than inventing a
private browser-execution, crawl-discovery, or check-dispatch mechanism of its own. No future spec
MAY widen 009's `ExecutionUnitClass` for a concern this spec's own Domain Check Registry already
resolves without doing so. A future spec that genuinely cannot fit one of these frozen contracts
MUST raise an explicit upstream amendment request against this spec, per this spec's own Edge
Cases' governance rule (inherited from 006/009's identical model) — it MUST NOT silently diverge.

**Consolidation note**: this spec is the single planning package for what the roadmap previously
named as six separate items — **E10** (Browser/Probe Engine), **E11** (Crawler Engine), **D22**
(Frontend/UX), **D23** (Accessibility), the web-facing slice of **D24** (Functional Testing), and
**D25** (SEO) — planned together because they share one discovery/evidence infrastructure. The
planning *granularity* changed; the *architectural boundaries* did not. This spec is organized
around **six internal areas across two kinds**: two **Engines** (Browser/Probe, Crawler) that
execute against the target and produce typed Evidence, and four **Domains** (Frontend/UX,
Accessibility, Functional Web, SEO) that consume Evidence and materialize Findings through
deterministic, versioned checks. **Engine ≠ Domain** is this spec's own instance of the general
rule `specs/006-scan-architecture-v2/spec.md` established (Constitution Principle VIII, "Engines
Serve Domains") and `specs/009-core-scan-execution-platform/spec.md` FR-004 restated one layer
down (domain → execution class → execution unit); this spec adds nothing that collapses it.

**Input**: User description: "SPEC 010 — Web / UI / Accessibility / Functional Web / SEO Testing
Platform. Consolidates E10 Browser/Probe Engine, E11 Crawler Engine, D22 Frontend/UX, D23
Accessibility, the web-facing portion of D24 Functional Testing, and D25 SEO into one Product Spec,
without collapsing their architectural boundaries. Must consume frozen 006/007/008/009 — never
create a private replacement for ScanPlan/ExecutionGraph/ExecutionUnit/queues/progress/
cancellation/recovery/Evidence/Artifact/Finding provenance/reverify. Must design: a real Browser/
Probe execution service (the existing `apps/probe-pool` Playwright code is real but entirely
unwired); a real bounded Crawler (today's scanning is single-page/HTTP-only); Frontend/UX
(responsive, visual-structural, state, content-stress, RTL/i18n); Accessibility (WCAG-oriented,
honest about automation limits — zero accessibility-testing capability exists today for customer
targets); Functional Web (bounded workflow catalog, form-safety classification — no arbitrary
customer JavaScript); SEO (indexability, structured data, sitemap — current `meta-checker`/
`content-checker` cover only a narrow slice of what the product's own AI prompt already claims).
Must threat-model the browser/crawler execution itself (SSRF, tenant isolation, crash recovery) and
define a bounded-execution/budget model so a scan cannot combinatorially explode across pages ×
browsers × viewports × locales. Must NOT start SPEC 011 (source/backend testing), SPEC 012 (active
security testing), or SPEC 013 (load/performance testing) — those remain separate specs this one
only exposes extension points for." (Full triggering brief supplied in the session that created
this spec. Current-state infrastructure claims are drawn from this session's own direct reads and
three parallel research passes over `apps/probe-pool`, `packages/capability-sdk`, every package
under `packages/capabilities-vendored/`, `apps/worker/src/orchestrator/orchestrator.ts`,
`apps/api/prisma/schema.prisma`, `packages/scoring/src/fingerprint.ts`, `packages/redaction`,
`packages/config/src/pricing.ts`, `apps/web/components/scan/ScanForm.tsx`, and
`apps/api/src/services/storage/reports.ts` — treated as settled fact, not re-derived.)

**A note on template fit**: like F01/F07/009, this is a foundation/platform-contract spec, but
unlike those three — which each finalize a backbone with no testing logic of its own — this spec's
charter is to turn that backbone into the *first* real testing capability built on top of it, across
six internal areas that must stay architecturally distinct while sharing one discovery/evidence
substrate. Its "users" are: (a) a future implementer wiring `apps/probe-pool` into a real dispatch
path; (b) the authors of SPEC 011-014, who need this spec's own extension points (not a redesign of
009) for their own domains; (c) an operator who needs honest coverage reporting, not a system that
silently treats a skipped check as a pass; (d) a customer who needs an Accessibility/SEO/visual
report that never overclaims what automation actually proved.

## Clarifications

### Session 2026-10-07

- Q: Should Functional Web Testing support customer-authored, app-specific workflows (e.g. a
  checkout wizard), or only a Fahes-declared catalog of common interaction patterns? → A:
  Fahes-declared bounded catalog only (product-policy decision, confirmed by the user this
  session — not inferable from repository evidence). No customer-authored workflow DSL, editor, or
  storage surface exists in this spec (FR-031). A future spec MAY extend this additively if product
  direction changes; this spec does not design that extension point speculatively.
- Q: Does a captured screenshot become a visual-regression baseline automatically on first capture,
  or only after explicit user approval? → A: User-controlled approval (product-policy decision,
  confirmed by the user this session). Until a screenshot is explicitly approved, no
  `SCREENSHOT_DIFF` finding is ever raised for that page/browser-matrix-entry combination — only
  FR-023's deterministic structural checks run regardless of baseline state (FR-026,
  `contracts/visual-baseline-contract.md`).
- Q: Does `robots.txt` constrain where the Crawler/Browser Engines are willing to go, or does it
  only inform the SEO domain's own indexability evidence? → A: Informational only for SEO
  (product-policy decision, confirmed by the user this session). F01's `TargetAuthorization`/Scope
  remains the sole permission boundary for an authorized scan (FR-021); `robots.txt` content is
  evidence the SEO domain evaluates for what a *search engine* would respect, never a boundary this
  spec's own engines enforce on themselves.
- Q: Does this spec need its own new `ExecutionUnitClass` value for "run the deterministic domain
  checks against evidence just produced," given Browser/Crawler Engines only *produce* Evidence and
  explicitly must not *decide* Findings themselves? → A: No — found during this spec's own
  architecture pass, resolved the same way 009 treated its own frozen-sibling-enum caution: widening
  009's `ExecutionUnitClass` casually for a concern 009 never anticipated would repeat exactly the
  mistake 009 itself avoided with F01's `ExecutionClass`. Domain-check evaluation instead runs as
  ordinary, synchronous, parent-worker-side computation triggered by each committed `Evidence` row
  (never inside the isolated child process, never as a second `ExecutionUnit`) — see FR-001a and
  `contracts/web-check-registry-contract.md`. This is new orchestration *within* this spec's own
  territory, consuming 009's `recordEvidence`/`materializeFinding` exactly as published, and
  requires zero change to 009's own enum or contracts.
- Q: Do `ModuleType`'s current five values (`PERFORMANCE`/`SECURITY`/`UI`/`TESTING`/`SEO`,
  `apps/api/prisma/schema.prisma:28-34`) already cover this spec's four Domains, or does this spec
  need new values? → A: Two new, additive enum values are needed — `ACCESSIBILITY` and
  `FUNCTIONAL` — confirmed by direct schema read finding neither exists today and no other value's
  name plausibly covers them. `UI` is reused for the Frontend/UX domain and `SEO` is reused for the
  SEO domain (both already fit). This is the one touch this spec makes to an existing, live
  (non-frozen-spec-owned) schema enum, and it is of a materially different, lighter kind than the
  `@relation`-edit caution 006/007/008/009 each avoided: a Postgres `ALTER TYPE ... ADD VALUE` never
  rewrites, locks, or changes the meaning of any existing row's current value — it is pure addition.
  See FR-003 and `research.md` R1 for the full feasibility proof.

### Session 2026-10-08 (closure pass)

- Q: An **approved** `VisualBaseline`'s screenshot is an `Artifact` tied to the scan that captured
  it; under 009's own report-retention-parity sweep, should it expire with that scan's report, or
  survive independently? → A: Survives independently (product-policy decision, confirmed by the
  user during this closure pass — not inferable from the original spec, which this session's own
  prior pass correctly declined to invent). An active, approved baseline's `Artifact` is excluded
  from its originating scan's own retention sweep (FR-026a, `data-model.md`'s own retention
  section) — this is the only choice that makes visual regression actually useful across scans
  over time; the alternative (expire with the originating scan) would silently stop visual
  regression working for any page whose first-approved-baseline scan ages out, which this spec's
  own User Story 3 (never overclaim, never silently degrade) argues directly against.
- Q: Does F01's own frozen `scope-matching-contract.md` text ("every single time a browser follows
  a redirect, loads a cross-origin resource, or a crawler expands its frontier") require a fresh
  scope check for every incidental page subresource (fonts, CDN scripts, analytics, third-party
  embeds), and if so, does that make ordinary web page rendering impossible against any reasonable
  `ScopeDefinition`? → A: Resolved as an interpretation of F01's own text for this spec's own
  consuming purposes (F01's document is untouched) — "destination" in F01's three illustrative
  examples (a redirect, a crawl-frontier expansion, a workflow step) shares one common thread: each
  is a destination the *engine itself* deliberately chooses to pursue, not a resource the browser's
  own rendering engine fetches automatically and incidentally. This spec therefore scopes F01's
  fresh-check obligation to engine-chosen destinations (navigation, redirect-of-navigation, popups,
  crawl-frontier expansion, workflow `navigate` steps) and leaves ordinary page subresources to
  `packages/safe-net`'s own unconditional SSRF/egress policy — weakening neither F01 (every
  destination its own examples describe keeps its fresh check) nor SSRF protection (safe-net's own
  policy is unconditional, a strictly stronger guarantee for subresources than a scope check would
  provide). See `research.md` R13 for the full textual analysis and `contracts/browser-execution-
  contract.md`'s own closure-pass revision.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A future engine/domain implementer gets one place to plug in (Priority: P1)

An engineer implementing the Browser/Probe Engine (E10), the Crawler Engine (E11), or any of the
four Domains needs a single, coherent answer for "how does my engine's work become Evidence, how
does Evidence become a Finding, how do I report coverage honestly" — not a redesign of SPEC 009 and
not a private evidence store invented because this spec left a gap.

**Why this priority**: this is the entire reason planning granularity changed from six roadmap items
to one spec — six independently-planned items create the exact risk 009's own consolidation
rationale named: one item assuming a browser-isolation model another item designs differently, or
one domain inventing its own coverage taxonomy incompatible with a sibling's.

**Independent Test**: take a (not-yet-written) future `/speckit-plan` for the Accessibility domain's
own implementation and confirm every cross-area reference it needs (how Browser-Engine Evidence
reaches it, how its own check registers, how a finding's provenance traces back through
`IssueEvidenceLink` to the exact page/browser-matrix-entry/execution unit, how reverify works for
one of its findings) is answered once, in this spec's `contracts/`.

**Acceptance Scenarios**:

1. **Given** this spec's completed contracts, **When** a future implementer asks "how do I register
   one deterministic check for my domain," **Then** they find exactly one `WebCheckDefinition` shape
   (`contracts/web-check-registry-contract.md`) naming its required Evidence kinds, automatability
   tier, and fingerprint-parts template — never three different domain-specific answers.
2. **Given** the same contracts, **When** they ask "what happens if my check cannot run on a given
   browser family," **Then** they find one authoritative coverage taxonomy (FR-041) producing
   `UNSUPPORTED`, never a domain-specific silent skip indistinguishable from `PASS`.

---

### User Story 2 - An operator can prove a scan actually tested what it claims, not silently skipped it (Priority: P1)

A customer or operator reviewing a report needs to know, for every requested domain, exactly which
pages/browsers/checks ran, which were genuinely not applicable, which were unsupported on a given
browser, and which never ran at all — never a report that silently presents missing coverage as a
clean pass.

**Why this priority**: tied for P1 because this is the master brief's own explicit test (§44: "Do
not silently treat missing execution as PASS") and because a future Production Readiness spec's own
scoring is only trustworthy if this platform's coverage facts are trustworthy first.

**Independent Test**: resolve a plan covering all four domains against a target where one browser
family is unsupported for one check, one page is unreachable, and one workflow step is blocked by
scope; confirm the report's own coverage summary names every one of these outcomes distinctly.

**Acceptance Scenarios**:

1. **Given** an Accessibility check whose automatability tier is `HUMAN_JUDGMENT_REQUIRED`, **When**
   a report is generated, **Then** the report states that tier explicitly next to any result for
   that check — it is never presented with the same confidence as an `AUTOMATED` check's result.
2. **Given** a crawl that reached 40 of an estimated 120 pages before its `discoveryBudget` was
   exhausted, **When** the SEO domain's orphan-page logic runs, **Then** it reports zero orphan-page
   findings for any page outside the 40 actually reached, naming the coverage limitation explicitly
   rather than asserting orphan status from insufficient data (FR-038).

---

### User Story 3 - A customer's report never overclaims what automation proved (Priority: P2)

A customer reading an Accessibility or visual-regression finding needs to trust that Fahes is not
claiming more than it actually, deterministically measured — no fabricated contrast score, no "100%
WCAG compliant," no visual-regression noise from an unapproved baseline.

**Why this priority**: lower than User Stories 1-2 because it is a direct *consequence* of getting
the coverage taxonomy and baseline-approval lifecycle right, not an independent design surface — but
it is the master brief's own repeated, explicit instruction (§24, §27, §12) and this session's own
confirmed product-policy decision on visual baselines.

**Independent Test**: capture a screenshot with no prior approval, confirm zero `SCREENSHOT_DIFF`
finding is raised for it; separately, run the contrast check against an element with a background
image, confirm it reports `INCONCLUSIVE` rather than a numeric score.

**Acceptance Scenarios**:

1. **Given** a freshly-captured screenshot with no existing `VisualBaseline` approval, **When** the
   same page is scanned again, **Then** no visual-regression finding is produced until a human
   explicitly approves a baseline (FR-026).
2. **Given** a contrast check against an element whose background is a CSS gradient, **When** the
   check runs, **Then** it reports `INCONCLUSIVE` for that element with a stated reason, never a
   fabricated numeric ratio (FR-030).

### Edge Cases

- **A Browser-Engine ExecutionUnit's page triggers a file download, a popup, or a `javascript:`/
  `data:`/`blob:` navigation** → per FR-012, the browser context's own permission/download/popup
  policy refuses or sandboxes this by default; it is recorded as Evidence (what was attempted), never
  silently followed as if it were an ordinary navigation.
- **A Crawler-class unit's frontier discovers a URL outside its own grant's Scope mid-crawl** → per
  F01's own scope-matching-contract redirect/cross-origin/crawl-frontier rule (reused unchanged) and
  009's own identical Edge Case, the child `ExecutionUnit` is never created — recorded
  `REFUSED_OUT_OF_SCOPE` in the parent's own `CRAWL_DISCOVERY` evidence (FR-017).
- **Two domains' checks both need the same Browser-Engine Evidence (e.g. a DOM snapshot feeding both
  Accessibility and SEO)** → the Evidence row is produced once; the Domain Check Registry dispatches
  it to every registered check that declares a matching required-kind — no domain re-fetches or
  re-renders the page for its own copy (FR-001, FR-001a, `contracts/web-check-registry-contract.md`).
- **A worker crashes after claiming a check-execution slot (`IdempotentClaim`) but before writing
  its `CHECK_RESULT`** → the claim remains with `resultRef: null`; after a fixed staleness window
  it is eligible for exactly one re-claim by the next qualifying Evidence commit, guaranteeing
  eventual completion without ever producing two `CHECK_RESULT` rows for the same identity
  (FR-041a, `research.md` R15, `data-model.md`'s own claim/retry semantics).
- **Two concurrent crawler discovery workers both reach the last remaining page-budget slot at the
  same instant** → `CrawlBudgetCounter`'s single atomic conditional-increment statement serializes
  them at the database row-lock level; exactly one wins the slot, the other records `BUDGET_
  EXHAUSTED` — the ceiling is never exceeded regardless of concurrency (FR-020, `research.md` R16).
- **A `discoveryBudget` is exhausted while unvisited links remain in the frontier** → the crawl
  terminates cleanly at its budget, the coverage summary states the truncation explicitly (FR-020),
  and no domain check (particularly SEO's orphan-page logic, FR-038) treats the unreached remainder
  as proven absent or proven present.
- **A workflow step's own action-safety classification (FR-032) is `SERVER_SIDE_PERSISTENT_MUTATION`
  but the Target's current `TargetAuthorization` does not permit it** → the step is refused before
  it runs (F01's existing `isAuthorized` check, reused unchanged); this spec invents no new grant
  type to make the step permissible — the workflow simply does not execute that step for this target.
- **A reverify is requested for a Finding whose origin was an orphan-page (sitewide-coverage-
  dependent) SEO finding** → per FR-043's named exception, this reverify cannot be a single-page
  minimal plan; it must re-resolve with the same crawl scope the original finding's coverage actually
  depended on, still fresh against F01/F07, never reusing the original crawl's own stale evidence.
- **A `VisualBaseline` is pending approval when the scan that captured its candidate screenshot is
  retention-swept** → the candidate screenshot (an `Artifact`) is swept per 009's own FR-034 report-
  retention-parity rule exactly as any other artifact; an unapproved baseline simply never gets
  approved after that point — this spec invents no separate, longer retention tier for pending
  approvals (FR-026's own lifecycle, `contracts/visual-baseline-contract.md`).

## Requirements *(mandatory)*

### Cross-Cutting — Platform Integration & Taxonomy

- **FR-001**: This spec MUST organize its six areas into exactly two kinds, never blurring the
  distinction: **Engines** (Browser/Probe, Crawler) that execute against the target and produce
  typed `Evidence` (009's own model, consumed unchanged), and **Domains** (Frontend/UX,
  Accessibility, Functional Web, SEO) that register deterministic `WebCheckDefinition`s consuming
  that Evidence and materializing Findings through 009's own `materializeFinding`. An Engine MUST
  NOT decide a Finding; a Domain MUST NOT execute against the target directly.
- **FR-001a (Domain Check Registry dispatch location — added during this spec's closure pass to
  replace a stale `FR-xxx` placeholder found in the original draft's Edge Cases/Clarifications)**:
  Domain-check evaluation MUST run as ordinary, synchronous, parent-worker-side computation
  triggered by newly-committed, non-`CHECK_RESULT` Engine-produced Evidence — never inside an
  Engine's own isolated child process, and never as a second `ExecutionUnit`/a new `ExecutionUnit
  Class` value. `CHECK_RESULT` Evidence is permanently excluded from the set of kinds that can
  trigger this computation (structural, not developer-discipline, per `research.md` R15) — this is
  what makes the registry's own output recursively re-triggering itself impossible by construction.
  See `contracts/web-check-registry-contract.md`.
- **FR-002**: This spec MUST NOT create a private replacement for any of: `ScanPlan`/
  `ExecutionGraph`/`ExecutionUnit` (009), queue/dispatch/progress/cancellation/recovery (009),
  `Evidence`/`Artifact` (009), Finding provenance (009), or `isAuthorized`/Scope-matching/
  `safetyCheckpoint` (F01/F07). Every new mechanism this spec defines is additive orchestration
  consuming those contracts exactly as published.
- **FR-003 (ModuleType extension — this spec's own Clarifications)**: This spec MUST extend the
  existing `ModuleType` enum (`apps/api/prisma/schema.prisma:28-34`) with two new, additive values:
  `ACCESSIBILITY` and `FUNCTIONAL`. `UI` is reused for the Frontend/UX domain; `SEO` is reused for
  the SEO domain. This is an additive `ALTER TYPE ... ADD VALUE` touch to an existing enum — it
  changes the meaning of zero existing rows and requires zero `@relation` edit to any model, and is
  therefore categorically lighter than the `@relation`-edit caution 006/007/008/009 each exercised
  toward frozen-spec-owned models; `ModuleType` is live product schema, not a frozen upstream
  spec's own entity.
- **FR-003a (activation touchpoints — added during this spec's closure pass)**: Adding
  `ACCESSIBILITY`/`FUNCTIONAL` to `ModuleType` does **not**, by itself, make either value
  operational in a real scan. Before either may appear in a priced quote, a scored report, or the
  scan-creation UX, a future implementation MUST also update: `packages/config/src/pricing.ts`'s
  `AREA_COST` map (no price exists for either value today); `apps/web/components/scan/
  ScanForm.tsx`'s `ALL_AREAS` array (today's five-value list, unchanged by this planning pass,
  FR-051); any exhaustive `switch`/lookup over `ModuleType` in scoring, readiness, or report-
  rendering code that does not already have a default/fallback branch (a future implementation's
  own obligation to find and update, not assumed exhaustively enumerated by this planning pass);
  and the AI-prompt-assembly registry if either domain's own AI-layer contribution is to be wired
  in. FR-051's strict-parallel-run guarantee already covers the enum addition itself; this FR exists
  only to prevent a future reader from mistaking "the enum values exist" for "the domains work."
- **FR-004**: The domain → execution-class mapping for this spec's four Domains MUST be resolved
  through 009's own existing three-layer chain (FR-004 of 009) — this spec supplies the mapping
  table (`plan.md`'s Domain/Engine Matrix), never a new resolution mechanism. `UI`/`ACCESSIBILITY`/
  `FUNCTIONAL` each require `BROWSER` (009's `ExecutionUnitClass`) for any check needing a rendered
  page; `SEO` requires `BROWSER` only for its rendered-vs-static checks (FR-040) and otherwise
  remains `PASSIVE_HTTP` (today's unchanged path, FR-005); any Domain's checks needing multi-page
  discovery additionally require `CRAWLER`.
- **FR-005 (parallel-run parity)**: Every existing HTTP-only capability (`meta-checker`,
  `content-checker`, `network-inspector`, `css-analyzer`'s static half, `lighthouse-analyzer`'s
  header half, the link-integrity logic inside today's misnamed `playwright-runner`) MUST continue
  dispatching through today's unchanged orchestrator/`CapabilityExecution` path with zero behavior
  change — confirmed real, working, `ctx.fetch`-only code
  (`packages/capabilities-vendored/{meta-checker,content-checker,network-inspector,css-analyzer,
  lighthouse-analyzer,playwright-runner}/src/index.ts`) that this spec does not touch.

### Browser / Probe Engine

- **FR-006**: The Browser Engine MUST be realized as a `BROWSER`-class `ExecutionUnit` (009's own
  enum value) whose child-process body wraps `apps/probe-pool/src/browser/pool.ts`'s already-real,
  already-tested Chromium launch/context/page lifecycle (`createBrowserPool`, lines 54-122) —
  dispatched, isolated (009's FR-019 child-process+`SIGKILL`), and finalized exactly per 009's
  `contracts/execution-runtime-contract.md`. This spec reuses the proven browser-launch code; it
  does not reimplement it.
- **FR-007 (closing the confirmed zero-call-site gap)**: The `BROWSER`-class dispatch wrapper (009's
  own worker-side dispatch code) MUST supply a real `pageProvider` to `withPage`
  (`packages/capability-sdk/src/context.ts:194-201`), which today always rejects with "No browser
  pool is configured" because no caller ever supplies one (confirmed: zero references to
  `probe-pool` from `apps/worker`/`apps/api`). This spec does not change `withPage`'s existing
  contract shape — it closes the wiring gap on the caller side.
- **FR-008 (concurrency bound — new work)**: `createBrowserPool()` today launches exactly one shared
  `Browser` instance with no concurrency cap (confirmed: no pool-of-browsers sizing logic exists
  anywhere in `pool.ts` or elsewhere). This spec MUST define a fixed, per-worker-process maximum of
  concurrent `withPage()` contexts; a `BROWSER`-class unit whose dispatch would exceed this maximum
  is refused at F07's own `safetyCheckpoint`/budget layer (FR-012's `concurrency` flag, reused, never
  a private concurrency gate this spec invents outside F07).
- **FR-009 (crash/hang recovery — new work)**: This spec MUST extend `research.md` R9's
  `FailureClass` assignment (009) with explicit browser-specific triage: the parent `SIGKILL`
  deadline firing with the child's own browser process already disconnected classifies
  `ENGINE_DEFECT`; the deadline firing with the browser process still alive but the page hung
  classifies `TIMEOUT`; an uncaught Playwright API error inside the child classifies
  `ENGINE_DEFECT`. No concurrency cap, crash listener, or restart logic exists in `pool.ts` today
  (confirmed) — this spec's own dispatch wrapper, not `pool.ts` itself, owns detecting and
  classifying these outcomes.
- **FR-010 (Browser Matrix, bounded)**: This spec MUST define `BrowserMatrixEntry` = `{
  browserFamily, viewport, locale, direction, theme, reducedMotion }`, carried in the owning
  `ExecutionUnit.configuration` (009's own per-caller config field — not a new table). A resolved
  plan's page-count × matrix-size product MUST be checked against a fixed ceiling at
  plan-resolution time (FR-049); a configuration exceeding it is **refused**, never silently
  truncated to "whatever fits" (mirroring 009's own FR-033 artifact-budget refuse-not-truncate
  rule). A default matrix (one desktop + one mobile entry, the Target's own locale/theme) applies
  when no custom matrix is requested.
- **FR-011 (coverage honesty per browser family)**: A check declared unable to execute reliably on
  a given `browserFamily` (`contracts/web-check-registry-contract.md`'s own
  `supportedBrowserFamilies` field) MUST report `UNSUPPORTED` (FR-041) for that family — never a
  silently-omitted result indistinguishable from `PASS`.
- **FR-012 (browser-level threat model — extends the existing SSRF proxy; closure-pass revision)**:
  `apps/probe-pool` already routes **every** browser request — navigation and subresource alike —
  through `packages/safe-net`'s SSRF-guarding proxy (confirmed: `pool.ts:61-68`, proven by a real
  adverse test at `apps/probe-pool/tests/adverse/browser-pool-ssrf.test.ts:28-44`) — this spec
  REUSEs that unchanged, unconditionally, for HTTP(S) egress. F01's `isInScope`/`isAuthorized` is a
  **separate, narrower** obligation that applies only to **engine-chosen destinations** — top-level
  navigation, the destination of a followed redirect, and a popup/new-tab — never to an ordinary
  page subresource (fonts/CSS/JS/images/analytics/third-party embeds), which safe-net's own policy
  alone governs (`research.md` R13's full resolution of F01's own text against this spec's own
  practice; `contracts/browser-execution-contract.md`). This spec additionally defines, as **new**
  work the existing proxy does not cover: every new `BrowserContext` MUST deny all browser
  permissions by default (camera, microphone, geolocation, clipboard, downloads, notifications);
  `file://`/`data:`/`blob:` top-level navigation MUST be refused; a popup/new-tab MUST be subject to
  the identical fresh scope check as the opening page before being followed (never auto-granted
  trust from its opener); a Service Worker registration attempt MUST NOT persist past its owning
  `BrowserContext`'s own teardown (FR-013). WebSocket/WebRTC connections are egress the existing
  safe-net proxy already governs (reused, not re-designed here).
- **FR-013 (tenant isolation at the browser-context level)**: Every `BROWSER`-class `ExecutionUnit`
  MUST receive a freshly-created `BrowserContext` (extending `pool.ts`'s existing per-call-context
  pattern, confirmed real at lines 72-74, 108-115) that is torn down, with zero persisted cookies/
  localStorage/IndexedDB/cache/Service-Worker-registration, at the end of that unit — no two
  `ExecutionUnit`s, whether same-tenant or cross-tenant, ever share live browser state.
- **FR-014**: Screenshot/trace/video/network-capture Evidence produced by the Browser Engine MUST
  be written through 009's own `recordEvidence`/`createArtifact` contracts using 009's own already-
  defined `EvidenceKind` values (`SCREENSHOT`, `SCREENSHOT_DIFF`, `DOM_NODE`, `ACCESSIBILITY_NODE`,
  `BROWSER_TRACE`, `HAR`, `VIDEO` — all already present in 009's `data-model.md` enum) — this spec
  invents no second screenshot/evidence storage system, directly satisfying the master brief's own
  explicit instruction and closing the confirmed gap that `apps/api/src/services/storage/
  reports.ts`'s own header comment names ("nothing calls this yet").
- **FR-015 (new Evidence kinds — authorized extension of 009's own extensible enum)**: Per 009's own
  `spec.md` FR-028 ("extensible, not closed"), this spec adds exactly these new `EvidenceKind`
  values: `CONSOLE_MESSAGE` (bounded-size browser console capture), `CRAWL_DISCOVERY` (FR-019),
  `STRUCTURED_DATA` (SEO's JSON-LD/schema capture), `CHECK_RESULT` (FR-041's own coverage-taxonomy
  record). This spec does not widen 009's `ExecutionUnitClass` (that enum's own extension is
  explicitly out of bounds, per this spec's own Clarifications) — only `EvidenceKind`, which 009
  itself designed to be extended by exactly a future spec like this one.

### Crawler Engine

- **FR-016**: The Crawler Engine MUST be realized as a `CRAWLER`-class `ExecutionUnit` declaring a
  `discoveryBudget` (`{ maxPages, maxDepth, maxConcurrency }`) in its own `configuration`, consuming
  009's own already-resolved Clarification (bounded intent at plan time, additive runtime-discovered
  child `ExecutionUnit`s as the frontier expands) — this spec supplies the discovery *logic*; 009
  already supplies the *mechanism* for how a frontier-driven class's children enter the graph.
- **FR-017 (fresh scope check per discovery — reused from F01, not reimplemented; a crawl-frontier
  expansion is itself an engine-chosen destination, `research.md` R13)**: Every discovered link
  MUST pass F01's `isInScope`/`isAuthorized` fresh (F01's own `scope-matching-contract.md` crawl-
  frontier rule, reused unchanged — "never inferred from the fact that some other, already-
  admitted URL on the same request chain was in scope") before a child `ExecutionUnit` is created
  for it. An out-of-scope discovery is recorded `REFUSED_OUT_OF_SCOPE` in the parent's own `CRAWL_
  DISCOVERY` evidence (FR-019) — never silently dropped, never treated as a plan violation
  (identical framing to 009's own Edge Cases for the identical scenario).
- **FR-018 (PageIdentity / canonicalization — closure-pass revision)**: This spec MUST define a
  normalized `PageIdentity` (scheme + host + path + query, fragment stripped) reusing F01's own
  `scope-matching-contract.md` normalization rules (host lowercasing/punycode-folding, path
  percent-decoding and `.`/`..` resolution, trailing-slash handling) for in-crawl deduplication —
  this spec does not invent a second, incompatible normalization algorithm. The query string is
  retained **in full by default**; a parameter is excluded only if it appears on a fixed,
  explicitly-maintained allow-list of known non-semantic names — **an unrecognized parameter is
  always semantic**, never heuristically stripped (`contracts/page-identity-contract.md`'s own
  closure-pass rule — closes the risk of two genuinely different rendered pages collapsing into one
  identity). `PageIdentity` is distinct from a page's own declared `<link rel="canonical">` target,
  which is the SEO domain's own concern (FR-037), not the Crawler Engine's.
- **FR-019 (discovery log as Evidence, not a new table)**: Every discovery attempt (followed,
  deduplicated, or refused) MUST be recorded as `Evidence` of kind `CRAWL_DISCOVERY` (FR-015) on the
  discovering `ExecutionUnit` — `{ url, pageIdentity, discoveredFromExecutionUnitId, httpStatus,
  scopeVerdict, depth }`. This spec does not create a new persisted `CrawlPage` table; 009's own
  extensible Evidence mechanism already fits (master brief §52's own "prefer Evidence payload"
  instruction).
- **FR-020 (crawl safety, race-safe — closure-pass revision)**: The Crawler MUST enforce
  `discoveryBudget.maxPages` via a single atomic, conditional-increment database statement
  (`data-model.md`'s `CrawlBudgetCounter`) — never a separate count-then-create sequence in
  application code, which races under concurrent discovery workers. `maxDepth` is checked locally
  per discovery path (no shared mutable state, no race possible). Dedup by `PageIdentity` (FR-018)
  MUST use an atomic claim (`data-model.md`'s `IdempotentClaim`) — two concurrent discoveries of
  the identical `PageIdentity` cannot both win, closing query-parameter-explosion and calendar-trap
  classes of crawl trap structurally and race-safely (`research.md` R16). A fixed maximum redirect-
  hop count and a fixed maximum single-response size (checked during streaming decompression,
  never after fully buffering) refuse, never hang on, anything exceeding either.
- **FR-021 (robots.txt is informational only — this spec's own Clarifications)**: The Crawler Engine
  MUST NOT treat `robots.txt` `Disallow` rules as a crawl boundary — F01's `TargetAuthorization`/
  Scope remains the sole permission boundary (confirmed product-policy decision, this session).
  `robots.txt`'s content is captured as Evidence for the SEO domain's own indexability logic
  (FR-037), never consulted by the Crawler Engine to decide where it goes.
- **FR-022 (sitemap discovery, budget-bounded)**: Sitemap/sitemap-index discovery and parsing is
  Crawler-Engine-produced Evidence feeding the SEO domain (FR-039's structured-data-adjacent
  validation applies the identical "deterministic parse only" discipline to sitemap XML). Every
  URL a sitemap names is itself a discovery candidate subject to FR-017's fresh scope check and
  counted against the same `discoveryBudget` (FR-020) as any other discovered link — a large
  sitemap cannot bypass the page-count ceiling by arriving through a different discovery path.

### Frontend / UX Domain

- **FR-023**: Frontend/UX checks are `WebCheckDefinition`s (`domain: UI`) consuming Browser-Engine
  `DOM_NODE`/`SCREENSHOT` Evidence for deterministic, structural checks only: horizontal/viewport
  overflow, clipped/overlapping content, off-screen controls, broken responsive grids, touch-target
  sizing, modal/z-index conflicts, broken image rendering, safe-area violations. These run
  regardless of any `VisualBaseline`'s own approval state (FR-026) — structural correctness is not
  gated on a human approving a baseline.
- **FR-024 (state-testing honesty)**: Loading/error/empty/success-state checks MUST be limited to
  one of three evidence sources this spec treats as deterministic: naturally observed state (what
  the page actually showed), controlled browser/network simulation this spec's own engine performs
  (FR-035), or a Fahes-declared workflow's own triggered state (FR-031) — an AI-inferred "possible"
  state is never treated as deterministic testing evidence (Constitution Principle III, restated for
  this spec's own area).
- **FR-025 (content-stress / RTL-i18n, bounded)**: Content-stress and RTL/i18n checks in this spec
  are DOM-local/browser-local only (long-text/long-label overflow, mixed-direction layout breakage,
  text-scaling clipping) — no destructive mutation of real customer data, and no test-fixture-driven
  variant is designed in this pass. RTL support is modeled as a rendering-direction capability
  (`BrowserMatrixEntry.direction`), never hardcoded to one specific locale.
- **FR-026 (visual regression — user-controlled approval, this spec's own Clarifications; closure-
  pass revision)**: A captured `SCREENSHOT` Evidence becomes a candidate baseline (`VisualBaseline`/
  `VisualBaselineApproval`, `data-model.md` — split during this spec's own closure pass after the
  original single-table design was found infeasible, see Closure Finding CF-1) only after explicit
  user approval recorded against that exact `(pageIdentity, browserMatrixEntryHash)` pair. Until
  approved, no `SCREENSHOT_DIFF` finding is ever produced for that pair — a later scan's new
  screenshot is still captured and stored (FR-014) but not diffed into a finding. Approving
  supersedes the prior approved baseline (if any) for that same pair via one atomic database
  operation (never a window with two simultaneously-active baselines, `data-model.md`'s own
  concurrency guarantee) — the superseded approval remains queryable as history, never deleted.
- **FR-026a (approved-baseline retention — resolved during this spec's own closure pass)**: An
  **active, approved** baseline's `Artifact` MUST be excluded from its originating scan's own
  report-retention-parity sweep (009's FR-034) — it survives independently of that scan's own
  report aging out, for as long as it remains the active baseline (confirmed product-policy
  decision, this closure pass). Once superseded, its extended-retention flag is cleared and it
  becomes eligible for ordinary retention sweeping after a fixed, bounded audit grace period —
  never instantly, never forever. A pending (never-approved) candidate screenshot gets no such
  extension (FR-026's own unchanged rule).

### Accessibility Domain

- **FR-027 (genuinely new capability)**: Accessibility checks are `WebCheckDefinition`s (`domain:
  ACCESSIBILITY`, FR-003's new `ModuleType` value) consuming a real axe-core pass run inside the
  Browser Engine's own child process against the rendered page, written as `Evidence` of kind
  `ACCESSIBILITY_NODE` (already present in 009's enum). This is confirmed **new** work — the only
  existing axe-core usage in the repository (`apps/web/package.json`'s `@axe-core/playwright`,
  exercised by `apps/web/tests/e2e/accessibility.spec.ts`) tests WebAudit's *own* marketing/auth
  pages as internal dev-QA, with zero relationship to any customer-facing scan capability.
- **FR-028 (automatability-tier honesty — master brief §24's explicit requirement)**: Every
  registered Accessibility `WebCheckDefinition` MUST declare exactly one of `AUTOMATED`,
  `PARTIALLY_AUTOMATED`, or `HUMAN_JUDGMENT_REQUIRED` (`contracts/web-check-registry-contract.md`).
  A report MUST state this tier next to any result for that check. No report produced by this
  platform may claim or imply full WCAG conformance from automated testing alone.
- **FR-028a (structural override for `HUMAN_JUDGMENT_REQUIRED` — added during this spec's closure
  pass)**: A check declared `HUMAN_JUDGMENT_REQUIRED` MUST NOT have a `PASS`/`FINDING` verdict from
  its own `evaluate` function trusted as-is — the Domain Check Registry itself overrides any such
  verdict to `INCONCLUSIVE` and logs an anomaly before recording it (`contracts/web-check-registry-
  contract.md`), since a tier that by definition requires human judgment cannot, by its own
  evaluator alone, have produced a trustworthy automated decision. This closes the exact risk named
  in this spec's own closure-pass instructions: a `HUMAN_JUDGMENT_REQUIRED` check must not
  accidentally receive a deterministic `PASS` merely because evidence was captured.
- **FR-029 (real keyboard interaction, not attribute inspection)**: Keyboard-accessibility checks
  MUST drive real key events (Tab, Shift+Tab, Enter, Space, Escape, Arrow keys) through the Browser
  Engine's own page-interaction primitives (FR-031's shared primitive set) and observe actual focus
  movement/traps/loss — never inferred solely from static ARIA/tabindex attribute presence. Tab-walk
  iteration is bounded (a fixed maximum step count) to prevent an infinite-loop scenario from
  hanging the check.
- **FR-030 (contrast — computed, honest about limits)**: Contrast checks MUST use the rendered,
  computed foreground/background/opacity/theme-state (via the Browser Engine's own computed-style
  read), never source CSS color declarations alone. Where exact contrast cannot be deterministically
  established (a gradient, background image, or transparency stack behind the text) the check MUST
  report `INCONCLUSIVE` (FR-041) for that specific element with a stated reason — never a fabricated
  numeric ratio.

### Functional Web Domain

- **FR-031 (bounded workflow catalog — this spec's own Clarifications)**: Functional Web Testing
  runs a Fahes-declared, versioned catalog of common interaction patterns (navigation, menus, tabs,
  accordions, dialogs, search, filters, pagination, client-side routing/deep-links/back-forward/
  refresh, basic form interaction) built from a fixed, typed primitive set — `navigate`, `click`,
  `fill`, `select`, `check`, `submit`, `wait`, `assertUrl`, `assertVisible`, `assertHidden`,
  `assertText`, `captureEvidence` — with **no customer-authored workflow DSL, editor, or storage
  surface** in this spec (confirmed product-policy decision, this session). No primitive accepts
  arbitrary script injection or `eval`.
- **FR-032 (action-safety classification)**: Every workflow step declares exactly one of:
  `READ_ONLY`, `LOCAL_BROWSER_MUTATION` (state that lives only in the browser tab, e.g. opening a
  dropdown), `SERVER_SIDE_REVERSIBLE_MUTATION`, `SERVER_SIDE_PERSISTENT_MUTATION`, or `DESTRUCTIVE`.
  Only `READ_ONLY`/`LOCAL_BROWSER_MUTATION` steps run by default against any authorized target with
  no further grant. A step classified in the remaining three tiers runs only when the Target's
  *current* `TargetAuthorization` (F01, re-checked fresh — never cached, per F01's own FR-014/FR-024)
  explicitly permits it; this spec grants no new authorization type, it only maps a workflow step's
  own declared risk onto F01's existing model.
- **FR-032a (enum value grants no capability — added during this spec's closure pass)**: A workflow
  step's own declared `actionSafety` value, including `DESTRUCTIVE`, grants it no capability by
  itself — the value is a classification label FR-032's own fresh F01 gate reads, never a
  permission the catalog confers. Declaring a step `DESTRUCTIVE` does not and cannot make it
  executable against a target whose `TargetAuthorization` does not independently permit it; this
  spec's own Functional Web Testing area never silently becomes SPEC 012's Active Security Testing
  through this mechanism. Every step above `LOCAL_BROWSER_MUTATION` additionally carries an
  idempotency claim (`data-model.md`'s `IdempotentClaim`, `scope: "workflow-step-mutation"`) so a
  retried step cannot blindly duplicate an already-executed server-side mutation.
- **FR-033 (form testing, non-destructive by default)**: Form-testing checks (required/format/
  min-max validation, error-message visibility, submit enable/disable, double-submit, loading-state,
  keyboard submission) are composed entirely from FR-031's bounded primitives. A form step whose own
  classification (FR-032) is above `LOCAL_BROWSER_MUTATION` is never executed without the already-
  granted authorization FR-032 requires — this spec does not blindly submit a real, state-mutating
  form merely because a form exists on the page.
- **FR-034 (async/SPA/hydration-failure detection)**: Checks for hydration errors, uncaught browser
  errors, failed dynamic-chunk loads, stale UI after navigation, and route-transition failure
  consume `CONSOLE_MESSAGE`/`HAR`/`DOM_NODE` Evidence the Browser Engine already produces (FR-014/
  FR-015). A single console warning is never, by itself, automatically a finding — each registered
  check's own evaluator declares exactly which signal combination (e.g. an uncaught exception *and*
  a subsequent DOM state that never recovers) constitutes a reportable defect.
- **FR-035 (bounded network simulation)**: Slow-network and temporary-offline simulation is opt-in
  per workflow step and bounded (a fixed maximum simulated-delay/offline-duration). The *absence* of
  offline-capable behavior on a site with no declared offline expectation is never itself a finding
  — only an explicitly-asserted expectation (`assertVisible`/`assertText` naming the expected
  offline-state UI) that the page fails to satisfy is.

### SEO Domain

- **FR-036**: SEO checks are `WebCheckDefinition`s (`domain: SEO`, today's existing `ModuleType`
  value) consuming both today's unchanged HTTP-only Evidence path (`meta-checker`/`content-checker`,
  FR-005 parity — title/description/viewport/canonical/H1/`html lang`/alt-text/thin-content, already
  real) and new Crawler/Browser-Engine Evidence for checks today's code genuinely cannot perform:
  Open Graph/Twitter metadata, robots meta/`X-Robots-Tag`, sitemap validation, structured data,
  hreflang, duplicate metadata across the crawled set (two or more discovered pages sharing an
  identical title/description, flagged only once `discoveryBudget` coverage makes the comparison
  meaningful, per FR-038's own coverage-honesty discipline), internal-link graph analysis, rendered
  (client-side) metadata — confirmed, by direct read of `apps/worker/src/prompts/seo.ts`, to be
  claimed in the product's own AI prompt today with **zero** backing capability.
- **FR-037 (indexability — derived, contradiction-aware)**: Indexability is a derived verdict
  combining HTTP status, robots meta, `X-Robots-Tag`, `robots.txt` content (informational per
  FR-021), and the declared canonical — a contradiction (robots allows, page itself says `noindex`)
  MUST be reported naming the *actual* blocking mechanism explicitly, never collapsed to reporting
  only one of the contributing signals.
- **FR-038 (orphan-page honesty — bounded by coverage)**: An orphan-page signal MUST only be
  reported when the crawl's own `discoveryBudget` (FR-020) coverage actually reached enough of the
  site to support the claim; the report's own coverage metadata (FR-041) names the crawl's
  completeness so an orphan claim is never asserted from a budget-truncated crawl (this spec's own
  Edge Cases; master brief §37's explicit "do not call a page orphaned if crawl coverage was
  insufficient" instruction).
- **FR-039 (structured data — deterministic parse only)**: Structured-data checks validate JSON-LD
  parse validity and known-schema required-property presence only where a maintained schema
  contract supports deterministic validation (Evidence kind `STRUCTURED_DATA`, FR-015) — this spec
  never claims search-engine rich-result eligibility beyond what was deterministically checked.
- **FR-040 (rendered vs. static SEO signal mismatch)**: A SEO check whose Browser-Engine-rendered
  signal (e.g. client-rendered `<title>`) differs from the raw-HTML signal `meta-checker` already
  reports MUST be surfaced as its own distinct finding category naming the discrepancy explicitly —
  never silently preferring one signal over the other without naming that a mismatch exists.

### Coverage, Fingerprinting, and Reverify

- **FR-041 (coverage taxonomy)**: Every `WebCheckDefinition` execution MUST resolve to exactly one
  of: `PASS`, `FINDING`, `NOT_TESTED` (precondition false, mirroring 009's `canRun`-false→`SKIPPED`
  convention at the check level), `UNSUPPORTED` (FR-011, browser-family or technique limitation),
  `BLOCKED` (its own dependency/scope/authorization prevented execution, or its own `evaluate` call
  threw), or `INCONCLUSIVE` (FR-030-style — evidence exists but is insufficient to decide, or an
  override of a `HUMAN_JUDGMENT_REQUIRED` check's own `PASS`/`FINDING`, FR-028a). Every one of these
  six outcomes is recorded as `Evidence` of kind `CHECK_RESULT` (FR-015); a `FINDING` outcome
  additionally calls 009's own `materializeFinding`, linked back to its own `CHECK_RESULT` evidence
  (and any other supporting evidence) via `IssueEvidenceLink`. Missing execution is never silently
  recorded as `PASS` — nor, per FR-041a below, silently recorded as *nothing at all*.
- **FR-041a (readiness, non-recursion, and idempotency — added during this spec's closure pass)**:
  A check whose `requiredEvidenceKinds` span more than one `ExecutionUnit`'s own output MUST declare
  a `readinessScope` function (`data-model.md`) identifying the identity (e.g. `pageIdentity`) its
  readiness is evaluated per; the Domain Check Registry evaluates such a check exactly once, the
  first time every required kind is present for that scope, guarded by an atomic idempotency claim
  (`data-model.md`'s `IdempotentClaim`) so a retried, replayed, or concurrently-duplicated trigger
  can never produce two `CHECK_RESULT` rows for the same logical execution. `CHECK_RESULT` Evidence
  is permanently excluded from the set of kinds that can themselves trigger registry evaluation —
  structurally, not by developer discipline — making the registry's own output recursively
  re-triggering itself impossible by construction (`contracts/web-check-registry-contract.md`;
  `research.md` R15). At `ScanPlan` finalization, every registered check that never reached a
  recorded `CHECK_RESULT` (because its required evidence never arrived) is swept to a terminal
  `BLOCKED`/`NOT_TESTED` verdict — a requested check can never end a scan with no recorded outcome
  at all.
- **FR-042 (fingerprint parts include matrix identity where relevant)**: A `WebCheckDefinition`
  whose result is genuinely browser/viewport-specific MUST include its `BrowserMatrixEntry`'s
  identity (FR-010) in the `fingerprintParts` it passes to 009's own, unchanged `fingerprintOf`
  mechanism (`packages/scoring/src/fingerprint.ts:fingerprintOf`); a page-wide check (most SEO
  checks) omits it. This spec's own `WebCheckDefinition` declares which per check — this spec does
  not change `fingerprintOf`'s signature or `Issue.location`'s existing plain-string shape
  (confirmed: `apps/api/prisma/schema.prisma:574`), it only decides what each check passes in.
- **FR-043 (reverify — fresh minimal plan, one named exception; closure-pass wording tightened)**:
  A reverify for a Finding sourced from a `BROWSER`/`CRAWLER`-class `ExecutionUnit` follows 009's
  own FR-029 (a fresh, minimal single-unit `ScanPlan`, re-checking F01 live) — never requiring a
  full site crawl when the finding's own location is a single page/check. The one named exception:
  a finding whose own validity depends on sitewide coverage (an orphan-page SEO finding, FR-038)
  MUST reverify with the **minimum** crawl scope necessary to reproduce the original coverage claim
  — neither blindly reusing the original crawl's own stale evidence (which could be out of date)
  nor blindly rescanning more broadly than that claim actually requires (which would needlessly
  re-run work FR-049's own budget discipline exists to bound). A reverify that cannot obtain a
  fresh, sufficient-coverage result resolves `REFUSED` (009's own fail-closed `resolvePlan`
  behavior) rather than silently narrowing to a single-page check that cannot actually reproduce
  the sitewide claim it is meant to verify.
- **FR-044 (reverify parity for unchanged capabilities)**: Findings sourced from today's unchanged
  HTTP-only capabilities (FR-005) continue using today's existing single-capability reverify runner
  (`apps/worker/src/reverify/runner.ts`, confirmed real and unchanged) — FR-043 applies only to
  genuinely new `ExecutionUnit`-sourced findings this spec introduces.

### Privacy, Redaction, Tenant Isolation

- **FR-045 (redaction — narrower than 009's own class list, so this spec adds its own obligation)**:
  009's `recordEvidence` already redacts payloads for `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/
  `SOURCE_EXECUTION`-class units (009 FR-030); `BROWSER`/`CRAWLER` are **not** on that list. This
  spec therefore independently REQUIRES `@webaudit/redaction` (confirmed real, scoped to scanning
  text segments for credential-shaped values and high-entropy strings — `packages/redaction/src/
  detect.ts:33-50`) be applied to every `CONSOLE_MESSAGE`/`HAR`/form-input-bearing `DOM_NODE`
  payload this spec's engines produce, before persistence — closing the gap that 009's own class
  list does not cover for this spec's two Engine classes.
- **FR-046 (screenshot redaction limitation, stated honestly; closure-pass wording tightened)**:
  There is no reliable automated mechanism to redact personally-identifying content rendered inside
  a screenshot's own pixels — confirmed: `@webaudit/redaction`'s public surface (`packages/
  redaction/src/index.ts:22-38`) only scans text (`PromptSource.segments`), never binary image
  content. This spec does not claim pixel-level screenshot redaction, and no report this platform
  produces may imply that a screenshot has been privacy-reviewed. Operationally: textual Evidence
  (`CONSOLE_MESSAGE`/`HAR`/form-bearing `DOM_NODE`) IS redacted before persistence (FR-045);
  `SCREENSHOT`/`SCREENSHOT_DIFF`/`VIDEO`/`BROWSER_TRACE` Artifacts are NOT content-redacted in any
  way — their only protection is the same tenant-scoped access control every other `Artifact`
  already has (FR-048; 009's own `Artifact` contract) and the retention rules that bound how long
  they exist (009's FR-034; FR-026a for an approved baseline specifically). A screenshot MAY be
  flagged sensitive by a future consent/coverage policy; that policy is not designed here.
- **FR-047**: No workflow-step configuration, `Evidence` payload, or queue-job payload this spec
  defines may carry a raw credential, session token, cookie, or API key — only an opaque
  `credentialBindingRef` (F05, deferred) — restating 009's own FR-020/FR-045 for this spec's own
  workflow-step and browser-context-cookie surfaces specifically.
- **FR-048**: Every new construct this spec defines (a `BrowserContext`'s own lifetime, `CRAWL_
  DISCOVERY`/`CHECK_RESULT` Evidence, `VisualBaseline` approval state) MUST be tenant-scoped,
  re-derived through its owning `Scan`/`ExecutionUnit`'s `userId` — never a bare id lookup,
  restating 009's own FR-041 for this spec's own new surfaces.

### Budgets and Bounded Execution

- **FR-049 (combinatorial-explosion control — refuse, not truncate)**: At plan-resolution time, this
  spec's own page-count cap × `BrowserMatrixEntry`-count cap × workflow-step cap MUST each be
  independently bounded, and their product additionally bounded by one fixed ceiling. A
  `ScanConfiguration` whose requested combination would exceed that ceiling is **refused** at
  resolution (009's own `resolvePlan` refusal path, reused), never silently truncated to "whatever
  fits" — directly closing the master brief's own named risk (§10: a scan "must not accidentally
  become 20 pages × 10 viewports × 5 browsers × 4 themes × 10 locales").
- **FR-050 (metering boundary — mechanism only, no new pricing)**: This spec does not design final
  commercial pricing (009's own FR-044 metering-boundary deferral, extended here). Confirmed: today's
  pricing (`packages/config/src/pricing.ts`) is flat per-`ModuleType`, with zero per-page multiplier
  — this spec establishes only the budget *mechanism* (FR-049), never a specific number, leaving the
  actual commercial model to a future Credits spec exactly as 009 already deferred it.

### Migration and Compatibility

- **FR-051 (strict parallel-run, extended to this spec's own area)**: This spec introduces zero
  behavior change to any of today's five existing `ModuleType` values' HTTP-only dispatch
  (`CapabilityExecution`, unchanged), today's flat per-module pricing, or today's scan-creation UX
  (`apps/web/components/scan/ScanForm.tsx`'s `ALL_AREAS` selection, confirmed unchanged by this spec)
  — every new mechanism is additive (two new `ModuleType` values, 009's already-defined
  `ExecutionUnit`/`Evidence` machinery, four new `EvidenceKind` values, four new small tables —
  `VisualBaseline`, `VisualBaselineApproval`, `IdempotentClaim`, `CrawlBudgetCounter`, all added
  during this spec's own closure pass to correct and close gaps the original draft's prose
  described without a feasible mechanism) until an explicit future cutover decision, per 006's and
  009's own identical strict-parallel-run requirement, inherited without exception.
- **FR-052 (non-blocking naming correction, not an enforced edit)**: Today's `playwright-runner`
  capability (`packages/capabilities-vendored/playwright-runner/`) is confirmed to perform only
  same-origin link-integrity checking via `ctx.fetch` — it does not drive a browser despite its
  name. This spec preserves that working logic unchanged and recommends (non-blockingly, for a
  future implementation pass) it be renamed to something honest (e.g. `link-integrity-checker`) once
  a genuinely browser-driven capability exists to occupy the name it currently misuses — this
  planning pass does not edit the file.

### AI Boundary

- **FR-053 (deterministic before probabilistic — restated for this spec)**: No AI/machine-learning
  judgment of any kind may decide a `WebCheckDefinition`'s coverage verdict (FR-041), a scope/
  authorization outcome, an Evidence record's content, or a `VisualBaseline` approval — restating
  009's own identical FR-046 for this spec's own six areas. AI may enrich (UX critique, remediation
  guidance, cross-evidence interpretation via the existing one-call-per-module `AIExecutor`
  architecture, unchanged) but never substitutes for this spec's own deterministic measurement.

## Key Entities

- **`VisualBaseline`**: NEW — the live "current state" pointer, one row per `(userId, pageIdentity,
  browserMatrixEntryHash)` triple (FR-026). Originally drafted as a single table conflating pointer
  and history, found infeasible during this spec's own closure pass (`data-model.md` Closure
  Finding CF-1) and split in two.
- **`VisualBaselineApproval`**: NEW — the append-only history of every approval ever made, retained
  even after supersession, with extended retention while active (FR-026a).
- **`IdempotentClaim`**: NEW — one generic, reusable "claim a logical slot exactly once" primitive,
  added during this spec's own closure pass, covering Domain Check Registry execution idempotency,
  crawl-discovery dedup race-safety, and workflow-step mutation idempotency under one shared shape
  (`research.md` R15/R16).
- **`CrawlBudgetCounter`**: NEW — the one atomic, bounded counter the Crawler Engine's `maxPages`
  ceiling needs to stay race-safe under concurrent discovery workers, added during this spec's own
  closure pass (`research.md` R16).
- **`BrowserMatrixEntry`**: NEW, but a value object carried in `ExecutionUnit.configuration` (009's
  own field), never a table.
- **`WebCheckDefinition`**: NEW, a code-level (versioned-in-source-control) registry entry, directly
  analogous to today's existing `AuditCapability` shape — never a database row.
- **`PageIdentity`**: NEW, a derived/computed value (not persisted on its own) reusing F01's
  normalization rules, with a closure-pass-strengthened "unknown parameter = semantic by default"
  rule.
- Every other candidate entity the master brief names (`BrowserConfiguration`/`BrowserMatrix` as a
  table, `CrawlFrontier`/`CrawlPage` as a table, `WorkflowDefinition`/`WorkflowStep` as a table,
  `CoverageSummary` as a table) remains deliberately **not** a new table — see `data-model.md`'s
  own justification for each.
- Reused unchanged from 009: `ExecutionUnit`, `ExecutionDependency`, `Evidence` (four new `kind`
  values added, FR-015), `Artifact`, `IssueEvidenceLink`, `ScanPlan`, `ScanProfile`/
  `ScanProfileVersion`.
- Reused unchanged from today's production schema: `Issue`/fingerprinting (FR-042's own addition is
  to `fingerprintParts` content, never to the mechanism), `Capability`/`CapabilityExecution` (FR-005
  parity), `ModuleType` (FR-003's two new additive values).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every subsystem this spec touches (probe-pool, capability-sdk's `withPage`, every
  browser-dependent vendored capability, the orchestrator, `ModuleType`, pricing, `ScanForm.tsx`,
  the R2 screenshot-storage module, the reverify runner) is classified REUSE / REUSE-AFTER-WIRING /
  EXTEND / REPLACE / DEPRECATE / NEW in `plan.md`, each citing a specific file/line from this
  session's own three parallel research passes — zero unclassified or evidence-free
  classification, matching 009's own SC-001 bar.
- **SC-002**: Each of this spec's four new entities (`VisualBaseline`, `VisualBaselineApproval`,
  `IdempotentClaim`, `CrawlBudgetCounter` — the first drafted as one infeasible table and
  corrected, the latter two added, during this spec's own closure pass) has a complete field list
  in `data-model.md`, a proven-feasible Prisma/PostgreSQL shape with a named, race-safe concurrency
  mechanism where applicable, and zero structural (`@relation`) edges into any existing/frozen
  model — matching 009's own SC-002 bar.
- **SC-003**: Every one of this spec's six areas (two Engines, four Domains) has its own named
  contract in `contracts/`, and every contract names which 009/F01/F07 contract it consumes rather
  than reimplements.
- **SC-004**: Every adversarial scenario in this spec's own adversarial-review pass
  (`research.md`'s Independent Adversarial Review section) maps to at least one Functional
  Requirement or an explicit, named defer-to-F01/F07/009 resolution — zero orphaned scenarios.
- **SC-005**: `quickstart.md`'s validation steps (the checklist a future E10/E11/D22-D25
  implementation must pass) pass when run against this spec's own `plan.md`/`data-model.md`.
- **SC-006**: This spec's own package produces zero changes to any file outside
  `specs/010-web-testing-platform/` — verified by `git status`/`git diff --name-only` at the close
  of this planning pass.
- **SC-007**: A future implementer of any one of the six areas can answer, from this spec alone:
  how their engine's work becomes Evidence (or, for a Domain, which Evidence it consumes), how a
  Finding is materialized with correct provenance, how coverage is reported honestly, and how
  reverify works for one of their findings — without a follow-up question to 009/F01/F07.

## Assumptions

- 006/007/008/009 are frozen and consumed, not redesigned, by this spec — this spec proposes zero
  amendment to any of their entities, contracts, or ceiling values. The corrections this spec
  records are against its own, newly-introduced territory (the domain-check-dispatch decision, the
  `VisualBaseline` persistence fix, the crawl-budget/dedup atomicity primitives) or are documented
  interpretations of upstream text for this spec's own consuming purposes, never edits to any
  upstream document (F01's navigation-vs-subresource scope semantics, `research.md` R13).
- This spec's current-state baseline (three parallel research passes over `apps/probe-pool`,
  `packages/capability-sdk`, every `packages/capabilities-vendored/*` package, `apps/worker/src/
  orchestrator/orchestrator.ts`, `apps/api/prisma/schema.prisma`, `packages/scoring/src/
  fingerprint.ts`, `packages/redaction`, `packages/config/src/pricing.ts`, `apps/web/components/
  scan/ScanForm.tsx`, `apps/api/src/services/storage/reports.ts`, and `apps/worker/src/reverify/
  runner.ts`) is treated as settled, not re-derived a second time in `research.md`.
- No Prisma migration is run by this planning pass. `data-model.md`'s four new models and two new
  `ModuleType` enum values are the real, intended schema touch — the actual edit is implementation
  work for a future session.
- The four product-policy questions this spec's own Clarifications record (workflow-authorship
  scope, visual-baseline approval mode, `robots.txt` policy, and — found and resolved during this
  spec's own closure pass — approved-baseline retention) were each confirmed by the user, not
  inferred from repository evidence or a safe technical default — per the master brief's own
  explicit instruction to stop and ask for exactly this category of decision.
- "Tenant" means an individual `User` account, identical to F01's/009's own confirmed assumption.
- Specific numeric ceilings (page-count cap, matrix-size cap, workflow-step cap, console-message
  size cap) are each a future engine/implementation decision this spec deliberately does not invent
  — this spec establishes the *mechanism* (refuse at a fixed ceiling, never truncate silently) each
  needs, not the specific number, mirroring 009's own identical posture toward its own budget FRs.
