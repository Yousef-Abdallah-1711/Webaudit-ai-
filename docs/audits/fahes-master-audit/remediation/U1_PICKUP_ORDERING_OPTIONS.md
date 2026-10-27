# U-1 Pickup-Ordering Options (SPEC 009)

**No option is selected. This document is analysis for the owner.** Sources: HEAD `specs/009-…/plan.md:253-258` (lifecycle diagram), `data-model.md:53-65`, `contracts/execution-runtime-contract.md` (steps 0–7), `contracts/execution-unit-contract.md:84-86` (WORKING_TREE rule 7), `contracts/runtime-finalization-contract.md:19,50-52`, `contracts/scan-deadline-contract.md:113-128,177-200,266-272` (WORKING_TREE, untracked), 012 `upstream-amendment-requests.md` AR-18, 008 `safety-checkpoint-contract.md`.

## 1. What the documents say today (three readings that cannot all hold)

**R-D (HEAD diagram + data-model comments)** — admission precedes the queue job:
`PLANNED —F07 PROCEED→ ADMITTED —queue job created→ DISPATCHED —child started→ RUNNING`; `ADMITTED→REFUSED` "between admission and dispatch". `ADMITTED` = "passed F07 safetyCheckpoint… about to dispatch"; `DISPATCHED` = "a queue job exists".

**R-C (runtime contract steps 1–4)** — job first, admission on pickup:
1 enqueue `{executionUnitId}` · 2 worker re-reads on pickup · 3 F07 `safetyCheckpoint`; `STOP` → `REFUSED or KILLED`, no fork; `PROCEED` → 4 `transitionStatus(DISPATCHED)`, fork, `RUNNING`. Here a job exists while the unit is still before `DISPATCHED`, and `DISPATCHED` is set *after* F07 — the opposite of R-D's meaning.

**R-U (U-1 working tree)** — `DISPATCHED` = "a queue job exists and NO child process or Guest has started" (`scan-deadline-contract.md:118`, rule 7); step 0 runs "on pickup after the re-read and before F07" and may see a unit that is `PLANNED`, `ADMITTED` or `DISPATCHED` (`:118`); `PLANNED→REFUSED` and `DISPATCHED→REFUSED` are added. But "step 0 runs before F07" means F07 has not run yet at pickup, which under R-D would make `ADMITTED` impossible at pickup, and the matrix (`:188-190`) says `ADMITTED`/`DISPATCHED` units "hold an F07 lease when the checkpoint already returned PROCEED".

**Concrete inconsistencies** (also AR-18 items 1–4, 012 `upstream-amendment-requests.md`):
1. When is `ADMITTED` set relative to the F07 call? (R-D: by it; R-C: never before F07.)
2. When is the queue job created relative to F07? (R-D: after; R-C: before.)
3. What does `DISPATCHED` mean? (R-D/R-U: job exists; R-C: about to fork after F07.)
4. Is the F07 lease held when step 0 runs? (R-U step 0: "no lease"; matrix: held for ADMITTED/DISPATCHED.)
5. `REFUSED` is defined "never admitted at all" (`runtime-finalization-contract.md:19`) yet is used for `ADMITTED`/`DISPATCHED` units.
6. Pre-RUNNING stops: R-C says `REFUSED or KILLED`; diagram and matrix allow `KILLED` only from `RUNNING`.

## 2. Candidate sequences

Notation: P = producer (orchestrator/plan driver), W = worker host at pickup. `Q` = queue job. "step0" = deadline/terminal precondition of `scan-deadline-contract.md`.

### Option A — "Admit, then enqueue" (adopt R-D; U-1 adapts)
1. P: step0 (deadline/scan-terminal) while `PLANNED`; on fail finalize `REFUSED` via `PLANNED→REFUSED`.
2. P: F07 `safetyCheckpoint`; `STOP` → `REFUSED(f07 reason)` via `PLANNED→REFUSED`; `PROCEED` → `ADMITTED` (lease held if concurrency consumed).
3. P: create Q, `ADMITTED→DISPATCHED`.
4. W: pickup, re-read, **step0 again** (time passed in queue); on fail → finalize `REFUSED` via `DISPATCHED→REFUSED` **and release the lease** (lease is held in `DISPATCHED`).
5. W: fork, `DISPATCHED→RUNNING`.
- Edges added vs HEAD: `PLANNED→REFUSED`, `DISPATCHED→REFUSED` (as U-1). `ADMITTED→REFUSED` already exists (expiry while queued-but-not-yet-DISPATCHED).
- Text to change: runtime contract (reorder steps 1–4, F07 moves before enqueue); U-1 step 0 wording ("no lease" becomes "lease released by finalization when held"); `runtime-finalization-contract.md:52`.
- Safety: F07 budget/lease is consumed before a job exists, so an expired scan can leak an admission if step 4 fails and the lease release is not transactional (couples to AR-19). A job-less ADMITTED unit after a producer crash needs a reconciler (AR-22). Strong point: refused work never occupies the queue.
- Recovery: orphan `ADMITTED`/`DISPATCHED` units are self-healed by `expirePlanUnits` (already in U-1) and F07 lease expiry.
- 012 impact: 012's `sec_transition_unit` already accepts `PLANNED→ADMITTED`, `ADMITTED→DISPATCHED`, `DISPATCHED→RUNNING` — matches Option A; AR-18 items 1–2 close with no 012 change.

### Option B — "Enqueue, then admit on pickup" (adopt R-C; diagram and data-model adapt)
1. P: step0 while `PLANNED` (optional pre-check); create Q; unit stays `PLANNED` (or set `DISPATCHED` at enqueue — see variant).
2. W: pickup, re-read, step0 (before F07); fail → `REFUSED` via `PLANNED→REFUSED`; no F07 call, no lease.
3. W: F07 `safetyCheckpoint`; `STOP` → `REFUSED(f07 reason)` (no lease); `PROCEED` → `ADMITTED`.
4. W: `ADMITTED→DISPATCHED` is now a bookkeeping edge immediately before fork; fork; `RUNNING`.
- Variant B′: set `DISPATCHED` at enqueue (matches U-1's definition) and let step 3 move `DISPATCHED→ADMITTED` (a **new** backward-looking edge) — not recommended: invents an edge.
- Edges added: `PLANNED→REFUSED` only; `DISPATCHED→REFUSED` becomes unnecessary unless B′.
- Text to change: data-model comments (`ADMITTED`, `DISPATCHED`), diagram (HEAD `plan.md:253-258`), U-1 matrix (`:182-186` columns), `execution-unit-contract` rule 7 ("exactly two edges" becomes one), 011/012 references that assume `DISPATCHED→REFUSED` (012: `sec_refuse_unclaimed_unit` is "`PLANNED` only", consistent).
- Safety: F07 is called after the job exists, so no lease is held during queue wait (a queued job cannot starve concurrency). Weaker point: expired scans still enqueue jobs that are refused at pickup (queue load) and the `ADMITTED` status loses its "authorized before queued" meaning, which 012's FR-195 and 011 may rely on.
- Recovery: a crashed worker between F07 `PROCEED` and `RUNNING` leaves an `ADMITTED` unit with a held lease → covered by lease expiry + `expirePlanUnits`.

### Option C — "Two-gate": deadline at producer, authorization at pickup
1. P: step0 while `PLANNED`; fail → `PLANNED→REFUSED`. Create Q (unit `PLANNED`).
2. W: pickup, step0' (remaining time against `dispatchThresholdMs`), then F07 `safetyCheckpoint`; `PROCEED` → `ADMITTED`→`DISPATCHED`→`RUNNING`.
- Combines B's lease-free queue wait with A's early refusal of already-expired scans; uses only `PLANNED→REFUSED` (plus existing `ADMITTED→REFUSED`).
- Same text changes as B; additionally step0 appears twice (producer and pickup) and must be defined as idempotent with the same reasons.

## 3. Comparison (qualitative, DOC-based; nothing here is tested)

| Criterion | A | B | C |
|---|---|---|---|
| Matches HEAD diagram and `data-model` comments | Yes | No (they change) | No (they change) |
| Matches HEAD runtime contract order | No (reorders) | Yes | Yes |
| Edges added | 2 (as U-1) | 1 (or invents one, B′) | 1 |
| Lease held while queued | Yes (must release on refusal) | No | No |
| Queue carries doomed jobs | No | Yes | Reduced |
| Meaning of `ADMITTED` as "authorized" | preserved | weakened | weakened |
| 012 (`sec_transition_unit`, FR-195, T814) changes | none | wording only | wording only |
| 011 (AG2, T-U1 reliance) changes | none | text citing `DISPATCHED→REFUSED` | text citing `DISPATCHED→REFUSED` |
| Couples to AR-19 (transactional lease release) | strongly | weakly | weakly |
| Couples to AR-22 (orphan recovery) | `ADMITTED`/`DISPATCHED` orphans | `ADMITTED` orphans | `ADMITTED` orphans |

## 4. Questions requiring owner approval (answerable explicitly; see `OWNER_DECISIONS_REQUIRED.md` Q2)

1. Which option (A, B, C) is the intended sequence? If none, which semantics of `ADMITTED` and `DISPATCHED` apply?
2. Must F07 admission precede queue creation (authorization before any job exists)?
3. Is a held lease acceptable while a job waits in the queue?
4. Is exactly one added edge (`PLANNED→REFUSED`) acceptable, or must `DISPATCHED→REFUSED` exist?
5. Should the choice be recorded as an amendment of 009 (the frozen contract) with its own approval, rather than as an in-place edit of U-1?

## 5. What is not decided here

Timing numbers (`M`, margins), lease TTLs, the AR-19 transactional surface, and whether 010 engines inherit U-1's obligations (RM-B9) are separate. This document does not edit U-1 and does not approve it.
