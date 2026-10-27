# U-1b — Complete Transition, Race and Crash Matrix (design review round 2)

2026-10-24. Design analysis only; **no spec edited, nothing approved**. It models `PROPOSED_SPEC009_AMENDMENT_U1B_v3.md`. Labels: **[C]** follows from the written contract text under the stated assumptions, **[A]** an assumption, **[U]** unproven or open, **[X]** cannot be guaranteed by SPEC 009 alone. No runtime exists, so nothing here is observed behaviour.

Assumptions: A1 all hosts are conforming workers (compromised-worker bypass is AR-13); A2 the host claim is a unique row per `(executionUnitId, attempt)` created in one PostgreSQL transaction under the unit row lock; A3 every unit status change is a compare-and-swap (`UPDATE … WHERE status = from AND …`) under the same row lock (existing 009 `transitionStatus` shape, `execution-unit-contract.md:58`); A4 PostgreSQL clock for every new deadline comparison (U-1 `scan-deadline-contract.md:259-265`); A5 the F07 lease lasts 30 s from last renewal and renewal needs the holder token (`008/data-model.md:55,66-70`); A6 `attempts: 1` for non-passive classes (FR-024); A7 no host takeover (owner-accepted conservative rule).

## 1. Persisted points (the crash points)

| Pt | Persisted write | Unit status after | Claim | F07 lease | Child/Guest |
|---|---|---|---|---|---|
| P0 | queue job created | `PLANNED` | none | none | none |
| P1 | claim row inserted (`claimUnitHost`) | `PLANNED` | exists, owner H | none | none |
| P2 | F07 `GRANTED` committed (`AdmissionLease` row) | `PLANNED` | H | held (30 s) | none |
| P3 | CAS `PLANNED → ADMITTED` | `ADMITTED` | H | held | none |
| P4 | CAS `ADMITTED → DISPATCHED` | `DISPATCHED` | H | held | none yet |
| P5 | (not persisted) child/Guest forked, held by the start gate | `DISPATCHED` | H | held | exists, inert |
| P6 | CAS `DISPATCHED → RUNNING` | `RUNNING` | H | held | inert until gate released |
| P7 | (not persisted) work order delivered / gate released | `RUNNING` | H | held | working |
| P8 | `finalizeExecutionUnit` commit | terminal | inert | released in the same txn if release surface exists (AR-19) else expires ≤ 30 s | must be gone or being torn down |

## 2. Transition matrix (every edge)

Writer abbreviations: **OWNER** = claim owner presenting the claim token; **SWEEP** = orchestrator authority (`expirePlanUnits`/gate, U-1); **ANY(step0)** = any pickup, database-verified step-0 predicate only (idempotent: a second finalization with a different outcome is rejected, `runtime-finalization-contract.md` rule 1).

| # | Edge | Authorized writer | Ownership / claim precondition | Lease behaviour | Deadline behaviour | Child/process state | Crash-recovery outcome |
|---|---|---|---|---|---|---|---|
| 1 | `PLANNED → ADMITTED` | OWNER | token + `hostInstanceId` match; unit still `PLANNED`; lease row live for the unit (database clock) [PROPOSED, mirrors 012 FR-201(c)] | lease already exists (from P2); CAS failing means unit became terminal → owner releases its own lease (it is the unique holder, A2) or lets it expire ≤ 30 s | step-0 predicate re-checked after F07/proofs [PROPOSED] | none | crash before: P2 state, lease expires, unit `PLANNED`+claim, no resume → SWEEP `REFUSED` at plan deadline [C] |
| 2 | `ADMITTED → DISPATCHED` | OWNER | token match; status `ADMITTED` | held; renewed by host loop | none new | none yet (fork only after this CAS) | crash after: `DISPATCHED`, lease expires, no child (never forked) → SWEEP `REFUSED` [C] |
| 3 | `DISPATCHED → RUNNING` | OWNER | token match; status `DISPATCHED`; lease live [PROPOSED] | held; renewal continues | step-0 predicate not re-run (remaining time was checked at step 7) | child exists and is held by the start gate; CAS success is the **only** trigger for gate release | crash after CAS before release: `RUNNING`, inert child exits on parent loss/start-gate timeout [PROPOSED]; SWEEP finalizes `RUNNING` after termination confirmation (U-1) |
| 4a | `PLANNED → REFUSED` (step 0) | ANY(step0) or OWNER | none required for the three step-0 reasons (predicate is database-verified); other reasons need OWNER | none held | step-0 predicate | none | idempotent; second writer is a no-op |
| 4b | `PLANNED → REFUSED` (engine guard, F07 `STOP`) | OWNER | claim exists | none (no lease on STOP; F07 consumed nothing) | n/a | none | crash before write: unit `PLANNED`+claim → SWEEP |
| 4c | `PLANNED → REFUSED` (plan/scan end, stop recorded) | SWEEP | none | none (a lease acquired at P2 but not yet at P3 may exist: it expires ≤ 30 s) | plan deadline passed / scan terminal | none | n/a |
| 5a | `ADMITTED → REFUSED` (post-`PROCEED` proof refusal, step-7 re-check, stop observed by loop) | OWNER | token match | released by finalization (AR-19) else ≤ 30 s | re-check refusal reasons `SCAN_DEADLINE_*` | none | crash before write: lease expires, SWEEP |
| 5b | `ADMITTED → REFUSED` (deadline/scan end/stop) | SWEEP | none | released by finalization or expires | plan deadline | none | n/a |
| 6a | `DISPATCHED → REFUSED` (stop observed by loop before CAS to RUNNING; deadline) | OWNER | token match | as 5a | as 5a | child held by gate: host terminates it | crash: SWEEP |
| 6b | `DISPATCHED → REFUSED` (deadline/scan end/stop) | SWEEP | none | as 5b | plan deadline | an inert child may exist; **no work was delivered** (start gate) [U]; ended by host or by parent-loss/start-gate timeout [PROPOSED; AR-22 open for guarantees] | n/a |
| 7a | `RUNNING → COMPLETED/FAILED/CANCELLED/KILLED` | OWNER | token match | released by finalization | existing host-loop deadline check | child ended before finalize (host kills/awaits) | OWNER crash: SWEEP after termination confirmation; bound = plan deadline + sweep interval; AR-22 [U] |
| 7b | `RUNNING → FAILED/CANCELLED` (sweep) | SWEEP | none | released by finalization or ≤ 30 s | plan deadline | confirmation via `onUnitExpired` | as U-1 |
| 8 | `PLANNED → BLOCKED/SKIPPED`, TELEMETRY `PLANNED → COMPLETED` | orchestrator (HEAD) | none | none | none | none | unchanged |

## 3. Status-by-cause matrix (extends U-1 `:180-190`; F07 stop beats deadline in every column)

| Cause | `PLANNED` | `ADMITTED` | `DISPATCHED` | `RUNNING` |
|---|---|---|---|---|
| Plan deadline passed / scan `TIMED_OUT` | `REFUSED(SCAN_DEADLINE_EXPIRED)` | same | same | `FAILED(TIMEOUT, SCAN_DEADLINE)` after confirmation |
| Scan `CANCELLED` | `REFUSED(SCAN_CANCELLED)` | same | same | `CANCELLED` |
| Scan `FAILED` | `REFUSED(SCAN_FAILED)` | same | same | `FAILED(TRANSIENT_INFRASTRUCTURE)` |
| F07 stop pending/recorded | `REFUSED(KILL_SWITCH_PENDING)` | same | same | `KILLED(f07Reason)` / `CANCELLED` |
| Step 0 fails (pickup or re-check) | `REFUSED(SCAN_DEADLINE_*)` | `REFUSED(SCAN_DEADLINE_*)` (re-check) | n/a | n/a |
| Engine guard refusal | `REFUSED(reason)` | n/a | n/a | n/a |
| F07 `STOP` at admission | `REFUSED(f07 reason)` | n/a | n/a | n/a |
| Proof refusal after `PROCEED` | n/a | `REFUSED(reason)` | n/a | n/a |
| Lease lost before `RUNNING` | host stops, **does not finalize**; SWEEP at plan deadline (OD-C default) | same | same | existing behaviour |
| Host crash | claim persists, **no resume**; SWEEP | same | same; inert child exits (gate timeout/parent loss) | hard stop/dead-man (AR-22 [U]) then SWEEP |
| Job lost / never enqueued | SWEEP | n/a | n/a | n/a |

## 4. Race matrix (requested cases)

Each race resolves through A2/A3: exactly one claim insert wins; exactly one status CAS wins.

| # | Race | Interleaving | Resolution | Loser obligation | Residual |
|---|---|---|---|---|---|
| R1 | Duplicate pickup / stalled-job redelivery of a `PLANNED` unit | H1 and H2 pass step 0 | both call `claimUnitHost`; unique `(unit, attempt)` admits one; the other gets `ALREADY_CLAIMED` | stops **before any F07 call**, writes nothing, never sees the F07 holder token | none for conforming hosts [C]; bypass by non-conforming worker [X] (AR-13) |
| R2 | Redelivery of a non-`PLANNED` unit (host lost) | job redelivered after P3+ | pickup-ignore rule: ack, no state change | none | recovery only at plan deadline + sweep interval [U — bound accepted] |
| R3 | Claim acquired, host crash before F07 | crash between P1 and P2 | unit `PLANNED`+claim, no lease; no takeover | none | unit stuck until SWEEP; deliberate [C] |
| R4 | F07 `PROCEED` (P2), then failed `PLANNED → ADMITTED` CAS | unit finalized by SWEEP between P2 and P3 | CAS fails | owner releases its own lease (unique holder) when the release surface exists; otherwise lease expires ≤ 30 s | lease occupies concurrency ≤ 30 s [U until AR-19] |
| R5 | Lease loss before `RUNNING` | host stalled > 30 s; 008 reclaims | renewal returns zero rows → stop (008 FR-006a) | host aborts, kills any child, withholds work, **does not finalize**; claim stays | unit ends only at SWEEP; ordering with CAS: `DISPATCHED→RUNNING` requires a live lease [PROPOSED] |
| R6 | `ADMITTED → DISPATCHED` vs deadline SWEEP | CAS vs `ADMITTED → REFUSED` | row lock: one wins | host losing never forks | none |
| R7 | Fork / start gate / `DISPATCHED → RUNNING` vs SWEEP | child forked (P5), SWEEP wins `DISPATCHED → REFUSED` first | host CAS fails | host terminates the child; no work order was delivered | **U1** below |
| R8 | Crash immediately before/after each persisted point | see §1 / §5 | per §5 | — | — |
| R9 | Kill-switch stop requested while pre-`RUNNING` | (a) before claim; (b) after claim before F07; (c) `ADMITTED`/`DISPATCHED` hosted; (d) unhosted | (a)/(b) F07 admission refuses `KILL_SWITCH_PENDING` at step 1 → `REFUSED`; (c) loop sees stop ≤ 5 s → `acknowledgeStop`, abort, finalize `REFUSED(KILL_SWITCH_PENDING)`, `recordStopped`; (d) no host: SWEEP finalizes at deadline, no acknowledgement | (c) host acknowledges then finalizes | **(d) = R-10, open with 008** |
| R10 | Finalization racing a host or stale worker | SWEEP finalizes while host acts | host writes are CAS on status and claim token; after terminal every host write fails; loop reads unit status ≤ 5 s and stops; a stale holder that lost its lease must not finalize (U-1 `:244-246`) | host stops, kills child | stale worker with live OS process and no DB path: child ends by parent-loss/gate timeout; hard guarantee needs AR-22 [U] |
| R11 | Stale host resumes after stall, still believes it owns | claim row unchanged (no takeover); lease reclaimed | renewal fails → stop; CAS requires live lease [PROPOSED] | as R5 | window ≤ renewal interval + stall [inherited from 008] |

## 5. Crash-after/before table (R8)

| Crash point | State left | Recovery | Bound |
|---|---|---|---|
| before P0 | unit `PLANNED`, no job | SWEEP `REFUSED` | plan deadline + interval |
| P0 → P1 | job queued, no claim | redelivery picks up (claim free) | queue/BullMQ redelivery |
| P1 → P2 (after claim, before F07) | `PLANNED`+claim | no resume; SWEEP | plan deadline + interval |
| P2 → P3 (after F07, before CAS) | `PLANNED`+claim+lease | lease expires ≤ 30 s; SWEEP | lease 30 s; status plan deadline + interval |
| P3 → P4 | `ADMITTED`+claim+lease | as above; no resume | same |
| P4 → P5 (after `DISPATCHED`, before fork) | `DISPATCHED`, no child | SWEEP `REFUSED` | same |
| P5 → P6 (child forked, before CAS) | `DISPATCHED` + inert child | child exits on parent loss/start-gate timeout [PROPOSED]; SWEEP `REFUSED` | status: plan deadline + interval; child: `startGateTimeoutMs` (provisional) — enforcement against a compromised or non-conforming child [X] |
| P6 → P7 (CAS done, gate not released) | `RUNNING`, inert child | as `RUNNING` host crash: SWEEP after confirmation | plan deadline + interval; AR-22 |
| after P7 | `RUNNING`, working child | hard stop/dead-man/reconciler (AR-22 [U]), SWEEP | not shortened by this draft |
| before P8 (finalize txn) | `RUNNING` | rolled back; SWEEP | as above |
| after P8, release failed | terminal, lease held | expires ≤ 30 s | 30 s (until AR-19) |

## 6. Guarantees: established by the written contract vs unproven

| Id | Guarantee | Status | Basis / gap |
|---|---|---|---|
| G1 | At most one conforming host obtains the right to call F07 for `(unit, attempt)` | **[C]** under A1, A2 | unique claim before F07; F07 replays the same holder token to any caller using the same key (`safety-admission-contract.md:78`), so only the claim prevents token sharing |
| G2 | Each unit status edge has exactly one winner | **[C]** under A3 | row lock + status predicate |
| G3 | No terminal unit is re-dispatched | **[C]** | HEAD rule 4 + pickup-ignore |
| G4 | A pre-`RUNNING` stop yields `REFUSED`, never `KILLED` | **[C]** | HEAD diagram, U-1 matrix, 012 N5-3 |
| G5 | No lease exists while `PLANNED` | **[C]** | sequence (F07 after claim) |
| G6 | Plan deadline immutable and DB-clock enforced | **[C]** | U-1 (unchanged) |
| G7 | Host-initiated writes after the unit became terminal fail | **[C]** under A3 | CAS on status |
| U1 | **No safety-sensitive action before the `DISPATCHED → RUNNING` CAS succeeds** | **[U] — not established by the proposed contract alone** | needs: (i) work order, configuration, credentials delivered only after CAS; (ii) child cannot act autonomously (no work without parent; no network path or only parent-mediated); (iii) external resource creation (e.g. SPEC 011 Guest provisioning, listed inside the unit's `timeoutPolicyMs`, `scan-deadline-contract.md:87-91`) happens after `RUNNING` or is covered by a teardown-confirmation rule; (iv) per-engine conformance declaration and test; 011 does not say which 009 status provisioning runs under [UNVERIFIED]; compromised child [X] |
| U2 | Lease-renewal authority confined to the claim owner | **[U]** | holds only for conforming hosts; DB-level enforcement = AR-13; relies on 008 replay returning the token only to the first caller [A] |
| U3 | No unbounded stale-host activity | **[U]** | loop + CAS + lease give a ≤ renewal-interval window, not zero; fencing also needs the terminal-status read in the loop |
| U4 | Stop acknowledgement for unhosted pre-`RUNNING` units | **[U] — open with SPEC 008 (R-10)** | |
| U5 | Recovery bound shorter than plan deadline + sweep interval | **[U] — not claimed** | AR-19, AR-22 |
| U6 | Lease freed promptly on sweep finalization | **[U]** | requires AR-19 unit-keyed release; else ≤ 30 s expiry |
| U7 | Orphan child cleanup after host loss | **[U]/[X]** | start-gate timeout and parent-loss exit are proposed requirements; hosting-failure backstop is AR-22 |
| X1 | Compromised worker forging claims, tokens or transitions | **[X]** | AR-13 (012 `sec_*` functions) |
