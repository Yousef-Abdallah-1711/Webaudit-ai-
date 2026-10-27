# U-1b Design Review — Round 2 Findings

2026-10-24. Review-only; **no existing spec or code edited, nothing staged or committed.** Inputs re-read this round (not taken from the earlier summary): `PROPOSED_SPEC009_AMENDMENT_U1B_v2.md` in full; 008 `contracts/kill-switch-contract.md` (full), `safety-admission-contract.md:25-80`, `safety-checkpoint-contract.md:28-60`, `data-model.md:36-75`, `spec.md` FR-006a (:312); 009 `data-model.md:186-232` (ExecutionUnit), `contracts/execution-runtime-contract.md` (full), `runtime-finalization-contract.md:1-60`, `scan-deadline-contract.md` (full, last round), `spec.md:380-388`; 012 `spec.md:401,416,423` (FR-183, FR-195, FR-201(c)), `data-model.md:855-868` (`UnitDispatchRecord`), 4.10B/4.10C/4.10F, `contracts/active-security-execution-contract.md:38-52`, `tasks.md:609`; 011 `contracts/untrusted-execution-contract.md:84-96`, `plan.md:211`, `spec.md:207`.
Labels: **FACT** = stated in a cited file · **INFERENCE** = my reasoning from facts · **UNVERIFIED** = not established by any file read. Output files: `PROPOSED_SPEC009_AMENDMENT_U1B_v3.md`, `U1B_RACE_CRASH_MATRIX.md`.

Owner directions applied: OD-A option (1) generic 009 host claim before F07; OD-C default retained (host stops without finalizing, sweep finalizes, no new reason); start gate, post-F07 deadline re-check, host loop from `PROCEED` provisionally accepted subject to this validation; Q1 dates unresolved.

## 1. Host-claim contract (requirement 2) — result: designed, v3 §4

Facts driving the design:
- F07 returns the same `AdmissionResult` (incl. the holder token) to a duplicate `(targetAuthorizationId, idempotencyKey)` call (`008 safety-admission-contract.md:78`); the lease token fences only *renewals* (`008/data-model.md:66-70`; FR-006a `spec.md:312`). So F07 cannot tell a second host from the first → ownership must be decided before the F07 call (INFERENCE, strong).
- 009 has no claim, `hostInstanceId` or fence column (`data-model.md:186-232`; grep of 009 contracts: none) and its finalization rule is key-based only; with `attempts:1` the key never changes, so rule 1 does not fence a stale same-attempt holder (`scan-deadline-contract.md:241-246`).
- 012 already implements the pattern: `UnitDispatchRecord`, `@@unique([executionUnitId, attempt])`, `dispatchSeq`, `hostInstanceId` (`012/data-model.md:855-868`), claim never stale-reclaimed (`spec.md:416`).
Design (v3 §4): one `ExecutionUnitHostClaim` row per `(unit, attempt)`; created in one transaction that also evaluates the step-0 predicate on the database clock; fresh token returned once, hash stored; `claimSeq` from a sequence; **no expiry takeover, no reassignment, no required heartbeat**; inert when the unit is terminal; every host-initiated transition and finalization is claim-guarded; sweep/orchestrator finalization needs no token; only database-verified step-0 refusals are allowed unclaimed. How it prevents two hosts: the second claimant gets `ALREADY_CLAIMED` and never calls F07, so it never receives a holder token and cannot renew or transition (**FACT-based design; guarantee holds for conforming workers only** — bypass is AR-13).

## 2. Race and crash tracing (requirement 3) — result: `U1B_RACE_CRASH_MATRIX.md` §4–§5
All nine requested cases traced (R1–R11, P0–P8). Outcomes: duplicate pickup, claim-then-crash, failed `PLANNED→ADMITTED` CAS, lease loss, `ADMITTED→DISPATCHED` vs sweep, fork/gate/CAS and finalization races resolve to "exactly one winner, loser stops" given row-locked CAS; the losing host kills any forked child and finalizes nothing. Crash cases leave a non-terminal unit with no resume until the plan-deadline sweep (accepted limitation).
New contradiction found by tracing (**C-1**): 012 FR-201(c)(3) lets `sec_claim_unit_host` claim a unit that is "neither terminal nor `RUNNING`" (`012/spec.md:423`), i.e. an `ADMITTED`/`DISPATCHED` unit — a resume path, contradicting the owner's no-resume rule. v3 §10 lists the required 012 change (claim only `PLANNED`).

## 3. Start gate (requirement 4) — result: **guarantee NOT established by the proposed contract alone**
The contract can require: no work order/config/credentials before the CAS; no autonomous child action; exit on parent loss; exit after `startGateTimeoutMs`; terminate the child if the CAS fails. It cannot prove "no safety-sensitive action before `RUNNING`" because:
1. It depends on each engine's isolation protocol (INFERENCE). 009 says the child never holds a DB connection and asks its parent for checkpoints (`execution-runtime-contract.md` step 6 text), which supports parent-mediated actions, but a child that acts without asking is outside generic 009.
2. **External resource creation**: SPEC 011 counts Guest provisioning inside the unit's `timeoutPolicyMs` measured from `DISPATCHED` (`scan-deadline-contract.md:87-91` worked example; 011 `plan.md:149` lists `provision` as a run sub-step) and does not say which 009 status it occurs under — **UNVERIFIED**. If provisioning happens before `RUNNING`, a `DISPATCHED → REFUSED` finalization would release the lease while a Guest exists. Required mechanism: either provisioning begins only after `RUNNING`, or a termination-confirmation rule (`onUnitExpired`) is extended to `DISPATCHED` for engines that create external resources.
3. A forked child before `RUNNING` is not under the parent-armed hard stop (armed after `RUNNING`, HEAD step 5); orphan prevention needs parent-loss exit + gate timeout [PROPOSED] and, as a guarantee, AR-22 (open).
4. Compromised child: [X].
Required additional mechanism, stated exactly: **per-engine conformance declaration and test** for items (a) work only after the CAS, (b) no autonomous action/network path, (c) resource creation after `RUNNING` or confirmed teardown, plus the 011 confirmation. Race R7 is therefore recorded as **conditionally resolved, not resolved**.

## 4. Host loop from `PROCEED` (requirement 5) — result: v3 §5 step 6
Facts: lease 30 s, renewal ≤ 5 s with holder token, zero rows ⇒ stop (`008/data-model.md:55,66-70`; FR-006a); stop acknowledgement and the 5 s escalation are the hosting process's duty (`kill-switch-contract.md:45-66`); 009's loop exists only "while `RUNNING`" (`execution-runtime-contract.md` step 6) and 012 runs proofs after `PROCEED` (`active-security-execution-contract.md:43`) → renewal/ack gap (INFERENCE, confirmed as a real gap).
Design: loop from `PROCEED`: renew; stop-pending check → `acknowledgeStop` → abort; deadline check; **unit-status read** (added: lets a host notice that the sweep finalized the unit); lease loss ⇒ stop without finalizing (OD-C). Neither loop nor CAS alone is fencing; fencing is the combination claim uniqueness + token-guarded CAS on status + lease-live predicate at `PLANNED→ADMITTED` and `DISPATCHED→RUNNING` [PROPOSED] + terminal-status check in the loop + start gate. Remaining window (INFERENCE): a stalled host can act for up to one renewal interval plus stall time before noticing; this is inherited from 008's design for `RUNNING` units as well. Interaction with the sweep: the sweep finalizes by CAS; the loop notices within ≤ 5 s and kills the child.

## 5. R-10 (requirement 6) — result: **preserved as an open dependency on the SPEC 008 owner**; consequence determined
Facts: only an execution's own checkpoint calls `acknowledgeStop`/`recordStopped` (`kill-switch-contract.md:45-56`); the 5 s escalation is performed by the unit's own hosting process (`:58-66`); `expirePlanUnits` never writes F07 tables or calls `triggerStop` (`scan-deadline-contract.md:173`); admission refuses while a `KillSwitchState` is `REQUESTED`/`ACKNOWLEDGED` (`safety-admission-contract.md` step 1).
Answer to "can pre-`RUNNING` sweep finalization leave a request unacknowledged and does it affect escalation": **yes for host-less units** (INFERENCE from the three facts): the row can stay `REQUESTED`; no escalation occurs because there is no hosting process to perform it; for wider scopes admission stays refused while `REQUESTED` (safe direction, but indefinite). Hosted pre-`RUNNING` units acknowledge via the new loop. Whether 008 treats stranded `REQUESTED` rows as acceptable, alertable or reconcilable is **UNVERIFIED and not decided** (question in v3 §9).

## 6. Edge/cause matrix (requirement 7) — `U1B_RACE_CRASH_MATRIX.md` §2–§3
All edges listed with writer, claim precondition, lease, deadline, child state and crash outcome (eight edge groups, 11 transition rows) plus the full status-by-cause table.

## 7. SPEC 012 follow-ups vs the no-resume rule (requirement 8) — v3 §10
Conflicts with no-resume: FR-201(c)(3) (:423) [C-1]; FR-195 (:416) "nothing when already `ADMITTED`/`DISPATCHED`" and "status the unit holds at pickup"; E14 contract :43-44 "skipped when already `DISPATCHED`". Consistent: `sec_refuse_unclaimed_unit` (PLANNED-only; no record; no unreleased lease, 4.10B); `dispatch.crash-keeps-claim-sweep-finalizes` (T814). Wording to adjust: FR-183, auth-workflow :40, data-model 4.10F case 2, plan :367, T814 expectations for `DISPATCHED` causes, AR-18 items 1–2. 012 not edited.

## 8. Contradictions found
| Id | Contradiction | Evidence |
|---|---|---|
| C-1 | 012 claim admits `ADMITTED`/`DISPATCHED` units (resume) vs no-resume rule | `012/spec.md:423` |
| C-2 | U-1: "pre-`RUNNING` units have nothing to terminate" vs fork-before-CAS (child can exist in `DISPATCHED`) | `scan-deadline-contract.md:199`; runtime step 4 |
| C-3 | 009 loop only "while `RUNNING`" vs lease TTL 30 s from `PROCEED` and 012 proofs after `PROCEED` | runtime step 6; `008/data-model.md:55`; E14 :43 |
| C-4 | `runtime-finalization-contract.md:19` `REFUSED` "never admitted at all" vs existing `ADMITTED → REFUSED` | `:19`; HEAD `plan.md:257` |
| C-5 | `data-model.md` `dispatchedAt` ("a queue job exists") semantics vs definition (i) hand-off time | `data-model.md:210-232` region; v3 §2 |
| C-6 | 012 4.10F case 2 "no process exists" for `DISPATCHED` vs an inert child under the start gate | `012/data-model.md:1191` |
| C-7 | HEAD never specifies who enqueues or when a unit becomes eligible (job-creation recovery undefined) | grep of `spec.md`, runtime contract |

## 9. Unsupported guarantees and unresolved decisions
Guarantees **not** established: U1 (start gate), U2 (renewal authority beyond conforming hosts), U3 (stale-host window), U4 (stop ack for host-less units), U5 (recovery bound < plan deadline + interval), U6 (prompt lease release without AR-19), U7 (orphan child cleanup), X1 (compromised worker). Table: `U1B_RACE_CRASH_MATRIX.md` §6.
Unresolved decisions: approval of the whole v3 text; mapping of 012 `UnitDispatchRecord` as the claim specialization; cross-spec lease-live read in two CAS predicates; `startGateTimeoutMs`; unit-status read in the loop; SPEC 011 provisioning order; R-10 (008); AR-19; AR-22; AR-18 item 5; Q8; Q1 dates; Q4–Q9.

## 10. Facts vs inferences (summary)
FACT: 008 replay semantics and lease TTL/token rules; 008 ack/escalation ownership; 009 sequence and finalization rules; 012 claim/CAS mechanics; 011 provisioning inside `timeoutPolicyMs`. INFERENCE: token-sharing hazard, renewal/ack gap, stranded `REQUESTED` rows, stall windows, start-gate dependence on engine protocol. UNVERIFIED: 011 provisioning status; 008's treatment of stranded stop requests; anything about runtime behaviour (nothing is implemented).
