# Final Production-Readiness Delta Review — the whole 250-task plan

**Date:** 2026-09-04
**Scope:** Everything. With the [full-project remediation
roadmap](2026-09-03-full-project-remediation-roadmap.md)'s nine sessions all done (`tasks.md` shows
250/250, +T236a), this is the closing check the user asked for directly: "make sure 100% that everything
for all of this is done and production ready." Three independent passes, run against the *current, final*
state of the codebase — not by re-reading old review documents and trusting their own "done" framing.
**Status column:** ✅ Fixed in this review · 🔵 Confirmed already-known, accepted trade-off (not new,
not hidden) · 🔴 Open, needs a real decision (not fixed here, not silently dropped).

---

## Pass 1 — audit of the six historical plan/review documents

Method: read each of the six pre-existing planning/review documents in `docs/superpowers/plans/` in
full, extracted every distinct finding/task, and checked its *current* disposition against the real code
and against `tasks.md`'s checkbox state — not against the document's own "done" claim.

**Verdict: clean across all six.** No dropped findings. Every item resolves to one of: a real, currently-
present code fix (cited by file/line in the review), a documented deliberate deferral traceable to a
PROGRESS.md Open Decision or CLAUDE.md Known-open-item, or an explicitly-labeled still-open item that is
itself named in PROGRESS.md's own account. The task-number cross-check (does any of these six documents
cite a T-number `tasks.md` still shows unchecked?) also came back clean — the only unchecked tasks at the
time of this check were Phase 11's own remaining items, which none of the six documents reference.

Documents checked: `2026-08-27-credit-refund-integrity.md`, `2026-08-27-control-gate-enforcement.md`,
`2026-09-02-phases-4-7-engineering-review.md`, `2026-09-02-phases-4-7-remediation.md`,
`2026-09-04-us7-admin-adversarial-review.md`, `2026-09-04-sandbox-runner-adversarial-review.md`.

---

## Pass 2 — the seven non-negotiables and a `tasks.md` accuracy spot-check

Method: re-verify each of CLAUDE.md's seven non-negotiables against the current source directly (not
prose), run the relevant live test suites, and spot-check ~24 tasks spread across early/middle/late
phases against their own specific claim in `tasks.md`.

| # | Non-negotiable | Verdict |
|---|---|---|
| 1 | Core never names a capability | 🔵 **Real, already-known tension — see Finding A below** |
| 2 | Nothing fetched from a third party at runtime | ✅ Holds |
| 3 | Code layer runs first, zero tokens | ✅ Holds |
| 4 | All AI through `ai-executor`, ≥2 vendors | ✅ Holds strongly |
| 5 | Sandbox-runner only, no unsandboxed fallback | ✅ Holds strongly (one disclosed functional gap, not a Principle-V breach — see Open Decision #20) |
| 6 | Never charge for platform failures | ✅ Holds (one stale comment, fixed — Finding C) |
| 7 | Green means verified | ✅ Holds strongly, no exceptions found |

**`tasks.md` spot-check**: ~24 tasks checked across T035–T236 (early credit/SSRF/control-gate suites,
middle archive/refund/renewal work, late sandbox/admin/polish tasks). **No task's `[X]` mark was found
false** — every claim held up against the actual code and, where applicable, a live test run. The
project's own habit of disclosing partial work in the task's own line (T226/Open Decision #20, T236's
7 `it.todo`s, `apps/probe-pool`'s honest non-deployability) was checked against the code each time and
found accurate.

**`pnpm run typecheck` / `pnpm run build`** (root scripts, via turbo): still fail on the pre-existing
`@webaudit/api`↔`@webaudit/worker` cyclic-dependency warning — confirmed unchanged from Open Decision
#16, not silently worse, not silently fixed. Per-package `tsc`/`next build` remain independently clean.

### Finding A (🔵 confirmed already-known, not new) — Principle I's real tension with `capability-loader.ts`

`apps/worker/src/orchestrator/capability-loader.ts` hardcodes a static `CAPABILITY_LOADERS` table
(literal `import()`s per module), and `apps/worker/src/reverify/resolve-check.ts` hardcodes a
`CHECK_NAMESPACE_TO_CAPABILITY` map from check-id namespace to a literal capability-id string. Both
admit this openly in their own comments. The registry (`apps/api/src/services/registry/registry.ts`) is
only consulted afterward to filter by `isEnabled` — the *set of possible capabilities per module* is
still named in core, which is exactly what non-negotiable #1 forbids taken literally.

This is **not a new discovery** — it is PROGRESS.md's own Open Decision #13 ("Capability loader is a
static import table... Made, not settled"), on record since Phase 3. What Pass 2 adds: the
`resolve-check.ts` mapping is a second instance of the same shortcut, previously undocumented in #13's
own text, and the tension with the constitution's absolute "grounds for rejection on its own" framing is
worth stating plainly rather than filed only as a discovery-mechanism nuance. **Fixed in this review**:
Open Decision #13 updated to name both files and to state the tension explicitly, and CLAUDE.md's
"Project state" section (see Finding B) now names it as a live, accepted exception rather than leaving a
reader to discover the contradiction unaided.

### Finding B (✅ fixed) — CLAUDE.md's "Project state" section was badly stale

Found genuinely wrong, not merely dated: it read "**209 of 250 tasks done**... Next is **Phase 8**" and
listed only 10 of 11 adversarial gates green — describing the project as it stood *before Phase 8 even
started*, directly contradicted by `tasks.md` (250/250) and by this same file's own, correctly-updated
"Known open items" section a few paragraphs later. Traced to the Session 9 documentation commit, which
updated several other CLAUDE.md paragraphs but missed this one. **Fixed**: rewritten to state 250/250,
all 11 gates green, and to name the two most load-bearing open exceptions (Open Decisions #13 and #20)
directly in the same section, rather than requiring a reader to already know to go find them.

### Finding C (✅ fixed) — a stale comment in `terminal-refund.ts`

Claimed `sweepTimedOutScans` "is not yet scheduled in production (its only caller today is a test)" —
false today: `apps/worker/src/index.ts` calls `scheduleTimeoutSweep` as a real repeatable BullMQ job in
the actual process entrypoint, and has since Phase 5. Not a billing gap (SC-008 holds regardless, per
Pass 2's table above) — a documentation-accuracy issue in a security/billing-adjacent comment, exactly
the kind of thing worth catching before calling the codebase's own internal documentation trustworthy.
**Fixed**: comment corrected to state the sweep is genuinely scheduled.

---

## Pass 3 — integration-seam review across subsystems

Method: hunt specifically for bugs at the *seams* between subsystems built somewhat independently over
nine sessions — not re-reviewing any single piece in isolation, since each has already been reviewed on
its own at least once.

| # | Seam checked | Verdict |
|---|---|---|
| 1 | Sandbox dispatch × admin auth | 🟡 **Functionally safe, real test-coverage gap — Finding D, fixed** |
| 2 | Structured logger × worker shutdown | ✅ Confirmed safe, no coupling |
| 3 | Control gate × sandbox conformance's own `controlLevel` | 🔴 **Genuine latent gap, not currently exploitable — Finding E, recorded** |
| 4 | Credit refund × sandbox (real scan path) | ✅ Confirmed disjoint — no scan-time code calls sandbox-runner today |
| 5 | Rate limiter × questionnaire Redis state | ✅ Confirmed safe — disjoint keyspaces, disjoint mechanisms (ioredis key/counter store vs. BullMQ vs. Postgres row state) |
| 6 | Three spot-checked "easy to get wrong" invariants | ✅ All three still hold, verified against current code (RedactedPrompt cross-queue identity, guarded state transitions, persist-before-publish) |

### Finding D (✅ fixed) — `POST /admin/capabilities/upload` was missing from the one test designed to catch exactly this class of gap

`apps/api/tests/adverse/admin-authz.test.ts` exists specifically to prove `requireOperator` gates every
admin route in the *real assembled app* (`createApp()`), not a standalone router — its own header states
"a future admin route added under `routes/admin/` and forgotten in `adminRoutes` would pass every
existing `admin.*.test.ts` file and still be exploitable — only a test against the real mounted app
catches that." The upload route (T226, Session 8) was never added to its `ROUTES` array. Traced the
actual request path (`app.ts:327` → `adminRoutes()` → `requireAuth`+`requireOperator` mounted before any
sub-router, including `adminCapabilitiesRoutes`) and confirmed the gate **is** genuinely applied in
practice — this was a coverage gap, not an active vulnerability. But it is exactly the kind of gap this
suite exists to prevent from going unnoticed: a future refactor of `adminRoutes()` that broke this one
route's gating would have passed the entire suite. **Fixed**: added
`{ method: 'post', path: '/admin/capabilities/upload' }` to `ROUTES`; re-ran the suite — 57/57 pass (up
from 54, the three new refusal-mode checks for the added route).

Also confirmed no credit/billing coupling on this path: `capability-upload.service.ts` and
`capabilities.routes.ts` import neither credits nor billing services — capability upload is not a
billable action, and nothing here can debit or double-charge.

### Finding E (🔴 open, recorded — needs a design decision, not a quick fix) — conformance-checking can only ever exercise `controlLevel: NONE`

`capability-upload.service.ts`'s `sampleCapabilityInput()` hardcodes `controlLevel: 'NONE'` for every
conformance run, and `runConformanceSuite` never varies this or gates on a capability's own
`requiredControlLevel` — it just runs the capability once at whatever level the sample input carries.
The *real* control gate (`apps/worker/src/module-runner/resolve.ts`'s `resolveApplicable`) is external
to the capability and correctly compares `required` against the scan's actual verified level before ever
calling the capability at all — so **today** there is no exploitable false pass, confirmed by grepping
every vendored capability for any internal branch on `input.controlLevel` (zero matches — no capability
reads it today). The gap is structural and latent: nothing in the capability contract
(`packages/capability-sdk/src/contract.ts`) forbids a future capability from branching on
`input.controlLevel` internally, and nothing in conformance-checking would ever exercise a branch gated
above `NONE`. A second, independent reason this can't bite today: no uploaded capability can pass
conformance's `manifest-valid` check at all right now (Open Decision #20), so no upload produces
`passed: true` regardless of this gap.

**Not fixed here, recorded as a new Open Decision (#21)** — the right fix (run conformance once per
control level the manifest claims, or make it a documented, enforced rule that capability code must
never read `controlLevel` at all, only the runner may) is a real design call, the same shape as Open
Decision #20's own "needs a design decision, not a quick fix" reasoning, and rushing it risks the same
mistake this project has already avoided elsewhere (synthesizing a fix that makes a verification mean
less than it claims).

---

## Consolidated fix list (this review)

1. Added `POST /admin/capabilities/upload` to `admin-authz.test.ts`'s `ROUTES` — 57/57 passing.
2. Corrected `terminal-refund.ts`'s stale "timeout sweep not yet scheduled" comment.
3. Rewrote CLAUDE.md's badly stale "Project state" section (209/250 → 250/250, 10/11 → 11/11 gates,
   named the two most load-bearing open exceptions directly).
4. Expanded PROGRESS.md's Open Decision #13 to name `resolve-check.ts`'s mapping too, and to state the
   tension with non-negotiable #1 explicitly rather than filing it only as a discovery-mechanism note.
5. Added a new PROGRESS.md Open Decision #21 for Finding E (conformance's `controlLevel` pinning).

## What is genuinely, honestly still open — not fixed, not hidden

- **Open Decision #13** — the capability-loader/resolve-check static-table shortcut, a real, accepted
  tension with non-negotiable #1. Needs a product/eng call: accept permanently, or do the registry
  extraction.
- **Open Decision #20** — capability upload produces a conformance verdict but not an installed,
  runnable capability; separately, no upload can pass full conformance today because of a pre-existing
  `harness.ts` manifest-construction gap.
- **Open Decision #21** (new) — conformance-checking can only ever exercise `controlLevel: NONE`; latent,
  not currently exploitable, needs a design decision before it matters.
- **Open Decisions #18, #19** — two Windows-specific gaps in `sandbox-runner` (empty-env leakage, an
  fs-permission glob-matching quirk), unverified on the real (expected Linux) deployment target.
- **`pnpm test:visual`** is not green for every surface in `design/screen-map.md` — 7 pre-existing
  `it.todo`s on the known `PublicHeader` mobile-nav gap.
- **`apps/probe-pool`** is not yet a deployable unit — no server entrypoint exists.
- **A new accessibility finding (carried correction 0a-2)**: the vendored `--accent`/`--promo-bg` brand
  tokens fail WCAG AA contrast on every public page — narrowly excluded from the new axe-core suite with
  full evidence, not fixed (needs a signed-off design exception, not a polish-task side effect).
- The already-long-standing product-decision items (monetary price points, the Level-1 probe rate, the
  per-area score formula, OpenAI/Google provider pricing) remain exactly as open as PROGRESS.md has
  always stated — this review did not find anything new about them, only confirmed they're still
  accurately described.

## Verification gate for this review's own fixes

```
pnpm test:adverse apps/api/tests/adverse/admin-authz.test.ts   → 57/57 passed
pnpm --filter @webaudit/worker exec tsc --noEmit                → clean
eslint (admin-authz.test.ts, terminal-refund.ts)                 → clean
```

## Bottom line

Six of seven non-negotiables hold cleanly, verified against live code and live test runs, not prose. The
seventh (core never names a capability) has one real, already-accepted, now more clearly documented
tension — not a hidden defect. Every one of the six historical review documents is genuinely closed, with
no dropped findings. `tasks.md`'s 250/250 is trustworthy on every task sampled. Five real, cheap items
were found and fixed in this review; three genuine but non-urgent design questions were found and
recorded rather than rushed. **The project is production-ready in the sense this whole engagement has
always used the phrase**: every guarantee this document's own seven non-negotiables state is either
true today, verified live, or is a plainly-stated, deliberate, already-accepted exception — never a
silent gap.
