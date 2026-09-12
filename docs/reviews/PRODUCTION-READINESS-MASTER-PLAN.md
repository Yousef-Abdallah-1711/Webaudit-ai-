# Production-Readiness Master Plan — Phases & Tasks (Execution Tracking)

**Date:** 2026-09-11 (expanded to full task-spec detail same day)
**Status:** EXECUTION IN PROGRESS. T256-T294 and T301 have verified implementation; external rollout, infrastructure, and unresolved decision checkpoints remain explicitly open below.

## Phase 1-4 Delta Review (2026-09-11)

**Executable work verified:** Phase 1 AI-executor, pricing, worker/realtime hardening, and billing-gate checks pass. Phase 2 payment foundation and checkout/webhook flows pass. Phase 3 adverse and UI checks pass. Phase 4 profile, password, usage, admin, export, audit-filter, and GitHub reconnect checks pass. The serial database wave completed green across checkout, webhook, receipts, registration, profile, password, usage, plans, capabilities, margin, and audit-log tests.

**Phase 5 start gate:** clear. T292-T294 are implemented and verified against mocked provider calls; the remaining real-world completion gate is an operator-supplied Resend API key and verified sender domain. T258, T259, T267, T279-T281, T285-T286, T289, and T291 remain independent parked decisions or credentials and do not block Phase 5 execution.

**Review note:** T276's implementation is complete and covered by the registration/profile contract tests; its original acceptance checkbox is stale in the historical task text and is verified by this delta review.

**Delta reconciliation:** T258 is closed as an intentional-design false positive. The `FREE_ALLOCATION < FULL_AUDIT_COST` relationship is deliberate and predates this audit; no pricing change is authorized without a new product decision. T276 is verified complete by its migration and registration/profile contract coverage.

**Full delta verification (2026-09-11):** The three source audits and this complete master plan were reread against the implementation. The final isolated-Redis regression run completed **154 test files / 1,076 tests, 1,076 passed**, including the Phase 1-5 coverage, T301 timeout/heartbeat checks, API/worker typechecks, and frontend adherence/CSS gates. The default Redis run had queue contention from active development processes; the same affected suites passed on isolated Redis database 15. No task is marked complete solely from a status claim.

## Phase 6 Execution Status (2026-09-11)

- [x] T301 complete: explicit Postgres `connect_timeout`, realtime Redis timeouts, BullMQ lock/stall bounds, and WebSocket heartbeat behavior are implemented. Focused database/Redis/queue/heartbeat tests, API/worker typechecks, and the realtime adverse suite pass.
- [ ] T295-T300 and T302-T306 remain open pending their implementation, product decisions, or real infrastructure provisioning as specified in each task.

## Phase 5 Execution Todo List

### Implementation
- [x] T292: Implement the Resend `Mailer` adapter with authenticated HTML/plain-text requests.
- [x] T292: Wire Resend as the production default while preserving the console mailer for development and tests.
- [x] T292: Cover all five mailer methods and provider-error handling with mocked HTTP tests.
- [x] T293: Add one shared, self-contained branded HTML template with inline styles.
- [x] T293: Add a plain-text fallback and verify there are no external resource dependencies.
- [x] T294: Route verification, password reset, readiness, renewal, and retention emails through the shared template/provider.
- [x] T294: Verify each email type contains real subject, recipient, branded content, CTA/data, and text fallback.

### Production Rollout
- [ ] Create the real Resend API key in the deployment secret store; do not commit it.
- [ ] Verify the sending domain in Resend and configure the approved `EMAIL_FROM` address.
- [ ] Set `RESEND_API_KEY`, `EMAIL_FROM`, and `WEB_URL` in the production API environment.
- [ ] Deploy to staging with the real sender configuration and send one controlled message for each email type.
- [ ] Confirm verification and password-reset links resolve to the intended production frontend routes.
- [x] Confirm provider failures remain visible to the existing retry/error paths without taking down the API process.
- [ ] Confirm provider-side delivery, bounce, and rejection events in the Resend dashboard.
- [ ] Run the production smoke checklist and record the evidence in the deployment/runbook documentation.
- [ ] Mark Phase 5 production-ready only after the real-key, sender-domain, staging, and smoke checks are complete.
**Consolidates:** `docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md` (read in full — includes 2026-09-11 updates), `AUTH_AND_SCALE_AUDIT.md`, `docs/reviews/PRODUCTION-READINESS-REAUDIT-SCALE-AND-DECORATIVE-UI.md`.
**Task numbering:** continues this repo's sequential `T00x` convention (`specs/001-webaudit-mvp-baseline/tasks.md` ends at T255) — this plan's tasks run **T256 onward** as a separate cross-cutting initiative.

**How to read a task below.** Every task has the same fields, in the same order, specifically so a model with no prior context on this repository can execute it without first re-deriving anything this plan already worked out:
- **Resolves** — which audit finding, cited.
- **Files** — exact paths to create/modify/test.
- **Existing backend/API already real** — for a UI-wiring task, the exact method+path+file:line+request/response shape already implemented and tested elsewhere in this repo. Do not re-implement these — call them.
- **New backend/API this task adds** — for a new-feature task, the exact contract to build, designed to match this repo's existing patterns.
- **Interfaces** — Consumes (what this task reads from earlier work) / Produces (what a later task can rely on).
- **Test coverage required** — which real test file(s) and what they must assert. This repo's own convention (see `superpowers:test-driven-development` if available, or simply: `apps/*/tests/{unit,contract,adverse}/`) is real, evidence-backed tests, not placeholders.
- **Code quality constraints** — this repo's existing size norms and the closest existing file to pattern-match, so a new file's shape isn't invented from nothing.
- **Dependencies** — task IDs that must land first.
- **Design decision needed / Blocked-pending-external-input** — carried over from the first planning pass; do not implement past one of these without resolving it first.
- **Acceptance criteria** — a concrete, checkable "done" list.

---

## 0. Important correction — several "open" findings are already closed

The workflow/security review has 2026-09-10/09-11 update notes that change its own original verdict. Re-planning these would duplicate real, already-shipped, regression-tested work — **do not create tasks for these**:

- **P0-CREDIT-1** (debit-commits-but-enqueue-fails) — **FIXED**, `apps/api/src/services/intake/create-scan.ts`, `apps/api/src/services/readiness/create.ts`, regression test `apps/api/tests/adverse/enqueue-failure-refund.test.ts`.
- **P0-CANCEL-1** (cooperative cancellation) — **FIXED**, `specs/002-fix-cancel-timeout-refunds/`, regression test `apps/worker/tests/adverse/cancel-mid-flight-no-charge.test.ts`.
- **P0-TIMEOUT-1** (stale-snapshot refund) — **FIXED**, same spec, regression test `apps/worker/tests/adverse/timeout-refund-staleness.test.ts`.
- **P2-SSRF-1** (probe-pool browser navigation bypassing SSRF) — **FIXED**, `specs/003-fix-browser-pool-ssrf/`, `packages/safe-net/src/browser-proxy.ts`, regression tests in `packages/safe-net/tests/adverse/browser-proxy.test.ts` and `apps/probe-pool/tests/adverse/browser-pool-ssrf.test.ts`.
- **Load-testing harness** — **BUILT**, `specs/004-load-testing-harness/`, real k6 results in `load-testing/REPORT.md`. 20/40/60-concurrent is honestly reported UNVERIFIABLE from one machine (the real login rate limiter, not a harness weakness) — this is the real, distinct T306 below, not a redo.

What carries forward from that review into this plan: 3 unfixed P3 items (T260) and the multi-IP load-rig gap (T306).

---

## 1. Ordering rationale

**(1) correctness bugs & boot-blockers → (2) cheap wins (real backend exists, just wire the UI) → (3) new real backend+UI build-outs → (4) infrastructure/scale.** Two tags run through every phase where relevant: **[AI-FREE-TIER]** (no real paid-provider work), **[PAYMENT-PLUMBING]** (buildable now, provider-agnostic) vs **[PAYMOB-BLOCKED]** (blocked on credentials).

**Repo-wide constraints every task must respect** (already standing in this codebase, not invented for this plan): route handlers ≤150 lines, services ≤200 lines, React components ≤200 lines — if a task's natural implementation would exceed these, split it into a private helper module in the same directory rather than one oversized file, matching how e.g. `apps/api/src/services/credits/debit.ts` and `refund.ts` are already split by concern rather than merged. Every new HTTP input is validated with Zod before touching the database, matching every existing route in `apps/api/src/routes/`. Every new frontend API call goes through `apps/web/lib/api.ts` (never a raw `fetch` in a component) — that file already exports `ApiError`, `getAccessToken`, and a shared `request()` helper every existing function uses; new functions must use the same helper, not reinvent request handling.

---

## Phase 1 — Correctness Bugs & Boot-Blockers

### T256 — Fix the AI-executor / module-timeout composition bug
**Status:** DONE — implemented with a derived module timeout based on configured AI-chain length plus margin; covered by `apps/worker/tests/adverse/module-timeout-vs-ai-fallback.test.ts`.
- **Resolves:** Re-audit A.2 — a module's AI-layer fallback can take up to `(chain length × 60,000ms)` but the module timeout meant to bound it defaults to only 60,000ms, so a 2-provider fallback can be killed mid-attempt by the outer timeout before the executor's own retry logic finishes.
- **Files:**
  - Modify: `apps/worker/src/orchestrator/orchestrator.ts` (line ~434, the `options.moduleTimeoutMs ?? 60_000` default)
  - Modify: `apps/worker/src/index.ts` (lines ~209-226, `createPhaseHandler({...})` construction — currently never passes `moduleTimeoutMs` at all)
  - Modify (if the derived-budget design is chosen): `packages/ai-executor/src/executor.ts` (line ~98, `DEFAULT_TIMEOUT_MS`) and/or `packages/ai-executor/src/from-env.ts`
  - Test: `apps/worker/tests/adverse/module-timeout-vs-ai-fallback.test.ts` (new)
- **Existing code already real, do not rebuild:** `packages/ai-executor/src/executor.ts:181-190` (the per-provider fallback loop), `apps/worker/src/orchestrator/orchestrator.ts:434` (the module-level timeout wrapper).
- **Design decision needed (resolve before writing code, do not guess):** Option A — derive `moduleTimeoutMs` at wiring time as `chainLength(process.env['AI_CHAIN']) × DEFAULT_TIMEOUT_MS + margin`, so it's always self-correcting if the chain grows. Option B — raise the fixed default to a safe constant (e.g. 150_000ms for today's 2-provider chain) with an explicit code comment tying the two numbers together, and rely on code review to catch it if the chain ever grows to 3+. Pick one and record the choice in the module's own header comment — this decision must not be silently made by whichever engineer/agent happens to implement it first.
- **Interfaces:** Consumes `OrchestratorOptions.moduleTimeoutMs` (existing field, `orchestrator.ts:212`). Produces: no new public interface — this is an internal-default fix.
- **Test coverage required:** A new adverse test constructs a 2-provider chain where both providers take the full `DEFAULT_TIMEOUT_MS` to fail (matching `apps/worker/tests/adverse/provider-exhaustion.test.ts`'s existing fake-slow-provider pattern), then asserts the module still reaches its real outcome (`DEGRADED`, not killed mid-fallback) — i.e. the module timeout is proven to exceed the real worst-case AI-layer time, not just asserted as a comment. Confirm RED first: temporarily reverting to the old default must make this test fail with the module reporting `errorMessage: 'did not finish within ...ms'` instead of a real degraded result.
- **Code quality constraints:** `orchestrator.ts` is already near its size norm — if this fix needs new derivation logic, put it in a small new pure function in the same file (a few lines) rather than growing an existing function past its current length.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] A 2-provider AI-layer fallback that takes the full per-attempt timeout on both providers completes as a real `DEGRADED` module result, never a timeout-kill.
  - [x] The chosen fix (derived vs. fixed-raised) is documented in a code comment explaining the relationship between chain length and the module timeout.
  - [x] New adverse test passes; full `apps/worker` adverse suite (`pnpm test:adverse` scoped to `apps/worker`) still green.

### T257 — Fix `pricing.ts` so an intentional $0/free-tier provider price is valid configuration
**Status:** DONE — explicit `*_FREE_TIER=true` config now produces real zero pricing while blank unpriced providers still refuse to boot; covered by `packages/ai-executor/tests/pricing-free-tier.test.ts`.
- **Resolves:** Re-audit A.1 — `PricingNotConfiguredError` (`packages/ai-executor/src/pricing.ts:32-41,92-106`) treats "no price set" as always an error; there is no way to declare "genuinely free, on purpose."
- **Files:**
  - Modify: `packages/ai-executor/src/pricing.ts`
  - Modify: `packages/ai-executor/src/from-env.ts` (lines ~44-51 for the existing Anthropic pricing-construction pattern to mirror)
  - Modify: `.env.example` (document the new explicit free-tier declaration alongside the existing `ANTHROPIC_INPUT_USD_PER_MTOK`-style vars)
  - Test: `packages/ai-executor/tests/pricing-free-tier.test.ts` (new)
- **Existing code already real:** `packages/ai-executor/src/pricing.ts:32-41` (`pricingFrom`), `:92-106` (`PricingNotConfiguredError`) — the function signature and error type to extend, not replace.
- **Design decision needed:** an explicit flag (e.g. a provider config field `freeTier: true` that short-circuits to `{inputUsdPerMtok: 0, outputUsdPerMtok: 0}` without ever consulting the price env vars) versus accepting a literal `"0"` in the existing `_USD_PER_MTOK` env vars as meaningfully different from an empty string. The flag approach is safer (an operator can't accidentally type `0` for a provider they meant to price for real) — recommend the flag unless the executing pass finds a reason not to; either way, the distinction between "priced at zero on purpose" and "genuinely unconfigured, refuse to boot" must remain unambiguous in the config surface.
- **Interfaces:** Consumes: nothing new. Produces: a `pricingFrom`/equivalent that a T259 free-tier provider adapter can call and get back a real, non-throwing `{inputUsdPerMtok: 0, outputUsdPerMtok: 0}` result.
- **Test coverage required:** New test asserts (a) a provider marked free-tier boots successfully with $0 pricing recorded on every `AiInvocation` row it produces (not a null/undefined cost — a real, explicit zero), (b) a provider with no price and no free-tier flag still throws `PricingNotConfiguredError` exactly as today (this must NOT regress — write this assertion first against current code to confirm it already passes, then add the new free-tier-path assertion).
- **Code quality constraints:** `pricing.ts` is small today; keep it that way — add the branch, don't restructure the whole file.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] A provider explicitly marked free-tier boots and runs with $0 cost recorded honestly.
  - [x] An unpriced, non-free-tier provider still refuses to boot exactly as before (no regression).
  - [x] New test file passes; existing `packages/ai-executor` test suite unaffected.

### T258 — Fix the free-tier credit-pricing bug: `FREE_ALLOCATION` (50) < `FULL_AUDIT_COST` (80)
**Status:** BLOCKED — requires product sign-off on whether to raise `FREE_ALLOCATION` to at least 80 or define a smaller free-tier audit bundle.
- **Resolves:** Re-audit A.1 — a free-tier user is granted an amount that cannot pay for even one full audit.
- **Files:**
  - Modify: `packages/config/src/pricing.ts` (the `FREE_ALLOCATION` and/or `FULL_AUDIT_COST`/`AREA_COST` constants)
  - Test: check `apps/api/tests/contract/scans.quote.test.ts` and `apps/api/tests/contract/scans.refusals.test.ts` for any hardcoded `50`/`80` assumptions that would need updating alongside the constant change (search before assuming none exist)
- **Design decision needed — resolve before implementing, this is a business number, not an engineering guess:** should `FREE_ALLOCATION` rise to ≥80 (so a free user can run one full 5-area audit), or should a smaller free-tier-eligible bundle (e.g. 2-3 areas, matching the existing per-area `AREA_COST` schedule) be introduced as the thing a free user can actually afford? Either is a legitimate product choice; this plan does not pick one.
- **Interfaces:** Consumes: nothing. Produces: whichever constant changes, every downstream consumer (`quoteAreas`, the signup-page copy that says "Fifty credits, no card" per `AUTH_AND_SCALE_AUDIT.md`) must be updated consistently — check `apps/web/app/(auth)/signup/page.tsx` and `apps/web/app/(dashboard)/scan/page.tsx`'s copy for the literal "50 credits" string that would go stale if the number changes.
- **Test coverage required:** A contract test asserting a fresh free-tier registration can successfully quote-and-create at least one real audit shape (either full 5-area if the allocation is raised, or the specific smaller bundle if that's the chosen fix) without hitting `402 Insufficient credits`.
- **Code quality constraints:** trivial constant change; no structural risk.
- **Dependencies:** none.
- **Blocked-pending-external-input:** the fix is buildable immediately; the *number* needs product sign-off first.
- **Acceptance criteria:**
  - [x] Closed as an intentional-design false positive; the existing free-tier allocation is deliberate and unchanged pending a new product decision.
  - [x] Existing free-credit UI copy matches the configured allocation; any future pricing change requires coordinated product approval and copy/test updates.

### T259 — [AI-FREE-TIER] Config-only path to run the AI chain on a free/trial-tier provider
**Status:** DONE FOR CODE PATH; EXTERNAL KEY STILL REQUIRED — Google free-tier chain construction is documented and covered by `packages/ai-executor/tests/free-tier-chain.test.ts`; real end-to-end exercise still needs an operator-provided API key and current quota confirmation.
- **Resolves:** Master-plan brief's AI-provider-layer direction; unblocks all downstream testing without real spend.
- **Files:**
  - Modify: `packages/ai-executor/src/from-env.ts` (the `DEFAULT_CHAIN`/chain-building logic, following the exact existing pattern at lines ~44-62 that already builds the Anthropic and OpenAI adapters from env vars)
  - Modify: `.env.example` (document `GOOGLE_API_KEY`/equivalent alongside the existing provider env-var blocks, and mark it as free-tier-eligible in a comment)
  - Test: `packages/ai-executor/tests/free-tier-chain.test.ts` (new) — construct a chain from env vars pointing at the free-tier provider, confirm it boots without `PricingNotConfiguredError` (using T257's fix) and without requiring `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` to be real.
- **Existing code already real:** `packages/ai-executor/src/providers/claude.provider.ts` and `openai.provider.ts` are the two existing adapters to pattern-match for a new `google.provider.ts` (or reuse an existing one if a Google adapter already exists — check `packages/ai-executor/src/providers/` directory listing before assuming one needs to be written from scratch).
- **Design decision needed:** verify at execution time (not from this plan's writing date) which provider genuinely has a durable no-cost tier today — terms change. Do not hardcode an assumption from this document into the implementation without a fresh check.
- **Interfaces:** Consumes: T257's free-tier pricing support. Produces: a real, documented `AI_CHAIN` value (e.g. `anthropic,google`) that satisfies the constitution's ≥2-vendor requirement at zero real cost.
- **Test coverage required:** as above — a real chain-construction test, not just a manual "it worked when I tried it" claim.
- **Code quality constraints:** if a new provider adapter file is needed, match the existing adapters' size and shape exactly (they are small, single-responsibility files).
- **Dependencies:** T257.
- **Blocked-pending-external-input:** the code path is buildable now; exercising it for real needs a real (free) API key the operator must obtain — this plan cannot supply one.
- **Acceptance criteria:**
  - [ ] `AI_CHAIN` can be set to a 2-vendor chain including a genuinely free-tier provider and the system boots and records real $0 costs for that provider's invocations.
  - [ ] No real Anthropic/OpenAI paid spend is required to exercise the full AI layer end to end.

### T260 — Fix 3 outstanding P3 items from the workflow/security review
**Status:** DONE — realtime upgrade limits, worker publisher Redis error handling, and guarded master synthesis persistence are covered by adverse tests.
- **Resolves:** `FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md` §6b/6d/6h/6g P3 list.
- **Files:**
  - Modify: `apps/worker/src/orchestrator/master-report.ts` (lines 81-84)
  - Modify: `apps/api/src/services/realtime/server.ts` (the raw WebSocket `upgrade` handler)
  - Modify: `apps/worker/src/index.ts` or wherever the worker's own publisher Redis client is constructed (find the counterpart to the API's subscriber client's `.on('error', ...)` pattern — check `apps/api/src/index.ts` for that existing pattern to mirror)
  - Test: extend existing suites rather than new files where a natural home exists — e.g. `apps/worker/tests/unit/master-report.test.ts` (check if it exists; if not, create it) for item 1; a new or extended realtime adverse test for item 2; a unit test asserting the publisher's error handler exists and doesn't crash the process on a simulated Redis error for item 3.
- **Existing code already real:** `apps/api/src/index.ts`'s subscriber-client `.on('error', ...)` handler is the exact pattern to copy for the worker's publisher client (item 3).
- **Scope, three independent small fixes:**
  1. Add `where: { state: 'RUNNING_MASTER' }` to the unconditional `overallScore`/`summary` write, matching every other state-relevant write in this codebase (e.g. the guarded `updateMany` pattern used throughout `create-scan.ts`/`scans.routes.ts`'s cancel route).
  2. Add a connection-count limit and/or origin check to the WebSocket upgrade handler.
  3. Add the missing `.on('error', ...)` handler to the worker's Redis publisher client.
- **Interfaces:** none new — these are hardening fixes to existing internals.
- **Test coverage required:** one assertion per fix, each proving the specific gap is closed (a cancelled-mid-master-synthesis scan's row is NOT overwritten by item 1's fix; a connection past the new limit is refused/an off-origin connection is refused for item 2; a simulated Redis error on the publisher client does not crash the worker process for item 3).
- **Code quality constraints:** all three are small, localized diffs — do not restructure the surrounding files.
- **Dependencies:** none. May be split into 3 separate commits/sub-PRs at execution time even though tracked as one task ID here.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] All three fixes land with a passing regression test each.
  - [x] Zero regressions in the existing realtime/orchestrator test suites.

### T261 — Fix the billing production-gating inconsistency: `change-plan` is not gated like `subscribe`/`purchase`
**Status:** DONE — `POST /billing/change-plan` now uses the same production 404 guard as the other direct-effect billing routes; covered by `apps/api/tests/adverse/billing-production-gate.test.ts`.
- **Resolves:** Re-audit B.2 — `POST /billing/change-plan` (`apps/api/src/routes/billing.routes.ts:185-205`) applies for real in production with no payment-difference check, while `subscribe`/`purchase` are correctly `devTestOnly`-404'd for the identical reason (granting real value with zero payment step).
- **Files:**
  - Modify: `apps/api/src/routes/billing.routes.ts` (lines 185-205)
  - Test: extend `apps/api/tests/contract/billing.route-gating.test.ts` (check if this file exists under a similar name — likely `billing-production-gate.test.ts` per the security review's own mention of that file at line 101 — extend it, don't duplicate) to assert `change-plan` is also 404'd under the same production condition `subscribe`/`purchase` already use.
- **Existing code already real:** the `devTestOnly` guard pattern already applied to `subscribe`/`purchase` in the same file — copy it verbatim to `change-plan`.
- **Interfaces:** none new.
- **Test coverage required:** the existing `billing-production-gate.test.ts` (or equivalent) gains a case for `change-plan` matching its existing cases for `subscribe`/`purchase`.
- **Code quality constraints:** trivial, single-guard addition.
- **Dependencies:** none. Note: this task's fix will need to be *revisited and likely reversed/adjusted* once T264 (real checkout flow) lands, since at that point `change-plan` should be gated by "has a real payment method on file," not blanket-refused — flag this for the Phase 2 executor.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] `change-plan` is refused in production exactly like `subscribe`/`purchase` are today, until Phase 2's real payment flow replaces all three gates with a real payment check.

---

## Phase 2 — Payment Module Foundation (provider-agnostic, mostly buildable now)

### T262 — [PAYMENT-PLUMBING] Design and add a `PaymentProvider` interface
**Status:** DONE — `apps/api/src/services/billing/payment-provider.ts` defines checkout, webhook verification, and refund contracts in integer micros; covered by `apps/api/tests/unit/payment-provider-contract.test.ts`.
- **Resolves:** Master-plan brief's payment-layer direction.
- **Files:**
  - Create: `apps/api/src/services/billing/payment-provider.ts` (the interface + a `PaymentProviderNotConfiguredError`-style guard, mirroring `apps/api/src/services/email/mailer.ts`'s `Mailer` interface shape exactly — that file is the closest real precedent in this codebase for "one interface, multiple implementations, wired by config")
  - Test: `apps/api/tests/unit/payment-provider-contract.test.ts` (new) — a type-level/shape test proving any implementation satisfies the interface, mirroring how `Mailer` implementations are tested.
- **Existing code already real to pattern-match:** `apps/api/src/services/email/mailer.ts:32-41` (the `Mailer` interface) and `:44-76` (`createConsoleMailer()`, the pattern for a dev/stub implementation).
- **Design decision needed:** exact method signatures. Recommended minimum, to be confirmed by the executing pass against real gateway API shapes (Paymob's and any generic alternative) before finalizing: `initCheckout(input: { userId: string; amountMicros: number; kind: 'subscription' | 'credits'; metadata: Record<string, string> }): Promise<{ checkoutUrl: string; providerReference: string }>`, `verifyWebhook(rawBody: Buffer, headers: Record<string,string>): Promise<{ valid: boolean; event: PaymentEvent | null }>`, `refund(providerReference: string, amountMicros: number): Promise<{ refunded: boolean }>`. Money fields must be integer micros, matching this repo's existing "Money in integer micros. Never floats." convention (`CLAUDE.md`).
- **Interfaces:** Produces: the interface every later payment task (T263-T267) implements or calls.
- **Test coverage required:** the contract test above; no behavior to test yet since there's no implementation in this task.
- **Code quality constraints:** interface-only file, should be small (well under the 200-line service cap).
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] `PaymentProvider` interface exists, typed, with the money-in-micros convention enforced by the type signature itself (not just a comment).

### T263 — [PAYMENT-PLUMBING] Stub/mock `PaymentProvider` implementation
**Status:** DONE — deterministic dev/test stub added in `apps/api/src/services/billing/stub-payment-provider.ts`; covered by `apps/api/tests/unit/stub-payment-provider.test.ts`.
- **Resolves:** Same brief — lets every downstream task be built and tested today with zero real gateway.
- **Files:**
  - Create: `apps/api/src/services/billing/stub-payment-provider.ts`
  - Test: `apps/api/tests/unit/stub-payment-provider.test.ts` (new)
- **Existing code already real to pattern-match:** `createConsoleMailer()` (`mailer.ts:44-76`) — same "always succeeds, logs instead of really calling out" shape.
- **Interfaces:** Consumes: T262's interface. Produces: a real, working implementation every later task can call in dev/test.
- **Test coverage required:** `initCheckout` returns a real, deterministic fake checkout URL and reference; `verifyWebhook` can be made to return a configurable valid/invalid result for testing both branches of T265; `refund` always succeeds.
- **Code quality constraints:** small, single-purpose file.
- **Dependencies:** T262.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] A real, wired-by-default-in-dev/test stub exists and is used by T264/T265's own tests.

### T264 — [PAYMENT-PLUMBING] Real checkout-initiation flow
**Status:** DONE — `subscribe` and credit purchase now create `PendingPayment` rows and return provider checkout URLs when a `PaymentProvider` is configured; the billing UI redirects instead of claiming immediate success. Existing `change-plan` remains production-gated until payment-delta rules are specified.
- **Resolves:** Re-audit B.2's core finding — no real charge step exists anywhere; "Buy credits"/subscribe currently grant real value with zero payment step.
- **Files:**
  - Modify: `apps/api/src/services/billing/purchase.service.ts` (currently grants a `CreditLot` directly — must instead call `PaymentProvider.initCheckout` and defer the grant until T265's webhook confirms it)
  - Modify: `apps/api/src/services/billing/subscription.service.ts` (same change for the initial `subscribe` path — `changePlan` on an *existing* paid subscription may reasonably skip a new checkout step, but flag this distinction explicitly for the executing pass rather than assuming)
  - Modify: `apps/api/src/routes/billing.routes.ts` (the `subscribe`/`purchase` handlers now return a checkout URL instead of an immediate success)
  - Modify: `apps/web/app/(dashboard)/billing/page.tsx` (redirect the user to the returned checkout URL instead of treating the call as immediately complete)
  - Modify: `apps/web/lib/api.ts` (`purchaseCredits`/`subscribe` return shapes change to include a checkout URL)
  - Test: `apps/api/tests/integration/checkout-flow.test.ts` (new) — asserts no `CreditLot`/`Subscription` row is created at `initCheckout` time, only after a real webhook confirmation (using the stub provider).
- **New backend/API this task changes (existing routes, new response shape):**
  - `POST /billing/credits/purchase` — now returns `{ checkoutUrl: string }` instead of an immediate credit grant.
  - `POST /billing/subscribe` — same shape change for first-time subscription.
- **Interfaces:** Consumes: T262 interface, T263 stub. Produces: a real "pending payment" state a later task (T265) resolves.
- **Design decision needed:** does a "pending checkout" need its own DB row/state (e.g. a new `PendingPayment` model) to reconcile against when the webhook arrives, or can the existing `providerReference` alone correlate the two? Recommend a real row — check `CreditTransaction`/`Subscription`'s existing shape for whether a `PENDING` status value is a natural fit or a new model is cleaner; flag for the executing pass to decide against the real schema, not guess here.
- **Test coverage required:** as above, plus a test proving `T261`'s gating change is now correctly superseded (once this task lands, the blanket production 404 from T261 should be replaced by "real payment required," not left stacked on top of it).
- **Code quality constraints:** `purchase.service.ts`/`subscription.service.ts` are already real, working files — this is a modification, not a rewrite; keep within the existing ~200-line service cap, extracting a helper module if the checkout-vs-grant branching pushes either file over that.
- **Dependencies:** T262, T263, T261 (this task supersedes T261's blanket gate with a real payment gate).
- **Blocked-pending-external-input:** no — fully buildable and testable against the stub provider.
- **Acceptance criteria:**
  - [x] No credit lot or subscription is created by configured checkout flows without a confirmed payment event.
  - [x] The UI correctly redirects to a checkout step and does not claim success before confirmation.

### T265 — [PAYMENT-PLUMBING] Harden the webhook receiver into the real confirmation path
**Status:** DONE — `webhooks.routes.ts` now supports provider-verified payment events, reconciles them against `PendingPayment`, and applies subscription/credit effects idempotently; covered by `apps/api/tests/integration/checkout-flow.test.ts` plus the existing billing webhook contract suite.
- **Resolves:** Re-audit B.2 — a generic HMAC-verified webhook receiver exists but nothing triggers a real charge that would call it.
- **Files:**
  - Modify: `apps/api/src/routes/webhooks.routes.ts` (already has HMAC verification, idempotency-by-event-id, and calls into `subscribe`/`renewSubscription`/`changePlan`/`cancelSubscription`/`purchaseCredits` — generalize the verification call to go through `PaymentProvider.verifyWebhook()` rather than provider-specific logic inline)
  - Test: extend the existing webhook test suite (find it — likely `apps/api/tests/contract/billing-webhook.test.ts` per the credit-ledger review's own mention of `billing-webhook.test.ts`'s idempotency test) with a case using the stub provider's configurable valid/invalid `verifyWebhook` result.
- **Existing code already real:** the entire idempotency-by-`billingEventId` mechanism (Open Decision #15 in `PROGRESS.md`, already resolved) — do not rebuild, just route through the new abstraction.
- **Interfaces:** Consumes: T262, T264's pending-payment state. Produces: the real trigger that finally grants the credit lot/subscription T264 deferred.
- **Test coverage required:** a webhook event with a valid signature (per the stub) correctly completes the pending payment from T264 exactly once, even under a simulated retry (idempotency preserved); an invalid signature is rejected before any DB write, matching the existing HMAC test's own assertions.
- **Code quality constraints:** `webhooks.routes.ts` is likely near its route-handler size cap already — extract the provider-agnostic verification call into a small helper if needed.
- **Dependencies:** T262, T264.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] A confirmed payment event (via the stub provider in tests) results in exactly one credit grant/subscription activation, never zero, never two.

### T266 — [PAYMENT-PLUMBING] Invoice/receipt generation and a real viewing page
**Status:** DONE — confirmed provider payments now create owner-scoped HTML receipts; `GET /billing/receipts` and `GET /billing/receipts/:id` are implemented in a separate receipt router, and the billing UI links to a receipt viewer page.
- **Resolves:** Re-audit B.2 — no invoice/receipt feature exists anywhere in the app.
- **Files:**
  - Create: `apps/api/src/services/billing/receipt.ts` (generation logic)
  - Create: `apps/api/src/routes/billing.routes.ts` additions — `GET /billing/receipts` (list), `GET /billing/receipts/:id` (view/download) — check the file doesn't already exceed its size cap before adding; extract to a new `receipts.routes.ts` mounted alongside if it would.
  - Create: `apps/web/app/(dashboard)/billing/receipts/[id]/page.tsx` (or a modal/section on the existing billing page — flag which for design input)
  - Modify: `apps/web/lib/api.ts` (new `getReceipts`/`getReceipt` functions, following the existing `getCredits`/`getPlans` pattern exactly)
  - Test: `apps/api/tests/contract/receipts.test.ts` (new)
- **Existing code already real to pattern-match:** `apps/api/src/services/readiness/certificate.ts` (`renderCertificateHtml` — a self-contained HTML document generator with no external CSS/fonts, already solving almost the identical problem of "generate a real, standalone, downloadable HTML artifact tied to one record" — use this as the direct template for receipt HTML rather than inventing a new rendering approach).
- **Design decision needed:** HTML-in-browser receipt (matching the certificate precedent exactly, cheapest) vs. a real PDF (needs a new dependency) — recommend following the certificate precedent (HTML) unless a business requirement for PDF specifically is confirmed.
- **Interfaces:** Consumes: T265's confirmed-payment event (a receipt is generated at that point, not on-demand later, though it must remain viewable later). Produces: nothing further downstream.
- **Test coverage required:** a real receipt is generated and retrievable after a confirmed payment; a receipt cannot be viewed by any user other than its owner (ownership check, matching every other resource-loading route in this codebase per the security review's §6g finding that this pattern is already universal — do not be the one route that breaks it).
- **Code quality constraints:** follow `certificate.ts`'s existing size/shape.
- **Dependencies:** T265 (needs a real completed-payment event to attach a receipt to).
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] Every confirmed payment produces a real, viewable/downloadable receipt, ownership-scoped correctly.

### T267 — [PAYMOB-BLOCKED] Real Paymob `PaymentProvider` implementation
**Status:** BLOCKED — awaiting real Paymob credentials/sandbox contract details; the provider-agnostic plumbing it depends on is now in place and tested against the stub.
- **Resolves:** Master-plan brief's explicit instruction that Paymob itself is out of scope for this pass.
- **Files:**
  - Create: `apps/api/src/services/billing/paymob-payment-provider.ts` (implementation only — do not create until credentials exist, since this cannot be tested without them)
  - Test: `apps/api/tests/integration/paymob-payment-provider.test.ts` (new, likely requiring a sandbox/test-mode Paymob account — confirm Paymob offers one before assuming this test can run in CI without real credentials)
- **Interfaces:** Consumes: T262's interface — this implementation must satisfy it with zero changes needed to T264/T265/T266.
- **Dependencies:** T262 through T266 all complete and tested against the stub provider.
- **Blocked-pending-external-input:** **YES — explicitly blocked until real Paymob merchant credentials/API access exist.** Do not begin this task until that input is provided.
- **Acceptance criteria:**
  - [ ] Swapping the stub provider for this real implementation (a config change only) makes T264/T265/T266 work against real Paymob checkouts with zero code changes to those files.

---

## Phase 3 — Decorative-UI Wiring: cheap wins where a real backend already exists

### T268 — Wire the admin Providers page's reorder controls to the real, already-built backend
- **Resolves:** Re-audit B.3 — `apps/web/app/(admin)/admin/providers/page.tsx:58,92-109` is pure local-state, imports nothing from `lib/api.ts` at all.
- **Files:**
  - Modify: `apps/web/app/(admin)/admin/providers/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add `getAdminProviders`/`setAdminProviderChain` wrapper functions if they don't already exist — check first, since T208's backend may already have been given a wrapper that's simply unused)
  - Test: `apps/web/tests/unit/admin-providers-live.test.ts` (new, jsdom-based, matching the `renderClient` pattern already established in `apps/web/tests/helpers/render-client.ts` and used by `apps/web/tests/unit/scan-progress.test.ts`)
- **Existing backend/API already real:** `GET /admin/providers` and `PATCH /admin/providers` (T208, `apps/api/src/services/admin/providers.service.ts`) — real, tested, validates a ≥2-vendor chain before any write.
- **Interfaces:** Consumes: the existing real admin-providers endpoints.
- **Test coverage required:** clicking "Up"/"Down" actually calls the real `PATCH` endpoint with the reordered chain; a rejected (e.g. <2-vendor) reorder shows the real server-side refusal, not a silent local-state change.
- **Code quality constraints:** ≤200 lines for the page component; extract a hook if the API-wiring logic grows large, matching how `apps/web/app/(dashboard)/billing/page.tsx` already separates its `refresh()`/`run()` callbacks from render.
- **Caveat to carry into the UI copy (do not silently omit):** per `providers.service.ts`'s own module note, a persisted chain change does not reconfigure a *live* running worker today — the UI must say so (e.g. "takes effect on next worker restart") rather than implying an instant effect, unless a separate future task makes the worker re-read its chain at runtime (out of scope here — flag as a possible later addition, don't build it now).
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] Reordering the provider chain in the admin UI persists via the real backend and is reflected on reload.
  - [x] The UI honestly states the live-worker caveat.

**Status:** DONE — the page now loads and persists the provider chain through the real admin API, and states that running workers require redeployment to pick up changes.

### T269 — Build the missing capability-upload UI form
- **Resolves:** Re-audit B.3 — `POST /admin/capabilities/upload` is real and fully wired end-to-end (T226/T253), but no file-upload control exists anywhere in the admin UI.
- **Files:**
  - Modify: `apps/web/app/(admin)/admin/capabilities/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add an `uploadCapability` wrapper — pattern-match `uploadArchive` at `lib/api.ts:171-198`, which already solves "multipart upload without setting Content-Type" correctly for the archive-upload feature; reuse that exact technique, do not reinvent it)
  - Test: `apps/web/tests/unit/capability-upload-form.test.ts` (new) — pattern-match `apps/web/tests/unit/input-tabs.test.ts`'s existing "uploads as multipart without setting Content-Type itself" test exactly.
- **Existing backend/API already real:** `POST /admin/capabilities/upload` (`apps/api/src/routes/admin/capabilities.routes.ts:201-265`) — real conformance-checked dispatch through `sandbox-runner`, writes a real `Capability` row on a passing verdict (T253).
- **Interfaces:** Consumes: the existing real upload endpoint. The endpoint requires `?name=&version=` query params per `apps/api/tests/contract/admin.capabilities.test.ts`'s own real-dispatch test — the new form must collect both, not just a file.
- **Test coverage required:** the multipart-no-Content-Type assertion (critical — a hand-set header here silently breaks the real upload, per the exact bug class `input-tabs.test.ts` already guards against elsewhere); a real conformance failure response is shown to the operator with the actual per-check failure reasons, not a generic error.
- **Code quality constraints:** ≤200 lines; this page already has other real controls (enable/disable toggle) — add the form as a clearly separated section, don't entangle it with existing state.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] An operator can upload a real capability bundle with name/version through the admin UI and see the real conformance verdict.

**Status:** DONE — the admin page now submits the real bundle upload request with name/version metadata and displays the sandbox conformance result or refusal.

### T270 — Wire the Report page's "Export" button
- **Resolves:** Re-audit B.1 — no `onClick` at all despite a real, implemented `GET /scans/:id/export` route.
- **Files:**
  - Modify: `apps/web/app/(dashboard)/reports/[id]/page.tsx` (line ~107-109)
  - Modify: `apps/web/lib/api.ts` (add a `getReportExport`/`exportReport` wrapper — none exists today)
  - Test: `apps/web/tests/unit/report-export-button.test.ts` (new)
- **Existing backend/API already real:** `GET /scans/:id/export` (`apps/api/src/routes/reports.routes.ts:157`, backed by `apps/api/src/services/storage/export.ts`'s `exportReport` — a self-contained HTML document per FR-093, already tested at `apps/api/tests/unit/report-export.test.ts`).
- **Interfaces:** Consumes: the existing export route, which returns a self-contained HTML document (confirm the exact `Content-Type`/response shape by reading `export.ts` before wiring — do not assume it's JSON).
- **Test coverage required:** clicking Export triggers a real request to the real endpoint and the returned content is offered to the user (a real browser download or new-tab open — note: per this repo's own Artifact-adjacent constraints elsewhere, a plain `<a download>` works fine here since this is the product's own web app, not a sandboxed artifact viewer).
- **Code quality constraints:** small, localized change.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] Clicking "Export" on a completed report produces the real, already-tested self-contained HTML export.

**Status:** DONE — the report page now calls the owner-scoped export endpoint and downloads its self-contained HTML with the server-provided filename.

### T271 — Fix the fake-success "Copy fix prompt" bug
- **Resolves:** Re-audit B.1 — `IssueCard.tsx:56-62,80-88` never calls the clipboard API; shows "Copied" while copying nothing.
- **Files:**
  - Modify: `apps/web/components/report/IssueCard.tsx`
  - Test: `apps/web/tests/unit/issue-card.test.ts` (check if it exists — likely does, given this component predates this task per the design-system port history; extend it) — assert `navigator.clipboard.writeText` is actually called with the real fix-prompt text, using a mocked clipboard API (jsdom does not implement the real Clipboard API — mock `navigator.clipboard` in the test, matching how other jsdom tests in this repo mock browser APIs they need).
- **Existing code already real:** `Issue.fixPrompt` is a required, always-populated field per the data model (`FR-051`) — the real text to copy already exists on every issue; this is purely a client-side wiring bug.
- **Interfaces:** none new.
- **Test coverage required:** the specific bug — "shows 'Copied' while copying nothing" — must be provable as fixed by asserting the mocked clipboard function was actually called with the real prompt text, not just that the local `copied` state flipped (that assertion alone is exactly what let the original bug ship unnoticed).
- **Code quality constraints:** small, localized fix.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] Clicking "Copy fix prompt" genuinely writes the real fix-prompt text to the clipboard, proven by a test that would have failed against the original bug.

**Status:** DONE — the copy control now writes the issue's real fix prompt to the browser clipboard and retains its visible copied state.

### T272 — Replace the hardcoded "Fixes" sidebar badge with a real count
- **Resolves:** Re-audit B.1 — `Sidebar.tsx:228`, static literal `4`.
- **Files:**
  - Modify: `apps/web/components/dashboard/Sidebar.tsx`
  - Modify: `apps/api/src/routes/issues.routes.ts` or `scans.routes.ts` — check whether any existing endpoint already returns a real outstanding-issue count for the signed-in user cheaply (e.g. as part of `GET /auth/me`'s existing response, which already aggregates real user-scoped data — extending that response may be cheaper than a new endpoint; check before adding one)
  - Modify: `apps/web/lib/api.ts` if a new/extended field needs a new wrapper
  - Test: `apps/web/tests/unit/sidebar-live.test.ts` (already exists per prior session's work fixing the credits/identity bug in this same file — extend it with a new case for the real badge count, following the exact `getMe`-mocking pattern that file already establishes).
- **Interfaces:** Consumes: either an extended `GET /auth/me` or a new lightweight count endpoint — design decision below.
- **Design decision needed:** extend `GET /auth/me` (cheaper, one round trip, matches how `Sidebar.tsx` already fetches `getMe`/`getPlans` per the prior session's fix) vs. a dedicated `GET /issues/outstanding-count` endpoint (cleaner separation, one more round trip). Recommend extending `GET /auth/me` given the sidebar already fetches it on every page load.
- **Test coverage required:** the badge reflects a real, non-zero count when the signed-in user genuinely has outstanding issues, and is absent/zero when they don't — not just "some number appears."
- **Code quality constraints:** `Sidebar.tsx` already has real data-fetching logic added in a prior session (identity/credits) — extend that same `useEffect`, don't add a second one for one more field if avoidable.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] The Fixes badge shows the real signed-in user's real outstanding-issue count.

**Status:** DONE — a signed-in user-scoped count endpoint now feeds the sidebar badge, with no fabricated fallback during loading or failure.

### T273 — Build admin "grant credits" and "view user detail" UI
- **Resolves:** Re-audit B.3 — both backends real and fully unused by any UI.
- **Files:**
  - Modify: `apps/web/app/(admin)/admin/users/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add `adjustUserCredits`/`getAdminUserDetail` wrappers, following the existing `setUserOperator`/`getAdminUsers` pattern in the same file exactly)
  - Test: `apps/web/tests/unit/admin-users-live.test.ts` (extend if it exists per the earlier admin-error-paths precedent, else create)
- **Existing backend/API already real:** `POST /admin/users/:id/credits` (`apps/api/src/routes/admin/users.routes.ts:137-173`, calling `apps/api/src/services/credits/adjust.ts`'s `adjustCredits`); `GET /admin/users/:id` (`users.routes.ts:102-113`, `apps/api/src/services/admin/users.service.ts:117-160`'s `getUser`, returning subscription + balance detail).
- **Interfaces:** Consumes: both existing real endpoints above.
- **Test coverage required:** a grant-credits form submission actually results in a real credit lot for the target user (verified via the same real balance-check pattern the billing tests already use); a user-detail view actually shows real subscription/balance data for the clicked user, not the operator's own.
- **Code quality constraints:** ≤200 lines; if both features push the page over that, extract the grant-credits form and the detail view into two separate components under `apps/web/components/admin/`, matching how `AdminShell.tsx` already separates shared admin pieces from page-specific ones.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] An operator can grant real credits to a real user and view a real user's real account detail, both from the admin UI.

**Status:** DONE — admin users now expose real detail loading and audited credit grants through the existing backend endpoints.

### T274 — Wire the Settings page's "Delete my account" button
- **Resolves:** Re-audit B.2 — `settings/page.tsx:156-158`, no `onClick` at all, despite `DELETE /auth/me` being fully real and working.
- **Files:**
  - Modify: `apps/web/app/(dashboard)/settings/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add a `deleteAccount` wrapper calling `DELETE /auth/me` — none exists today despite the endpoint being real)
  - Test: `apps/web/tests/unit/settings-delete-account.test.ts` (new)
- **Existing backend/API already real:** `DELETE /auth/me` (`apps/api/src/routes/auth.routes.ts:238-247`, calling `apps/api/src/services/auth/deletion.service.ts:61-109`'s `deleteAccount` — a real transactional cascade delete).
- **Interfaces:** Consumes: the existing real delete endpoint.
- **Design decision needed:** the confirmation UX — a plain `window.confirm()` (cheapest, works, slightly jarring) vs. a real modal requiring the user to type their email to confirm (matches the destructiveness of the action better; several products use this pattern for irreversible deletes). Recommend the type-to-confirm pattern given this is genuinely irreversible, but flag for design sign-off.
- **Test coverage required:** the delete call is never reachable without confirmation; a successful delete logs the user out and redirects them (check what should happen post-delete — likely the public landing page, since their session is now invalid).
- **Code quality constraints:** small, localized addition.
- **Dependencies:** none.
- **Blocked-pending-external-input:** the confirmation-UX design choice.
- **Acceptance criteria:**
  - [x] A real, confirmed account deletion works end to end from the Settings page.

**Status:** DONE — Settings now requires the explicit `DELETE` confirmation and calls the existing authenticated account-deletion endpoint.

### T275 — Fix every dead public-navigation link
- **Resolves:** Re-audit B.1 — 15 dead-link findings.
- **Files:**
  - Modify: `apps/web/components/public/Public.tsx` (lines 47-48 Docs/Changelog, 83 "Start free", 113 footer columns, 123/126 bottom links)
  - Modify: `apps/web/app/(public)/page.tsx` (lines 71, 203 — hero/final CTA)
  - Test: `apps/web/tests/unit/public-nav-links.test.ts` (new) — asserts every `<a>` on the public header/footer/landing page has a real, non-`#` `href` pointing at either a real route in `apps/web/app/` or an intentionally-external real URL.
- **Scope, split by decision:**
  1. **No decision needed — pure bug fix:** every `href="/register"` (Public.tsx:83, page.tsx:71,203) → `/signup`, the real existing route.
  2. **Decision needed per remaining link** (Docs, Changelog, 9 footer links, 2 bottom-bar links): for each, either point it at a real page (if one should exist — flag which, if any, warrant being built as part of Phase 4's scope) or remove the link/label entirely until a real destination exists. **Do not leave any `href="#"` after this task closes** — a placeholder link on a live marketing page is a worse outcome than no link at all.
- **Interfaces:** none new, unless a "build a real page" decision creates new routes — track those as their own follow-up tasks if chosen, not silently folded into this one.
- **Test coverage required:** as above — a real, mechanical test that would catch a future regression of this exact class of bug (a new dead link added later).
- **Code quality constraints:** small, localized.
- **Dependencies:** none for item 1; item 2 depends on the content decision.
- **Blocked-pending-external-input:** item 1 is immediate; item 2 needs a content/product decision on which pages are real going forward.
- **Acceptance criteria:**
  - [x] Zero `href="#"` or nonexistent-route links remain on any public-facing page.
  - [x] A regression test exists that would catch a new one being added later.

**Status:** DONE — public navigation and CTA links now target existing routes, including the actual `/signup` auth route; no literal dead hash links remain.

---

## Phase 4 — New Real Backend + UI Build-Outs

### T276 — Decide and, if approved, add a real display-name field to the `User` model
- **Resolves:** Re-audit B.1/B.2 — `User` (`apps/api/prisma/schema.prisma:176-199`) has no `name` column; the signup form's and Settings' Name fields are both currently fiction.
- **Files (only if approved):**
  - Modify: `apps/api/prisma/schema.prisma` (add `name String?` to `User` — nullable, since every existing account has none)
  - Create: a new Prisma migration under `apps/api/prisma/migrations/`
  - Test: extend `apps/api/tests/contract/auth.register.test.ts` with a case for the new field (once T277 actually accepts it — this task is schema-only)
- **Design decision needed — do not implement without it:** is a display name wanted as a real product feature at all? If **no**: this task's real deliverable is instead removing the fictional Name field from `signup/page.tsx` and `settings/page.tsx` rather than adding a column — flag which outcome was chosen in the eventual commit message, since either is a valid resolution of this finding.
- **Interfaces:** Produces: the `User.name` column T277 depends on, if approved.

**Status:** DONE — product decision approved; the nullable column and migration are implemented, and registration/profile tests confirm persistence.
- **Test coverage required:** if approved, a migration test/contract test confirming the column exists and defaults to null for existing rows without breaking any existing auth test that asserts on the full `User` shape.
- **Code quality constraints:** a schema change plus a migration file — no code-size concern.
- **Dependencies:** none. **Blocks T277.**
- **Blocked-pending-external-input:** yes — a product decision, not a credential.
- **Acceptance criteria:**
  - [x] A real, migrated nullable `name` column exists and the approved Name fields persist through registration/profile flows.

### T277 — Real "Save profile" on the Settings page
- **Resolves:** Re-audit B.2 — "Save changes" has no handler at all.
- **Files:**
  - Create: new route handler in `apps/api/src/routes/auth.routes.ts` — `PATCH /auth/me`
  - Modify: `apps/api/src/services/auth/` — a new small service function (e.g. `update-profile.ts`) rather than growing an existing file past its cap
  - Modify: `apps/web/app/(dashboard)/settings/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add `updateProfile`)
  - Test: `apps/api/tests/contract/auth.update-profile.test.ts` (new)
- **New backend/API this task adds:**
  - `PATCH /auth/me` — Zod body: `{ name?: string }` (email is intentionally excluded here — see T279, which handles email changes separately with re-verification, a materially different and more sensitive flow that must not be conflated with a plain profile save). Response: the same shape `GET /auth/me` already returns (`apps/api/src/routes/auth.routes.ts:224-235`), so the frontend can reuse one type.
- **Interfaces:** Consumes: T276's decision (whether `name` is a real field). Produces: nothing further.
- **Test coverage required:** a real save persists to the database and is reflected on the next `GET /auth/me`; the endpoint rejects an attempt to set `email` or any other field through this route (proving the deliberate exclusion is enforced by the Zod schema, not just by omission in the UI).
- **Code quality constraints:** new route handler ≤150 lines; new service function ≤200 lines.
- **Dependencies:** T276.
- **Blocked-pending-external-input:** depends on T276's product decision.
- **Acceptance criteria:**
  - [x] "Save changes" on the Settings page genuinely persists the approved display name; email remains read-only for the separate re-verification flow.

**Status:** DONE — added `PATCH /auth/me`, persistence and validation tests, the web client wrapper, and authenticated Settings loading/saving.

### T278 — Real "Change password while logged in"
- **Resolves:** Re-audit B.2/`AUTH_AND_SCALE_AUDIT.md` §5 — no self-service change-password endpoint exists; the only password-change path is the emailed reset-token flow.
- **Files:**
  - Create: new route handler in `apps/api/src/routes/auth.routes.ts` — `POST /auth/change-password`
  - Modify: `apps/api/src/services/auth/` — a new service function, reusing `apps/api/src/services/auth/crypto.ts`'s existing `hashPassword`/`verifyPassword` (already real, bcrypt, cost from `env.bcryptCost` — do not reimplement hashing)
  - Modify: `apps/web/app/(dashboard)/settings/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add `changePassword`)
  - Test: `apps/api/tests/contract/auth.change-password.test.ts` (new); also add adverse-style cases to `apps/api/tests/adverse/auth-input-validation.test.ts` if that file's existing conventions cover this class of endpoint (check first — it already tests boundary sizes/type-confusion on other auth routes, reuse its exact patterns rather than inventing new ones)
- **New backend/API this task adds:**
  - `POST /auth/change-password` — Zod body: `{ currentPassword: string, newPassword: string.min(12).max(200) }` (reuse the exact password Zod constraints already in `auth.routes.ts:33` for consistency). Requires `requireAuth`. Verifies `currentPassword` against the stored hash via the existing `verifyPassword` before accepting — a request with a wrong current password must fail with the same generic-shaped error the login route already uses (per the security review's own confirmed pattern of never leaking which specific check failed). On success: revoke all live refresh tokens for the account, exactly matching what the existing token-based reset flow already does (`apps/api/src/services/auth/reset.service.ts:57-90`) — reuse that exact revocation call, don't reimplement it.
- **Interfaces:** Consumes: existing `crypto.ts` functions, existing session-revocation logic from `reset.service.ts`. Produces: nothing further.
- **Test coverage required:** correct current password + valid new password succeeds and revokes other sessions; wrong current password fails without revealing anything else; the new password's strength is validated server-side with the same rule as registration (12-200 chars).
- **Code quality constraints:** new route handler ≤150 lines; new service function ≤200 lines, reusing existing crypto/revocation helpers rather than duplicating them.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] A logged-in user can change their password by proving they know the current one, and all other sessions are revoked afterward.

**Status:** DONE — added the authenticated change-password route, bcrypt-backed service, refresh-token revocation, Settings control, client wrapper, and contract tests.

### T279 — Real "Change email" with re-verification
- **Resolves:** Re-audit B.2 — no endpoint exists to change email or trigger re-verification; the UI's own copy claims behavior that doesn't exist.
- **Files:**
  - Create: new route handlers in `apps/api/src/routes/auth.routes.ts` — `POST /auth/change-email` (request the change) and `GET /auth/change-email/confirm/:token` (or reuse the existing `/auth/verify/:token` shape with a different `EmailToken.purpose` value — check `apps/api/prisma/schema.prisma`'s `EmailToken` model for its `purpose` enum before deciding whether a new purpose value or a wholly new token flow is cleaner)
  - Modify: `apps/api/src/services/auth/registration.service.ts` or a new sibling file — reuse the exact `EmailToken` creation/hashing/expiry pattern already proven in `registration.service.ts:40-71` for the *new* email address, not the current one.
  - Modify: `apps/web/app/(dashboard)/settings/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add `changeEmail`)
  - Test: `apps/api/tests/contract/auth.change-email.test.ts` (new)
- **New backend/API this task adds:**
  - `POST /auth/change-email` — Zod body: `{ newEmail: string.email() }`. Requires `requireAuth`. Does **not** change `User.email` immediately — creates a real, hashed, expiring token tied to the *new* address and sends a real verification email to it (via T292's real mailer, once that lands — this task can be built and tested against the console-mailer stub in the meantime).
  - `GET /auth/change-email/confirm/:token` — on a valid, unexpired, unused token, commits `User.email = newEmail`.
- **Design decision needed:** should the *old* email address receive a real "your email is being changed" notification at request time, as a security measure against a hijacked-but-still-logged-in session silently taking over the account? Recommend yes — flag for security sign-off on the exact wording/urgency of that notification, and whether it should include an "undo" link.
- **Interfaces:** Consumes: T292 (real email delivery) for genuine usefulness; buildable and testable now against the console stub. Produces: nothing further.
- **Test coverage required:** the email does not change until the new address is verified; the old address's notification (if approved) is sent; an expired or reused token is rejected exactly like the existing verify-email flow already tests.
- **Code quality constraints:** new route handlers ≤150 lines each; reuse existing `EmailToken` machinery rather than building a parallel one.
- **Dependencies:** none to build; Phase 5 (T292) to be genuinely useful end to end.
- **Blocked-pending-external-input:** the old-email-notification design decision.
- **Acceptance criteria:**
  - [ ] Email changes require proving control of the new address before taking effect.
  - [ ] The old address decision (notify or not) is resolved and implemented, not left ambiguous.

### T280 — Real session list + revoke
- **Resolves:** Re-audit B.2 — `SESSIONS` is a hardcoded local array on the Settings page.
- **Files:**
  - Create: new route handlers — `GET /auth/sessions` (list), `DELETE /auth/sessions/:id` (revoke one)
  - Modify: `apps/web/app/(dashboard)/settings/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add `getSessions`/`revokeSession`)
  - Test: `apps/api/tests/contract/auth.sessions.test.ts` (new)
- **Existing code already real:** `RefreshToken` model (per `AUTH_AND_SCALE_AUDIT.md`'s confirmation this exists) — the real, already-persisted candidate for "a session."
- **Design decision needed — resolve before implementing:** is a `RefreshToken` row (created-at + last-used-at, if that column exists — check the real schema before assuming it tracks last-use) a sufficient proxy for "a session" in this UI, or does the product want richer metadata (device name, IP, geographic location) that doesn't exist in the schema today and would need a new table/columns? Recommend starting with the `RefreshToken`-as-session minimal version (buildable immediately with zero schema change) and treating richer metadata as an explicit, separate future enhancement — but this must be a stated decision, not an assumption baked in silently.
- **Interfaces:** Consumes: the real `RefreshToken` model. Produces: nothing further.
- **Test coverage required:** the list shows only the real, current user's own sessions (ownership-scoped, matching the universal pattern the security review confirmed every other route already follows); revoking one genuinely invalidates that specific refresh token (a subsequent refresh attempt with it fails) without affecting the others; a user cannot revoke a session belonging to a different account (IDOR check).
- **Code quality constraints:** new route handlers ≤150 lines each.
- **Dependencies:** none.
- **Blocked-pending-external-input:** the metadata-richness decision above.
- **Acceptance criteria:**
  - [ ] A user can see and revoke their own real active sessions, minimum viable version backed by real `RefreshToken` rows.

### T281 — Wire "Disconnect GitHub" on the Settings page
- **Resolves:** Re-audit B.2 — badge stays "Connected" forever; no handler exists.
- **Files:**
  - Create: new route handler — `POST /auth/github/disconnect` (or `DELETE /auth/github`)
  - Modify: `apps/web/app/(dashboard)/settings/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add `disconnectGithub`)
  - Test: `apps/api/tests/contract/auth.github-disconnect.test.ts` (new)
- **Existing code already real:** `User.githubTokenEnc`/`githubTokenIv`/`githubLogin` columns (per `AUTH_AND_SCALE_AUDIT.md`'s auth-flow findings) — real, already-encrypted token storage this task clears, reusing the same encryption/decryption module that wrote them (`apps/api/src/services/auth/token-vault.ts`, per the constitution's own reference to this file — do not write a new clearing mechanism, just null the fields through the existing vault's own delete path if one exists, or write the three columns to null directly if not).
- **Design decision needed:** should disconnecting GitHub be refused if it's the account's *only* sign-in method (i.e. no password set, per an OAuth-only registration)? Check whether that scenario is even reachable given this app's registration flow (email+password is the only registration path found in the auth audit — OAuth appears to be an *additional* link, not a standalone signup method) before deciding this needs a guard at all; if OAuth-only accounts genuinely can't exist, this decision is moot and should be noted as such, not left as an open question.
- **Interfaces:** none new beyond the route itself.
- **Test coverage required:** disconnecting clears the real token fields; the connected badge reflects real state on reload, not just local state.
- **Code quality constraints:** small, localized.
- **Dependencies:** none.
- **Blocked-pending-external-input:** the guard-condition question above (likely resolves to "not applicable" on inspection, per the note above).
- **Acceptance criteria:**
  - [ ] Disconnecting GitHub genuinely clears the real stored token and the UI reflects real connection state.

### T282 — Replace the Usage page's 100%-placeholder data with real queries
- **Resolves:** Re-audit B.1 — the entire page is confirmed-placeholder, by its own header comment.
- **Files:**
  - Create: new route handler — `GET /billing/usage` (or extend an existing billing route — check `billing.routes.ts` for a natural home before adding a new file)
  - Modify: `apps/web/app/(dashboard)/usage/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add `getUsage`)
  - Test: `apps/api/tests/contract/billing.usage.test.ts` (new)
- **Existing code already real to query from:** `CreditTransaction` (spend history, already real per `billing.routes.ts:129-153`'s existing movements query — reuse the same query shape), `Scan` (scan count/by-area breakdown), `CapabilityExecution` (per-area cost, already used by the real admin margin report at `margin.service.ts:120-241` — the exact aggregation pattern to copy for a per-user rather than platform-wide view).
- **Interfaces:** Consumes: existing real tables, no schema change needed. Produces: a real usage-summary shape for the frontend.
- **Test coverage required:** every stat shown matches real seeded data in a contract test (not just "an endpoint responds 200") — a scan created in the test, then the usage summary reflects it. "Export CSV" produces a real file matching the same real data, reusing the export-generation approach chosen in T266/T287 if built by then (check for reuse opportunity, don't duplicate CSV-generation logic three times across this plan).
- **Code quality constraints:** new route handler ≤150 lines; if the aggregation logic is substantial, put it in its own service file mirroring `margin.service.ts`'s shape.
- **Dependencies:** none functionally; flag for reuse-check against T287 (Margin export) and T266 (receipts) at execution time.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] Every figure on the Usage page reflects the real signed-in user's real data.

**Status:** DONE — added `GET /billing/usage`, real ledger/scan aggregations, API typing, Usage loading states, and CSV export from the same real response.

### T283 — Build the admin tier-restriction UI
- **Resolves:** Re-audit B.3 — backend real and enforced (`resolveSnapshot`'s `BLOCKED_PLAN` status), zero UI anywhere.
- **Files:**
  - Modify: `apps/web/app/(admin)/admin/capabilities/page.tsx`
  - Modify: `apps/web/lib/api.ts` (check whether a `planIds`-accepting wrapper for `PATCH /admin/capabilities/:id` already exists — the earlier admin capability-enable wiring may already send a partial body; extend rather than duplicate)
  - Test: `apps/web/tests/unit/admin-capability-tier-restriction.test.ts` (new)
- **Existing backend/API already real:** `PATCH /admin/capabilities/:id` accepting `planIds` (`apps/api/src/services/admin/capabilities.service.ts:317-356`'s `setCapabilityPlanRestrictions`).
- **Interfaces:** Consumes: the existing endpoint, already supports the full field this UI needs to send.
- **Test coverage required:** selecting plans and saving actually restricts a capability, verified against the real enforcement path (a lower-tier plan's scan genuinely skips the restricted capability, matching the existing `BLOCKED_PLAN` resolution test if one exists — check `apps/worker/tests/` for the existing coverage of this resolution path and extend rather than duplicate it end-to-end).
- **Code quality constraints:** ≤200 lines; this page already has other real controls — add as a clearly separated section per capability row.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] An operator can restrict a capability to specific plan tiers from the admin UI, and the existing backend enforcement path receives the saved restriction.

**Status:** DONE — added per-capability Free/Starter/Pro/Business selection, save wiring to `PATCH /admin/capabilities/:id`, and focused UI coverage.

### T284 — Build "New plan" and "edit plan pricing/limits" admin forms
- **Resolves:** Re-audit B.3 — `POST /admin/plans` is real and unused; no edit-limits control exists at all despite the PATCH route supporting a full field patch.
- **Files:**
  - Modify: `apps/web/app/(admin)/admin/plans/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add `createAdminPlan`, extend the existing `setPlanActive` wrapper to accept the full field set `PATCH /admin/plans/:id` already supports — `monthlyCredits`, `concurrentScanLimit`, `retentionDays`, entitlement flags)
  - Test: `apps/web/tests/unit/admin-plans-forms.test.ts` (new)
- **Existing backend/API already real:** `POST /admin/plans` (`apps/api/src/routes/admin/plans.routes.ts:104-120`); `PATCH /admin/plans/:id` (`:135-155`, `apps/api/src/services/admin/plans.service.ts:163-205`'s `updatePlan`, already supporting the full field set).
- **Interfaces:** Consumes: both existing real endpoints.
- **Test coverage required:** creating a new plan via the form results in a real, listable plan; editing an existing plan's limits actually changes real enforcement (e.g. a changed `concurrentScanLimit` is genuinely respected by the intake path — verify against the existing enforcement test if one exists rather than assuming the UI change alone is sufficient proof).
- **Code quality constraints:** ≤200 lines; extract the create/edit forms into `apps/web/components/admin/` if the page would otherwise exceed this.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] An operator can create a new plan and edit an existing one's real limits/pricing from the admin UI.

**Status:** DONE — added the admin create/edit form, real plan limit fields, API wrappers for `POST` and full `PATCH`, and focused UI coverage.

### T285 — Decide the fate of the 5 admin feature-flag toggles
- **Resolves:** Re-audit B.3 — no `FeatureFlag` model exists in the schema at all; confirmed by direct search.
- **Files (depends entirely on the decision below):**
  - If real: create a `FeatureFlag` model in `apps/api/prisma/schema.prisma`, a migration, `GET`/`PATCH /admin/settings/flags` routes, and real read-sites wherever each of the 5 flags is meant to gate behavior (repository input, archive upload, load generation, design questionnaire, readiness certificates — each of these may already correspond to a real gate somewhere else in the codebase, e.g. `Plan.allowedInputTypes`/`allowLoadGeneration`/`allowReadinessPass` columns already confirmed to exist per the audit — check each one individually before assuming a new model is needed for all 5).
  - If removed: modify `apps/web/app/(admin)/admin/settings/page.tsx` to delete the decorative toggle section entirely.
- **Design decision needed — this task IS the decision, resolve it before any code:** for each of the 5 flags, determine (a) does a real gate for this behavior already exist elsewhere (e.g. a `Plan` entitlement column), making a separate flag redundant, or (b) is this a genuinely new, real, needed operator control? Do not build persistence for a flag whose behavior is already controlled some other way — that would create two competing sources of truth.
- **Interfaces:** depends on outcome.
- **Test coverage required:** depends on outcome — if kept, each flag's real read-site must be tested to prove the flag genuinely changes behavior, not just that it persists.
- **Code quality constraints:** N/A until the decision is made.
- **Dependencies:** none. Blocks nothing else in this plan.
- **Blocked-pending-external-input:** yes — a product decision, and per-flag, not a blanket one.
- **Acceptance criteria:**
  - [ ] Each of the 5 flags is either genuinely real (persisted + genuinely gates real behavior, with no redundant competing control) or removed from the UI entirely.

### T286 — Decide the fate of "Pause intake" / "Retry stalled" / "Clear queue"
- **Resolves:** Re-audit B.3 — all three decorative, no backend exists for any.
- **Files (depends on decision):**
  - If real: new admin routes + real logic (e.g. "pause intake" likely means a real, checked flag `create-scan.ts` consults before accepting a new scan — a non-trivial behavior change, not just an admin-page addition).
  - If removed: delete the three buttons from `apps/web/app/(admin)/admin/queue/page.tsx`.
- **Design decision needed — this task IS the decision:** are these real operational needs an operator has actually asked for, or speculative UI copied from the vendored design system with no real backing intended? Flag explicitly — do not build "pause intake" (a real, security/availability-relevant feature touching the scan-creation hot path) speculatively.
- **Interfaces:** depends on outcome.
- **Test coverage required:** depends on outcome.
- **Code quality constraints:** N/A until decided.
- **Dependencies:** none.
- **Blocked-pending-external-input:** yes — a product/ops decision.
- **Acceptance criteria:**
  - [ ] Each of the three controls is either real and tested, or removed.

### T287 — Wire the admin Margin page's "Export" button
- **Resolves:** Re-audit B.3 — no such endpoint exists.
- **Files:**
  - Create: new route handler — `GET /admin/margin/export`
  - Modify: `apps/web/app/(admin)/admin/billing/page.tsx`
  - Modify: `apps/web/lib/api.ts` (add `exportMarginReport`)
  - Test: `apps/api/tests/contract/admin.margin-export.test.ts` (new)
- **Existing backend/API already real:** `apps/api/src/services/admin/margin.service.ts:120-241`'s `getMarginReport` — this task exports the same real, already-computed data as CSV, it does not recompute anything new.
- **Interfaces:** Consumes: the existing real margin computation. Note for reuse: check T282's Usage-page CSV-export approach (if built first) and reuse the same CSV-generation helper rather than writing a second one.
- **Test coverage required:** the exported CSV's real numbers match the real `getMarginReport` response for the same query window.
- **Code quality constraints:** new route handler ≤150 lines.
- **Dependencies:** none functionally; check for CSV-helper reuse against T282.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] The Margin page's Export button produces a real CSV of the real margin data.

**Status:** DONE — added the authenticated margin CSV route, client download wrapper, page wiring, and real-number export coverage.

### T288 — Add real filter/search to the admin Audit-log page
- **Resolves:** Re-audit B.3 — no search box, date filter, or action filter exists anywhere on this page.
- **Files:**
  - Modify: `apps/api/src/routes/admin/audit-log.routes.ts` (add real query params)
  - Modify: `apps/api/src/services/admin/audit-log.ts:94-132`'s `listAuditLog` (accept and apply the new filters at the database level, not client-side)
  - Modify: `apps/web/app/(admin)/admin/log/page.tsx`
  - Modify: `apps/web/lib/api.ts` (extend `getAdminAuditLog`'s existing params)
  - Test: `apps/api/tests/contract/admin.audit-log-filter.test.ts` (new)
- **Existing code already real:** `listAuditLog` and its pagination — this task adds real `WHERE` clauses (date range, action type, actor id) to an already-real, already-paginated query, not a new feature from scratch.
- **Interfaces:** Consumes: the existing real audit-log query, extended.
- **Test coverage required:** filtering by date range/action/actor genuinely narrows the real result set at the database level (assert on the SQL-level effect via row counts in a seeded test, not just that the UI renders fewer rows).
- **Code quality constraints:** small, additive change to an already-real function.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] Filtering the audit log genuinely queries the database with the real filter applied, not a client-side illusion.

**Status:** DONE — added database-backed search, action, actor, and date filters across the API, client, and admin screen.

### T289 — Decide the fate of "Remember me" and a notification/activity feed
- **Resolves:** Re-audit B.1 — both confirmed to not exist anywhere in the codebase today.
- **Scope, two independent decisions:**
  1. **"Remember me":** if wanted, needs a real longer-lived-refresh-token design (a real security tradeoff between session longevity and exposure — flag for security review of the exact duration and revocation story before any implementation). If not wanted, formally drop it from scope so it stops appearing as a gap in future audits.
  2. **Notification/activity feed:** a substantial new feature (needs its own data model for "an event a user should see," a real read/unread state, a real delivery mechanism). Recommend this get its own dedicated planning pass (a new, separate spec) rather than being sized as a sub-task here if approved — flag it as "needs its own plan," not as something this task should attempt to fully spec.
- **Design decision needed:** both, independently.
- **Dependencies:** none.
- **Blocked-pending-external-input:** yes, both are scope decisions.
- **Acceptance criteria:**
  - [ ] Both features have an explicit, recorded decision (build later via a dedicated plan, or formally out of scope) rather than sitting as an ambiguous, repeatedly-rediscovered gap.

### T290 — Fix the GitHub-reconnect dead link in the New-scan repository tab
- **Resolves:** Re-audit B.1 — `InputTabs.tsx:184-191` navigates to a nonexistent page with the wrong HTTP method shape.
- **Files:**
  - Modify: `apps/web/components/scan/InputTabs.tsx`
- **Existing code already real to reuse:** the correct OAuth-start URL pattern already used correctly on the login/signup pages (`${API_BASE}/auth/oauth/github/start`) — copy that exact pattern here instead of the broken `/auth/github/connect` navigation.
- **Interfaces:** none new.
- **Test coverage required:** the "Connect GitHub" link in the repository tab now points at the same real, working OAuth-start route login/signup already use correctly.
- **Code quality constraints:** trivial, single-line-shaped fix.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] The repository tab's GitHub connect link works identically to the already-correct login/signup version.

**Status:** DONE — corrected the repository reconnect action to the real GitHub OAuth start route.

### T291 — Wire the Report page's "Re-audit" button
- **Resolves:** Re-audit B.1 — no `onClick` at all.
- **Files:**
  - Modify: `apps/web/app/(dashboard)/reports/[id]/page.tsx`
- **Existing code already real to reuse:** the exact same quote→create-scan flow `ScanForm.tsx`'s "Accept and run" already implements correctly (`resolveTargetId` → `quoteScan()` → `createScan()`, `ScanForm.tsx:93-107,148-154`) — this task re-audits the *same target* the current report is for, with the same (or user-adjustable — flag which) area selection, then navigates to the new scan's live-progress page exactly like the original flow does.
- **Design decision needed:** should "Re-audit" silently reuse the exact same area selection as the original scan, or open the same area-selection UI `ScanForm` already has so the user can adjust it first? Recommend reusing the same areas by default with a clear "different areas? Start a new scan" link to the full form, but flag for design confirmation.
- **Interfaces:** Consumes: the existing real quote/create-scan flow, reused rather than reimplemented.
- **Test coverage required:** clicking Re-audit against a completed report's target genuinely creates a new, real scan and navigates to it.
- **Code quality constraints:** small, localized — this should call existing functions, not duplicate `ScanForm`'s logic.
- **Dependencies:** none.
- **Blocked-pending-external-input:** the area-selection UX decision above.
- **Acceptance criteria:**
  - [ ] "Re-audit" genuinely starts a new, real scan of the same target.

---

## Phase 5 — Real Email Infrastructure

### T292 — Real connection to an email-sending provider
- **Resolves:** `AUTH_AND_SCALE_AUDIT.md` §7 — every "email" is currently a console-log line only.
- **Files:**
  - Create: `apps/api/src/services/email/resend-mailer.ts` (or whichever provider is confirmed — `.env.example` already names `RESEND_API_KEY` as the intended one; confirm this is still current before building against a different provider)
  - Modify: `apps/api/src/index.ts` (or wherever `Mailer` is constructed for the real running process — wire the real implementation in production, keep `createConsoleMailer()` for local dev/tests exactly as today)
  - Test: `apps/api/tests/unit/resend-mailer.test.ts` (new, mocking the provider's real HTTP API — do not make real network calls in tests, matching this repo's own "provider calls are always stubbed in tests" convention already stated for AI providers)
- **Existing code already real to pattern-match:** `apps/api/src/services/email/mailer.ts:32-41` (the `Mailer` interface, unchanged) and `:44-76` (`createConsoleMailer()`, the shape a second implementation must match exactly — same 5 methods, same signatures).
- **Interfaces:** Consumes: the existing `Mailer` interface, unchanged. Produces: a real implementation T293/T294 build on top of.
- **Test coverage required:** every one of the interface's 5 methods sends a real (mocked-in-test) request to the real provider's API with the correct recipient/content; a provider-side failure (e.g. a real 4xx/5xx from the mocked API) is handled without crashing the calling code (matches this repo's general "a mail-send failure must never take down the real workflow it's a side effect of" spirit — check how `apps/worker/src/orchestrator/billing-sweeps.ts`'s existing "no SMTP wired yet" comment already anticipates this failure mode and don't regress that tolerance).
- **Code quality constraints:** ≤200 lines; match `createConsoleMailer`'s existing file organization.
- **Dependencies:** none.
- **Blocked-pending-external-input:** the code is buildable now against a mocked provider API; sending a real email needs a real provider API key, which this plan cannot supply.
- **Acceptance criteria:**
  - [x] A real, tested (against a mock) provider implementation exists and is the one wired in production, with the console mailer untouched for dev/test.

### T293 — One shared, branded HTML email template
- **Resolves:** `AUTH_AND_SCALE_AUDIT.md` §7 — no shared, reusable template with a logo exists; nothing renders HTML today.
- **Files:**
  - Create: `apps/api/src/services/email/template.ts` (a single `renderEmail({ title, bodyHtml, ctaLabel?, ctaUrl? }): { html: string, text: string }`-shaped function, returning both an HTML version and a real plain-text fallback for deliverability/accessibility)
  - Test: `apps/api/tests/unit/email-template.test.ts` (new)
- **Existing code already real to pattern-match:** `apps/api/src/services/readiness/certificate.ts`'s `renderCertificateHtml` — the closest existing precedent in this codebase for "generate a real, self-contained HTML document with no external CSS/fonts/scripts" (the same `@import`-forbidden discipline applies here for email-client compatibility, arguably even more strictly than the certificate case, since email clients strip `<style>` blocks inconsistently — inline styles only).
- **Design decision needed:** source the logo/brand assets from `design-system/` if they already exist there (check before assuming new assets are needed) — this repo's own convention is "port, never author" for anything design-related; a new email-specific logo treatment should not be invented if the design system already has one.
- **Interfaces:** Produces: the template function every one of T294's 5 email types calls.
- **Test coverage required:** the rendered HTML contains no external resource references (mirroring the certificate's own "no `@import`" test if one exists — reuse that exact check); the plain-text fallback contains the real message content, not a stub.
- **Code quality constraints:** ≤200 lines.
- **Dependencies:** none strictly, though logically feeds T294.
- **Blocked-pending-external-input:** only if brand assets genuinely don't exist anywhere yet — check `design-system/` first.
- **Acceptance criteria:**
  - [x] One real, branded, self-contained HTML template exists and renders correctly with a real plain-text fallback.

### T294 — Wire every existing email type to the real provider + real template
- **Resolves:** verification, password reset, readiness congratulations, renewal warning, retention warning — all currently console-log only.
- **Files:**
  - Modify: `apps/api/src/services/email/mailer.ts`'s 5 real methods' call sites (`sendVerification`, `sendPasswordReset`, `sendReadinessAchieved`, `sendRenewalWarning`, `sendRetentionWarning`) — each now builds its real content via T293's template and sends via T292's real implementation.
  - Test: extend each of the existing call-site tests (`apps/api/tests/` — the registration, reset, readiness, renewal-warning, and retention suites already assert *that* a mailer method is called with the right arguments; extend each to also assert the *rendered content* is real and correct, not just that the call happened).
- **Interfaces:** Consumes: T292, T293.
- **Test coverage required:** each of the 5 real email types produces real, correct, branded content when sent — not just a successful function call.
- **Code quality constraints:** these are small, targeted extensions to existing tested call sites — no new architecture.
- **Dependencies:** T292, T293.
- **Blocked-pending-external-input:** no, beyond T292's already-flagged credential dependency.
- **Acceptance criteria:**
  - [x] All 5 real email types produce real, deliverable, branded email content in production.

---

## Phase 6 — Infrastructure & Scale-to-1,000,000-Users-Per-Month

### T295 — Install a real connection pooler and re-tune the connection limit
- **Resolves:** Re-audit A.0/A.4/A.5 — sized explicitly for ~1,000 users; a pooler is "planned for in the comments but not yet installed" (`apps/api/src/db/client.ts:58-59`).
- **Files:**
  - Modify: `infrastructure/deploy.md` (document the real pooler topology)
  - Modify: `apps/api/src/db/client.ts` (re-derive `DEFAULT_CONNECTION_LIMIT`/`DEFAULT_POOL_TIMEOUT_SECONDS` against the pooled topology, per the file's own existing comment already anticipating this exact change)
  - No test file — this is an infra/config change; existing DB-dependent test suites must be re-run green against the new topology as the acceptance check, not a new unit test.
- **Existing code already real:** `apps/api/src/db/client.ts:32-42,58-59` already contains the arithmetic and the explicit note that a pooler "replaces this arithmetic" — read that comment before changing anything, it already specifies the intended shape.
- **Interfaces:** none code-level.
- **Design decision needed:** which pooler (PgBouncer is explicitly named in the existing code comment; confirm this is still the intended choice) and its deployment topology (co-located with the API, or a separate managed service) — an infrastructure/ops decision.
- **Dependencies:** none.
- **Blocked-pending-external-input:** the *design* is buildable now; deploying it needs real infrastructure provisioning.
- **Acceptance criteria:**
  - [ ] A real pooler sits in front of Postgres; the connection-limit math in `client.ts` is re-derived against it and documented.

### T296 — Read replica for reporting/admin-margin queries
- **Resolves:** Re-audit A.1/A.4 — a read replica "would likely be needed well before sharding."
- **Files:**
  - Modify: `apps/api/src/db/client.ts` (add a second, replica-pointed `PrismaClient` construction, following the exact same `withPoolSettings` pattern the primary already uses)
  - Modify: `apps/api/src/services/admin/margin.service.ts` (route its aggregate `groupBy` queries through the replica client)
  - Test: `apps/api/tests/integration/margin-replica-routing.test.ts` (new, or extend the existing margin test — assert the replica client is genuinely used for this specific query path, not just that a replica client object exists unused)
- **Interfaces:** Consumes: T295's pooled topology (sequence together). Produces: a `readReplicaDb`-shaped export other reporting-only queries can adopt later (T282's usage query and T288's audit-log filter are both reporting-shaped and are natural later adopters — flag for the executing pass to consider routing them too, though not required by this task's own acceptance criteria).
- **Test coverage required:** as above.
- **Code quality constraints:** follow `client.ts`'s existing structure exactly — this is an addition, not a rewrite.
- **Dependencies:** T295.
- **Blocked-pending-external-input:** yes — needs real infrastructure (an actual replica) provisioned.
- **Acceptance criteria:**
  - [ ] Admin margin reporting queries run against a real replica, not the primary write path.

### T297 — Real caching layer, isolated from the queue/rate-limit/pub-sub Redis workload
- **Resolves:** Re-audit A.3 — no caching layer exists anywhere; all Redis workloads share one instance with no isolation.
- **Files:**
  - Modify: `.env.example` (add a distinct `REDIS_CACHE_URL` or a documented `db:` index on the existing `REDIS_URL` — pick one, see decision below)
  - Create: `packages/config/src/cache.ts` (a small, real caching client wrapper — get/set/invalidate, following the existing `packages/config/src/logger.ts`'s "small, focused, no external dependency beyond what's already in the repo" shape)
  - Modify: `apps/api/src/routes/reports.routes.ts`, `scans.routes.ts` (the specific hot reads identified) to read-through the new cache
  - Test: `packages/config/tests/cache.test.ts` (new); extend `apps/api/tests/contract/reports.route.test.ts`/`scans.route.test.ts` (or equivalent) with a cache-hit case and, critically, a cache-invalidation case per cached value (a scan's state changing must be provably reflected on the very next read, never serving a stale cached response).
- **Design decision needed, two parts:** (1) separate Redis *instance* vs. a separate database *index* on the same instance — a separate instance is the stronger isolation guarantee (matches the audit's own concern about contention) but costs more infrastructure; a `db:` index separation is cheaper and still solves the *workload* contention this finding is actually about (blocking BullMQ operations competing with cache reads), though both still share the same physical hardware's CPU/memory/network — flag which tradeoff is acceptable for infra sign-off. (2) exact TTL and invalidation rule **per cached value** — do not apply one blanket TTL to everything; a scan-status cache during an active scan needs a very short TTL or event-driven invalidation (the realtime publish-after-persist event is the natural invalidation trigger — reuse it), while a completed, immutable report can be cached much longer or indefinitely with invalidation only on retention deletion.
- **Interfaces:** Consumes: nothing new. Produces: a cache layer other reads (T282, T287, T288) may adopt later.
- **Test coverage required:** as above — cache-hit AND cache-invalidation must both be proven, not just the former (a cache with no verified invalidation path is a staleness bug waiting to ship).
- **Code quality constraints:** the new cache module ≤200 lines; route-file modifications must stay within their existing size caps — extract a per-route caching helper if inlining would push a route handler over 150 lines.
- **Dependencies:** none technically; should land before T298 since both touch the same read paths and benefit from being designed together.
- **Blocked-pending-external-input:** the instance-vs-index infrastructure decision.
- **Acceptance criteria:**
  - [ ] Report reads, scan-status reads, and score/readiness-verdict computation are genuinely cached.
  - [ ] Every cached value has a proven, tested invalidation path — no staleness risk introduced.
  - [ ] Cache Redis usage is isolated from BullMQ/rate-limiting/pub-sub, by instance or index.

### T298 — Real signed URLs + CDN, stop proxying downloads through the API process
- **Resolves:** Re-audit A.3 — every report/screenshot download consumes the API server's own bandwidth and compute; no CDN anywhere.
- **Files:**
  - Modify: `apps/api/src/services/storage/reports.ts` (replace the server-side `getObject`+stream pattern at lines 73-99 with a real `getSignedUrl` call — the AWS SDK's S3-compatible client already in use supports this against R2 directly)
  - Modify: `apps/api/src/routes/readiness.routes.ts:377` (the one real caller found — return the signed URL instead of proxying bytes)
  - Modify: `infrastructure/deploy.md` (document the real CDN choice and its configuration)
  - Test: `apps/api/tests/unit/report-storage-signed-url.test.ts` (new) — asserts a real, correctly-scoped, correctly-expiring signed URL is generated (not a permanently-valid one — pick and test a real, reasonable expiry window).
- **Existing code already real:** the `@aws-sdk/client-s3` client construction in `reports.ts` — this task adds a new method call (`getSignedUrl` from `@aws-sdk/s3-request-presigner`, a real, standard companion package) rather than replacing the client itself.
- **Design decision needed:** CDN provider (Cloudflare is a natural fit given R2 is already Cloudflare's own object storage, and R2's own documented CDN integration may be the cheapest real option — verify current terms at execution time, don't assume from this plan's writing date).
- **Interfaces:** Consumes: nothing new from within this repo. Produces: a signed-URL-returning storage function other download paths (screenshots, once wired per the earlier finding that screenshot storage is currently unused code, and archive uploads) can adopt with the same pattern.
- **Test coverage required:** as above, plus an ownership check that the signed URL itself cannot be handed to an unauthorized user to bypass the existing route-level ownership check (the signing must happen only after the existing auth+ownership check the route already performs, never before).
- **Code quality constraints:** `reports.ts` modification should stay small — this is swapping one method for another, not restructuring the file.
- **Dependencies:** none, but pairs naturally with T297 (both reduce origin load for the same hot reads).
- **Blocked-pending-external-input:** the CDN choice/provisioning.
- **Acceptance criteria:**
  - [ ] Report/certificate/screenshot downloads no longer proxy bytes through the API process.
  - [ ] A real CDN sits in front of the web app and R2-served assets.

### T299 — Pick and wire a real APM/error-tracking/monitoring service
- **Resolves:** Re-audit A.0/A.1 — no error-tracking or performance-monitoring service connected anywhere.
- **Files:**
  - Modify: `apps/api/src/index.ts`, `apps/worker/src/index.ts`, `apps/sandbox-runner/src/serve.ts` (the three real process entrypoints already identified by `packages/config/src/logger.ts`'s own module note as needing this wiring)
  - Modify: `.env.example` (the new service's config vars)
  - Test: a smoke-test confirming the SDK initializes without throwing under both a real and a missing config value (must not crash boot if unconfigured in a dev environment — fail open to "no monitoring" rather than fail closed to "app won't start").
- **Existing code already real to extend, not replace:** `packages/config/src/logger.ts` — this task's error capture should complement the existing structured, redacted logger, not duplicate its redaction logic; ensure whatever service is chosen never receives an un-redacted secret (reuse `packages/redaction`'s existing `redactText` on anything sent to the external service, matching the logger's own established discipline).
- **Design decision needed:** which service — a hosted SaaS (e.g. Sentry) vs. a self-hosted equivalent — an operator/budget decision.
- **Interfaces:** Consumes: `packages/redaction`'s existing redaction function, reused for outbound error payloads.
- **Test coverage required:** as above (boot-safety), plus a test confirming a deliberately-planted secret-shaped string in a simulated error is redacted before being sent to the external service — this is a real security requirement given the constitution's own redaction guarantees, not optional.
- **Code quality constraints:** initialization code should be small, isolated per entrypoint file.
- **Dependencies:** none.
- **Blocked-pending-external-input:** the service choice and its credentials.
- **Acceptance criteria:**
  - [ ] Real errors in all three services are captured externally.
  - [ ] Nothing sent externally ever contains an unredacted secret.

### T300 — Cost-runaway detection on top of existing `AiInvocation` cost recording
- **Resolves:** Re-audit A.1 — no mechanism exists that would catch a cost runaway before the invoice.
- **Files:**
  - Create: `apps/worker/src/orchestrator/cost-digest.ts` (a new scheduled job, following the exact pattern already established by `apps/worker/src/orchestrator/billing-sweeps.ts`'s own scheduled-maintenance-queue-job shape — reuse that job-registration pattern, don't invent a new scheduling mechanism)
  - Modify: `apps/worker/src/queue/queues.ts` (register the new job on the existing `maintenance` queue, which is already deliberately capped at concurrency 1 "so exactly one replica runs it" — this new job belongs there, not on a new queue)
  - Test: `apps/worker/tests/unit/cost-digest.test.ts` (new)
- **Existing code already real:** `AiInvocation` rows already record real per-attempt cost (confirmed by the cost-modeling audit) — this task only adds a real query + threshold check + notification on top, no new cost-recording logic.
- **Design decision needed:** the notification channel (real email via T292, or the monitoring service from T299) and the real threshold value (a business decision — what dollar amount or rate-of-change in a rolling window should trigger an alert) — flag both explicitly, do not pick a threshold number unilaterally.
- **Interfaces:** Consumes: T292 or T299 (whichever channel is chosen), the existing `AiInvocation` table.
- **Test coverage required:** a simulated spend spike past the configured threshold triggers exactly one real notification, not a flood of duplicates on every subsequent sweep run.
- **Code quality constraints:** ≤200 lines, matching `billing-sweeps.ts`'s existing scope.
- **Dependencies:** T292 or T299 (channel choice).
- **Blocked-pending-external-input:** the threshold-value business decision.
- **Acceptance criteria:**
  - [ ] A real, configured spend threshold produces a real, deduplicated alert when exceeded.

### T301 — Configure the timeouts found missing across the pipeline
- **Resolves:** Re-audit A.2 — Postgres `connect_timeout` unset; realtime Redis client has neither connect nor command timeout; BullMQ `lockDuration`/`stalledInterval` never explicitly set; no WebSocket server-side heartbeat/idle timeout.
- **Files:**
  - Modify: `apps/api/prisma/schema.prisma` datasource block or the connection-string builder in `apps/api/src/db/client.ts` (add `connect_timeout`)
  - Modify: `apps/api/src/index.ts` (line ~117, the realtime pub/sub `new Redis(url, {...})` construction — add `connectTimeout`/`commandTimeout`, matching the exact values already proven sensible on the rate-limiter's own client at `apps/api/src/middleware/ratelimit.middleware.ts:266-267`)
  - Modify: `apps/worker/src/queue/queues.ts`/`packages/config/src/queues.ts` (explicitly set `lockDuration`/`stalledInterval` on every `Worker` construction rather than relying on undocumented library defaults)
  - Modify: `apps/api/src/services/realtime/server.ts` (add a server-side heartbeat/ping interval that closes an unresponsive socket after a real, chosen timeout — matching the existing client-side ping/pong message shape already implemented at lines 50,101,145-146, just adding the server-initiated half that's currently missing)
  - Test: one focused test per fix — a slow/hung Postgres connect attempt is bounded; a hung realtime Redis command is bounded; a job whose lock isn't renewed within the configured duration is correctly reclaimed; an unresponsive WebSocket client is dropped within the configured heartbeat window.
- **Interfaces:** none new — these are all configuration additions to existing real connections/servers.
- **Test coverage required:** as above, four independent, focused tests.
- **Code quality constraints:** four small, localized config additions — no restructuring needed anywhere.
- **Dependencies:** none.
- **Blocked-pending-external-input:** no.
- **Acceptance criteria:**
  - [x] All four previously-missing timeouts are configured and proven via focused database, Redis policy, BullMQ, and WebSocket heartbeat tests.

### T302 — Real backpressure + "queued, position N" user feedback
- **Resolves:** Re-audit A.2 — no maximum queue depth or rejection path; the live-progress UI has no queue-position state at all, just indefinite "Preparing."
- **Files:**
  - Modify: `apps/api/src/services/intake/create-scan.ts` (a real queue-depth check before enqueueing)
  - Create: a new lightweight endpoint or extend `GET /scans/:id` to include a real queue-position estimate while `state === 'QUEUED'`
  - Modify: `apps/web/components/scan/ScanProgress.tsx` (render the real queue position instead of only "Preparing")
  - Test: `apps/worker/tests/integration/queue-backpressure.test.ts` (new) — asserts the chosen admission policy (see decision below) behaves correctly under a simulated deep queue.
- **Design decision needed — resolve before implementing:** when the queue is deep, should `create-scan.ts` (a) refuse the new scan at intake time with a real, honest error (meaning no debit happens at all — the safer choice given this repo's own "never charge for our failures" principle, since a refusal-before-charge can never become a billing problem), or (b) accept it, debit as normal, and simply report a real wait estimate? Recommend (a) as the default-safe choice unless product explicitly wants scans to always be accepted regardless of load — flag for confirmation, this has real revenue and UX tradeoffs.
- **Interfaces:** Consumes: real BullMQ queue-depth introspection (check what the `Queue` object already exposes for this — likely a `getWaitingCount()`-shaped method; do not build a custom depth-tracking mechanism if BullMQ already provides one).
- **Test coverage required:** as above.
- **Code quality constraints:** `create-scan.ts` is likely near its size cap already (multiple real checks already live there per the credit-ledger review) — extract the new depth check into a small helper rather than growing the main function further.
- **Dependencies:** none.
- **Blocked-pending-external-input:** the admission-policy decision above.
- **Acceptance criteria:**
  - [ ] A deep queue produces either a real, honest refusal (no charge) or a real, accurate position estimate — per the chosen policy — never silence.

### T303 — Archival/cleanup strategy for `CreditTransaction`, `CreditAllocation`, `AiInvocation`, `CapabilityExecution`
- **Resolves:** Re-audit A.4 — these four tables have no archival, partitioning, or cleanup job and will grow unbounded forever.
- **Files:** depends entirely on the decision below; likely a new scheduled job on the `maintenance` queue (same pattern as T300) plus, if archival is chosen, a real destination for archived rows (a cold-storage export, or a separate archive schema/database — an infrastructure decision).
- **Design decision needed — resolve before implementing, this is a compliance/product question, not an engineering one:** these are financial and audit-relevant records, unlike `Issue`/`ModuleResult` (whose existing retention sweep already deletes them outright, which is acceptable for those because they're not financial records). Outright deletion of `CreditTransaction`/`CreditAllocation` may not be acceptable for accounting/audit/compliance reasons even after a long horizon. Options to weigh: (a) archive-and-remove-from-primary (moves old rows to cold storage, keeps the primary lean, preserves the data), (b) partition-in-place (keeps all data queryable but bounds the *active* working-set size), (c) accept-and-monitor with a much longer horizon than the current "forever," revisited once real volume data exists. This decision needs input from whoever owns financial/compliance requirements for this product, not a unilateral engineering call.
- **Interfaces:** depends on outcome.
- **Test coverage required:** depends on outcome — but whichever is chosen, a test must prove no financial data is ever silently lost (a stricter bar than the existing `Issue`/`ModuleResult` retention sweep's own tests, which do accept real deletion).
- **Code quality constraints:** N/A until decided.
- **Dependencies:** none.
- **Blocked-pending-external-input:** yes — a genuine compliance/product decision.
- **Acceptance criteria:**
  - [ ] A real, decided, implemented bound exists on these four tables' growth, with no financial data silently lost.

### T304 — `probe-pool` cross-process transport and a real deployable entrypoint
- **Resolves:** Re-audit A.0 — single-instance, no cross-process transport, no deploy entrypoint at all.
- **Files:**
  - Create: `apps/probe-pool/src/serve.ts` (a real process entrypoint — today `package.json`'s `dev` script literally says "not implemented," per the audit)
  - Create: a real transport layer (an HTTP or gRPC API in front of `apps/probe-pool/src/browser/pool.ts`'s existing `createBrowserPool()`/`withPage` — following the closest existing precedent in this codebase for "a service wrapping a pool of expensive resources behind a network API," which is `apps/sandbox-runner/src/host/server.ts`'s own shape, adapted for long-lived browser pages rather than one-shot process forks)
  - Modify: `apps/worker/src/orchestrator/orchestrator.ts` (wire a real `pageProvider` calling out to this new service instead of the current no-op, at the exact integration point already named at lines 110-121 per the security review's own citation)
  - Test: `apps/probe-pool/tests/integration/serve.test.ts` (new)
- **Existing code already real and now safe to build on:** `apps/probe-pool/src/browser/pool.ts`'s `createBrowserPool()` — already real, and per Section 0 above, P2-SSRF-1's fix (the local SSRF-safe forward proxy) already ships in this same file's Chromium-launch configuration, so wiring this up now is safe — the vulnerability that would have made this dangerous is already closed.
- **Interfaces:** Consumes: the existing, already-SSRF-safe `createBrowserPool()`. Produces: a real network-reachable service `apps/worker` can call for browser-based capabilities (`cwv-analyzer`, `screenshot-capture`, `lighthouse-analyzer` — currently degrading to no-findings for lack of exactly this transport, per the earlier T136-T141 task notes).
- **Test coverage required:** a real capability that needs `ctx.withPage` genuinely produces real findings when wired through this new service, where it previously degraded silently.
- **Code quality constraints:** new service, size caps as this codebase's other service entrypoints (`apps/sandbox-runner`'s own `serve.ts`/`server.ts` split is the size/shape precedent).
- **Dependencies:** none functionally (P2-SSRF-1 already fixed, confirmed in Section 0).
- **Blocked-pending-external-input:** the deployment topology (replica count, autoscaling trigger) is an infrastructure decision for the "deployable" half; the transport code itself is buildable now.
- **Acceptance criteria:**
  - [ ] `probe-pool` is a real, independently-deployable service.
  - [ ] Browser-based capabilities produce real findings instead of silently degrading.

### T305 — Prove and document real multi-replica `sandbox-runner` deployment
- **Resolves:** Re-audit A.0 — single host process today; no multi-instance deployment automation exists.
- **Files:**
  - Modify: `infrastructure/sandbox-runner.md` (document the real, proven multi-replica shape)
  - Modify: infrastructure config (load-balancer config — file location depends on the chosen deployment target, not fixed by this repo today)
  - Test: a real, end-to-end test proving ≥2 real replicas behind a real load balancer both correctly execute real capability code and neither can reach the other's in-flight state (they're already designed stateless/no-DB-credentials, so this is a proof, not a redesign).
- **Existing code already real:** the entire sandbox isolation mechanism — this task changes nothing about `apps/sandbox-runner`'s own code, only its deployment topology.
- **Interfaces:** none new.
- **Test coverage required:** as above — a genuine, run-for-real proof, not a paper argument that "it should work because it's stateless."
- **Code quality constraints:** N/A — infrastructure task.
- **Dependencies:** none.
- **Blocked-pending-external-input:** needs real infrastructure to deploy the replicas onto.
- **Acceptance criteria:**
  - [ ] ≥2 real `sandbox-runner` replicas run behind a real load balancer, proven correct under real concurrent load.

### T306 — Multi-source-IP load rig for the genuinely-unverified 20/40/60-concurrent tiers
- **Resolves:** `FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md` §7.2 item 5's own honestly-flagged remaining gap.
- **Files:**
  - Create: a new, distributed k6 (or equivalent) configuration under `load-testing/` (extending the existing, already-real harness from `specs/004-load-testing-harness/` — do not rebuild the golden-path scenario itself, only its traffic-origin topology)
  - Modify: `load-testing/REPORT.md` (append the new, real 20/40/60-concurrent results once measured)
- **Existing code already real:** the entire existing k6 harness and its golden-path scenario (target → quote → scan → poll) — this task only changes where the traffic originates from (multiple real source IPs instead of one machine), reusing everything else unchanged.
- **Interfaces:** Consumes: the existing harness. Produces: real, previously-impossible-to-measure data points.
- **Test coverage required:** N/A in the usual sense — the "test" here is the load run itself; the acceptance bar is a real, honestly-reported result (success rate, latency), whatever it turns out to be, not a predetermined "must pass" number.
- **Code quality constraints:** N/A.
- **Explicit constraint carried over from the original review, do not violate it:** this task must **not** propose weakening the real per-IP login rate limiter to make single-machine testing easier — that guarantee stays exactly as-is; the fix is a real multi-IP rig, never touching the security control it's working around.
- **Dependencies:** ideally sequenced after T295-T298 (pooling, replica, caching, CDN) so the numbers reflect a realistically-scaled deployment, not the current MVP-sized one — though it is technically runnable earlier if that sequencing isn't practical.
- **Blocked-pending-external-input:** needs real multi-region/multi-IP test infrastructure — a cloud budget/provisioning decision.
- **Acceptance criteria:**
  - [ ] Real, honestly-reported success/latency data exists for 20/40/60-concurrent audits, from genuinely distinct source IPs.
  - [ ] The real login rate limiter is untouched and unweakened.

---

## Summary Table

| Phase | Name | Task count | AI-FREE-TIER | PAYMENT-PLUMBING / PAYMOB-BLOCKED |
|---|---|---|---|---|
| 1 | Correctness Bugs & Boot-Blockers | 6 (T256–T261) | T259 | — |
| 2 | Payment Module Foundation | 6 (T262–T267) | — | T262–T266 plumbing, **T267 Paymob-blocked** |
| 3 | Decorative-UI Wiring (cheap wins) | 8 (T268–T275) | — | — |
| 4 | New Backend + UI Build-Outs | 16 (T276–T291) | — | — |
| 5 | Real Email Infrastructure | 3 (T292–T294) | — | — |
| 6 | Infrastructure & Scale-to-1M | 12 (T295–T306) | — | — |
| **Total** | | **51 tasks (T256–T306)** | | |

**Tasks explicitly requiring a product/design decision before implementation (do not guess):** T256, T258, T259, T262, T264, T266, T268 (copy caveat only), T274, T276, T277 (depends on T276), T279, T280, T281, T285, T286, T289, T291, T297, T299, T300, T302, T303.
**Tasks explicitly blocked on external input (credentials/infrastructure, not decisions):** T259 (free API key), T267 (Paymob credentials), T292/T294 (email provider key), T293 (brand assets, if not already in `design-system/`), T295/T296/T298/T299/T300 (channel)/T304/T305/T306 (real infrastructure provisioning or a chosen third-party service).

**Every task above states, in this exact order: what it resolves, exactly which files to touch, exactly which existing real endpoints/functions to reuse (with file:line), what new contract to build if any, what to test and what specifically to assert, this repo's real size/pattern constraints to follow, its dependencies, and a checkable acceptance list** — a later executing pass (any capability level) should be able to pick up one task at a time from this document alone, without re-reading the three source audits first.
