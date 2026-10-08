# Phase 0 Research: Web / UI / Accessibility / Functional Web / SEO Testing Platform

All current-state evidence below was gathered by this session's own three parallel research
passes over `apps/probe-pool`, `packages/capability-sdk`, every package under `packages/
capabilities-vendored/`, `apps/worker/src/orchestrator/orchestrator.ts`, `apps/api/prisma/
schema.prisma`, `packages/scoring/src/fingerprint.ts`, `packages/redaction`, `packages/config/src/
pricing.ts`, `apps/web/components/scan/ScanForm.tsx`, and `apps/api/src/services/storage/
reports.ts`, plus direct reads of 009's and F01's own contracts — treated as settled, not
re-derived a second time here.

## R1: Is extending `ModuleType` with two new values safe, or does it repeat the frozen-sibling-
enum mistake 009 avoided with F01's `ExecutionClass`?

- **Decision**: safe, and categorically different from the case 009 avoided. 009 avoided widening
  F01's `ExecutionClass` because that enum belongs to a *frozen upstream spec* whose own document
  would need to record the amendment — widening it silently would be exactly the "casually
  reopening frozen architecture" the master brief forbids. `ModuleType` is not spec-owned; it is
  live production schema with no owning frozen document, and 009 itself already reused
  `ModuleType[]` directly (`ScanProfileVersion.defaultDomains`, 009's `data-model.md:135`) without
  any amendment ceremony, confirming the lineage already treats `ModuleType` as safely shared.
  Adding a value (`ALTER TYPE ... ADD VALUE`) changes the meaning of zero existing rows — a
  materially lighter operation than a `@relation` edit, which is the specific thing 006/007/008/009
  each actually avoided.
- **Alternatives considered**: reusing `UI` for both Frontend/UX and Accessibility (rejected — this
  spec's own master brief explicitly requires Accessibility be reported with its own honesty/
  coverage model distinct from visual/structural UX, which a shared enum value would blur in every
  downstream query that groups by `module`); inventing a wholly separate, parallel domain-taxonomy
  concept instead of touching `ModuleType` at all (rejected — would create exactly the "two
  incompatible domain taxonomies" risk this spec's own consolidation rationale exists to prevent).

## R2: Should `apps/probe-pool` become its own deployed network service, or be wired in-process?

- **Decision**: in-process wiring (the `BROWSER`-class dispatch wrapper constructs
  `createBrowserPool()` and supplies its `withPage` as `CodeLayerContext.options.pageProvider`
  directly, inside the same child process 009's own FR-019 already isolates) is the lower-risk
  default for this planning pass. `apps/probe-pool`'s own `package.json` `dev` script ("echo 'not
  implemented — scaffold only'") and its lack of any HTTP/RPC server entrypoint
  (`apps/probe-pool/src/index.ts:1-8` exports only a constant) confirm it was never built as a
  standalone service — treating it as one would require designing a new RPC/transport layer this
  spec's own charter does not ask for.
- **Rationale**: 009's own FR-019 process isolation (a dedicated child process per long-running
  `ExecutionUnit`, parent-armed `SIGKILL`) already provides the isolation boundary a separate
  service would otherwise exist to provide. Running `createBrowserPool()` inside that same,
  already-isolated child process reuses an existing guarantee rather than building a second one.
- **Alternatives considered**: a standalone `apps/probe-pool` HTTP service, independently scalable
  from `apps/worker` (not rejected outright — this plan's own contracts do not foreclose it; a
  future implementation may still choose it for independent scaling once real load data exists,
  per this spec's own "do not design for hypothetical future requirements" discipline).

## R3: Where does Domain Check dispatch run — as a new `ExecutionUnitClass`, or elsewhere?

- **Decision**: ordinary, synchronous, parent-worker-side computation, triggered by each committed
  `Evidence` row, entirely outside 009's own `ExecutionUnitClass` enum. See `spec.md`'s own
  Clarifications for the full reasoning; restated here: 009's enum is deliberately narrow (mirrors
  F01's `ExecutionClass` value-for-value for its six non-passive values, by design, per 009's own
  `data-model.md`); widening it for a concern 009 never designed for ("evaluate rules against
  evidence I just produced") would repeat the exact mistake 009 itself avoided toward F01.
- **Rationale**: Constitution Principle VIII ("Engines Serve Domains") is directly satisfied by this
  separation — the Engine's own isolated child process does one thing (produce Evidence); the
  Domain Check Registry does a different thing (evaluate pure functions against already-committed
  Evidence) in the ordinary worker process, with no further browser/crawl dependency, no further
  queueing, and (closing a crash-safety question directly) no risk of losing already-gathered
  Evidence if the check-evaluation step itself fails, since 009's own `recordEvidence` already
  commits Evidence independently of the owning unit's finalization (009's `evidence-envelope-
  contract.md` step 4).
- **Alternatives considered**: a second `ExecutionUnit` per domain-check pass (rejected — widens
  009's own enum unnecessarily and adds a queueing/dispatch round-trip for what is, by construction,
  fast synchronous computation over data already in hand); evaluating checks inside the Engine's
  own child process before it returns (rejected — would blur the Engine/Domain boundary this spec's
  entire charter exists to keep distinct, and would force every new Domain's check logic to be
  vendored into the same process-isolation boundary the Engine needs for a materially different
  reason — liveness against a hung browser, not check-evaluation correctness).

## R4: Does a check's result (including non-Finding outcomes like `PASS`/`UNSUPPORTED`) need a new
persisted table, or does 009's own `Evidence` mechanism already fit?

- **Decision**: a new `EvidenceKind` (`CHECK_RESULT`), not a new table — every check execution,
  regardless of verdict, is recorded as one `CHECK_RESULT` Evidence row (`{ checkId, checkVersion,
  domain, verdict, pageIdentity, browserMatrixEntryHash?, reason? }`); a `FINDING` verdict
  additionally calls `materializeFinding`, linking its own `CHECK_RESULT` evidence via
  `IssueEvidenceLink` alongside whatever other Evidence supports the finding.
- **Rationale**: 009's own `spec.md` FR-028 explicitly designed `EvidenceKind` to be "extensible,
  not closed" by exactly a future spec like this one; master brief §52's own "prefer Evidence
  payload... do not create persistent models when typed Evidence payloads/contracts are enough"
  instruction applies directly. A second table recording the same fact 009's own Evidence mechanism
  already models would be exactly the "do not blindly create all of them" anti-pattern that section
  warns against.
- **Alternatives considered**: recording only `FINDING`-verdict checks (via `Issue`) and leaving
  `PASS`/`NOT_TESTED`/etc. entirely unrecorded (rejected — directly violates master brief §44's own
  explicit "do not silently treat missing execution as PASS" requirement; an unrecorded check and a
  passing check would be indistinguishable, which is the exact failure mode this spec's own User
  Story 2 exists to prevent).

## R5: How does crawl discovery stay deduplicated without inventing a new URL-normalization
algorithm?

- **Decision**: reuse F01's own `scope-matching-contract.md` normalization rules (host
  lowercasing/punycode-folding, percent-decoding, `.`/`..` resolution, trailing-slash handling)
  verbatim for this spec's own `PageIdentity` — adding only the semantically-meaningful-query-
  retention rule (fragment stripped, tracking/ordering-insensitive query handling left to a future
  implementation's own tuning, per this spec's "mechanism, not specific algorithm tuning" posture).
- **Rationale**: Constitution Principle VIII, applied here to F01's own contract rather than to
  a sibling spec's: F01's normalization is already proven correct for the identical problem (does
  destination X equal destination Y for matching purposes) one layer up (scope matching); reusing
  it for deduplication is the same function applied to a closely related question, not a new
  algorithm needing its own independent proof.
- **Alternatives considered**: query-string-stripping dedup (rejected — master brief §32's own
  explicit "do not globally strip query strings if they are semantically meaningful" instruction);
  a wholly new normalization library (rejected — unjustified duplication of logic F01 already
  proves correct).

## R6: How is a `VisualBaseline`'s approval state kept from becoming a second, parallel retention
tier?

- **Decision**: `VisualBaseline.artifactId` references a 009-owned `Artifact` row directly; the
  `Artifact`'s own lifecycle (009's FR-034 report-retention-parity sweep) is never overridden or
  extended by this spec. A pending (unapproved) baseline candidate is swept exactly like any other
  `Artifact` when its owning scan's report retention boundary passes — it simply never gets approved
  after that point.
- **Rationale**: inventing a longer-lived retention tier "just in case a human hasn't approved yet"
  would be exactly the kind of parallel mechanism 009's own FR-034 exists to prevent proliferating;
  this spec's own Edge Cases name this outcome explicitly as acceptable, not a gap.
- **Alternatives considered**: a dedicated, longer retention window for pending baselines (rejected
  — unjustified complexity for a product-policy edge case this session's own clarification did not
  ask for, and a second retention tier this platform would need to keep consistent with 009's own
  sweep forever after).

## R7: Does Accessibility's automatability-tier requirement (FR-028) need a new Prisma field on
`Issue`, or does it belong elsewhere?

- **Decision**: elsewhere — the tier is a static property of the `WebCheckDefinition` itself (a
  code-level, versioned registry entry), not a per-`Issue` fact; a report renders the tier by
  looking up the check's own declared tier via its `checkId`, never by reading it off the `Issue`
  row. No `Issue` schema change is needed.
- **Rationale**: the tier does not vary per execution (the same check is always, say,
  `PARTIALLY_AUTOMATED`) — storing it per-row would be redundant, denormalized state this spec's
  own minimal-footprint posture (master brief §52) argues against.
- **Alternatives considered**: a new `automatabilityTier` column on `Issue` (rejected — redundant
  with the check registry's own static declaration; would also require a schema change to an
  existing, frozen-adjacent model this spec otherwise achieves zero such edits against).

## R8: How does `fingerprintOf` stay unchanged while still distinguishing a viewport-specific
finding from an identical-looking page-wide one?

- **Decision**: `fingerprintParts` (an existing, caller-supplied array, `packages/scoring/src/
  fingerprint.ts:fingerprintOf`'s own `parts: readonly string[]` field) is where a
  `BrowserMatrixEntry`'s identity goes when a check's own declaration says it is viewport/browser-
  specific — the function's own signature, and `Issue.location`'s existing plain-string shape, are
  both untouched.
- **Rationale**: this is exactly the kind of "the mechanism already exists, use it" resolution
  Constitution Principle VIII prefers over inventing a new field; `fingerprintOf` was designed to
  take caller-supplied disambiguating parts precisely so callers never need a schema change to add
  a new disambiguating dimension.
- **Alternatives considered**: adding a structured `viewport`/`browserFamily` field to `Issue`
  itself (rejected — unnecessary schema change when the existing `parts` mechanism already solves
  the identical problem with zero schema impact).

## R9: Does redaction need a new mechanism, given 009's own `recordEvidence` redaction class list
(`ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/`SOURCE_EXECUTION`) does not include `BROWSER`/
`CRAWLER`?

- **Decision**: no new mechanism — this spec's own `BROWSER`/`CRAWLER`-class Evidence writers call
  the identical `@webaudit/redaction` function 009's own `recordEvidence` already uses for its
  three named classes; this spec simply does not rely on 009's own class-list gate to trigger it,
  since that gate was never designed to cover this spec's two classes.
- **Rationale**: 009's own `evidence-envelope-contract.md` names `@webaudit/redaction` as the one
  shared mechanism (never a second one); this spec's own obligation is to call it at its own
  additional call sites, not to build a second redaction library.
- **Alternatives considered**: proposing an amendment to 009's own class list to add `BROWSER`/
  `CRAWLER` (considered, not chosen — 009 is frozen, and widening its own gate list is unnecessary
  when this spec can simply call the same underlying function directly at its own call sites with
  identical effect, avoiding any upstream amendment at all).

## R10: Is a real axe-core dependency a new third-party risk this spec must threat-model, or does
it fit the existing vendoring discipline?

- **Decision**: fits the existing discipline — `axe-core` is pinned at a specific version (per
  Constitution Principle II, "Vendored Forever," already applied to every other capability
  dependency in `packages/capabilities-vendored/*/package.json`), and it runs *inside* the browser
  page context the Engine already isolates (FR-012/FR-013) — it introduces no new network egress,
  no new credential surface, and no new process boundary beyond what the Browser Engine already
  has.
- **Rationale**: this is exactly the "mature, maintained component, not a dependency merely because
  it's popular" bar the master brief's own research section (§58) sets; axe-core is the de facto
  standard deterministic accessibility rule engine and requires no bespoke security review beyond
  the browser-context isolation this spec already designs.
- **Alternatives considered**: a custom, hand-written ARIA/contrast rule engine (rejected —
  unjustified reinvention of a mature, already-correct component for no stated benefit).

## R11: Backward-compatibility evidence — does any existing production call site reference any of
this spec's new constructs?

- **Decision**: none exists, confirmed directly by this session's own three research passes: no
  `ACCESSIBILITY`/`FUNCTIONAL` `ModuleType` value, no `VisualBaseline` table, no `CONSOLE_MESSAGE`/
  `CRAWL_DISCOVERY`/`STRUCTURED_DATA`/`CHECK_RESULT` `EvidenceKind` value exists in the current
  schema; no crawler/accessibility capability exists under `packages/capabilities-vendored/`; zero
  references to `probe-pool` exist from `apps/worker`/`apps/api`.
- **Rationale**: FR-051's "zero behavior change" claim should be evidence-backed the same way
  006/007/008/009 each insisted their own equivalent claims be.
- **Alternatives considered**: asserting backward compatibility without this check (rejected — the
  same posture every prior spec in this lineage already flagged as insufficient for its own
  identical claim).

## R12: Does this spec need to amend 006/009's own documents for anything found during this pass?

- **Decision**: no amendment to 006/007/008/009 is required or made. This spec's one genuine
  correction (R1/R3's reasoning) is recorded against its own, newly-introduced territory — it does
  not contradict any FR, contract, or ceiling value any of the four upstream packages already
  states.
- **Rationale**: per the master brief's own repeated "do not reopen frozen architecture casually"
  instruction, and because no genuine contradiction was found (every upstream contract this spec
  consumes — F01's scope-matching, F07's safety-checkpoint, 009's execution-unit/evidence/
  finalization contracts — was consumable exactly as published, with zero modification needed).
- **Alternatives considered**: proposing the `ModuleType`/`EvidenceKind` extensions as formal
  amendments to a document outside this spec's own directory (considered, not chosen — neither
  enum is owned by a frozen spec's own document; 009's `EvidenceKind` is explicitly designed to be
  extended by a downstream spec without a formal amendment ceremony, and `ModuleType` belongs to no
  spec at all).

## Independent Adversarial Review

For every scenario: whether already fully resolved by F01/F07/009 (this spec changes nothing, only
calls their contract correctly) or resolved by a specific FR of this spec's own.

| # | Scenario | Disposition |
|---|---|---|
| 1 | Target redirects to `localhost` | Already resolved by `packages/safe-net`'s existing SSRF-guarding proxy (reused unchanged, FR-012) plus F01's fresh per-destination `isInScope` check (FR-017) — a redirect to `localhost` fails both independently. |
| 2 | DNS changes after initial scope check | F01's own scope-matching contract is explicitly "called fresh, for the actual destination reached, every single time" (F01's own rule, reused) — there is no cached-DNS-implies-still-in-scope assumption anywhere in this spec. |
| 3 | Page opens an out-of-scope popup | FR-012: a popup is subject to the identical scope check as the opening page before being followed — never auto-trusted from its opener. |
| 4 | Page creates an infinite popup loop | FR-012's popup policy is bounded by the same per-unit `timeoutPolicyMs`/`SIGKILL` deadline (009 FR-019, unchanged) that bounds any other hung-page scenario — an infinite popup loop is indistinguishable, at the isolation layer, from any other hang, and is terminated the same way. |
| 5 | A service worker survives unexpectedly | FR-012/FR-013: Service Worker registration MUST NOT persist past its owning `BrowserContext`'s own teardown — a fresh context per unit (FR-013) structurally prevents survival into a later unit. |
| 6 | One tenant receives another tenant's cookies | FR-013: fresh `BrowserContext` per `ExecutionUnit`, zero persisted cookies/storage across contexts — structurally prevented, not merely policy. |
| 7 | A page never finishes loading | 009's own FR-019 `SIGKILL` deadline (reused, unchanged) bounds this regardless of the page's own cooperation; FR-009 classifies the resulting outcome correctly (`TIMEOUT`). |
| 8 | Browser crashes mid-screenshot | FR-009: classified `ENGINE_DEFECT` if the browser process itself is gone at the deadline; any `Evidence` already committed before the crash (e.g. a prior page's DOM capture) is never lost, since `recordEvidence` commits independently of finalization (009, reused). |
| 9 | Crawler enters infinite calendar URLs | FR-018's `PageIdentity` dedup plus FR-020's `maxPages`/`maxDepth` ceiling close this structurally — a calendar trap's infinite URL space is bounded by the budget regardless of how many distinct identities it generates before the ceiling is hit. |
| 10 | Query parameters generate infinite unique pages | Same as #9 — FR-020's hard page-count ceiling is the actual backstop; FR-018's dedup reduces redundant work but the ceiling is what prevents runaway growth even without perfect dedup. |
| 11 | Redirect loop | FR-020's fixed maximum redirect-hop count refuses (not hangs on) a loop. |
| 12 | Recursive sitemap index | FR-022: sitemap-discovered URLs count against the same `discoveryBudget` as any other discovery — a recursive sitemap cannot bypass the page-count ceiling, and a fixed sitemap-recursion-depth ceiling (implementation-time tuning, per this spec's "mechanism not number" posture) bounds the recursion itself. |
| 13 | Huge sitemap | FR-020's fixed maximum single-response-size ceiling refuses parsing an oversized response before attempting it. |
| 14 | Huge HTML page | Same ceiling (FR-020) applies uniformly to any fetched resource, sitemap or page. |
| 15 | Malformed HTML | Deterministic checks (FR-023/FR-036/etc.) operate on whatever the browser's own rendering engine or the existing regex-based parsers (`meta-checker`/`content-checker`, unchanged) produce from malformed input — a parse failure is recorded as `INCONCLUSIVE` or `BLOCKED` (FR-041) for the affected check, never crashes the Engine itself (FR-009's own crash-triage covers an Engine-level failure; a single check's own evaluator failing is caught and classified independently, per `contracts/web-check-registry-contract.md`). |
| 16 | Page triggers a download | FR-012: downloads are denied by default at the `BrowserContext` permission level — recorded as Evidence of what was attempted, never silently saved or executed. |
| 17 | Page attempts `file://` navigation | FR-012: top-level `file://`/`data:`/`blob:` navigation is refused by the context's own policy. |
| 18 | DNS rebinding after initial resolution | Closed by the existing `packages/safe-net` proxy's own re-resolution-aware design (reused unchanged, proven by its own adverse test suite) — this spec does not re-implement SSRF protection, only extends the threat model documentation to browser-specific vectors the proxy does not itself cover (FR-012). |
| 19 | Cloud metadata endpoint (`169.254.169.254`) requested from within the page | Same existing `safe-net` proxy coverage (FR-012, reused) — a private/link-local IP destination is exactly the class that proxy already blocks. |
| 20 | `javascript:` URI navigation | FR-012: refused at the context policy level, identical treatment to `file://`/`data:`. |
| 21 | Crawl trap via session-ID-bearing URLs | FR-018's `PageIdentity` normalization strips a session-id parameter only if it is explicitly present on the fixed, maintained allow-list (closure-pass rule: unknown = semantic by default, never heuristic) — FR-020's hard ceiling is the backstop regardless, including for a session-id scheme not yet on the allow-list. |
| 22 | Crawler follows a logout/delete link (state-changing GET) | FR-020's crawl behavior is read-only discovery (fetch + link-extraction) with no form submission or mutating action — a logout/delete endpoint reached via GET is fetched (as any other link is) but no further mutating action is taken by the Crawler Engine itself; whether *reaching* such a URL via GET itself causes a side effect is a target-side concern this spec cannot control, identical to the risk any ordinary web crawler accepts, and is explicitly out of this spec's own remediation scope (it is a target-side CSRF/safe-GET violation, not a Fahes defect) — named here for honesty, not resolved by new mechanism. |
| 23 | Compression bomb / huge decompressed response | FR-020's maximum single-response-size ceiling is checked against the decompressed size during streaming, never after fully buffering — refusing before the bomb fully expands in memory (implementation-time detail, named as a requirement here). |
| 24 | Slow/stalling response | FR-020/009's own per-unit `timeoutPolicyMs` bounds this — a stalling response is indistinguishable, at the isolation layer, from a hung page (#7) and is terminated the same way. |
| 25 | Workflow step ignores `AbortSignal` | 009's own FR-019 `SIGKILL` deadline does not depend on cooperation (identical resolution to 009's own adversarial scenario #29, inherited unchanged) — a workflow step cannot out-wait it. |
| 26 | Visual-baseline race: two scans attempt to approve different candidates for the same `(pageIdentity, matrixEntry)` concurrently | FR-026 (closure-pass revision): `approveBaseline`'s single atomic pointer upsert (`data-model.md` CF-1's fix) serializes the two calls via Postgres's own row-level lock on the `VisualBaseline` pointer row — one commits first and becomes active, the second's own approval is recorded in `VisualBaselineApproval` history and immediately marked superseded; never an undefined race, never two simultaneously-active rows. |
| 27 | A `WebCheckDefinition`'s own evaluator throws an uncaught exception | Caught and classified by the Domain Check Registry itself (`contracts/web-check-registry-contract.md`) as that specific check's own `INCONCLUSIVE`/`BLOCKED` result — never propagated to crash the owning `ExecutionUnit`'s own finalization, and never silently recorded as `PASS` (FR-041). |
| 28 | A reverify is requested for an orphan-page finding but the original crawl's scope is no longer reproducible (target restructured) | FR-043's named exception requires the same crawl scope; if that scope cannot be freshly re-authorized/re-resolved, the reverify plan resolves `REFUSED` (009's own `resolvePlan` fail-closed behavior, reused) rather than silently falling back to a narrower, misleading single-page check. |
| 29 | Coverage silently treated as PASS when a check never ran | Structurally prevented by FR-041: every check execution (including a never-attempted one, recorded by the Domain Check Registry's own dispatch bookkeeping as `NOT_TESTED` or `BLOCKED`) produces a `CHECK_RESULT` Evidence row — there is no code path that leaves a requested check with no recorded outcome at all. |
| 30 | Browser-matrix/page-count budget explosion (20 pages x 10 viewports x 5 browsers x 4 themes x 10 locales) | FR-049's refuse-at-a-fixed-ceiling rule (reusing 009's own refuse-not-truncate pattern) is the direct, named resolution to exactly this master-brief-stated risk. |

## Closure-Pass Research (2026-10-08)

The following four entries were added during this spec's own dedicated closure pass, which found
and corrected a genuine data-model defect (CF-1), closed the Domain Check Registry's recursion/
idempotency lifecycle, resolved a real ambiguity in F01's own frozen text against this spec's own
practice, and closed two crawler race conditions the original draft described in prose without a
feasible mechanism.

## R13: Does F01's own frozen scope-matching text require a fresh scope check for every incidental
page subresource, and if taken literally would that make ordinary web rendering impossible?

- **Decision**: no — resolved as a documented interpretation of F01's own text for this spec's own
  consuming purposes (F01's document itself is untouched). F01's `isAuthorized`/scope governs
  **engine-chosen destinations** (top-level navigation, the destination of a followed redirect, a
  popup/new-tab, a crawl-frontier expansion, a workflow `navigate` step) — not ordinary page
  subresources (fonts/CSS/JS/images/analytics/third-party embeds), which `packages/safe-net`'s own
  unconditional SSRF/egress proxy governs instead.
- **Rationale**: F01's own `scope-matching-contract.md` "Redirect / cross-origin / crawl-frontier
  rule" names three illustrative triggers — a redirect, "loads a cross-origin resource," and a
  crawl-frontier expansion — sharing one common thread: each is a destination the *engine itself*
  deliberately chooses to pursue as its own next action. F01 predates any spec that designed a
  rendering browser engine in detail; its own `ScopeDefinition` model (host/path patterns matched
  against a *target's own* domain) is built for "is this part of the site under test," a question
  that does not generalize to "should the browser be allowed to fetch Google's font CDN." Read
  fully literally, "loads a cross-origin resource" would require an independent scope check for
  every subresource a page loads while rendering, and since a `ScopeDefinition` is scoped to the
  target's own domain(s), nearly every third-party subresource would independently resolve
  out-of-scope — breaking ordinary rendering of almost any real website (no Google Fonts, no CDN-
  hosted libraries, no embedded video, no analytics). This is self-evidently not the intended
  behavior, and treating it as a hard contradiction requiring a halt (rather than a genuine
  ambiguity this spec is the first to encounter in practice) would block this spec's own closure
  for a reading its own upstream's history does not support: F07's own `safetyCheckpoint`'s
  `consumes: { request, concurrency }` budget-accounting model (also triggered by the identical
  "destination" concept) would, under the literal reading, need to run a full admission cycle per
  subresource — a burden no part of this lineage's own stated design (e.g. 009's own "no DB
  transaction per progress tick" bound) ever contemplated, further evidence the narrower reading is
  the one F01's own authors intended.
- **Why this is a resolution, not a silent amendment**: F01's own document is not edited; every
  destination F01's own illustrative examples actually describe still gets its fresh check,
  unchanged (navigation, redirect-of-navigation, crawl-frontier, workflow steps). Nothing about
  F01's enforcement is weakened — a destination this spec now treats as "engine-chosen" was always
  going to get checked; a destination this spec treats as "ordinary subresource" was never one of
  F01's own illustrative examples' actual subject matter in the first place.
- **Why this does not weaken SSRF protection**: `packages/safe-net`'s own proxy applies
  *unconditionally* to every request, scoped or not — it is, if anything, a *stronger* guarantee
  for subresources than a scope check would have provided, since it blocks dangerous destinations
  (localhost, private IPs, cloud metadata) regardless of which domain they claim to belong to,
  where a scope check alone would only have asked "is this the target's own domain."
- **Alternatives considered**: treating this as a hard contradiction and halting the closure pass
  with "WEB TESTING PLATFORM REQUIRES UPSTREAM ARCHITECTURE AMENDMENT" (considered seriously, given
  this closure pass's own explicit instruction to do exactly that for a genuine contradiction —
  rejected because this is ambiguity in underspecified scope, not a contradiction between two
  statements that cannot both be true: F01 never explicitly says subresources are in scope, and the
  product-level absurdity of the literal reading is itself strong evidence of what was actually
  intended); amending F01's own document to add this clarification directly (rejected — out of this
  spec's own charter, and unnecessary when F01's text supports the narrower reading without editing
  it).

## R14: Why was the original `VisualBaseline` persistence design infeasible, and is the fix actually Prisma/PostgreSQL-feasible?

- **Decision**: fixed via a pointer (`VisualBaseline`)/history (`VisualBaselineApproval`) split —
  see `data-model.md`'s own Closure Finding CF-1 for the full defect description and fix. Both
  halves use ordinary, non-partial `@@unique` constraints, requiring no Postgres extension and no
  Prisma feature beyond what F01/F07/009 already use.
- **Rationale**: the original single-table design's own prose ("enforced at the active layer...
  not by a bare `@@unique` across all rows ever created") directly contradicted the schema actually
  written in the same document (a bare `@@unique` on the full triple, with `supersededAt` outside
  the key) — a bare unique constraint on that triple rejects a legitimate second approval the
  instant it is inserted, since Postgres has no way to know "only count rows where `supersededAt`
  IS NULL" from an ordinary unique index alone.
- **Alternatives considered**: a Postgres partial/filtered unique index (`WHERE supersededAt IS
  NULL`) — rejected as the schema-level fix because Prisma's own schema language does not have
  first-class, version-independent support for partial indexes as of this lineage's own stated
  Prisma/PostgreSQL baseline, which would require a hand-written raw-SQL migration step outside
  Prisma's own declarative schema — a feasibility risk this spec's own closure instructions
  explicitly asked to avoid; service-layer-only enforcement with no real database constraint at all
  (rejected — exactly the kind of "vague check-then-create race" this closure pass was asked to
  eliminate, and the actual root cause of the original defect).

## R15: How does the Domain Check Registry avoid recursion, duplicate execution, and readiness
races, without becoming a second execution platform?

- **Decision**: (A) `CHECK_RESULT` is permanently excluded from the registry's own trigger set —
  structural, not developer-discipline, checked at registry load time. (B/E) every dispatch attempt
  is gated by an atomic `IdempotentClaim` (`scope: "check-execution"`) before any evaluation occurs
  — a lost claim is a no-op, closing duplicate execution from retries, replays, and two different
  required-kind Evidence rows both triggering a call. (C/D) readiness is a pure query ("are all
  required kinds present for this check's own declared `scopeKey`") run only after the claim is
  won, never before — a not-yet-ready claim is released, not left dangling, so a later genuinely-
  ready trigger is never blocked. (F/G) `materializeFinding` is called at most once per identity in
  practice because evaluation itself only happens once per identity (the claim gate), and 009's own
  `materializeFinding` is independently idempotent as a second, non-relied-upon layer of the same
  guarantee. A finalization-time sweep (`sweepUnresolvedChecks`) guarantees a check whose required
  evidence never arrives still ends with a recorded terminal verdict.
- **Rationale**: every one of these guarantees is achieved with ordinary atomic SQL statements
  (`INSERT ... ON CONFLICT`, conditional `UPDATE`) and one small, generic, reusable table
  (`IdempotentClaim`) — no new queue, no new `ExecutionUnitClass`, no second execution platform,
  directly satisfying this closure pass's own explicit "must remain lightweight deterministic
  parent-worker-side domain evaluation" instruction.
- **Alternatives considered**: a second `ExecutionUnit` per domain-check pass (rejected — widens
  009's own enum for a concern it was never designed for, repeating the exact mistake this spec's
  own Clarifications already avoided once); relying on application-level "check if already done"
  logic with no real atomic primitive (rejected — exactly the check-then-create race this closure
  pass was asked to eliminate); a bespoke table per use case instead of one generic
  `IdempotentClaim` (rejected — three structurally-identical tables would need to be kept
  consistent with each other forever, violating Constitution Principle VIII's own "reuse before
  inventing a parallel one" rule applied to this spec's own territory).

## R16: How does the Crawler Engine's `maxPages` budget and `PageIdentity` dedup stay correct under
concurrent discovery workers, without a check-then-create race?

- **Decision**: `maxPages` is reserved via a single atomic conditional-increment SQL statement
  against a dedicated `CrawlBudgetCounter` row (`UPDATE ... SET pagesCreated = pagesCreated + 1
  WHERE pagesCreated < maxPages RETURNING pagesCreated`) — Postgres's own row-level lock on that one
  counter row serializes any number of concurrent reservation attempts. `PageIdentity` dedup is an
  `IdempotentClaim` (`scope: "crawl-discovery"`) — two concurrent discoveries of the identical
  identity cannot both win the claim.
- **Rationale**: both are the same class of problem R15 already solved generically (an atomic,
  race-safe "exactly one winner" primitive), applied here to the Crawler Engine's own two
  concurrency-sensitive decisions — reusing `IdempotentClaim` for dedup and introducing one small,
  purpose-built counter table for the ceiling (a genuinely different guarantee — "bounded count,"
  not "claim once" — that does not fit the claim primitive's own shape).
- **Alternatives considered**: `SELECT COUNT(*) FROM ExecutionUnit WHERE ...` followed by a
  conditional `INSERT` (rejected — the exact check-then-create race this closure pass was asked to
  eliminate: two concurrent workers can both read "1 remaining" before either commits); an advisory
  lock keyed by the crawl root's id held for the duration of the entire discovery pass (rejected —
  unnecessarily serializes unrelated discovery work that does not touch the budget at all; the
  single-row atomic increment only ever contends with another caller doing the identical
  operation, never with unrelated work).

## Closure-Pass Independent Adversarial Review (2026-10-08)

Scenarios named in this feature's own closure-pass instructions, beyond the 30 already disposed
above. Disposition follows the identical format: already resolved by F01/F07/009, or resolved by a
specific FR/mechanism this closure pass added.

| # | Scenario | Disposition |
|---|---|---|
| C1 | Simultaneous baseline approvals for the same triple | `approveBaseline`'s atomic pointer upsert (CF-1/R14) — Postgres row-lock serializes; no undefined race (identical to adversarial #26, now using the corrected mechanism). |
| C2 | Superseded baseline history | `VisualBaselineApproval` rows are never deleted on supersession — only `supersededAt`/`retentionExtended` change; always queryable (FR-026, `data-model.md`). |
| C3 | Approved artifact retention | FR-026a: an active approval's `Artifact` is excluded from its originating scan's own retention sweep; a superseded one regains ordinary eligibility after a bounded audit grace period — resolved as a confirmed product-policy decision this closure pass, not invented silently. |
| C4 | `CHECK_RESULT` self-trigger recursion | Structurally impossible — `CHECK_RESULT` is permanently excluded from the registry's own trigger set (R15, FR-001a/FR-041a). |
| C5 | Duplicate Evidence delivery | The `IdempotentClaim` check-execution gate (R15) treats a duplicate trigger for an already-claimed or already-completed identity as a no-op. |
| C6 | Sibling Evidence arriving late | `readinessScope`'s own pure query re-evaluates readiness on every qualifying commit; a check is evaluated only once all required kinds are present, whenever that becomes true (R15 guarantee C/D). |
| C7 | Worker restart during check evaluation | A claimed-but-incomplete `IdempotentClaim` (`resultRef IS NULL`) past a staleness threshold is eligible for exactly one re-claim via an atomic `UPDATE` — never a permanently stuck or duplicated record (`data-model.md`'s own claim/retry semantics). |
| C8 | Duplicate Finding materialization | 009's own `materializeFinding` idempotency (its "skipping any id already linked" rule) is a second, independent layer behind this spec's own claim-gated exactly-once evaluation (R15 guarantee F) — belt and suspenders, neither relied on alone. |
| C9 | CDN/subresource scope behavior | Resolved by R13: subresources are never F01-scope-checked at all, closing the "would this break normal rendering" risk structurally rather than by exception-listing specific CDNs. |
| C10 | Redirect to localhost | Already closed by `packages/safe-net`'s existing proxy (unconditional, R13) — never reaches F01's scope check at all for this to matter, and would also fail F01's own fresh check for a navigation redirect regardless. |
| C11 | DNS rebinding | Closed by safe-net's own re-resolution-aware design (unchanged, adversarial #18) — applies identically to subresources now that R13 confirms safe-net, not F01, governs them. |
| C12 | Popup escape | FR-012: a popup is an engine-chosen destination (R13) — scope-checked fresh, identical to adversarial #3. |
| C13 | Iframe escape | An iframe's own top-level navigation within the frame is treated identically to a top-level page navigation for scope purposes (an engine-chosen destination, R13); the iframe's own subresources follow the same subresource rule as the main frame's. Not separately mechanism'd — the existing navigation/subresource split already covers it without a frame-specific exception. |
| C14 | Crawler budget race | `CrawlBudgetCounter`'s atomic conditional increment (R16) — the ceiling cannot be exceeded under any concurrency. |
| C15 | Duplicate URL discovery race | `IdempotentClaim` (`scope: "crawl-discovery"`, R16) — two concurrent discoveries of the identical `PageIdentity` cannot both win. |
| C16 | Semantic query collapse | `page-identity-contract.md`'s closure-pass rule: unknown parameter = semantic by default, allow-list only, never heuristic (closes the risk of two different rendered pages collapsing into one identity). |
| C17 | Sitemap explosion | FR-022/FR-020: sitemap URLs count against the same `CrawlBudgetCounter`-enforced ceiling as any other discovery — cannot bypass it via a separate path. |
| C18 | Unsupported browser | FR-011/FR-041: `UNSUPPORTED` verdict, checked before `evaluate` is even called (`web-check-registry-contract.md` step 5) — never silently omitted. |
| C19 | Missing required Evidence | `sweepUnresolvedChecks` (FR-041a) guarantees a terminal `BLOCKED`/`NOT_TESTED` verdict at plan finalization — never an unresolved, unrecorded check. |
| C20 | Axe/human-judgment false PASS | FR-028a: the registry structurally overrides a `HUMAN_JUDGMENT_REQUIRED` check's own `PASS`/`FINDING` to `INCONCLUSIVE` — cannot slip through as a trusted automated pass. |
| C21 | Persistent form mutation retry | FR-032a: every step above `LOCAL_BROWSER_MUTATION` carries an `IdempotentClaim` (`scope: "workflow-step-mutation"`) — a retried step recognizes its own prior execution and does not duplicate the mutation. |
| C22 | Destructive workflow action | FR-032a: the `DESTRUCTIVE` enum value itself grants no capability — every step above `LOCAL_BROWSER_MUTATION` still requires F01's own fresh, independently-granted authorization; this spec's own catalog cannot manufacture permission SPEC 012 alone would otherwise gate. |
| C23 | Truncated crawl orphan claim | FR-038 (unchanged by this closure pass, already correct): orphan status requires sufficient, non-truncated coverage; a budget-truncated crawl resolves `INCONCLUSIVE`, never `FINDING`. |
| C24 | Screenshot privacy exposure | FR-046 (closure-pass tightened): no pixel redaction exists or is claimed; the only protection is the same tenant-scoped `Artifact` access control every other artifact already has — stated as an explicit limitation, not papered over. |
| C25 | Stale reverify authorization | FR-043 (closure-pass tightened): reverify always re-checks F01 live, fresh, against current grants — the "minimum necessary scope" wording closure fixes the *breadth* of re-check, never its *freshness*, which was already correct. |
| C26 | Tenant-crossing baseline lookup | `getActiveBaseline`/`approveBaseline` both take `userId` as a required parameter and the `VisualBaseline` pointer's own unique constraint is keyed by `(userId, pageIdentity, browserMatrixEntryHash)` — a cross-tenant lookup for the same page/matrix simply misses (a different tenant's pointer row, if any, is a structurally distinct row) (FR-048). |

Zero scenario across both tables (30 original + 26 closure-pass) disappears without a resolving
mechanism — every one maps to a named FR, contract rule, or an explicit, correctly-scoped defer to
F01/F07/009.
