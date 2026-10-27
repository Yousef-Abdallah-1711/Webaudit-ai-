# PROPOSED SPEC 009 Amendment U-1b — Dispatch Ordering and Host Claim (v4 draft)

**STATUS: PROPOSED — NOT APPLIED — NOT APPROVED — NOT READY FOR APPROVAL** until the cross-spec confirmations in §11 exist. Supersedes v3 (unchanged), v2, v1. No existing file is edited by this draft. Findings behind every change: `U1B_FINAL_ADVERSARIAL_REVIEW.md`; exhaustive tables: `U1B_RACE_CRASH_MATRIX_v2.md`.

Tags: **[OWNER]** stated by the owner · **[OWNER-PROV]** provisionally accepted by the owner subject to validation · **[HEAD]/[U-1]** existing text · **[DERIVED]** mechanical consequence · **[PROPOSED]** my drafting, needs approval · **[OPEN]** unresolved · **[PG]** relies on documented PostgreSQL behaviour (not a repo file, not re-verified here).

Owner directions in force: Q2 = B; Q2.1 = (i); Q2.2 = E1; no automatic resume of `ADMITTED`/`DISPATCHED`; OD-A = generic host claim before the F07 call; OD-C default (lease lost before `RUNNING` ⇒ host stops without finalizing, sweep finalizes, no new closed reason); start gate, post-F07 deadline re-check, host loop from `PROCEED` provisionally accepted. Q1 dates unresolved (006 header untouched); Q4–Q9 open.

## 0. Changes from v3 (all from the final adversarial review)
1. Order fixed: `PROCEED → ADMITTED → engine proofs → deadline re-check → DISPATCHED → fork → RUNNING` (v3 ran proofs before `ADMITTED`). [B1]
2. **No external resource, credential, work order or configuration before `RUNNING`**; the "inert Guest shell" wording is removed. [B2]
3. Lease timing corrected: concurrency slot freed ≤ ~90 s after a crash (30 s expiry + 60 s sweep); renewal can succeed on an expired-but-unreclaimed lease; "lease lost" = zero-row renewal. [B4]
4. Finalize/release atomicity is stated as AR-19-dependent; stale-renewer behaviour stated. [B5]
5. Host loop now ends with `recordStopped`; stranded stop states extended to "host finalized then crashed". [B6]
6. CAS form and lease predicate made explicit (single statement; `FOR SHARE` on the lease row; "renewable" predicate). [B9]
7. SPEC 011/010/012 confirmation list expanded (supervisor creation, EP credential, provisioning, second F07 call). [B3, B7]
8. Guarantees classified; nothing claimed beyond what the text proves.

## 1. Scope
Statuses and ordering from plan resolution to `RUNNING`; queue-job semantics; host claim; F07 admission position; lease ownership; refusal/finalization/crash/race behaviour in that window; stop handling before `RUNNING`. Applies to units with `requiresSafetyCheckpoint = true`. Unchanged: passive/`SOURCE_STATIC` units on the legacy queue (FR-040), `TELEMETRY`, F01/F07 contracts, U-1's immutable plan deadline, single `timeout-sweep`, billing/refund, queue topology, scan-completion gate, evidence fencing.

## 2. Status definitions (replace `spec.md` FR-014 text, `data-model.md:53-65`, `plan.md` labels)
| Status | Meaning |
|---|---|
| `PLANNED` | In a `RESOLVED` plan; not yet eligible (HEAD) or eligible and possibly queued/claimed. No F07 admission; **no lease at rest** (one may exist transiently between F07 `GRANTED` and the `ADMITTED` CAS). |
| `ADMITTED` | F07 `PROCEED` obtained by the claim owner and `PLANNED→ADMITTED` won. Lease held; host loop running. Engine proofs run in this status. [HEAD meaning kept] |
| `DISPATCHED` | Admitted and handed to the owning host's runtime to start the child process; the child may be forked but is **inert**. No safety-sensitive action, credential, work order or external resource exists. `dispatchedAt` records this hand-off. (Replaces "a queue job exists".) |
| `RUNNING` | The owning host won `DISPATCHED→RUNNING`. Only now may the start gate be released and engines create external resources. |
| `REFUSED` | Terminal outcome before any safety-sensitive action started. Replaces "never admitted". |
| others | unchanged; `KILLED` only from `RUNNING` |

## 3. Edges
HEAD: `PLANNED→ADMITTED`, `ADMITTED→DISPATCHED`, `DISPATCHED→RUNNING`, `ADMITTED→REFUSED`, `RUNNING→COMPLETED/FAILED/CANCELLED/KILLED`. U-1: `PLANNED→REFUSED`, `DISPATCHED→REFUSED` (E1, approved in principle). No status added or removed. Per-edge writer, preconditions, lease, deadline, child/resource and crash outcome: `U1B_RACE_CRASH_MATRIX_v2.md` §2.

## 4. Host-claim contract [OWNER direction; design PROPOSED]
**4.1 Entity.** `ExecutionUnitHostClaim`: `id`; `executionUnitId`, `attempt`; `scanPlanId`, `userId`; `hostInstanceId` (unique per hosting-process incarnation); `claimTokenHash` (SHA-256 of a fresh ≥128-bit token returned once; never stored clear, logged, queued, or given to the child); `claimSeq` (database sequence, never reused); `acquiredAt` (database clock). `@@unique([executionUnitId, attempt])`; scalars only. For SPEC 012 classes `UnitDispatchRecord` (`012/data-model.md:855-868`) is the specialization, with "claim token ≡ authenticated database principal" (`hostInstanceId = principalId`) [OPEN: 012 owner].
**4.2 Acquisition.** `claimUnitHost(executionUnitId, hostInstanceId)`: one transaction; lock the unit row; require `PLANNED`, plan `RESOLVED`, scan non-terminal; evaluate the step-0 predicate with the statement clock (`clock_timestamp()`; `now()` is the transaction start time [PG]); on failure return `STEP0_FAILED(reason)` without inserting; insert (the unique index admits one claimant [PG]); results `CLAIMED | ALREADY_CLAIMED | STEP0_FAILED | NOT_CLAIMABLE` (the last for any non-`PLANNED` status — the no-resume rule at the claim boundary).
**4.3 Expiry, heartbeat, host loss.** No takeover, no reassignment, no required heartbeat (optional `lastSeenAt`, diagnostic only). Inert once the unit is terminal. After host loss the claim persists and the plan-deadline sweep finalizes the unit (§9). Takeover is not designed; it would need a claim epoch in the F07 idempotency key, the broker binding and every guarded write, plus guaranteed termination of the previous host's child.
**4.4 Enforcement.**
1. F07 is called only by the claim owner after `CLAIMED`. A pickup that cannot claim never calls F07 and never sees the holder token (F07 returns the same `AdmissionResult` to a repeated key, `008 safety-admission-contract.md:78`, so F07 cannot fence a duplicate). **Class: conforming-worker rule**; the check precedes a separate F07 transaction and is not atomic with it (AR-19/AR-13).
2. Each host-initiated transition is one statement: `UPDATE ExecutionUnit SET status = to … WHERE id = ? AND status = from AND EXISTS (claim row with the presented token hash and `hostInstanceId`)`; the claim row is immutable, so the subquery cannot go stale [PG]. **Class: implementation-dependent until the contract mandates this form.**
3. `PLANNED→ADMITTED`, `ADMITTED→DISPATCHED` and `DISPATCHED→RUNNING` also require the unit's F07 lease to be **renewable** (unreleased and unreclaimed — the same condition 008's renewal uses, `008/data-model.md:66-70`) read in the same transaction under `SELECT … FOR SHARE` on the lease row, so reclaim or release cannot commit between check and CAS [PG]; lock order unit row → lease row must be validated against 008's order [UNVERIFIED]. A failed predicate makes the host attempt one renewal; zero rows = lease lost (OD-C default).
4. Host-initiated finalization presents the token; sweep/orchestrator finalization needs none; the only unclaimed finalization is a step-0 refusal whose reason `finalizeExecutionUnit` recomputes from the database (change to the finalization contract). `finalizeExecutionUnit` stays the only terminal write (AR-18 item 5 [OPEN]).
5. After the unit is terminal every guarded write fails on the status predicate.
**4.5 Limits.** Prevents two conforming hosts from obtaining execution or lease-renewal authority for one `(unit, attempt)`. Child-control actions (fork, kill, deliver, release gate) have no database check; a bypassing or compromised worker is AR-13.

## 5. Dispatch sequence (replaces `execution-runtime-contract.md` steps 0–4)
1. **Enqueue** `{ executionUnitId }` when eligible (HEAD; eligibility and job creation unspecified in HEAD and unchanged). Unit `PLANNED`; no F07, no lease.
2. **Pickup**: re-read from PostgreSQL. **Pickup-ignore**: non-`PLANNED` ⇒ acknowledge, change nothing. [OWNER]
3. **`claimUnitHost`** (§4.2, includes step 0). Not `CLAIMED` ⇒ stop, no F07. `STEP0_FAILED` ⇒ `REFUSED` via `PLANNED→REFUSED`.
4. **Engine guards** as owner (e.g. SPEC 012 feature/environment/input checks) ⇒ `REFUSED` from `PLANNED`, token required.
5. **F07 admission** by the owner: `STOP` ⇒ `REFUSED(f07 reason)` from `PLANNED` (never `KILLED`); `PROCEED` ⇒ lease held. **Start the host loop** (§7).
6. **CAS `PLANNED→ADMITTED`** (§4.4). On CAS failure the host stops and, being the unique lease holder, releases its own lease when a release surface exists (AR-19), otherwise it expires and is reclaimed ≤ ~90 s.
7. **Engine proofs** (SPEC 012 VAB/DAP) in `ADMITTED`; refusal ⇒ `REFUSED` from `ADMITTED`, lease released by finalization. Then **re-evaluate the step-0 predicate** [OWNER-PROV]: failure ⇒ `REFUSED(SCAN_DEADLINE_*)`.
8. **CAS `ADMITTED→DISPATCHED`**.
9. **Fork the child under the start gate** [OWNER-PROV]: the child holds **no credential, work order or configuration, creates no external resource, and performs no safety-sensitive action**; it exits on parent loss and if the gate is not released within `startGateTimeoutMs` (provisional platform constant). These two exit requirements are **new** (no current generic contract has them).
10. **CAS `DISPATCHED→RUNNING`**. Only after success: arm the parent hard stop (HEAD step 5), deliver the work order/credentials, release the gate; engines may now create external resources (e.g. SPEC 011 Guest provisioning). CAS failure ⇒ the host terminates the child and finalizes nothing.
11. **Finalization** per HEAD step 7; stale holders that lost their lease do not finalize (U-1 `:244-246`).

## 6. Start gate — what is and is not guaranteed
The contract requires §5 steps 9–10. It **does not prove** "no safety-sensitive action before `RUNNING`"; that needs per engine: (a) work only through the parent after the CAS; (b) no autonomous child behaviour or network path; (c) all external resource creation and credential delivery after `RUNNING`; (d) a conformance declaration and test; (e) orphan cleanup for inert children after host loss (AR-22). Established for SPEC 012 by its text (child has no network path; broker lease after `RUNNING`: `credential-broker-contract.md:52`); **UNVERIFIED for SPEC 010 and SPEC 011** (§11). A compromised child is outside 009. The race is conditionally resolved, not resolved.

## 7. Host loop from `PROCEED` [OWNER-PROV]
At least every 5 s until finalization: (1) read the unit's status and `scan terminal OR now >= effectiveDeadlineAt` (database clock) — stop if terminal or expired; (2) stop-pending sub-check (`consumes {false,false}`); on a stop: `acknowledgeStop` → abort → kill any child → finalize `REFUSED(KILL_SWITCH_PENDING)` from the status held (release the lease) → **`recordStopped`**; (3) renew the lease with the holder token; zero rows = lease lost ⇒ abort, kill child, withhold work, **do not finalize**, the sweep ends the unit (OD-C). Renewal succeeds on an expired-but-unreclaimed lease (no expiry predicate) and fails once reclaimed. The host also owns the 5 s escalation duty (`kill-switch-contract.md:58-66`).

## 8. Status-by-cause matrix, lease and recovery
Cause × status: `U1B_RACE_CRASH_MATRIX_v2.md` §3 (adopted as normative; stop beats deadline in every column; impossible combinations listed there). Lease ownership: acquire — claim owner via `PROCEED`; renew — claim owner only; release — `finalizeExecutionUnit` step 2, whose atomic unit-keyed token-free surface is **AR-19 [OPEN]**; until then finalization and release are not one transaction and a stale-but-live host can renew a terminal unit's lease until its loop reads the terminal status (≤ 5 s after it resumes); a crashed host's slot is freed by reclaim ≤ ~90 s.

## 9. Crash-recovery limitation (explicit)
A unit whose host is lost in `PLANNED` (after claim), `ADMITTED` or `DISPATCHED`, whose job is lost, or whose job was never created, is not resumed and ends only when the plan-deadline sweep finalizes it: remaining plan deadline (up to the 6 h ceiling) plus one sweep interval. The concurrency slot recovers earlier (≤ ~90 s). An inert child may remain until its parent-loss/gate-timeout exit; there is no guarantee for non-conforming engines (AR-22). No shorter bound is claimed while AR-19 and AR-22 are open.

## 10. Kill-switch states before `RUNNING` — preserved as an open dependency on the SPEC 008 owner
Facts and cases: `U1B_FINAL_ADVERSARIAL_REVIEW.md` §5. A refused-at-admission unit, a host-less unit finalized by the sweep, and a host that finalized then crashed before `recordStopped` leave the `KillSwitchState` unchanged (`REQUESTED`/`ACKNOWLEDGED`); broad-scope rows can then block admission in scope with no stated clearing path. **Question for the 008 owner (nothing chosen here):** who advances `REQUESTED → ACKNOWLEDGED/STOPPED` when no live execution hosts the unit, how does a broad-scope row with no live in-scope execution leave `REQUESTED`, and what is the aggregation rule for several executions sharing a row? (a) finalizer acknowledges/records by authority; (b) a reconciler advances rows with no live in-scope executions; (c) accepted and alerted. This draft makes no 008 text change.

## 11. Cross-spec confirmations and wording (none applied)
- **SPEC 011 (confirm before approval)**: status under which the supervisor child is created and when it receives the EP mTLS credential (invariant 15, `:129`) — must be after `RUNNING` under the §5 rule; that provisioning (phase 4), the `ep-run-start` claim and the presigned URL happen after `RUNNING`; that phase 1's "dispatch `safetyCheckpoint`" (`spec.md:207`, `plan.md:211`) is not a second F07 call (or is an idempotent replay); phase 1 "REFUSED/KILLED, no Guest" consistent with `KILLED` only from `RUNNING`; the EP hard-TTL "dispatch time" = `dispatchedAt`.
- **SPEC 010**: whether BROWSER/CRAWLER children can be inert before `RUNNING` (Q8 open).
- **SPEC 012 (not edited; follow-ups)**: FR-201(c)(3) (`spec.md:423`) → claim only a `PLANNED` unit; FR-195 (:416) and E14 :43-44 remove resume branches and reorder to `PROCEED → ADMITTED → proofs`; FR-183 (:401); `auth-workflow-execution-contract.md:40`; `data-model.md:1191` (an inert child can exist; lease reclaim ≤ ~90 s, not 30 s) and 4.10F; `plan.md:367`; T814 (:609); AR-18 items 1–4 closed, 5–6 open; claim mapping.
- **SPEC 008**: no text change by this amendment; open: AR-19 (release surface, trusted-caller model), §10 question, lock-order confirmation.

## 12. SPEC 009 change list (after approval only)
`spec.md` FR-014 (:380-388) + new host-claim requirement; `data-model.md` (:53-65 comments, new `ExecutionUnitHostClaim`, `dispatchedAt`); `plan.md` (:253-261 diagram, claim step, lease/claim paragraph); `contracts/execution-runtime-contract.md` (§5 sequence, pickup-ignore, start gate, `claimUnitHost`); `execution-unit-contract.md` rules 6–7 (definitions, claim-guarded transitions, single-statement CAS form); `runtime-finalization-contract.md` (:19 `REFUSED`; claim token; reason recomputation for unclaimed step-0 finalization); `scan-deadline-contract.md` (:113-128, :177-200, :199, :266-272: step 0 only for `PLANNED`, matrix, start-gate statement, re-check, limitation); `tasks.md` (T-U1-4/7/9 wording; new tasks for the claim entity, `claimUnitHost`, start gate, loop-from-`PROCEED`, race/crash adverse tests — numbered by the task-list work, RM-F1); `research.md` pointer.

## 13. Unresolved decisions
1. Approval of the whole text (not given). 2. Rule "no external resource/credential/work order/config before `RUNNING`" for all non-passive engines (010/011/012 owners). 3. Corrected recovery statements (§9). 4. Lease predicate form incl. `FOR SHARE` and lock order. 5. 011/012/010 confirmations (§11). 6. The 008 question (§10). 7. `startGateTimeoutMs` value. 8. AR-13, AR-19, AR-22, AR-18 item 5, Q8, Q1 dates, Q4–Q9.

## 14. Validation criteria after application
One definition per status; every edge in diagram, data model, unit contract and matrix; no text places F07 before the claim, proofs before `ADMITTED`, or a resource/credential before `RUNNING`; every host-initiated write is claim-guarded in the single-statement form; lease text uses reclaim ≤ ~90 s and "renewable"; §6 and §9 present once; no `[OPEN]`/`[PROPOSED]` markers remain; re-grep of 010/011/012.
