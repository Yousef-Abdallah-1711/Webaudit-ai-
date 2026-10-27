# U-1b — Corrected Transition, Race and Crash Matrix (v2)

2026-10-25. Supersedes `U1B_RACE_CRASH_MATRIX.md` (unchanged). Models `PROPOSED_SPEC009_AMENDMENT_U1B_v4.md`. Design analysis only; nothing approved or applied. Guarantee classes: **PT** proven by text · **CC** conditional on conformance · **ID** implementation-dependent · **UN** unproven · **AR13/AR19/AR22** depends on that upstream item. Corrections vs v1 of this matrix: proofs now run **after** `ADMITTED`; lease timing uses reclaim ≤ ~90 s (`008/research.md:95-96`), not 30 s; renewal can succeed on an expired-but-unreclaimed lease (`008/data-model.md:66-70`); `recordStopped` added; pause/resume rows added; lease-live predicate is "renewable" (unreleased and unreclaimed) with `FOR SHARE`; no external resource before `RUNNING`.

Assumptions: A1 conforming workers; A2 unique claim row per `(unit, attempt)`; A3 single-statement CAS `UPDATE … WHERE status = from AND EXISTS(claim token hash, `hostInstanceId`)`; A4 database clock via `clock_timestamp()` for new deadline comparisons; A5 F07 lease: expiry 30 s after last renewal, reclaim by a 60 s sweep (so ≤ ~90 s); renewal needs the holder token and succeeds while the row is unreleased and unreclaimed; A6 `attempts: 1`; A7 no takeover.

## 1. Persisted and external points
| Pt | Event | Unit status after | Claim | F07 lease | Child / resource |
|---|---|---|---|---|---|
| P0 | job enqueued | `PLANNED` | – | – | – |
| P1 | claim inserted (step-0 predicate evaluated atomically) | `PLANNED` | H | – | – |
| P2 | F07 `GRANTED` (lease row) | `PLANNED` | H | held | – |
| P3 | CAS `PLANNED→ADMITTED` | `ADMITTED` | H | held; loop running | – |
| P3a | engine proofs (e.g. 012 VAB/DAP) and deadline re-check | `ADMITTED` | H | held | – |
| P4 | CAS `ADMITTED→DISPATCHED` | `DISPATCHED` | H | held | – |
| P5 | child forked, inert, gated (OS process only) | `DISPATCHED` | H | held | inert child, **no credential, no work, no external resource** |
| P6 | CAS `DISPATCHED→RUNNING` | `RUNNING` | H | held | inert child |
| P7 | work order/credentials delivered; hard stop armed | `RUNNING` | H | held | working; engine may now create external resources |
| P8 | finalize commit | terminal | inert | released (AR-19) or reclaim ≤ ~90 s | must be gone or confirmed gone |
| P9 | `recordStopped` (only when a stop was acknowledged) | terminal | inert | – | – |

## 2. Transition matrix
Writers: **OWNER** (token + `hostInstanceId`), **SWEEP** (orchestrator authority), **ANY(step0)** (database-verified step-0 reason only).
| # | Edge | Writer | Claim precondition | Lease behaviour | Deadline | Child / resource | Crash outcome | Class |
|---|---|---|---|---|---|---|---|---|
| 1 | `PLANNED→ADMITTED` | OWNER | token + status; lease renewable (`FOR SHARE`, unit→lease lock order UNVERIFIED) | lease exists from P2 | step-0 predicate evaluated in the claim txn earlier; re-check after P3a | none | crash before: unit `PLANNED`+claim+lease; reclaim ≤ ~90 s; SWEEP at deadline | ID |
| 2 | `ADMITTED→DISPATCHED` | OWNER | token + status; lease renewable | held, renewed by loop | re-check done at P3a | none yet | crash after: `DISPATCHED`, no child; SWEEP | ID |
| 3 | `DISPATCHED→RUNNING` | OWNER | token + status; lease renewable | held | none | inert child exists; success is the only trigger for gate release | crash after CAS before delivery: `RUNNING` with inert child; SWEEP after confirmation; child exits on parent loss/gate timeout (new requirement) | ID / UN (orphan) |
| 4a | `PLANNED→REFUSED` step 0 | ANY(step0) or OWNER | none for the 3 database-verified reasons (finalize must recompute the predicate) | none | step-0 predicate | none | idempotent | CC (DB-enforced only via 012's function) |
| 4b | `PLANNED→REFUSED` engine guard / F07 `STOP` | OWNER | token + status | none (STOP) / the lease from P2 only if the refusal follows `GRANTED` before P3 | – | none | crash: SWEEP | CC |
| 4c | `PLANNED→REFUSED` plan/scan end, stop recorded | SWEEP | none | transient lease (P2→P3) reclaimed ≤ ~90 s | plan deadline | none | – | PT |
| 5a | `ADMITTED→REFUSED` proof refusal, re-check, stop observed by loop | OWNER | token + status | released by finalization (AR-19) else reclaim ≤ ~90 s | `SCAN_DEADLINE_*` on re-check | none | crash: SWEEP | AR19 |
| 5b | `ADMITTED→REFUSED` deadline/scan end/stop | SWEEP | none | as 5a | plan deadline | none | – | AR19 |
| 6a | `DISPATCHED→REFUSED` loop-observed deadline/stop before CAS to `RUNNING` | OWNER | token + status | as 5a | – | host terminates the inert child | crash: SWEEP | AR19 |
| 6b | `DISPATCHED→REFUSED` sweep | SWEEP | none | as 5a | plan deadline | inert child may remain; no resource, credential or work order exists (rule) | child ends by parent-loss exit/gate timeout; **UN** for non-conforming engines (AR22) | UN |
| 7a | `RUNNING→COMPLETED/FAILED/CANCELLED/KILLED` | OWNER | token + status | released by finalization | existing loop | child ended/confirmed first | OWNER crash: SWEEP after `onUnitExpired = TERMINATED` | AR19/AR22 |
| 7b | `RUNNING→FAILED/CANCELLED` sweep | SWEEP | none | as 7a | plan deadline | confirmation via `onUnitExpired` | bound plan deadline + interval | AR22 |
| 8 | `PLANNED→BLOCKED/SKIPPED`; TELEMETRY `PLANNED→COMPLETED` | orchestrator (HEAD) | none | none | – | – | unchanged | PT |

## 3. Status-by-cause matrix (F07 stop beats the deadline in every column)
| Cause | `PLANNED` | `ADMITTED` | `DISPATCHED` | `RUNNING` |
|---|---|---|---|---|
| Plan deadline / `TIMED_OUT` | `REFUSED(SCAN_DEADLINE_EXPIRED)` | same | same | `FAILED(TIMEOUT, SCAN_DEADLINE)` after confirmation |
| Scan `CANCELLED` | `REFUSED(SCAN_CANCELLED)` | same | same | `CANCELLED` |
| Scan `FAILED` | `REFUSED(SCAN_FAILED)` | same | same | `FAILED(TRANSIENT_INFRASTRUCTURE)` |
| F07 stop pending | `REFUSED(KILL_SWITCH_PENDING)` | same | same | `KILLED(f07Reason)` / `CANCELLED` |
| Step 0 / re-check fails | `REFUSED(SCAN_DEADLINE_*)` | `REFUSED(SCAN_DEADLINE_*)` (re-check) | impossible (re-check precedes P4) | n/a |
| Engine guard refusal | `REFUSED(reason)` | impossible | impossible | impossible |
| F07 `STOP` at admission | `REFUSED(f07 reason)` | impossible | impossible | impossible |
| Proof refusal (012 VAB/DAP) | impossible | `REFUSED(reason)` | impossible | impossible |
| Lease lost (zero-row renewal) before `RUNNING` | host stops, no finalize; SWEEP (OD-C default) | same | same | existing behaviour |
| Host crash | no resume; SWEEP | same | same; inert child exits | confirmation then SWEEP (AR22) |
| Job lost / never enqueued | SWEEP | impossible | impossible | impossible |
Impossible = cannot occur under the v4 ordering; a row marked impossible that is observed indicates a non-conforming writer.

## 4. Crash and pause points
| Point | State left | Recovery | Bound / class |
|---|---|---|---|
| before P0 / P0→P1 | `PLANNED` (± job) | redelivery claims (if no claim) or SWEEP | plan deadline + interval |
| P1→P2 | `PLANNED`+claim | no resume; SWEEP | plan deadline + interval (CC) |
| P2→P3 | `PLANNED`+claim+lease | reclaim ≤ ~90 s frees the slot; SWEEP finalizes | lease: PT (crashed host); status: plan deadline + interval |
| P3→P3a, P3a→P4 | `ADMITTED`+claim+lease | same | same |
| P4→P5 | `DISPATCHED`, no child | SWEEP `REFUSED` | same |
| P5→P6 | `DISPATCHED` + inert child | SWEEP `REFUSED`; child exit on parent loss/gate timeout | child: UN (new requirement; AR22 for guarantee) |
| P6→P7 | `RUNNING` + inert child | as host crash in `RUNNING` | UN |
| after P7 | working child, possibly external resource | hard stop/dead-man/reconciler, then SWEEP | AR22 |
| P8 (rollback) | unchanged | SWEEP | – |
| after P8, release failed | terminal, lease held | reclaim ≤ ~90 s | PT (crashed), **stale-but-live renewer until its loop reads terminal ≤ 5 s** (CC) |
| P8→P9 | terminal, stop `ACKNOWLEDGED` with no owner | **UN — 008 question** | – |
| **Pause (host frozen) at P1…P7, then resume** | claim unchanged; lease not renewed | see §5 R12–R15 | CC/ID |

## 5. Races
| # | Race | Resolution | Loser | Class |
|---|---|---|---|---|
| R1 | duplicate pickup/stalled redelivery of `PLANNED` | unique claim; second gets `ALREADY_CLAIMED` before any F07 call | stops | CC (PG unique) |
| R2 | redelivery of non-`PLANNED` unit | pickup-ignore | acks | PT |
| R3 | claim then crash before F07 | no resume | – | CC |
| R4 | `PROCEED` then failed `PLANNED→ADMITTED` (sweep finalized in between) | CAS fails; host owns the lease uniquely (claim) | releases (AR-19) else reclaim ≤ ~90 s | AR19 |
| R5 | lease loss before `RUNNING` | zero-row renewal ⇒ stop; no finalize; SWEEP | host kills child | CC |
| R6 | `ADMITTED→DISPATCHED` vs sweep | row lock: one wins | host never forks | ID (A3) |
| R7 | fork/gate/`RUNNING` CAS vs sweep | CAS fails ⇒ host kills inert child; nothing delivered | – | UN for non-conforming engines |
| R8 | kill-switch stop pre-`RUNNING` | hosted: loop ≤ 5 s → `acknowledgeStop` → abort → finalize → `recordStopped`; unhosted: SWEEP finalizes, no F07 write | – | UN — 008 question |
| R9 | finalization vs host/stale worker | CAS on status and token; loop reads terminal ≤ 5 s | host stops, kills child | CC |
| R10 | lease expiry vs renewal vs reclaim | renewal succeeds until reclaim (no expiry predicate); reclaim after ≤ 90 s; zero rows afterwards | stop | PT (008 text) |
| R11 | lease-live predicate vs reclaim | atomic only with `FOR SHARE` on the lease row in the CAS txn; else TOCTOU ≤ 30 s | – | ID |
| R12 | host pauses > 30 s before F07 (after claim), sweep finalizes unit, host resumes and calls F07 | F07 grants a lease for a terminal unit; CAS fails; host releases (AR-19) else reclaim ≤ ~90 s | – | AR19 |
| R13 | host pauses after P3, resumes after reclaim | renewal zero rows ⇒ stop; `DISPATCHED→RUNNING` fails the lease predicate | – | CC/ID |
| R14 | host pauses after P6, child already released | parent frozen ⇒ no renewals; child's actions need parent mediation (012) or EP heartbeat (011 dead-man 15 s, unbuilt) | – | UN beyond 012 |
| R15 | stale host resumes after sweep finalized the unit | all CAS fail; loop reads terminal ≤ 5 s; renewals stop; non-conforming host keeps renewing | – | CC; AR13/AR19 |
| R16 | concurrent stop on a broad scope shared by several units | one row per scope; acknowledgement aggregation undefined | – | UN — 008 |

## 6. Kill-switch `REQUESTED` trace
| Situation | Row result |
|---|---|
| refused at admission (live host) | stays `REQUESTED` (STOP path acknowledges nothing) |
| hosted pre-`RUNNING` | `ACKNOWLEDGED` then `STOPPED` only if the host reaches `recordStopped` |
| host lost before F07 / after F07 | unchanged until sweep; sweep writes nothing to F07 |
| sweep-finalized | unchanged |
| repeated admission | refused at step 1; audit volume UNVERIFIED |
| GRANT/TARGET/TENANT/PLATFORM | can remain `REQUESTED` and block admission in scope; clearing UNVERIFIED |

## 7. Guarantees (summary; full list in `U1B_FINAL_ADVERSARIAL_REVIEW.md` §7)
PT: no re-dispatch of terminal units; pre-`RUNNING` stop = `REFUSED`; immutable DB-clock deadline; no lease while `PLANNED` at rest; slot freed ≤ ~90 s after a crash. CC: single claimant; owner-only finalization; stale-host self-stop. ID: single-winner CAS form, lease-predicate atomicity. UN: start gate, orphan cleanup, stop acknowledgement for host-less units, prompt release (AR-19), shorter recovery, compromised worker (AR-13).
