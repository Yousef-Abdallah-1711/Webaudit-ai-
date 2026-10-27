# PROPOSED SPEC 009 Amendment U-1b — Dispatch Ordering (v2, corrected draft)

**STATUS: PROPOSED — NOT APPLIED — NOT APPROVED.** Supersedes `PROPOSED_SPEC009_AMENDMENT_U1B.md` (v1, unchanged). No existing file is edited by this draft. It may be applied only after the owner approves this complete text, including the items in §10. Findings behind every change: `U1B_AMENDMENT_REVIEW_FINDINGS.md` (R-1 … R-13).

Provenance tags: **[OWNER]** stated by the owner · **[HEAD]** existing HEAD text kept · **[U-1]** existing working-tree text kept · **[DERIVED]** mechanical consequence · **[PROPOSED]** my drafting beyond the owner's statements, needs explicit approval · **[PENDING OD-x]** blocked on an open decision.

Owner statements implemented: Q2 = B (enqueue first, F07 admission on pickup; formal amendment; preserve the state model unless explicitly changed; consistent `ADMITTED`/`DISPATCHED` definitions) · Q2.1 = option (i) (`DISPATCHED` = admitted and handed to the host's runtime, no child started; preserve `PLANNED → ADMITTED → DISPATCHED → RUNNING`) · Q2.2 = **E1 in principle** (`DISPATCHED → REFUSED`; `REFUSED` = terminal outcome before execution starts) · redelivery: no automatic resume of `ADMITTED`/`DISPATCHED` after host loss; the plan-deadline sweep finalizes them; the recovery limitation is stated; no shorter bound is claimed while AR-19/AR-22 are open. Not decided here: Q1 dates (006 header and "frozen 006" references untouched), Q4–Q9, AR-13/19/22/18-5.

## 1. Scope
In: statuses and ordering from plan resolution to `RUNNING`; job semantics; F07 admission position; lease ownership; refusal, finalization and crash/race behaviour in that window. Unchanged: F01/F07 contracts, U-1's immutable plan deadline (`computePlanDeadline`, anchors, 6 h ceiling, grant check), the single `timeout-sweep` job, billing/refund rules, queue topology, scan-completion gate, evidence fencing.

## 2. Status definitions (replace `spec.md` FR-014 text, `data-model.md:53-65` comments, `plan.md` diagram labels)

| Status | Meaning |
|---|---|
| `PLANNED` | In a `RESOLVED` plan; either not yet eligible (HEAD meaning) or eligible and possibly queued. **No F07 admission performed, no F07 lease held.** Eligibility and job creation are unchanged from HEAD, which does not specify them (recovery for a never-enqueued unit: §7). [OWNER/HEAD] |
| `ADMITTED` | F07 `safetyCheckpoint` returned `PROCEED` on pickup and the unit won `PLANNED → ADMITTED`. The F07 lease is held (when `consumes.concurrency`) and the host loop (§4 step 6) is running. [HEAD meaning kept: "passed F07"] |
| `DISPATCHED` | Admitted and handed to the owning host's runtime to start the child/Guest. **No safety-sensitive action has occurred**; a child process may exist but is held by the start gate (§4 step 9). The lease is held. (Replaces "a queue job exists".) [OWNER Q2.1 (i), PROPOSED start-gate] |
| `RUNNING` | The host won `DISPATCHED → RUNNING` and released the child's start gate; safety-sensitive work may occur. [HEAD, clarified] |
| `REFUSED` | Terminal outcome **before any safety-sensitive action started** (step-0 refusal, engine guard refusal, F07 `STOP`, post-`PROCEED` proof refusal, or plan/scan end while `PLANNED`, `ADMITTED` or `DISPATCHED`). Replaces "never admitted". [OWNER Q2.2] |
| `COMPLETED`, `FAILED`, `CANCELLED`, `KILLED`, `BLOCKED`, `SKIPPED` | unchanged; `KILLED` only from `RUNNING` [HEAD/U-1] |

## 3. Edge table

| Edge | Origin |
|---|---|
| `PLANNED → ADMITTED` | HEAD (F07 `PROCEED` on pickup) |
| `ADMITTED → DISPATCHED` | HEAD (hand-off to runtime; meaning changed) |
| `DISPATCHED → RUNNING` | HEAD (start gate released) |
| `ADMITTED → REFUSED` | HEAD |
| `PLANNED → REFUSED` | U-1 (needed because refusals now occur from `PLANNED`) |
| `DISPATCHED → REFUSED` | U-1, **approved in principle by the owner (E1)** |
| `RUNNING → COMPLETED / FAILED / CANCELLED / KILLED` | HEAD |
No status is added or removed. U-1 rule 7 ("exactly two edges are added") stays true and its parenthetical definition of `DISPATCHED` is replaced.

## 4. Dispatch sequence (replaces `execution-runtime-contract.md` steps 0–4; steps 5–7 and boundary rules otherwise unchanged)

1. **Enqueue.** A job with payload `{ executionUnitId }` only (FR-018) is created when the unit is eligible (HEAD rules unchanged). The unit stays `PLANNED`; no F07 call, no lease, no budget. [OWNER/DERIVED]
2. **Pickup.** Re-read unit, plan and scan from PostgreSQL (payload never authoritative). **Pickup-ignore rule:** if the unit is not `PLANNED`, acknowledge the job and change nothing — no step 0, no F07 call, no status write (a terminal unit: HEAD rule 4). This is the accepted conservative redelivery rule. [OWNER/DERIVED]
3. **Step 0** (U-1 deadline precondition), only for a `PLANNED` unit: scan terminal or deadline passed → `REFUSED(SCAN_DEADLINE_EXPIRED / SCAN_CANCELLED / SCAN_FAILED)`; remaining < `timeoutPolicyMs + hardStopMarginMs` → `REFUSED(SCAN_DEADLINE_INSUFFICIENT)`; edge `PLANNED → REFUSED`; consumes nothing, holds no lease. [U-1]
4. **Sole hosting ownership.** Before any F07 call the host establishes that it is the only host of this unit; a pickup that cannot establish it stops without calling F07. The mechanism is **[PENDING OD-A]** (generic 009 host claim · per-engine equivalent claim, which SPEC 012 already has as `sec_claim_unit_host` · none). Reason: F07 returns the same `AdmissionResult`, including the holder token, to a duplicate call (008 `safety-admission-contract.md` rule 3), so ownership cannot be decided after the call. Engine-specific guards (SPEC 012 feature-flag/environment/input guards) run here and refuse from `PLANNED` (§5 row E).
5. **F07 admission** (sole authority; PostgreSQL per 008 FR-017; arguments and idempotency key unchanged): `STOP` → finalize `REFUSED` with F07's reason via `PLANNED → REFUSED` (never `KILLED`). `PROCEED` → the lease exists from now.
6. **Host loop starts at `PROCEED`** [PROPOSED, R-3]: every ≤ 5 s renew the lease (holder token), check for a pending stop (and acknowledge per 008), check `scan terminal OR now >= effectiveDeadlineAt`. A failed renewal is treated as a stop (008 FR-006a): the host aborts its work and **does not finalize** (U-1 `:244-246`); the unit then ends by the sweep (OD-C).
7. **Post-admission checks.** Engine proofs that follow `PROCEED` (SPEC 012 VAB/DAP) run now; any refusal finalizes `REFUSED` from the status held and releases the lease through finalization. Then **re-evaluate the step-0 predicate** [PROPOSED, R-8]: failing either test → `REFUSED(SCAN_DEADLINE_EXPIRED / _INSUFFICIENT)`.
8. **`PLANNED → ADMITTED`**, then **`ADMITTED → DISPATCHED`**: each a compare-and-swap on status bound to the owning host once OD-A fixes how (012: `hostInstanceId`). A host that loses a CAS stops, finalizes nothing and releases nothing it cannot prove it solely owns (§6); it never forks.
9. **Fork and start gate** [PROPOSED, R-1]: the host forks the child/Guest, which **performs no safety-sensitive action** until the host has won `DISPATCHED → RUNNING`. If the CAS is lost (sweep finalized the unit, or a stop was recorded), the host terminates the child immediately and finalizes nothing. Once `RUNNING`, HEAD step 5 (parent-armed hard-stop armed before any safety-sensitive action) and step 6 (≤ 5 s F07 cadence) apply unchanged, plus U-1 step 6a.
10. **Finalization** per HEAD step 7 via `finalizeExecutionUnit` (the only terminal write; rule 1 unchanged — AR-18 item 5 open).

## 5. Status-by-cause matrix (extends U-1 `:180-190`; "F07 stop recorded beats the deadline outcome in every column" is kept)

| Cause | `PLANNED` (queued or ineligible) | `ADMITTED` | `DISPATCHED` | `RUNNING` |
|---|---|---|---|---|
| A. Plan deadline passed / scan `TIMED_OUT` | `REFUSED(SCAN_DEADLINE_EXPIRED)` (`PLANNED→REFUSED`) | same (`ADMITTED→REFUSED`) | same (`DISPATCHED→REFUSED`; no termination confirmation needed because no safety-sensitive action occurred — an unstarted child is ended by the host or by the engine's parent-loss behaviour, **AR-22 open**) | `FAILED(TIMEOUT, SCAN_DEADLINE)` after termination confirmation (U-1) |
| B. Scan `CANCELLED` | `REFUSED(SCAN_CANCELLED)` | same | same | `CANCELLED` |
| C. Scan `FAILED` | `REFUSED(SCAN_FAILED)` | same | same | `FAILED(TRANSIENT_INFRASTRUCTURE)` |
| D. F07 kill switch pending/stopped | `REFUSED(KILL_SWITCH_PENDING)` | same | same | `KILLED(f07Reason)` / `CANCELLED` |
| E. Engine guard refusal as host (SPEC 012 `SEC_*` guards, input mismatch) | `REFUSED(reason)` (before F07; no lease) | n/a | n/a | n/a |
| F. F07 `STOP` at admission | `REFUSED(f07 reason)` | n/a | n/a | n/a |
| G. Proof/engine refusal after `PROCEED` (VAB/DAP) | n/a | `REFUSED(reason)`; lease released by finalization | n/a | n/a |
| H. Step-0 predicate fails on pickup or re-check | `REFUSED(SCAN_DEADLINE_*)` | `REFUSED(SCAN_DEADLINE_*)` (re-check, lease released) | n/a | n/a |
| I. F07 lease lost/expired before `RUNNING` | n/a | host stops, does not finalize; sweep ends the unit (**OD-C**) | same | existing U-1/012 behaviour |
| J. Host crash | job queued: ignored if the unit is no longer `PLANNED`; a `PLANNED` unit with a live job is picked up normally (OD-A claim decides); otherwise swept at the plan deadline | lease expires ≤ 30 s after last renewal; **not resumed**; swept at the plan deadline → `REFUSED` | same as `ADMITTED`; an unreleased child ends via parent-loss behaviour (AR-22 open) | child ends by hard stop/dead-man (AR-22 open); sweep finalizes after confirmation (U-1) |
| K. Queue job lost or never created | swept at the plan deadline → `REFUSED` | n/a | n/a | n/a |

Dependents of any non-`COMPLETED` outcome become `BLOCKED` one level at a time (HEAD step 5, unchanged).

### Races (each transition is a compare-and-swap on status; exactly one writer wins; terminal precedence per U-1 rule 1)
| Race | Loser's obligation |
|---|---|
| sweep vs `PLANNED → ADMITTED` | host stops; may hold a lease acquired for a terminal unit → §6 |
| sweep vs `ADMITTED → DISPATCHED` | host stops, never forks |
| sweep vs `DISPATCHED → RUNNING` | host terminates the forked child at once (start gate) |
| F07 stop vs any host CAS | stop wins; host aborts |
| two pickups of one `PLANNED` unit | the non-owner stops before F07 (OD-A) |

## 6. Lease ownership and release
| Aspect | Rule |
|---|---|
| Acquire | by the sole owning host via F07 `PROCEED`; a duplicate call returns the same result, so a non-owner must discard any result it obtains |
| Renewal authority | the acquiring host (holder token), from `PROCEED` until finalization |
| Release | `finalizeExecutionUnit` step 2, by any authorized finalizer (host or sweep). The unit-keyed, token-free, transaction-joinable release surface is **AR-19, unresolved and not specified here** |
| Until AR-19 | a crashed or stale host's lease is freed only by its 30 s expiry (008 `data-model.md:55`); finalization may precede the release by up to that time |
| Lease acquired for an already-terminal unit (host lost the CAS) | released only under an OD-A mechanism that proves sole ownership; otherwise it expires within 30 s — a stated limitation |
| No lease | `PLANNED`, `REFUSED` at step 0 / engine guard / `STOP` |

## 7. Crash-recovery limitation (explicit)
A unit whose host is lost in `ADMITTED` or `DISPATCHED`, whose job is lost, or whose job was never created ends only when the plan-deadline sweep finalizes it: bound = the plan's remaining deadline (up to the 6 h ceiling) plus one sweep interval. Its lease frees within 30 s of the last renewal, so concurrency recovers earlier than the status; the unit can appear in progress without a live host. **This draft claims no shorter bound** and none is claimed while AR-19 and AR-22 remain open. The conservative redelivery rule (no resume) is deliberate and owner-accepted.

## 8. Cross-spec compatibility
- **008**: F07 called unchanged, only its position changes. Open questions for the 008 owner: AR-19 surface; whether kill-switch escalation depends on acknowledgement by a unit ended pre-`RUNNING` by a sweep that writes nothing to F07 (U-1 `:173`) — **UNVERIFIED (R-10)**.
- **010**: no obligation imposed here; U-1's engine obligations remain Q8, open.
- **011**: no reference to `DISPATCHED`/`ADMITTED`/the edges; re-grep after approval.
- **012** (untracked, not edited; wording changes only after this amendment is approved; RM-A4/E9 stay unapplied): `spec.md` FR-183 (:401) and FR-195 (:416) — remove "nothing when already `ADMITTED`/`DISPATCHED`" and "status held at pickup"; `contracts/active-security-execution-contract.md:43-44,265,276` — remove "skipped when already `DISPATCHED`", add the start gate; `contracts/auth-workflow-execution-contract.md:40`; `data-model.md:1191` (case 2: a held child may exist), 4.10B pickup-status wording; `plan.md:367`; `tasks.md` T814 (:609, expectations stay valid for E1) and T056 (:90); `upstream-amendment-requests.md` AR-18 items 1–2 (resolved by this text if approved).

## 9. File-by-file change list (to be applied only after approval; exact current → proposed)
| File | Current | Proposed |
|---|---|---|
| `spec.md` FR-014 (:380-388) | `ADMITTED` "…about to dispatch — distinguishable from `DISPATCHED` because admission and queue-dispatch are two different operations…"; `DISPATCHED` "(a queue job exists for it)"; `REFUSED` "(never admitted … at or before the checkpoint, FR-022)"; `PLANNED` "not yet eligible to run" | §2 definitions |
| `data-model.md:53-65` | comments `ADMITTED // passed F07 safetyCheckpoint… about to dispatch`, `REFUSED // never admitted…`, `DISPATCHED // a queue job exists for it` | `ADMITTED // F07 PROCEED on pickup; lease held`, `REFUSED // terminal before any safety-sensitive action`, `DISPATCHED // admitted; handed to runtime; child held by start gate` |
| `plan.md:253-261` | `ADMITTED --> DISPATCHED: queue job created`; U-1 labels on the two refusal edges | `ADMITTED --> DISPATCHED: hand-off to runtime`; add `PLANNED --> ADMITTED: F07 PROCEED on pickup`; relabel U-1 edges |
| `contracts/execution-runtime-contract.md` | steps 0 (before enqueue), 1–4, 6a, rule 6 | §4 sequence; rule 6 restated with the pickup-ignore rule |
| `contracts/execution-unit-contract.md` rule 6–7 | "`DISPATCHED` means a queue job exists and no child process or Guest has started" | §2 definition; edge list §3 |
| `contracts/runtime-finalization-contract.md:19, 50-52` | `REFUSED` "never admitted at all"; "never holds a lease" (step 0) | §2 `REFUSED`; add "a `REFUSED` of an `ADMITTED`/`DISPATCHED` unit releases its lease in step 2 (§6)" |
| `contracts/scan-deadline-contract.md:113-128,177-200,266-272` | step 0 "may be `PLANNED`, `ADMITTED` or `DISPATCHED`"; matrix; `:199` "pre-`RUNNING` units have nothing to terminate" | step 0 only for `PLANNED`; §5 matrix; `:199` replaced by the start-gate statement |
| `tasks.md` T-U1-4, T-U1-7, T-U1-9 | wording of step 0, matrix, edges | aligned to §4/§5 |
| `research.md` | U-1 entry | pointer to this amendment |

## 10. Items needing explicit approval (the amendment is not approved until all are answered)
1. This complete text (including E1's final wording: `DISPATCHED → REFUSED`, `REFUSED` = terminal before any safety-sensitive action).
2. **OD-A** single-host ownership mechanism (§4 step 4).
3. **OD-C** reason/cause for lease loss before `RUNNING` (§5 row I).
4. The three [PROPOSED] additions: **start gate** (§4 step 9), **host loop from `PROCEED`** (§4 step 6), **post-admission deadline re-check** (§4 step 7), and the pickup-ignore rule's consequence that a `PLANNED` unit whose first host died after claiming but before `ADMITTED` is not resumed under 012's never-reclaimed claim (swept at the plan deadline).
5. Your own review of the full state-transition and crash-recovery contract (Q2.1 condition).

## 11. Validation criteria after application
1. grep of `DISPATCHED`, `ADMITTED`, `REFUSED`, `PLANNED` across `specs/009`: one definition each, no "queue job exists" meaning for a status.
2. Every edge in the diagram appears in `data-model.md`, `execution-unit-contract.md`, the §5 matrix and nowhere else.
3. No sentence places F07 before the job, or step 0 on a non-`PLANNED` unit.
4. Lease table consistent with `runtime-finalization-contract.md` rule 2 and no claim of a unit-keyed release.
5. The limitation paragraph (§7) present once; no document claims a recovery bound shorter than plan deadline + sweep interval.
6. No `‹…›` or `[PENDING …]` markers remain in applied text.
7. 011 re-grep clean; 012 wording list prepared as a separate change.
