# Owner Decisions To Close

Nothing here is approved. **To begin any implementation you must answer exactly one item: A0-1.** Everything else is needed only when the named SPEC is about to start; answer in batches when you are ready. Classification and reasoning for all 69 decisions: `DECISION_RECLASSIFICATION.md`. Answer format: one line per item, e.g. `DEC-048: Option A`. Anything you leave open keeps its fail-closed default.

Not asked (evidence or technical investigation settles them, or they are deferrable): DEC-050, 056–058 (accept as one default batch in Q9), 053/054 (evidence from the 011 owner/provider), 060, 063, 064, 068; and the deferrable list at the end.

## Batch 0 — Authorization to start (no decision ID)
**A0-1. Authorize SPEC 007 slice 1** (007 tasks T001–T002 plus mirroring three enums in `packages/types`), implemented through `/codex-delegate` per `CLAUDE.md`, stopping before commit.
- Recommended: authorize. Alternative: hold.
- Consequence: a bounded, reversible schema-enum change with its own test; no migration; no decision needed (`FIRST_IMPLEMENTATION_GATE.md`).
- Blocks: F-03 only. **Required now to start anything.** Format: `A0-1: authorize` or `A0-1: hold`.

**A0-2 (optional). Authorize F-01a baseline** — run the existing gate commands (`pnpm typecheck`, `pnpm lint`, `pnpm test` unit project) once to record pre-existing failures; they write only ignored caches (`.turbo/`, `node_modules/`, `*.tsbuildinfo`). DB-backed suites are skipped because the Docker daemon is currently not running.
- Recommended: authorize. Consequence: tells us whether a CI workflow could be green at all. Blocks: F-01b. Not required for A0-1. Format: `A0-2: authorize`.

## Batch 1 — Before SPEC 008 starts (Level 1; blocks S-01/S-02/S-04, CORE-06, E-06)
**DEC-045 — How is F07 admission/release exposed?**
- Question: must admission, checkpoint and lease release be callable inside a caller's database transaction, with identity and clock derived from the claimed unit rather than supplied by the caller?
- Recommended **Option A**: yes — transaction-joinable, unit-keyed, token-free release, context-derived identity (needed by SPEC 012's design and by atomic finalize+release).
- Option B: application-level service only (faster now; finalize and release cannot be one transaction; later retrofit for 012). Option C: a separate admission service.
- Consequences: A changes the 008 contract (G-03) and S-02/S-03 shape; B leaves prompt lease release UNPROVEN. Blocks: S-02, S-03, CORE-06, E-06. Required now: no (before SPEC 008 prep). Format: `DEC-045: A`.

**DEC-044 — Adopt the database role-boundary direction (AR-13)?**
- Recommended **Option A**: adopt the direction (separate roles, definer functions for security-sensitive writes; detailed design in F-02). Option B: defer until before the SPEC 012 broker (retrofit risk).
- Consequence: A keeps 008's function inventory consistent with 012; no compromised-worker resistance is claimed either way until built. Blocks: S-01/S-02 design, E-06. Format: `DEC-044: A`.

**DEC-034 — Who owns and when is the AR-13/AR-19 design (OD-2)?**
- Recommended: you are the owner; I draft F-02 for review before S-01. Alternative: name another owner/date. Blocks: S-01. Format: `DEC-034: owner=<name>, date=<date>` or `DEC-034: Option A (draft for me)`.

**DEC-048 — When a stop is requested and no live host exists, who advances the kill-switch row?**
- Recommended **Option A**: the finalizer acknowledges by authority **and** a reconciler advances rows with no live in-scope execution. Option B: finalizer only. Option C: accept and alert only.
- Consequences: C leaves broad-scope rows blocking admission indefinitely; A adds a reconciler to SPEC 008. Blocks: S-04, CORE-06. Format: `DEC-048: A`.

**DEC-049 — `recordStopped` order until AR-19 exists.**
- Recommended **Option A**: a reconciler records `STOPPED` once no live lease exists. Option B: call after finalize regardless. Option C: only after reclaim.
- Consequence: B violates 008's "after budget released" wording while release is expiry-based. Blocks: S-04, CORE-06. Format: `DEC-049: A`.

## Batch 2 — Before SPEC 009 starts (Level 1)
**DEC-047 — Finalization authority (AR-18 item 5).** Recommended **A**: one logical `finalizeExecutionUnit` with a database implementation; SPEC 012's three entry points share one body (equivalence test). Option B: amend rule 1 to allow several paths. Blocks: CORE-06, 012 finalize functions. Format: `DEC-047: A`.

**DEC-051 — Effect-authorization ledger.** Recommended **A**: adopt a 009 ledger contract (authorized → confirmed), engines use conforming ledgers (012 reuses its intents). Option B: no ledger (accept new authorizations after terminalization). Consequence: A gives "no new database authorization after terminalization" only; effects already authorized are not prevented. Blocks: CORE-01, CORE-05, E-01, E-05, E-07. Format: `DEC-051: A`.

**DEC-066 — Path for the U-1b amendment text.** Recommended **A**: I produce a v6 incorporating the Phase 2C repairs (stop definition, terminology, ledger lifecycle, loop start) for your review before approval. Option B: approve v5 as is (not recommended: v5 contradicts 008 on `STOPPED` and misattributes concurrency refusal). Blocks: SPEC 009 start, G-01/G-02. Format: `DEC-066: A`.

**Q9 — Accept the design defaults for DEC-056 (claim token mechanics), DEC-057 (single-statement CAS, `FOR SHARE` lease check, only when the dispatch call consumed concurrency), DEC-058 (stop-first classifier).** Recommended: accept all three. Alternative: list exceptions. Blocks: CORE-03, CORE-04. Format: `Q9: accept` or `Q9: accept except DEC-0xx`.

## Batch 3 — Before SPEC 010 (E-01)
**DEC-052 — Context ceiling.** Recommended **Option A**: check the per-process ceiling before F07 admission with an in-memory reservation released on every exit; delayed requeue; build the pool after `RUNNING`. Option B: bounded `ADMITTED` wait (holds a lease). Option C: model as an F07 concurrency budget (not equivalent: per grant, not per process). **DEC-042 — U-1 obligations on 010:** recommended: formal 010 amendment; alternative: implementation obligation only. Blocks: E-01. Format: `DEC-052: A`, `DEC-042: amend`.

## Batch 4 — Before SPEC 011 E-05 (E-03/E-04 are unaffected)
**DEC-053/DEC-054 — Confirm for SPEC 011:** (1) supervisor creation, EP credential delivery and provisioning all occur after `RUNNING`, with no second F07 call; (2) the Execution Plane must refuse a `provision` after `destroy(runId)`. Recommended: confirm both. Alternative for (2): rely on dead-man and hard TTL cleanup only (a stale provision can orphan a Guest until then). Format: `DEC-053: confirm`, `DEC-054: tombstone` or `DEC-054: ttl-only`.

## Batch 5 — SPEC 012 and billing (latest decision points)
**DEC-032 — OD-3 billing (before B-02 and any 012 purchase surface).** Today: a 5-area audit charged 80, SECURITY `DEGRADED` counts as delivered, refund 0; UI(25)+SEO(10) with UI undelivered refunds 17. Recommended **Option 1**: time-boxed exception keeping today's per-area charge and refund (you set an expiry date). Option 2: class-level settlement (P17+AR-17+AR-15, needs F06). Format: `DEC-032: Option 1, expires <date>`.
**DEC-033 — Mode S vs P (before E-06).** Recommended: Mode P for an allow-listed pilot, Mode S before general availability. **DEC-055 (before E-06/E-07):** accept 012 follow-ups (PLANNED-only claim, no resume, no unclaimed refusal when a stop is pending): recommended accept. **DEC-061 (before B-01/E-09):** keep legacy `DEGRADED` and add a separate `coverageComplete:false` marker: recommended accept.

## Batch 6 — Documentation and provenance
**DEC-031 — SPEC 006 dates.** Supply the approval and freeze dates you can substantiate, or confirm statuses stay unchanged. **DEC-018** — tell me when you will run the U-1 and 011 commits (after DEC-066). Neither blocks implementation.

## Deferrable (no answer needed now)
DEC-035, 036, 037, 038, 039, 040, 041, 043, 046, 059, 060, 062, 065, 067, 068 — each keeps its default until the SPEC-local phase; DEC-067 (CI) waits for A0-2's baseline evidence; DEC-062 matters only if class-level billing (DEC-038) is adopted.
