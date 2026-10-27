# PROPOSED SPEC 009 Amendment U-1b — Dispatch Ordering and Host Claim (v3 draft)

**STATUS: PROPOSED — NOT APPLIED — NOT APPROVED.** Supersedes v2 (`…_v2.md`, unchanged) and v1. No existing file is edited. Applied only after the owner approves this complete text. Supporting analysis: `U1B_REVIEW_FINDINGS_R2.md` and `U1B_RACE_CRASH_MATRIX.md` (exhaustive edge/race/crash tables, guarantees proven vs unproven).

Tags: **[OWNER]** stated by the owner · **[OWNER-PROV]** owner "provisionally accepted, subject to validation" · **[HEAD]**/**[U-1]** existing text · **[DERIVED]** mechanical consequence · **[PROPOSED]** my drafting, needs approval · **[OPEN]** unresolved.

Owner directions in force: Q2 = B; Q2.1 = (i); Q2.2 = E1 (`DISPATCHED → REFUSED`, `REFUSED` = terminal outcome before execution starts) in principle; no automatic resume of `ADMITTED`/`DISPATCHED` after host loss (plan-deadline sweep finalizes; no shorter recovery bound claimed while AR-19/AR-22 open); **OD-A: generic host-claim primitive before the F07 admission call [OWNER, preferred option 1]**; **OD-C: default retained — lease lost before `RUNNING` ⇒ host stops without finalizing, sweep finalizes, no new closed reason [OWNER]**; start gate, post-F07 deadline re-check, host loop from `PROCEED` **[OWNER-PROV]**. Q1 dates unresolved (006 header untouched). Q4–Q9 open.

## 1. Scope
Statuses and ordering from plan resolution to `RUNNING`; queue-job semantics; the host claim; F07 admission position; lease ownership; refusal/finalization and crash/race behaviour in that window. Applies to units with `requiresSafetyCheckpoint = true` (non-passive classes). Unchanged: passive/`SOURCE_STATIC` units on the legacy queue (FR-040), `TELEMETRY` direct completion, F01/F07 contracts, U-1's immutable plan deadline, the single `timeout-sweep`, billing/refund rules, queue topology.

## 2. Status definitions (replace `spec.md` FR-014 text, `data-model.md:53-65` comments, `plan.md` labels)
| Status | Meaning |
|---|---|
| `PLANNED` | In a `RESOLVED` plan: not yet eligible (HEAD) or eligible and possibly queued/claimed. **No F07 admission performed, no F07 lease held at rest.** (A lease can exist transiently between F07 `PROCEED` and the `PLANNED → ADMITTED` CAS — §5.) |
| `ADMITTED` | The owning host won `PLANNED → ADMITTED` after F07 `PROCEED`; lease held; host loop running. [HEAD meaning kept] |
| `DISPATCHED` | Admitted and handed to the owning host's runtime to start the child/Guest. A child may be forked but is held by the start gate; **no safety-sensitive action has occurred**. Lease held. (Replaces "a queue job exists".) `dispatchedAt` records this hand-off. |
| `RUNNING` | The owning host won `DISPATCHED → RUNNING`; only then may the start gate be released. |
| `REFUSED` | Terminal outcome before any safety-sensitive action started. Replaces "never admitted". |
| others | unchanged; `KILLED` only from `RUNNING` |

## 3. Edges
`PLANNED→ADMITTED`, `ADMITTED→DISPATCHED`, `DISPATCHED→RUNNING`, `ADMITTED→REFUSED` (HEAD) · `PLANNED→REFUSED`, `DISPATCHED→REFUSED` (U-1; the latter owner-approved in principle, E1) · `RUNNING→COMPLETED/FAILED/CANCELLED/KILLED` (HEAD). No status added or removed. Per-edge writer, claim precondition, lease, deadline, child and crash outcome: `U1B_RACE_CRASH_MATRIX.md` §2.

## 4. Generic host-claim contract (new; **the SPEC 009 primitive established before F07**) [OWNER direction; design PROPOSED]

### 4.1 Persisted identity
New 009 entity `ExecutionUnitHostClaim`, PostgreSQL, one row per `(executionUnitId, attempt)`:
`id`; `executionUnitId`, `attempt` (the unit's current `attempt`); `scanPlanId`, `userId` (denormalized tenant, FR-041); `hostInstanceId` (opaque, unique per hosting-process incarnation); `claimTokenHash` (SHA-256 of a fresh ≥128-bit random token returned once to the claimant, never stored in clear, never logged, never in a queue payload, never given to the child); `claimSeq` (database sequence, monotonic, never reused: audit order and fencing order); `acquiredAt` (database clock). `@@unique([executionUnitId, attempt])`. Scalars only (no relations into other specs' tables), per 009's existing convention.
SPEC 012's `UnitDispatchRecord` (`012/data-model.md:855-868`: same uniqueness, `dispatchSeq`, `hostInstanceId`) and its `sec-unit-host` claim are **specializations**; for 012 classes they implement this contract instead of a second claim [OPEN: owner/012 owner to confirm the mapping].

### 4.2 Acquisition
`claimUnitHost(executionUnitId, hostInstanceId) → { claimId, claimToken, claimSeq } | ALREADY_CLAIMED | STEP0_FAILED(reason) | NOT_CLAIMABLE`, one PostgreSQL transaction: lock the unit row; require `status = PLANNED`, the plan `RESOLVED`, the scan non-terminal; evaluate the step-0 predicate on the **database clock** (so check and claim are atomic); on failure return `STEP0_FAILED` without inserting (the caller finalizes `REFUSED` using the database-verified reason, idempotently); insert the row; the unique constraint admits exactly one claimant per `(unit, attempt)`. A unit that is not `PLANNED` is `NOT_CLAIMABLE` (this is the no-resume rule at the claim boundary).

### 4.3 Expiry, heartbeat, host loss
- **No expiry-based takeover; no reassignment** (owner's conservative rule). The claim is inert once the unit is terminal.
- **No heartbeat is required.** The liveness fence is the F07 lease (30 s, renewed ≤ 5 s). An optional `lastSeenAt` written by the host loop is diagnostic only and has no semantics.
- **After host loss** the claim persists, no other host can claim, the unit stays non-terminal and the plan-deadline sweep finalizes it (§8 limitation).
- *Not adopted (future option, not designed here)*: takeover after claim expiry would require a monotonic claim epoch included in the F07 idempotency key, the credential-broker binding and every claim-guarded write, plus a guaranteed termination of the previous host's child; none exists.

### 4.4 Ownership validation and fencing
1. F07 `safetyCheckpoint` for the unit is called only by the claim owner and only after `claimUnitHost` succeeds (first call: dispatch admission; later calls: loop and per-action checks). A pickup that cannot claim never calls F07 and never receives the holder token. This is the discriminator: F07 returns the same `AdmissionResult`, including the holder token, to any caller that repeats `(targetAuthorizationId, idempotencyKey)` (`008 safety-admission-contract.md:78`), so F07 alone cannot fence a duplicate.
2. Every host-initiated transition (`PLANNED→ADMITTED`, `ADMITTED→DISPATCHED`, `DISPATCHED→RUNNING`) is a compare-and-swap on `(unitId, from-status, claimTokenHash, hostInstanceId)`.
3. `PLANNED→ADMITTED` and `DISPATCHED→RUNNING` additionally require, in the same transaction, a live F07 lease for the unit (unreleased, unexpired on the database clock). This is a liveness fence, not authority [PROPOSED; cross-spec read of the F07 table, as 012 FR-201(c) already does for `PLANNED→ADMITTED`].
4. Host-initiated finalization presents the claim token. Sweep/orchestrator finalization needs no token. The only unclaimed finalization is a step-0 refusal whose reason is database-verified. `finalizeExecutionUnit` remains the only terminal write (rule 1 unchanged; AR-18 item 5 [OPEN]).
5. After the unit is terminal every claim-guarded write fails (status predicate).

### 4.5 What this does and does not prevent
Prevents two **conforming** hosts from obtaining execution authority or lease-renewal authority for one `(unit, attempt)`. Does **not** prevent a compromised or non-conforming worker from bypassing the application-level check — that is database-level enforcement, AR-13 (012's `sec_*` functions). It does not shorten recovery (§8).

## 5. Dispatch sequence (replaces `execution-runtime-contract.md` steps 0–4)
1. **Enqueue** `{ executionUnitId }` when eligible (HEAD; eligibility/job creation unchanged and unspecified in HEAD). Unit `PLANNED`; no F07, no lease.
2. **Pickup**: re-read from PostgreSQL. **Pickup-ignore**: a non-`PLANNED` unit ⇒ acknowledge, change nothing (terminal: HEAD rule 4).
3. **`claimUnitHost`** (§4.2; includes the atomic step-0 predicate). Loser or `NOT_CLAIMABLE` ⇒ stop, no F07. `STEP0_FAILED` ⇒ `REFUSED` via `PLANNED→REFUSED`.
4. **Engine guards** as claim owner (e.g. SPEC 012 feature/environment/input checks): refusal ⇒ `REFUSED` from `PLANNED`, token required.
5. **F07 admission** by the owner: `STOP` ⇒ `REFUSED(f07 reason)` from `PLANNED` (never `KILLED`). `PROCEED` ⇒ lease held.
6. **Host loop starts at `PROCEED`** [OWNER-PROV]: at least every 5 s: (a) renew the lease with the holder token; (b) stop-pending sub-check (`consumes {false,false}`) and, on a pending stop, `acknowledgeStop` then abort; the host owns the 5 s escalation duty (008 `kill-switch-contract.md:58-66`); (c) deadline check (`scan terminal OR now >= effectiveDeadlineAt`, database clock); (d) read the unit's own status and stop if it is terminal. A zero-row renewal is treated as a stop (008 FR-006a): abort, kill any child, withhold work, **do not finalize** [OWNER OD-C default]; the unit then ends by the sweep.
7. **Post-admission checks** [OWNER-PROV]: engine proofs that follow `PROCEED`; then **re-evaluate the step-0 predicate**; failure ⇒ `REFUSED(SCAN_DEADLINE_*)` from the status held; lease released by finalization.
8. **CAS `PLANNED→ADMITTED`** then **CAS `ADMITTED→DISPATCHED`** (§4.4). A host that loses a CAS stops, never forks; if it holds the lease it acquired it releases it itself (it is the unique holder) when a release surface exists (AR-19), otherwise the lease expires ≤ 30 s.
9. **Fork under the start gate** [OWNER-PROV; guarantee conditional — §6]: the host forks the child/Guest. The child (i) receives no work order, configuration or credentials, (ii) performs no safety-sensitive action and creates no external resource beyond its own inert process/Guest shell, (iii) exits on parent loss, and (iv) exits if the gate is not released within `startGateTimeoutMs` (platform constant, provisional). The host then CASes `DISPATCHED→RUNNING`; **only after it succeeds** does the host deliver the work order and release the gate. If the CAS fails, the host terminates the child at once and finalizes nothing. HEAD step 5 (parent-armed hard stop, armed before any safety-sensitive action) and step 6 then apply, plus U-1 step 6a.
10. **Finalization** per HEAD step 7.

## 6. What the start gate does and does not guarantee
The contract can require items (i)–(iv) of step 9. It **cannot by itself prove** "no safety-sensitive action before `RUNNING`": that needs, per engine, (a) work delivered only through the parent after the CAS, (b) no autonomous child behaviour or network path, (c) all external resource creation after `RUNNING` — SPEC 011 counts Guest provisioning inside `timeoutPolicyMs` from `DISPATCHED` (`scan-deadline-contract.md:87-91`) and does not say which 009 status provisioning runs under [UNVERIFIED], (d) a per-engine conformance declaration and test, and (e) AR-22 for orphaned children if the host dies. A compromised child is outside 009. The race is therefore **not labelled resolved**: it is resolved for conforming engines that meet (a)–(d), open otherwise.

## 7. Status-by-cause matrix, lease table, races
Cause × status matrix: `U1B_RACE_CRASH_MATRIX.md` §3 (adopted as normative text; "F07 stop beats deadline in every column" kept). Races R1–R11 and crash points P0–P8: §4–§5 of that file. Lease ownership: acquire — claim owner via F07 `PROCEED`; renew — claim owner only, from `PROCEED` to finalization; release — `finalizeExecutionUnit` step 2 by any authorized finalizer, whose unit-keyed token-free transactional surface is **AR-19 [OPEN]**; until then a lost or stale host's lease is freed only by its 30 s expiry.

## 8. Crash-recovery limitation (explicit)
A unit whose host is lost in `PLANNED` (after claim), `ADMITTED` or `DISPATCHED`, or whose job is lost or never created, is not resumed and ends only when the plan-deadline sweep finalizes it: bound = remaining plan deadline (up to the 6 h ceiling) plus one sweep interval. The lease frees within 30 s of the last renewal, so concurrency recovers earlier than the status, and the unit can show as in progress without a live host. No shorter bound is claimed while AR-19 and AR-22 are open.

## 9. Kill-switch acknowledgement (R-10) — preserved as an open dependency on the SPEC 008 owner
Facts: `acknowledgeStop`/`recordStopped` are called by the execution's own checkpoint (`kill-switch-contract.md:45-56`); escalation after 5 s without acknowledgement is performed by the unit's own hosting process (`:58-66`); `expirePlanUnits` never writes F07 tables and never calls `triggerStop` (`scan-deadline-contract.md:173`). Consequence: a hosted unit (claim owner with the §5 loop) acknowledges and records the stop; a **host-less** pre-`RUNNING` unit finalized by the sweep never acknowledges, so its `KillSwitchState` can remain `REQUESTED` and no escalation occurs (none is possible without a host). Admission keeps refusing under that scope while `REQUESTED` (safe direction), which for GRANT/TARGET/TENANT/PLATFORM scopes can persist indefinitely; 008 does not say whether that is acceptable or how it is cleared. **Question for the 008 owner (not decided):** may the finalizer acknowledge/record the stop by authority, is there a reconciler for stranded `REQUESTED` rows, or is the state accepted and alerted?

## 10. Cross-spec wording after approval (none applied)
- **SPEC 009** (11 CS-A paths): table in §12.
- **SPEC 008**: no text change required by this amendment. Open requests: AR-19 (release surface, trusted-caller model); the R-10 question; optional clarification that a duplicate admission returns the holder token only to the claim owner (cannot be enforced by F07 and is therefore a 009 rule).
- **SPEC 012** (untracked, not edited; **no-resume check** of each follow-up): (1) `spec.md` FR-201(c)(3) (:423) says the unit is "neither terminal nor `RUNNING`" — admits claiming an `ADMITTED`/`DISPATCHED` unit, i.e. a resume path; must become `PLANNED` (**conflict with the accepted rule**). (2) FR-195 (:416) "nothing when it is already `ADMITTED` or `DISPATCHED`" and "status the unit holds at pickup" — remove resume branches. (3) `active-security-execution-contract.md:43-44` "skipped when already `DISPATCHED`" — remove. (4) FR-183 (:401), `auth-workflow-execution-contract.md:40`, `data-model.md:1191` (case 2 "no process" → "no safety-sensitive action; an inert child may exist"), `plan.md:367`. (5) `tasks.md` T814 (:609): the `DISPATCHED` expectation stays valid for E1 but the refusal causes from `DISPATCHED` are only sweep/loop-observed deadline or stop, not an F07 `STOP`; T056 (:90) unchanged. (6) AR-18 items 1–2 closed by this text if approved. (7) 012's claim/`UnitDispatchRecord` becomes the specialization of §4 (owner confirmation). (8) `sec_refuse_unclaimed_unit` (PLANNED-only, no record, no unreleased lease) is consistent with §4.4 rule 4.
- **SPEC 011** (untracked at the time of review): confirm which 009 status Guest provisioning runs under (§6c); no other text found.
- **SPEC 010**: unchanged; U-1 obligations remain Q8.

## 11. Unresolved decisions and open items
1. Approval of this complete text (nothing is approved by the owner directions above).
2. OD-A residuals: table name/location; confirmation that 012's `UnitDispatchRecord` is the specialization; no-takeover accepted.
3. Lease-live predicate in the `PLANNED→ADMITTED` and `DISPATCHED→RUNNING` CAS (cross-spec read).
4. Unit-status read added to the host loop; `startGateTimeoutMs` value.
5. OD-C retained (no new reason); R-10 with the 008 owner; AR-19; AR-22; AR-18 item 5; Q8; 011 provisioning order; the Q1 dates.

## 12. SPEC 009 change list (exact, after approval)
| File | Change |
|---|---|
| `spec.md` FR-014 (:380-388) | §2 definitions; add a host-claim requirement (§4) as a new FR or an extension of FR-016–FR-019 |
| `data-model.md` | status comments (:53-65); new `ExecutionUnitHostClaim` model and invariant; `dispatchedAt` meaning |
| `plan.md` (:253-261 and U-1 section) | diagram labels; add the claim step and the lease/claim ownership paragraph; correct U-1 labels |
| `contracts/execution-runtime-contract.md` | §5 sequence; boundary rule 6 → pickup-ignore; add start gate; add `claimUnitHost` |
| `contracts/execution-unit-contract.md` rules 6–7 | `DISPATCHED` meaning; edge list; rule that host-initiated transitions are claim-guarded |
| `contracts/runtime-finalization-contract.md` (:19, :50-52) | `REFUSED` meaning; claim token for host-initiated finalization; sweep authority unchanged |
| `contracts/scan-deadline-contract.md` (:113-128, :177-200, :199, :266-272) | step 0 only for `PLANNED`; matrix per `U1B_RACE_CRASH_MATRIX.md` §3; replace "nothing to terminate" by the start-gate statement; add the post-admission re-check; recovery limitation |
| `tasks.md` | T-U1-4/7/9 wording; new tasks for the claim entity, `claimUnitHost`, start gate, loop-from-`PROCEED` and the race/crash adverse tests (to be numbered by the task-list work, RM-F1) |
| `research.md` | pointer to this amendment |

## 13. Validation criteria after application
One definition per status; every edge appears in diagram, data model, unit contract and matrix; no sentence places F07 before the claim, a job before the unit is eligible, or step 0 on a non-`PLANNED` unit; every host-initiated write is claim-guarded; lease table consistent with `runtime-finalization-contract.md` rule 2; the §6 and §8 paragraphs present once; no recovery bound shorter than plan deadline + sweep interval; no `[OPEN]`/`[PROPOSED]` markers in applied text; re-grep of 010/011/012 as in §10.
