# PROPOSED SPEC 009 Amendment U-1b — Dispatch Ordering (enqueue first, F07 admission on pickup)

**STATUS: PROPOSED — NOT APPLIED — NOT APPROVED.** This is a standalone draft for owner review. No existing file was edited. It must not be applied to any SPEC 009 file until the owner approves the complete amendment, including the pending Q2.2 clause (§5).

Provenance tags on every clause: **[OWNER]** stated by the owner in this conversation · **[HEAD]** existing HEAD text kept · **[U-1]** existing working-tree U-1 text kept · **[DERIVED]** follows mechanically from the owner's statements and existing text · **[PROPOSED]** my drafting choice, needs explicit review · **[PENDING Q2.2]** blocked on the owner's edge choice.

Owner statements this draft implements: Q2 = B ("enqueue first, then perform F07 admission on pickup; formal amendment; do not silently rewrite U-1; preserve the existing state model unless the approved amendment explicitly changes it; define ADMITTED and DISPATCHED consistently across diagram, data model, runtime contract and SPEC 012 references"); Q2.1 = option (i), "subject to review of the full state-transition and crash-recovery contract; preserve PLANNED → ADMITTED → DISPATCHED → RUNNING". Q2.2, Q4–Q9 and Q1 dates are **not** decided here.

## 1. Scope

In scope: the order and meaning of statuses between plan resolution and `RUNNING`; queue-job semantics; where F07 admission and lease acquisition happen; refusal/finalization behaviour in that window; crash recovery by status. Out of scope and unchanged: F01/F07 contracts, the immutable plan deadline of U-1 (`computePlanDeadline`, anchors, ceiling, grant check), the single `timeout-sweep` job, billing/refund rules, queue topology, the AR-13/AR-18-5/AR-19/AR-22 questions (§8).

## 2. Normative definitions (replaces `spec.md` FR-014 status text, `data-model.md:53-65` comments, `plan.md` diagram labels)

| Status | Meaning after this amendment |
|---|---|
| `PLANNED` | The unit exists in a `RESOLVED` plan and may have a queue job. **No F07 admission has been performed and no F07 lease is held.** [OWNER/DERIVED] |
| `ADMITTED` | F07 `safetyCheckpoint` returned `PROCEED` for this unit on pickup. The F07 lease (if `consumes.concurrency`) is held from here. The host has not yet handed the unit to its execution runtime. [HEAD meaning preserved: "passed F07"] |
| `DISPATCHED` | The host that admitted the unit has handed it to its execution runtime to start the child process or Guest; **no child process or Guest has started**. The F07 lease is held. (**Replaces** HEAD "a queue job exists for it" and U-1 "a queue job exists and no child process has started".) [OWNER Q2.1 (i)] |
| `RUNNING` | A child process or Guest has been started by the claim-owning host. [HEAD] |
| `REFUSED` | Terminal. **Replaces** HEAD "never admitted — … at or before the checkpoint". New meaning: *the unit reached a terminal state before any execution started* (refused at step 0, stopped by F07, or ended by plan/scan end while `PLANNED`, `ADMITTED` or `DISPATCHED` [PENDING Q2.2 for `DISPATCHED`]). Needed because HEAD already uses `ADMITTED → REFUSED` (AR-18 item 4). [PROPOSED] |
| `COMPLETED`, `FAILED`, `CANCELLED`, `KILLED`, `BLOCKED`, `SKIPPED` | unchanged; `KILLED` only from `RUNNING` [HEAD/U-1] |

## 3. Normative dispatch sequence (replaces `execution-runtime-contract.md` steps 0–4; step 5–7 and boundary rules otherwise unchanged)

1. **Enqueue.** The plan driver creates a queue job whose payload is only `{ executionUnitId }` (FR-018). The unit stays `PLANNED`. No F07 call, no lease, no budget consumed. [OWNER/DERIVED]
2. **Pickup and re-read.** The worker re-reads the unit, its plan and its scan from PostgreSQL; the payload is never authoritative. [HEAD step 2]
3. **Step 0 (deadline precondition).** Exactly as `scan-deadline-contract.md` "Dispatch precondition" [U-1]: scan terminal or deadline passed → finalize `REFUSED` (`SCAN_DEADLINE_EXPIRED` / `SCAN_CANCELLED` / `SCAN_FAILED`); remaining time `< timeoutPolicyMs + hardStopMarginMs` → `REFUSED(SCAN_DEADLINE_INSUFFICIENT)`. The unit is `PLANNED` at this point, so the edge is `PLANNED → REFUSED`. Step 0 precedes F07; it consumes nothing and holds no lease. [U-1 + DERIVED]
4. **F07 admission.** If `requiresSafetyCheckpoint`: call F07 `safetyCheckpoint` (the sole authority; PostgreSQL-authoritative per 008 FR-017; unchanged). `STOP` → finalize `REFUSED` with the F07 reason from `PLANNED` (`PLANNED → REFUSED`); a pre-run stop is never `KILLED` [U-1/HEAD diagram]. `PROCEED` → `PLANNED → ADMITTED`. [HEAD + DERIVED]
5. **Hand-off.** `ADMITTED → DISPATCHED`. [OWNER Q2.1 (i)]
6. **Fork.** The claim-owning host starts the child/Guest; `DISPATCHED → RUNNING`. The parent-armed hard-stop deadline is armed before any safety-sensitive action (HEAD step 5, unchanged). [HEAD]
7. **While `RUNNING`:** host loop at ≤ 5 s: F07 checkpoint/renewal, plus the U-1 deadline check [U-1 step 6a]; finalization via `finalizeExecutionUnit` [HEAD step 7].

Rules:
- **Redelivery** [PROPOSED]: step 0 runs on every pickup, including BullMQ redelivery and worker restart (U-1 rule 6 kept). A redelivered job for a unit that is already terminal is a no-op (HEAD rule 4). For a unit in `ADMITTED` or `DISPATCHED` whose host is gone, the redelivery does **not** resume hosting by default; the unit is ended by the plan-deadline sweep (§6), unless the owner approves a takeover rule (none exists in 009 or 012; 012 states "no takeover or retry invented", `data-model.md` 4.10D/4.10F). For a `RUNNING` unit a redelivery is a no-op (single live host, 012 FR-183).
- **Idempotency**: the F07 call uses the unit's `idempotencyKey` (008 FR-008, unchanged). A replayed `GRANTED` is not current authorization after a stop (existing F07 rule; 012 N-12) — the host re-checks the kill-switch state on pickup.
- **Lease** [DERIVED]: acquired at F07 `PROCEED` (status `ADMITTED`); renewed by the existing host loop; released by `finalizeExecutionUnit` step 2 for every terminal outcome. **No lease exists while the unit is `PLANNED` and queued.** The release *mechanism* and its transactional surface are not defined here (AR-19, open).
- **Time budget** [PROPOSED, review]: step 0 now precedes F07 and the fork; the interval between step 0 and `RUNNING` (F07 latency + hand-off) is not separately budgeted. `dispatchThresholdMs = timeoutPolicyMs + hardStopMarginMs` is unchanged; the finalization margin `M` absorbs it. Review whether a measured bound is required before activation (U-1 already requires `M` calibration before any non-passive class is activated).

## 4. Edge table after this amendment

| Edge | Source | Note |
|---|---|---|
| `PLANNED → ADMITTED` | HEAD | F07 `PROCEED` on pickup |
| `ADMITTED → DISPATCHED` | HEAD | meaning of `DISPATCHED` changed (§2) |
| `DISPATCHED → RUNNING` | HEAD | child/Guest started |
| `ADMITTED → REFUSED` | HEAD | stop or plan end while `ADMITTED` |
| `PLANNED → REFUSED` | U-1 | step 0, F07 `STOP`, plan end; **needed under every Q2.2 option** |
| `DISPATCHED → ?` | **PENDING Q2.2** | E1 `DISPATCHED → REFUSED` (U-1 text) · E2 `DISPATCHED → FAILED` · E3 no persisted `DISPATCHED` (conflicts with Q2.1 (i)); see `Q2_2_DISPATCHED_EDGE_COMPARISON.md` |
| `RUNNING → COMPLETED / FAILED / CANCELLED / KILLED` | HEAD | unchanged |

U-1 rule 7 ("exactly two edges are added") is restated once Q2.2 is decided. No status is added or removed by this draft.

## 5. Pending clause — terminal edge from `DISPATCHED` (do not apply until the owner answers Q2.2)

Alternative texts, each to replace the placeholder `‹DISPATCHED-TERMINAL›` in the status-by-cause matrix (`scan-deadline-contract.md:180-186`) and in the edge table:
- **E1**: "`DISPATCHED → REFUSED` is ADDED; every cause that refuses a `PLANNED` or `ADMITTED` unit refuses a `DISPATCHED` unit with the same reason."
- **E2**: "`DISPATCHED → FAILED` is ADDED with `failureClass = TRANSIENT_INFRASTRUCTURE`, detail `NOT_STARTED`; such a finalization is never retried." (needs an owner-approved definition of `FAILED` for a unit that never ran and a no-retry rule)
- **E3**: "no `DISPATCHED` status is persisted before `RUNNING`" (requires relaxing Q2.1).

## 6. Deadline, refusal and crash-recovery contract by status

Cause rows are the U-1 matrix [U-1] with `PLANNED` meaning "queued, not admitted".

| Cause | `PLANNED` (job queued) | `ADMITTED` (lease held) | `DISPATCHED` (lease held, no child) | `RUNNING` |
|---|---|---|---|---|
| Plan deadline passed / scan terminal | `REFUSED(SCAN_DEADLINE_EXPIRED / SCAN_CANCELLED / SCAN_FAILED)` | same via `ADMITTED → REFUSED` | `‹DISPATCHED-TERMINAL›` | `FAILED(TIMEOUT, SCAN_DEADLINE)` / `CANCELLED` / `FAILED(TRANSIENT_INFRASTRUCTURE)` after termination confirmation (U-1) |
| F07 stop (kill switch) recorded | `REFUSED(KILL_SWITCH_PENDING)` | same | `‹DISPATCHED-TERMINAL›` | `KILLED(f07Reason)` / `CANCELLED` |
| Step 0 fails on pickup | `REFUSED(...)` | n/a | n/a | n/a |
| Host crash | job remains queued or is redelivered; step 0 re-runs; else swept at the plan deadline → `REFUSED`; no lease exists | lease expires unrenewed (F07 lease TTL, 008); sweep ends the unit at the plan deadline | same as `ADMITTED` | child ends by hard stop / dead-man (AR-22, open); sweep finalizes after termination confirmed (U-1) |
| Queue job lost (never delivered) | swept at the plan deadline → `REFUSED`; **recovery is bounded only by the plan deadline** (up to the 6 h ceiling) plus one sweep interval — no shorter bound is claimed | n/a | n/a | n/a |

Finalization authority [HEAD, unchanged]: `finalizeExecutionUnit` is the only terminal write (`runtime-finalization-contract.md` rule 1); `expirePlanUnits` and the host call it. Whether SPEC 012's three database entry points are "one logical function" is AR-18 item 5, **not decided** by this draft.

Crash-recovery dependencies that remain open and are **not** specified or implemented here: AR-22 (hosting-failure backstop for E14/E15/E13), AR-19 (transactional unit-keyed lease release), the orphan reconciler service level (012 4.10F case 6). Shortening any recovery bound below "plan deadline + sweep interval" requires them.

## 7. Cross-spec compatibility

| Spec | Effect | Evidence |
|---|---|---|
| 008 (F07) | None: F07 is called with the same arguments and the same idempotency key; only the call's position relative to the queue changes. Caller-supplied identifiers/`now` (AR-19) unchanged and open | `008/contracts/safety-checkpoint-contract.md`, `safety-admission-contract.md:12-20` |
| 010 | None imposed. Whether U-1 obligations (hard-stop margin, backstop, `onUnitExpired`, module-result finalizer) apply to BROWSER/CRAWLER is Q8, **open** | `scan-deadline-contract.md:291-301` |
| 011 | No reference to `DISPATCHED`, `ADMITTED` or the added edges in its normative files (checked 2026-10-22); it cites U-1 generically. Re-check after Q2.2 | grep of 011 spec/plan/data-model/tasks/research/contracts/checklists |
| 012 (untracked; wording changes **only after** the amendment is approved; 012 stays untracked and unedited for now) | Sequence already matches (FR-195 treats step 0 as a pickup action on a `PLANNED` unit). Wording to align: `spec.md` FR-183 (:401), FR-195 (:416); `contracts/active-security-execution-contract.md:43-44,265,276` ("`ADMITTED->DISPATCHED` skipped when already `DISPATCHED`" no longer applies); `contracts/auth-workflow-execution-contract.md:40`; `data-model.md:1191` (crash case 2); `plan.md:367`; `tasks.md` T814 (:609) and T056 (:90) depending on Q2.2; `upstream-amendment-requests.md` AR-18 items 1–2 | files read this session |
| Legacy code | None: passive-only scans and scans without a `ScanPlan` behave exactly as before (U-1 rule 4). Redis queue admission (`apps/api/src/services/queue/admission-gate.ts`) is unrelated to F07 | CODE |

## 8. Explicitly not decided or implemented by this amendment

Billing/OD-3 and legacy `DEGRADED` (Q4) · Mode S/P (Q5) · AR-13, AR-19, AR-22, AR-18 item 5 (Q6) · remaining 012/011 decisions (Q7) · SPEC 010 obligations (Q8) · independent-review standard (Q9) · the SPEC 006 approval/freeze dates (Q1) · any runtime implementation.

## 9. File-by-file change list (to be applied only after approval; exact before → after)

| File | Before (HEAD or working tree) | After (proposed) |
|---|---|---|
| `spec.md` FR-014 (lines 380-388) | "`ADMITTED` (passed its safety checkpoint… about to dispatch — distinguishable from `DISPATCHED` because admission and queue-dispatch are two different operations…), `DISPATCHED` (a queue job exists for it)… `REFUSED` (never admitted — … at or before the checkpoint, FR-022)" | §2 definitions; the "queue-dispatch" sentence reworded to "admission and hand-off to the execution runtime are two different operations" |
| `data-model.md:57-59` | `ADMITTED // passed F07 safetyCheckpoint… about to dispatch`; `REFUSED // never admitted…`; `DISPATCHED // a queue job exists for it` | `ADMITTED // F07 PROCEED on pickup; lease held`; `REFUSED // terminal before execution started`; `DISPATCHED // admitted and handed to the host's runtime; no child started` |
| `plan.md:253-261` (diagram) | `ADMITTED --> DISPATCHED: queue job created` | `ADMITTED --> DISPATCHED: hand-off to execution runtime`; `PLANNED --> ADMITTED: F07 safetyCheckpoint PROCEED on pickup`; edge labels for the two U-1 edges reworded; `DISPATCHED → ‹Q2.2›` |
| `contracts/execution-runtime-contract.md` | steps 0 (before enqueue), 1 enqueue, 2 re-read, 3 F07, 4 DISPATCHED+fork | §3 order: enqueue, re-read, step 0, F07, ADMITTED, DISPATCHED, fork; step "0" renumbered after "2" |
| `contracts/execution-unit-contract.md` rule 7 | "`DISPATCHED` means a queue job exists and no child process or Guest has started" | §2 meaning; edge list per Q2.2 |
| `contracts/runtime-finalization-contract.md:19, 50-52` | `REFUSED` "never admitted at all"; "`REFUSED` outcome from dispatch step 0 never holds a lease" | `REFUSED` "terminal before execution started"; keep the step-0 sentence and add "a `REFUSED` of an `ADMITTED`/`DISPATCHED` unit releases its lease in step 2" |
| `contracts/scan-deadline-contract.md:113-128, 177-200, 266-272` | step 0 "may be `PLANNED`, `ADMITTED` or `DISPATCHED`… before F07 `safetyCheckpoint`" and matrix text about when leases are held | step 0 always runs on a `PLANNED` unit before F07; matrix and edge text per §6 and Q2.2 |
| `tasks.md` T-U1-4, T-U1-7, T-U1-9 | wording of step 0 and the two edges | aligned to §3/§4 |
| `research.md` | U-1 research entry on the two edges | one-line pointer to this amendment |

## 10. Review checklist and validation criteria (for the owner/reviewer)

1. Every status has exactly one definition and every document uses it (grep `DISPATCHED`, `ADMITTED`, `REFUSED` across `specs/009` after application).
2. Every edge in the diagram appears in `data-model.md`, `execution-unit-contract.md` and the matrix, and nowhere else.
3. No sentence says a job exists *because* of a status, or that F07 ran before the job exists.
4. `scan-deadline-contract.md` contains no remaining statement that a `PLANNED`, `ADMITTED` or `DISPATCHED` unit is observed at step 0 other than `PLANNED`.
5. Lease table: `PLANNED` none; `ADMITTED`/`DISPATCHED` held; released only in `finalizeExecutionUnit`.
6. The Q2.2 clause is replaced by exactly one of E1/E2/E3 text and every `‹…›` placeholder is gone.
7. SPEC 011 re-grep clean; SPEC 012 wording list in §7 prepared as a separate change.
8. The amendment is approved explicitly as a whole, then applied to the 11 CS-A paths only (`FUTURE_COMMIT_PLAN.md`).

## 11. Approvals required

(1) Owner approval of the complete amendment text; (2) Q2.2 answer; (3) the owner's own review of the full state-transition and crash-recovery contract (Q2.1 condition). Until then: 009 files unchanged, U-1 uncommitted, nothing staged.
