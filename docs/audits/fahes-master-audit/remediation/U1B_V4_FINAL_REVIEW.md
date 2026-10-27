# U-1b v4 — Final Adversarial Review

2026-10-27. **Read-only review. No existing file was modified** (v4, the v2 matrix, the prior review, and all SPEC 008/009/010/011/012 files are unchanged; nothing staged or committed; no dates inferred; no approval implied). Inputs read in full: `PROPOSED_SPEC009_AMENDMENT_U1B_v4.md`, `U1B_RACE_CRASH_MATRIX_v2.md`, `U1B_FINAL_ADVERSARIAL_REVIEW.md`. Source sections re-inspected this round: 008 `data-model.md:36-75,125-175`, `research.md:88-101`, `contracts/safety-admission-contract.md`, `safety-checkpoint-contract.md`, `kill-switch-contract.md` (full); 009 `scan-deadline-contract.md` (:173-200, :239-265), `runtime-finalization-contract.md`, `execution-runtime-contract.md`; 010 `contracts/browser-execution-contract.md:44-66`; 011 `contracts/untrusted-execution-contract.md` (invariants 2, 8, 11, 15, lifecycle table, :201); 012 `contracts/active-security-execution-contract.md:38-60`, `data-model.md:1038,1059,1081`, `spec.md:401,416,423`.
Evidence labels: **REPO** (cited file) · **PG** (documented PostgreSQL behaviour; not a repo file; not re-verified here) · **INFERENCE** · **UNVERIFIED**.

## 1. Verdict
**NOT READY — SPECIFICATION REPAIRS REQUIRED.** v4 contains five internal contradictions and one guarantee that its own text cannot support (§3 F1). Even after those repairs, approval additionally depends on the cross-spec decisions in §8 (SPEC 008, 010, 011); those are listed but are not the primary reason for the verdict.

## 2. Answer to the highest-priority case
**Sequence:** (1) host wins `DISPATCHED→RUNNING`; (2) sweep terminalizes; (3) host delivers the work order/credentials and releases the gate.
**Does v4 prevent step 3 after step 2? No.**
- v4 §5 step 10 orders "CAS, then arm/deliver/release", and §7 reads status only at the loop cadence (≤ 5 s). A status read immediately before release does not close it: the sweep can commit between the read and the release (read-to-release race; the release is a process action, not a database action, so it cannot be made atomic with any database check).
- Can the sweep terminalize a `RUNNING` unit at that moment? U-1 finalizes a `RUNNING` unit only after the engine hook `onUnitExpired = TERMINATED` (`scan-deadline-contract.md:192-200`). For a unit whose gate has not been released the engine has nothing to destroy, so the hook can legitimately answer `TERMINATED` (INFERENCE; 011's hook is an idempotent `destroy(runId)` on a deterministic run id, `untrusted-execution-contract.md:201`). Hence terminalization before gate release is reachable.
- **Minimum mechanism** (cannot be satisfied by the generic contract alone): (a) every *authorization of an externally visible effect* must be a database step that, in one transaction, locks the unit row `FOR SHARE`, checks `status = RUNNING` + claim + renewable lease, and records the intent/consumption — terminalization needs the unit row exclusively, so it commits strictly before or after that step, never between; (b) the effect itself (a send, a provisioning call) happens outside the transaction and cannot be recalled, so the guarantee is "no *new* authorization after terminalization; at most the in-flight effect", not "no effect"; (c) resource creation that is not per-effect mediated (SPEC 011 provisioning) needs an engine-specific creation fence, e.g. an idempotent run-creation claim the termination hook can pre-empt with a tombstone — **UNVERIFIED that the Execution Plane supports it**; the documented backstop is the EP dead-man (15 s without heartbeat) and hard TTL (`011/spec.md:FR-052`), which are unbuilt (vendor unresolved, AG1).
- **Engine position (REPO):** SPEC 012 has a per-request fenced wrapper (`active-security-execution-contract.md:54`: fence, then claim, then write; fence = unit/scan non-terminal and deadline not passed, one transaction with a row lock) but the F07 checkpoint (step 5) and the send (step 7) follow in separate steps, so the window is bounded to one in-flight request, as 012 itself states (FR-190 note, same file :51). SPEC 011 fences only evidence writes (`:108` invariant 8), not provisioning or step starts. SPEC 010: no fence stated for browser context creation (`browser-execution-contract.md:52-66`).
- **Parent pause/crash after the CAS:** crash ⇒ `RUNNING` unit with an inert child; the exit-on-parent-loss and gate-timeout behaviours are **new requirements in v4, not established by any current contract**; the sweep finalizes only after confirmation. Pause then resume ⇒ the stale host can still release the gate (above). Gate timeout: the child exits if not released within `startGateTimeoutMs`; a host resuming just after receives a dead child — harmless; one resuming just before releases a gate for a terminal unit — the race above.
**Consequence:** v4 §6's wording "conditionally resolved" overstates; the start gate establishes *ordering*, not *post-terminalization safety*.

## 3. Prioritized findings

| # | Sev | Finding | Evidence | Failure trace | Required resolution |
|---|---|---|---|---|---|
| F1 | **High** | Start gate cannot prevent authorization/effects after terminalization (§2). | v4 §5 steps 9–10, §6; U-1 `:192-200`; 011 :108, :201 | CAS → sweep (hook says nothing to destroy) → host releases gate → child acts | Restate guarantee; add the per-effect database authorization step (a) as a requirement on every engine; engine-specific creation fence for 011 (c); accept in-flight bound |
| F2 | **High** | v4 loop checks deadline before stop (§7 order 1 then 2), contradicting "F07 stop beats the deadline in every column" (`scan-deadline-contract.md:188`); the claim's step-0 evaluation (§4.2) and step-7 re-check read no kill-switch state; 012 tier-U reasons exclude `KILL_SWITCH_PENDING` (`012/data-model.md` 4.10B). So the precedence is prose, not an algorithm, and at least three writers (claim `STEP0_FAILED`, step-7 re-check, loop) can write the deadline reason when a stop is also pending. | v4 §4.2, §5 step 7, §7; U-1 :185,:188 | stop requested + deadline passed → `REFUSED(SCAN_DEADLINE_EXPIRED)` instead of `KILL_SWITCH_PENDING`, stop never acknowledged | Specify one cause-precedence order used by every writer (stop first) or drop the claim |
| F3 | **High** | v4 §7 (2) says a host that sees a stop finalizes; (3) says a host that lost its lease does not finalize (U-1 :244-246). If both hold in one iteration the text contradicts itself. Also §7 (1) "stop if terminal or expired" never says who finalizes a pre-`RUNNING` deadline expiry, while the matrix (6a) gives it to OWNER. | v4 §7; matrix v2 §2 row 6a | lease lost + stop pending: finalizes (stale holder) or not? | Define precedence: lease-lost ⇒ acknowledge only, no finalization; state the owner finalization for loop-observed expiry |
| F4 | **High** | v4/matrix assume every `ADMITTED` unit holds an F07 lease and gate the CAS on a renewable lease. Per-class consumption policy is the engine's choice (`safety-checkpoint-contract.md` rule 2); a policy with `concurrency:false` yields no lease row, so the predicate can never pass. | v4 §2, §4.4(3); matrix v2 §1 | request-only unit: CAS `PLANNED→ADMITTED` always fails | Make the lease predicate conditional on `consumes.concurrency`; matrix rows conditional |
| F5 | **High** | SPEC 010 contradicts v4: `dispatchBrowserUnit` forks the child, constructs the browser pool in the child (step 2), then, if the worker is at its context ceiling, "this unit is not dispatched — it remains `ADMITTED`, retried at the next available slot" (`browser-execution-contract.md:52-58`). Under v4 the unit would sit in `ADMITTED` indefinitely with a held lease and a forked child, retried by whom after a host loss (no resume)? | 010 :52-58 | ceiling reached → unit `ADMITTED` for hours; deadline/stop handling relies on the loop; host loss ⇒ sweep only | 010 owner decision (Q8) |
| F6 | Med-High | `hostInstanceId` is host-supplied and compared by string equality; it is not an authenticated identity in 009. Only 012 maps it to an authenticated database principal. The claim token is a bearer secret, but the worker role in the repo is one shared `DATABASE_URL` (`apps/worker/src/db.ts:26`), so any worker can read/modify claim rows and, via 008, read `holderToken` in clear (`008/data-model.md:52`) and renew any lease. | v4 §4.1, §4.4; 008 :52 | non-conforming worker overwrites claim hash or renews leases | State as a conforming-worker rule; DB enforcement = AR-13 (012's functions) |
| F7 | Med | "~90 s" is a reclamation bound for a **crashed** holder when the maintenance sweep runs at its default 60 s cadence (`research.md:95-96`), not an authority bound: a paused-but-live holder can renew an expired-unreclaimed lease (`data-model.md:66-70`) and 008 states no cap on how long a live holder may do so. v4 §8 "a crashed host's slot is freed by reclaim ≤ ~90 s" is correct as worded; matrix v2 §4 row "after P8, release failed" and the summary in `U1B_FINAL_ADVERSARIAL_REVIEW.md` §4 are looser. The sweep cadence is itself an unverified operational assumption. | as cited | paused host revives lease after 30–90 s | Keep the bound only for crashed hosts; state the cadence assumption |
| F8 | Med | Lock ordering is **unverified** (§4): v4 mandates no order and 008 specifies none for reclaim/reconcile/release. | v4 §4.4(3); 008 contracts | see §4 | 008 lock-order statement before "proven" |
| F9 | Med | `recordStopped` preconditions: 008 says "once it has fully exited … budget released" (`kill-switch-contract.md:49-56`); without AR-19, release happens only at reclaim, so the v4 order finalize→`recordStopped` either violates the precondition or delays it ≤ ~90 s; whether it may be called after terminalization, or by an authority for a unit it did not host, is unspecified. | v4 §7; 008 :45-56 | host finalizes, release absent, calls `recordStopped` early | 008 decision (§8) |
| F10 | Med | Matrix v2 "impossible" rows are 012-specific or wrong: "F07 `STOP` … impossible from `ADMITTED`/`DISPATCHED`/`RUNNING`" is false — the periodic checkpoint (`consumes{false,false}`) re-runs admission and can return `REVOKED`/`EXPIRED`/`OUT_OF_SCOPE`/`KILL_SWITCH_PENDING` in those statuses (`safety-checkpoint-contract.md:28-34`; T814 expects `REFUSED` from all three); "engine guard refusal impossible from `ADMITTED`" ignores other engines' post-admission refusals (e.g. 010 step 3). | matrix v2 §3 | observed row marked "non-conforming" though legal | Correct the table |
| F11 | Med | A lease can be created for an already-terminal unit when a host pauses between claim and F07 (F07 is unaware of unit status; admission contract has no unit check). v4 acknowledges via R12 but §5 step 3–5 does not require a status/deadline re-read immediately before the F07 call, and even a re-read leaves a TOCTOU (separate transactions). | matrix v2 R12 | lease for terminal unit until release/reclaim | require pre-F07 re-read; accept residual until AR-19 |
| F12 | Low-Med | Token mechanics unspecified: who generates the token (database vs host), how the hash is computed inside the CAS statement, and whether the claim insert can leak the token to logs/queue. | v4 §4.1–4.2 | – | specify |
| F13 | Low | v4 §0(3) and matrix summary claim a "renewable" predicate; but a renewable-but-expired lease passes the CAS and is reclaimed right after commit, so the predicate protects the commit instant only. | v4 §4.4(3) | – | state the limit |

## 4. PostgreSQL lock-order analysis (task 2)
Operations and the locks each takes **as specified in the documents** (INFERENCE where the document is silent):
| Operation | Locks, in order | Source |
|---|---|---|
| host status CAS (v4) | `ExecutionUnit` row (UPDATE); claim row read only (immutable); proposed `SELECT … FOR SHARE` on the lease row — **order not stated in v4** | v4 §4.4 |
| finalization | unit row `FOR UPDATE` → F07 release (lease row UPDATE → `BudgetCounter` correction) | 009 rules 2–3; 008 data-model counter note; 012 4.10C "lease row locked after the unit row" (`012/data-model.md:1038`) |
| admission | `BudgetCounter` row `FOR UPDATE` → insert lease row | `safety-admission-contract.md:57,63` |
| renewal | lease row UPDATE only | `008/data-model.md:66-70` |
| reclaim sweep / drift reconciliation | lease row(s) → counter correction, or counter → live-lease recompute — **unspecified** | `008/data-model.md:36-45`, `research.md:88-101` |
| 012 global order | `BrokerPrincipalState`, tenant advisory lock, `ExecutionUnit`, `AdmissionLease`, `IdempotentClaim`, … (no `BudgetCounter` position) | `012/data-model.md:1081` |
Findings: (a) v4's CAS is deadlock-free against finalization **only if** it locks unit → lease (same as finalization). Locking the lease first would invert against finalization (unit → lease). (b) A potential cycle exists independent of v4 if drift reconciliation locks counter → leases while finalization/release locks lease → counter; **008 does not say which** — UNVERIFIED. (c) `FOR SHARE` is held to the end of the transaction and blocks a concurrent reclaim/release `UPDATE` of that row [PG], so the predicate cannot go stale *within* the CAS transaction; it does not extend past commit. (d) The predicate "unreleased ∧ unreclaimed" does exclude reclaimed/released leases at that instant, and (by 008's own renewal rule) accepts an expired one. (e) Row locks guarantee mutual exclusion among *conforming statements*; a worker that bypasses the CAS form is not constrained [X: AR-13].
**Evidence required to label the lock-order claim proven:** a 008 statement (contract or implementation) of the lock order for admission, renewal, release, reclaim and reconciliation; confirmation that no operation locks a lease row before a unit row; and the 012 global order extended with `BudgetCounter`. None exists. The claim is **UNVERIFIED**.

## 5. Race table
| # | Initial state | Interleaving | Final database state | Possible process/resource state | Enforced protection | Remaining gap |
|---|---|---|---|---|---|---|
| 1 | `RUNNING`, gate closed | host CAS → sweep finalizes (hook: nothing to destroy) → host releases gate | terminal | child starts work; engine may create resource | none (process action) | F1 |
| 2 | `RUNNING`, gate closed, 012 | as 1, child requests via parent gate | terminal | request authorization: B0 fenced wrapper rejects; checkpoint separate | per-request fence (REPO, 012 :54) | ≤ 1 in-flight request |
| 3 | `RUNNING`, 011 | as 1, supervisor calls EP `provision` | terminal | Guest exists; EP heartbeat from live supervisor | none on provisioning; EP hard TTL (unbuilt) | UNVERIFIED/UNPROVEN |
| 4 | `PLANNED`+claim | host paused before F07; sweep finalizes; host resumes, calls F07 | terminal + lease row | none | claim + status CAS block later steps | lease for terminal unit until release/reclaim (AR-19) |
| 5 | `ADMITTED`+lease | host paused > 30 s; resumes before reclaim | `ADMITTED`; lease revived | none | 008 renewal rule | none for budget; host continues |
| 6 | as 5 | resumes after reclaim | `ADMITTED`; lease reclaimed | none | zero-row renewal; CAS predicate | host's stop is conformance |
| 7 | `DISPATCHED`, inert child | sweep refuses; host later releases gate | `REFUSED` | child works | status CAS blocks RUNNING; but host may skip CAS (non-conforming) or gate released earlier | F1 for post-`RUNNING` only; here the CAS fails so gate stays closed (conformance) |
| 8 | any pre-RUNNING | stop pending + deadline | per F2 | – | prose precedence | F2 |
| 9 | lease lost + stop pending | same iteration | ambiguous | – | none | F3 |
| 10 | `ADMITTED` | duplicate pickup | unchanged | none | pickup-ignore (REPO v4) / claim unique [PG] | none for conforming |
| 11 | terminal, lease unreleased (no AR-19) | stale host renews | terminal; lease renewed | – | loop reads terminal ≤ 5 s | non-conforming host: unbounded |
| 12 | finalize txn | release op fails | rolled back (AR-19) or terminal+lease | – | undefined | AR-19 |

## 6. Guarantee table
| Guarantee | Class |
|---|---|
| No re-dispatch of a terminal unit; pickup-ignore | PROVEN BY REPOSITORY TEXT (009 rule 4 + v4 rule) |
| Pre-`RUNNING` stop yields `REFUSED`, never `KILLED` | PROVEN BY REPOSITORY TEXT |
| Plan deadline immutable, database-clock based | PROVEN BY REPOSITORY TEXT (U-1) |
| Crashed holder's slot reclaimed ≤ ~90 s | PROVEN BY REPOSITORY TEXT **given** the 60 s maintenance sweep runs (UNVERIFIED assumption) |
| One claim per `(unit, attempt)` | CONDITIONAL ON CONFORMANCE (PG unique index; workers share one DB role) |
| Exactly one winner per status edge | IMPLEMENTATION-DEPENDENT (single-statement form not mandated) |
| Host-initiated writes fail after terminalization | IMPLEMENTATION-DEPENDENT / CONDITIONAL ON CONFORMANCE |
| Lease-live check atomic with the CAS | IMPLEMENTATION-DEPENDENT (`FOR SHARE`) — lock order UNVERIFIED |
| Lock-order deadlock freedom with 008 | UNVERIFIED |
| Renewal authority confined to the claim owner | CONDITIONAL ON CONFORMANCE (bypass: AR-13; `holderToken` stored in clear) |
| "F07 stop beats the deadline" | UNPROVEN (prose only; v4 loop contradicts, F2) |
| Stop acknowledgement for host-less units | UNPROVEN (008 open) |
| `acknowledgeStop → abort → finalize → recordStopped` compatible with 008 | UNVERIFIED (precondition on release; AR-19) |
| No authorization/effect after terminalization | UNPROVEN (F1; per-effect fence + engine specifics required) |
| Inert child exits on parent loss/gate timeout | UNPROVEN (new requirement) |
| Prompt, atomic lease release on finalize | UNPROVEN (AR-19) |
| Recovery faster than plan deadline + sweep interval | UNPROVEN (not claimed) |
| Compromised-worker resistance | UNPROVEN (AR-13) |

## 7. Contradictions
1. v4 §7 order (deadline, then stop) vs v4 matrix/U-1 :188 "stop beats deadline" (F2).
2. v4 §7 (2) finalize on stop vs (3) lease lost ⇒ do not finalize vs U-1 :244-246 (F3).
3. v4 §2/§4.4(3) "ADMITTED ⇒ lease" vs class consumption policies without a concurrency lease (F4).
4. Matrix v2 §3 "F07 `STOP` impossible after admission" vs `safety-checkpoint-contract.md:28-34` periodic checkpoint and 012 T814 (F10).
5. v4 §6 "conditionally resolved" vs F1 (cannot be established generically).
6. v4 ADMITTED→DISPATCHED immediate vs 010 "remains `ADMITTED`, retried at the next slot" (F5).
7. Matrix v2 §4 "after P8, release failed" bound vs F7 for stale-but-live renewers.
8. 012 `spec.md:423` (claim for non-`RUNNING`, non-terminal units) vs no-resume (carried from the earlier review, still open).
9. 011: supervisor child created with the EP credential (invariant 15, `:129`) and phase 1 "REFUSED/KILLED, no Guest" vs v4 "no credential before `RUNNING`" — status mapping unstated (carried, UNVERIFIED).

## 8. Cross-spec items: classification
| Item | Class |
|---|---|
| SPEC 008: who advances `REQUESTED → ACKNOWLEDGED/STOPPED` with no live host; broad-scope clearing; aggregation among executions sharing a row; `recordStopped` preconditions/caller after terminalization | **Approval blocker unless the owner explicitly accepts the residual** (availability/audit completeness, not unsafe execution) |
| SPEC 008: lock order for admission, renewal, release, reclaim, reconciliation | **Approval blocker for any "proven" label**; otherwise implementation dependency |
| SPEC 011: status for supervisor creation, EP credential, provisioning, second F07 call; creation fence/tombstone for `provision` | **Approval blocker** (v4 imposes rules 011 may violate) |
| SPEC 010: `ADMITTED` wait at the context ceiling; children/browser before `RUNNING`; per-effect fence for context creation (Q8) | **Approval blocker** (explicit contradiction F5) |
| SPEC 012: claim mapping (principal ≡ token), FR-201(c)(3) → `PLANNED` only, FR-195/E14 resume branches, 30 s wording | Follow-up after approval; **not** a v4 blocker; 012 stays unedited/untracked |
| AR-13 (DB role boundary), AR-19 (release surface), AR-22 (hosting-failure backstop) | **Implementation dependencies / explicitly accepted residual risks** — v4 must keep stating them as limitations |
| AR-18 item 5 (single finalization authority) | Open implementation dependency; v4 does not rely on its resolution |
| Per-effect database authorization step (§2 a) | **New v4 repair** (specification) + per-engine conformance |
No owner approval is inferred for any item.

## 9. Smallest set of decisions/amendments needed before approval
**Specification repairs to v4 (no external decision):** (R1) restate the start-gate guarantee and add the per-effect authorization step; (R2) one cause-precedence order for every writer (stop first), including the claim's step 0 and the step-7 re-check; (R3) loop precedence for lease-lost vs stop and who finalizes loop-observed expiry; (R4) conditional lease predicate by `consumes.concurrency`; (R5) pre-F07 status/deadline re-read; (R6) mandate unit → lease lock order and the single-statement CAS form; (R7) correct the matrix "impossible" rows; (R8) token generation/hash specification and a conforming-worker statement for `hostInstanceId`.
**Decisions by others:** SPEC 008 owner — the stop-state ownership question (§8, with `recordStopped` preconditions) and the lock-order statement; SPEC 011 owner — supervisor/credential/provisioning/F07 mapping and a creation fence; SPEC 010 owner — the `ADMITTED` ceiling wait and pre-`RUNNING` browser child; project owner — acceptance of the residuals (unproven guarantees in §6) as stated limitations; SPEC 012 owner — mapping and wording follow-ups.

## 10. Recommendation
Do not present v4 for approval. Produce a v5 that applies R1–R8, then obtain the SPEC 008/010/011 decisions above. Any approval request should list the §6 "UNPROVEN/UNVERIFIED" rows as accepted limitations and must not describe the start gate, fencing, lock-ordering or recovery as guaranteed. This review does not edit specs, apply the amendment, stage, commit or run tests.
