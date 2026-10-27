# PROPOSED SPEC 009 Amendment U-1b — Dispatch Ordering, Host Claim and Effect Authorization (v5)

**PROPOSED — NOT APPLIED — NOT APPROVED — NOT READY FOR APPROVAL**

Supersedes v4 (unchanged, with v1–v3, the v2 matrix and all prior reviews). No existing SPEC 008/009/010/011/012 file or implementation file is edited by this document. Nothing here is a proven guarantee: statements are **requirements proposed**; the guarantee classes in §13 say what the repository text can and cannot support. Baseline at drafting: HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196`, 35 status entries, nothing staged, SPEC 009 working-tree diff 10 files +169/−4, `.specify/feature.json` → SPEC 011.

Tags: **[OWNER]** stated by the owner · **[OWNER-PROV]** provisionally accepted subject to validation · **[HEAD]/[U-1]** existing text · **[PROPOSED]** drafting needing approval · **[OPEN]** unresolved, owner named · **[PG]** relies on documented PostgreSQL behaviour (general knowledge, not a repo file, not re-verified) · **UNVERIFIED** no repository text establishes it.

Owner directions in force: Q2 = B; Q2.1 = (i); E1 (`DISPATCHED → REFUSED`) in principle; no automatic resume of `ADMITTED`/`DISPATCHED`; OD-A generic host claim before F07; OD-C default (lease lost before `RUNNING` ⇒ host stops without finalizing, sweep finalizes, no new reason); start gate, post-F07 re-check and host loop from `PROCEED` provisionally accepted. Q1 dates unresolved (no date inferred); Q4–Q9 open.

## 0. Change summary against v4 and finding traceability

| Finding | v5 resolution | Status |
|---|---|---|
| F1 start gate vs terminalization | §6: gate restated as *ordering only*; per-effect database authorization fence (`authorizeEffect`); `onUnitExpired` must consult recorded authorizations; guarantee limited to "no new authorization after terminalization" | **Partially resolved** — generic fence specified; SPEC 011 creation fence/tombstone **UNVERIFIED**; in-flight effect remains |
| F2 stop/deadline precedence | §7: one decision procedure `classifyPreRunCause` used by every writer; claim step-0 and re-check made stop-aware | **Resolved within 009**; acknowledgement mechanism for the STOP-at-admission path **OPEN (008)** |
| F3 loop precedence | §8: ordered loop procedure; who finalizes; lease-lost = acknowledge-only | **Resolved within 009**; acknowledge-only by a stale holder **UNVERIFIED (008)** |
| F4 lease conditional | §5.3: Class L (concurrency lease) and Class N (no lease) predicates | **Resolved** (text); classes' real policies UNVERIFIED |
| F5 SPEC 010 `ADMITTED` wait | §10: alternatives; generic rule that engine-local capacity checks precede F07 admission | **Unresolved — SPEC 010 owner** |
| F6 claim identity / bypass | §4: `hostInstanceId` = label; compromised-worker resistance not claimed (shared DB role, AR-13) | **Resolved as limitation** |
| F7 recovery bound | §12: ≈ 90 s only for a crashed holder with the documented 60 s maintenance sweep running; no bound for a paused-live holder | **Resolved as wording** |
| F8 lock order | §5.4 table, mandated `ExecutionUnit → lease`; deadlock freedom **not** claimed | **Unresolved — SPEC 008 decision; 012 global order lacks `BudgetCounter`** |
| F9 `recordStopped` | §9: no call order mandated; conflict with AR-19 documented | **Unresolved — SPEC 008** |
| F10 matrix errors | Appendix A: F07 `STOP` possible after admission via periodic checkpoint; engine vs generic separated | **Resolved** |
| F11 pre-F07 race | §5.2: fresh read before F07; residual TOCTOU documented | **Partially resolved** (residual until AR-19) |
| F12 token mechanics | §4.2 | **Resolved** (text); deployment logging config UNVERIFIED |
| F13 renewable-but-expired lease | §5.3–5.4: predicate protects the commit instant only | **Resolved as wording** |
| R1–R8 | R1 §6 · R2 §7 · R3 §8 · R4 §5.3 · R5 §5.2 · R6 §5.4 · R7 App. A · R8 §4.2 | as above |

## 1. Scope
Statuses and ordering from plan resolution to `RUNNING`; queue-job semantics; the host claim; F07 admission position; lease ownership; effect authorization after `RUNNING`; refusal/finalization/crash/race behaviour; stop handling. Applies to units with `requiresSafetyCheckpoint = true`. Unchanged: passive/`SOURCE_STATIC` units on the legacy queue (FR-040), `TELEMETRY` direct completion, F01/F07 contracts, U-1's immutable plan deadline, the single `timeout-sweep`, billing/refund, queue topology, scan-completion gate, evidence fencing.

## 2. Status definitions (replace `spec.md` FR-014 text, `data-model.md:53-65`, `plan.md` labels)
| Status | Meaning |
|---|---|
| `PLANNED` | In a `RESOLVED` plan: not yet eligible (HEAD) or eligible and possibly queued/claimed. No F07 admission; no lease at rest (one may exist transiently between F07 `GRANTED` and the `ADMITTED` CAS). |
| `ADMITTED` | The owning host obtained F07 `PROCEED` and won `PLANNED→ADMITTED`. For Class L the lease is held. Engine proofs run here. |
| `DISPATCHED` | Handed to the owning host's runtime to start the child; the child may be forked but is inert. No credential, work order, configuration, external resource or safety-sensitive action exists. `dispatchedAt` = hand-off time. |
| `RUNNING` | The owning host won `DISPATCHED→RUNNING`. The start gate may now be released **only through §6**. |
| `REFUSED` | Terminal before any safety-sensitive action was authorized. |
| others | unchanged; `KILLED` only from `RUNNING` |
Edges: HEAD `PLANNED→ADMITTED`, `ADMITTED→DISPATCHED`, `DISPATCHED→RUNNING`, `ADMITTED→REFUSED`, `RUNNING→*terminal`; U-1 `PLANNED→REFUSED`, `DISPATCHED→REFUSED`. No status added or removed.

## 3. Dispatch sequence (replaces `execution-runtime-contract.md` steps 0–4)
1. **Enqueue** `{ executionUnitId }` when eligible (eligibility and job creation unspecified in HEAD and unchanged). Unit `PLANNED`; no F07, no lease.
2. **Pickup**: re-read from PostgreSQL. **Pickup-ignore**: non-`PLANNED` ⇒ acknowledge, change nothing. [OWNER]
3. **Engine-local capacity checks** (e.g. a browser context ceiling) are evaluated here, before any F07 call, while `PLANNED` and lease-free; failing ⇒ delay/requeue the job, no admission (§10). [PROPOSED; SPEC 010 owner]
4. **`claimUnitHost`** (§4). Not `CLAIMED` ⇒ stop, no F07.
5. **Engine guards** as owner (e.g. SPEC 012 feature/environment/input checks) ⇒ `REFUSED` from `PLANNED` using §7 precedence.
6. **Pre-F07 re-read** (§5.2), then **F07 admission** by the owner: `STOP` ⇒ `REFUSED(f07 reason)` from `PLANNED`; `PROCEED` ⇒ Class L lease held. Start the host loop (§8).
7. **CAS `PLANNED→ADMITTED`** (§5).
8. **Engine proofs** (SPEC 012 VAB/DAP) in `ADMITTED`; refusal ⇒ `REFUSED` from `ADMITTED`. Then **re-evaluate §7** (stop first, then deadline); refusal from `ADMITTED`.
9. **CAS `ADMITTED→DISPATCHED`.**
10. **Fork the child under the start gate**: no credential, work order, configuration, external resource or safety-sensitive action; exits on parent loss and if the gate is not released within `startGateTimeoutMs` (provisional constant). These two exit rules are **new requirements, established by no current generic contract** (SPEC 012 states parent-loss exit for its own child).
11. **CAS `DISPATCHED→RUNNING`**; on failure the host terminates the child and finalizes nothing.
12. After success: arm the parent hard stop (HEAD step 5) and **only then** proceed through §6 (effect authorization) to deliver the work order/credentials, release the gate and create engine resources.
13. **Finalization** per HEAD step 7.

## 4. Host-claim contract [OWNER direction; design PROPOSED]
**4.1 Entity.** `ExecutionUnitHostClaim`: `id`; `executionUnitId`, `attempt`; `scanPlanId`, `userId`; `hostInstanceId`; `claimTokenHash`; `claimSeq` (database sequence, never reused); `acquiredAt` (statement clock). `@@unique([executionUnitId, attempt])`; scalars only. No expiry-based takeover, no reassignment, no required heartbeat; inert once the unit is terminal.
**4.2 Token and identity mechanics** [PROPOSED]. (a) **Generated by the host process** from a CSPRNG, **≥ 128 bits minimum, 256 bits recommended**. (b) Stored only as `claimTokenHash = SHA-256(token)`; the raw token exists only in host memory and is sent to the database as a **bound parameter**, never interpolated into SQL text. (c) Verification: `claimTokenHash = sha256($token)`; the comparison is between digests, so it leaks nothing exploitable by timing. (d) **Leakage controls**: the raw token is never logged, never in a queue payload (payload is only `{executionUnitId}`, FR-018), never in progress snapshots, audit rows, Sentry/diagnostics, never passed to the child, and is registered with the process-global scrubber; database bind-parameter logging must be off in deployments (**UNVERIFIED** deployment setting). (e) `hostInstanceId` is a **label** (process incarnation id) used for audit and diagnostics; it carries no authority unless an authenticated mapping is defined — only SPEC 012 defines one (authenticated database principal) [OPEN: 012 owner]. (f) A restarted host has a new `hostInstanceId` and no token, so it cannot continue (no resume).
**4.3 Acquisition.** `claimUnitHost(executionUnitId, hostInstanceId, tokenHash)`: one transaction; lock the unit row; require `PLANNED`, plan `RESOLVED`, scan non-terminal; evaluate §7 on the statement clock (`clock_timestamp()`; `now()` is the transaction start time [PG]); insert the claim (unique index admits one [PG]). Results `CLAIMED | ALREADY_CLAIMED | REFUSE(reason) | NOT_CLAIMABLE`. `REFUSE(reason)` is returned only when §7 yields a refusal and **no stop is pending** (so a stop is never masked by a deadline reason).
**4.4 Enforcement classes.** The uniqueness and row lock are database-enforced [PG]. Who may call `claimUnitHost`, and every use of the token, is a conforming-worker rule: **workers share one database role (`apps/worker/src/db.ts:26` uses `DATABASE_URL`; `holderToken` is stored in clear, `008/data-model.md:52`), so a non-conforming or compromised worker can overwrite claim rows, forge transitions or read and renew any lease. This amendment claims no resistance to that; it is AR-13 [OPEN].** F07 returns the same `AdmissionResult`, including the holder token, to any caller repeating the idempotency key (`008 safety-admission-contract.md:78`), so only the claim (not F07) separates callers.

## 5. Status CAS, lease predicates, lock order
**5.1 Form.** Each host-initiated status change is **one conditional `UPDATE`**: `UPDATE ExecutionUnit SET status = :to … WHERE id = :id AND status = :from AND EXISTS (SELECT 1 FROM ExecutionUnitHostClaim c WHERE c.executionUnitId = :id AND c.attempt = :attempt AND c.claimTokenHash = sha256(:token) AND c.hostInstanceId = :host)` and zero rows updated means the transition is lost. The claim row is immutable so the subquery cannot go stale [PG]. **The mandated shape is not a guarantee against a worker that does not use it.**
**5.2 Pre-F07 read (R5/F11).** Immediately before the F07 call the host re-reads the unit's status, the scan state, the stop rows (§7) and the deadline; if the unit is terminal or §7 yields a refusal, it stops (no F07 call) and finalizes by §8 rules. **Residual (documented, not eliminated):** the read and the F07 call are separate transactions (F07 is a different contract with its own tables and takes only `executionId`); a sweep can terminalize the unit between them and F07 can then create a lease for a terminal unit. The host's CAS then fails and it releases the lease itself only if a release surface exists; otherwise the lease stays until reclaim (§12). An atomic cross-contract mechanism exists only if SPEC 008 provides the transaction-participating surface (AR-19) — **UNVERIFIED/absent today**.
**5.3 Lease predicates (R4/F4).** Using the repository terms: a class's consumption policy `consumes {request, concurrency}` decides whether admission returns a `leaseId`/`holderToken` (`safety-admission-contract.md:24`, `safety-checkpoint-contract.md` rule 2).
- **Class L** (`consumes.concurrency = true`): after the unit `UPDATE` (statement 1) the same transaction runs `SELECT 1 FROM AdmissionLease WHERE executionId = :unit AND releasedAt IS NULL AND reclaimedAt IS NULL FOR SHARE` (statement 2); no row ⇒ **roll back** the whole transaction (lease lost; §8). "Renewable" matches 008's renewal predicate (`008/data-model.md:66-70`), which has **no expiry test**: a lease past `expiresAt` but not yet reclaimed still passes, and a paused host can renew it. The check protects only the commit instant; reclaim may occur immediately after.
- **Class N** (`consumes.concurrency = false`): no lease exists; statement 2 is omitted; the CAS rests on status + claim; liveness is the host loop (§8) without renewal.
Applies to all three host CAS edges. Whether a given engine class is L or N is UNVERIFIED until each engine spec states its consumption policy (010/011/012 do for some: 011 `{true,true}` at dispatch; 012 E14 `{request:false, concurrency:true}`).
**5.4 Lock order (R6/F8/F13).** Mandated for the host CAS: **`ExecutionUnit` row → applicable lease row**, using two ordered statements (a single statement with a `FOR SHARE` CTE does not guarantee the lock order [PG]).
| Operation | Order (as specified) | Source | Verified against 009 order? |
|---|---|---|---|
| host CAS (§5.3) | unit → lease (share) | this text | n/a |
| `authorizeEffect` (§6) | unit (share) → lease (share) | this text | n/a |
| finalization + release | unit (exclusive) → lease update → `BudgetCounter` correction | 009 rules 2–3; `012/data-model.md:1038` ("lease locked after the unit row") | consistent with CAS |
| admission | `BudgetCounter` (exclusive) → insert lease | `safety-admission-contract.md:57,63` | 012 wrapper locks the unit first (`sec_ctx`), then counter — position of counter in 012's global order **missing** (`012/data-model.md:1081`) |
| renewal | lease row only | `008/data-model.md:66-70` | no inversion |
| reclaim / drift reconciliation | **unspecified** (lease→counter or counter→leases) | `008/data-model.md:36-45`, `research.md:88-101` | **UNVERIFIED** |
Missing decisions: SPEC 008 must state the lock order of admission, renewal, release, reclaim and reconciliation; SPEC 012's global order must place `BudgetCounter`. **Deadlock freedom is not claimed.** Row locks give mutual exclusion among statements that use them; they say nothing about a worker that does not.

## 6. Start gate and per-effect authorization (R1/F1)
**6.1 What the gate is.** The gate orders actions inside the host: fork → `DISPATCHED→RUNNING` CAS → (§6.2) → release. **The gate alone does not prevent actions after terminalization**: after the CAS a sweep can terminalize the unit (its engine hook can answer `TERMINATED` when nothing exists to destroy — `scan-deadline-contract.md:192-200`), and the host can still release the gate; a status read immediately before release is a read-to-release race and is not sufficient.
**6.2 `authorizeEffect` — the required per-effect fence** [PROPOSED; applies to every non-passive engine]. Before **each externally visible effect** (a request to the target, a customer-code step start, an EP/vendor provisioning call, delivery of the work order or credentials) the host executes one database transaction: (1) `SELECT … FROM ExecutionUnit WHERE id = :id FOR SHARE`; (2) verify `status = RUNNING`, the claim token/`hostInstanceId`, scan non-terminal, deadline not passed (§7 order); (3) Class L: `SELECT … FROM AdmissionLease … FOR SHARE` (renewable); (4) record the authorization/intent (an engine-owned row or `IdempotentClaim` keyed by unit, attempt, effect kind, ordinal) and **commit**. Only then does the effect happen. Finalization needs the unit row exclusively, so it commits strictly before or after this transaction, never between [PG].
**6.3 What this guarantees and what it cannot.** The effect itself runs **outside** the transaction and **cannot be recalled**. The generic guarantee is limited to: **no *new* authorization after terminalization; at most already-authorized in-flight effects remain.** Mapping to existing mechanisms: SPEC 012's per-request fenced wrapper (fence, then claim, then write; `active-security-execution-contract.md:54`) is an instance of step (1)–(4) for requests, followed by a separate F07 checkpoint and send, so its bound is one in-flight request (`:51`); SPEC 011 fences only evidence writes (`untrusted-execution-contract.md` invariant 8) — **provisioning and step starts are not fenced (UNVERIFIED conformance)**; SPEC 010 states no fence for browser context creation.
**6.4 Termination hook.** `onUnitExpired(unit)` must return `TERMINATED` only when **no authorized effect lacks a confirmed completion/destruction record** and the engine has fenced further creation; if an authorization row exists without confirmation it returns `PENDING` (U-1 then keeps the unit non-terminal). This closes "sweep terminalizes while an authorized effect is about to run" for conforming engines.
**6.5 Engine-specific requirements (not established; owners named).**
- **SPEC 011** [OPEN: 011 owner]: provisioning (`ep-run-start` claim, presigned URL, run creation) must be preceded by `authorizeEffect(PROVISION)` after `RUNNING`; a **creation fence / tombstone** so `destroy(runId)` issued by the hook before creation prevents a later `provision` for that deterministic run id. **UNVERIFIED that the Execution Plane supports it**; the documented backstops (EP dead-man 15 s without heartbeat, hard TTL, reconciler; 011 FR-052) are unbuilt and vendor-dependent (AG1). Also unverified: the status under which the supervisor child is created and receives the EP credential (invariant 15, `:129`), and whether phase 1's "dispatch `safetyCheckpoint`" (`011/spec.md:207`) is a second F07 call.
- **SPEC 012**: per-request wrapper already exists; confirm it also checks `RUNNING`+claim and the lease class.
- **SPEC 010** [OPEN]: browser context creation and navigation need `authorizeEffect`; no fence is stated.
**6.6 Gate timeout and crashes.** Host crash after the CAS before release: unit `RUNNING` with an inert child; the child exits on parent loss/`startGateTimeoutMs` (new requirement); the sweep finalizes after the hook confirms. Host pause after the CAS, then resume after terminalization: the first `authorizeEffect` fails; the host must not release the gate and kills the child.

## 7. One precedence procedure for every writer (R2/F2)
`classifyPreRunCause(unit)` — **every** writer (claim, step-0 re-check, post-F07 re-check, engine guards, host loop, sweep/`expirePlanUnits`, `authorizeEffect`) evaluates in this order and uses the first match:
1. unit already terminal → no-op (return prior outcome);
2. **stop pending**: any `KillSwitchState` row in `REQUESTED`/`ACKNOWLEDGED`/`STOPPED` for the unit's execution, scan, grant, target, tenant or platform scope (008's fast-read query, `008/data-model.md:172-175`; `STOPPED` for `(EXECUTION, id)` refuses unconditionally, `kill-switch-contract.md:72-76`) → cause `KILL_SWITCH_PENDING` (pre-`RUNNING`) / the F07-reason outcome (`RUNNING`);
3. scan `CANCELLED` / `FAILED` / `TIMED_OUT` → `SCAN_CANCELLED` / `SCAN_FAILED` / `SCAN_DEADLINE_EXPIRED`;
4. `now >= effectiveDeadlineAt` → `SCAN_DEADLINE_EXPIRED`;
5. remaining time `< timeoutPolicyMs + hardStopMarginMs` → `SCAN_DEADLINE_INSUFFICIENT`.
Compatibility: 008 admission already evaluates the kill-switch rows first (`safety-admission-contract.md` step 1) — consistent. U-1's matrix prose "F07 stop beats the deadline" (`scan-deadline-contract.md:188`) becomes this algorithm. **SPEC 012:** its unclaimed step-0 function accepts only `SCAN_*` reasons (4.10B tier U) and cannot choose `KILL_SWITCH_PENDING`; therefore an unclaimed or claim-time refusal is **not written when a stop is pending** — the unit proceeds to F07 admission (which refuses with `KILL_SWITCH_PENDING`) or is left to the sweep (tier S includes `KILL_SWITCH_PENDING`) [012 follow-up]. **No acknowledgement mechanism is invented**: for a refusal at F07 admission the 008 checkpoint contract acknowledges nothing (`safety-checkpoint-contract.md:32-36`); whether the host should call `acknowledgeStop` there is a **008 question [OPEN]**.

## 8. Host loop and precedence in one iteration (R3/F3)
Starts at F07 `PROCEED` (Class L) or at the first `ADMITTED`/claim (Class N); at least every 5 s until finalization. Ordered procedure:
1. **Unit terminal?** (read status) → stop work, kill any child, **write nothing**.
2. **Renew the lease** (Class L). Zero rows ⇒ `leaseLost`.
3. Evaluate `classifyPreRunCause` (§7).
4. Act:
   - **`leaseLost` (with or without any other condition):** abort the signal, kill the child, withhold work; **no finalization** (U-1 `:244-246`, 008 FR-006a). If a stop is pending the host may call `acknowledgeStop` only (idempotent, no unit-state change) — **permissibility for a stale holder UNVERIFIED (008)**. The sweep finalizes with §7 precedence.
   - **stop pending, lease held:** `acknowledgeStop` → abort → kill child → **owner finalizes** (pre-`RUNNING`: `REFUSED(KILL_SWITCH_PENDING)`; `RUNNING`: existing KILLED/CANCELLED mapping). `recordStopped`: see §9.
   - **scan terminal or deadline expired (no stop), pre-`RUNNING`, lease held:** the **owner finalizes** `REFUSED(SCAN_*)` from the status held, releasing the lease through finalization.
   - **same, `RUNNING`:** existing U-1 host-loop behaviour.
5. Class N: step 2 skipped; every other step identical.

## 9. `recordStopped` (F9) — no order mandated
008 states `recordStopped` is called "once it has fully exited — no further work, budget released, workspace/session cleanup complete" (`kill-switch-contract.md:49-56`) and is idempotent. The only release path in the contracts is `finalizeExecutionUnit` step 2 through an F07 release operation that 008 does not specify (`safety-checkpoint-contract.md:37`; AR-19). Therefore: calling `recordStopped` after finalization satisfies the wording only if release is atomic with finalization (AR-19, absent); calling it earlier violates the wording; calling it after reclaim delays it by up to the reclaim bound. **Nothing here fixes a call order.** Until the SPEC 008 owner decides (§14), the host calls `acknowledgeStop` where §8 says and leaves `recordStopped` to the owner's decision; the documented residual is a `KillSwitchState` that may remain `ACKNOWLEDGED`/`REQUESTED`.

## 10. SPEC 010 — `ADMITTED` wait at the context ceiling (F5) — unresolved
Conflict: `browser-execution-contract.md:52-58` constructs the pool in the forked child, checks the worker's context ceiling afterwards and, if at the ceiling, leaves the unit `ADMITTED` and "retried at the next available slot". Under this amendment that means an unbounded `ADMITTED` wait with a held lease and a forked child, and no resume after host loss. Alternatives (SPEC 010 owner chooses; none selected): **(a)** evaluate the ceiling before F07 admission (§3 step 3) and delay the job — unit stays `PLANNED`, no lease, no child; **(b)** keep waiting in `ADMITTED` but bounded by the plan deadline with the host loop active, accepting a held lease during the wait; **(c)** model the ceiling as an F07 concurrency budget so the refusal arrives as an admission `STOP` (008 treats a concurrency refusal as terminal, per 011 invariant 13 note). Also pool construction (browser launch) must follow `RUNNING` (§6). v5 proposes (a) as the generic rule; the 010 text stays unapproved.

## 11. Cause and status matrix
Appendix A (self-contained). Impossible rows are limited to what the **generic** contract excludes and are labelled engine-specific otherwise.

## 12. Recovery and crash limitations (explicit)
- A unit whose host is lost in `PLANNED` (after claim), `ADMITTED` or `DISPATCHED`, whose job is lost or never created, is not resumed and ends only when the plan-deadline sweep finalizes it: remaining plan deadline (≤ 6 h ceiling) plus one sweep interval.
- **Lease slot reclamation ≈ 90 s applies only to a *crashed* holder and only if the documented maintenance sweep actually runs at its stated 60 s default cadence** (`008/research.md:95-96`: ≤ 30 s expiry + ≤ 60 s sweep); the sweep running is **UNVERIFIED**. It bounds slot reclamation, **not** host authority: a **paused-but-live** holder can renew an expired-unreclaimed lease and 008 states no cap; after reclaim its renewal fails.
- A stale-but-live host can keep renewing a terminal unit's lease until its loop reads the terminal status (≤ 5 s after it resumes); a non-conforming host without limit; absent AR-19, finalization and release are not one transaction.
- An inert child may remain until its parent-loss/gate-timeout exit (new requirements); no guarantee for non-conforming engines (AR-22).
No shorter bound is claimed while AR-19 and AR-22 are open.

## 13. Guarantee classes
| Guarantee | Class |
|---|---|
| No re-dispatch of terminal units; pickup-ignore | PROVEN BY REPOSITORY TEXT |
| Pre-`RUNNING` stop ⇒ `REFUSED`, never `KILLED` | PROVEN BY REPOSITORY TEXT |
| Immutable DB-clock plan deadline (U-1) | PROVEN BY REPOSITORY TEXT |
| Cause precedence "stop first" (§7) | PROPOSED procedure; not yet in any contract |
| One claim per `(unit, attempt)` | CONDITIONAL ON CONFORMANCE (PG unique index; shared DB role) |
| One winner per status edge | IMPLEMENTATION-DEPENDENT (mandated form) |
| Lease check atomic with CAS | IMPLEMENTATION-DEPENDENT; lock order UNVERIFIED |
| Deadlock freedom with SPEC 008 | UNVERIFIED |
| No new effect authorization after terminalization | CONDITIONAL ON CONFORMANCE (every engine uses `authorizeEffect`; `onUnitExpired` consults it) |
| No effect after terminalization | **UNPROVEN** (in-flight effect; SPEC 011 provisioning unfenced) |
| Inert-child cleanup | UNPROVEN (AR-22) |
| Prompt atomic lease release | UNPROVEN (AR-19) |
| Stop acknowledgement for host-less units; `recordStopped` order | UNPROVEN (008 open) |
| Compromised-worker resistance | **Not claimed** (AR-13) |

## 14. Decisions, owners and approval blockers
**Within SPEC 009 (this proposal, awaiting owner approval):** claim entity and token mechanics; CAS form and lock-order mandate; `authorizeEffect` and the hook rule; §7 and §8 procedures; Class L/N predicates; §3 ordering; `startGateTimeoutMs`.
**Other owners (not decided here):**
- **SPEC 008:** stop-state ownership when no live host (who advances `REQUESTED → ACKNOWLEDGED/STOPPED`; broad-scope clearing; aggregation among executions sharing a row; whether the STOP-at-admission path acknowledges; stale-holder acknowledge-only; `recordStopped` preconditions and permissible caller after terminalization); lock order of admission/renewal/release/reclaim/reconciliation; AR-19.
- **SPEC 010:** §10 alternatives; fence for context creation; pre-`RUNNING` child (Q8).
- **SPEC 011:** supervisor creation status and credential delivery; provisioning after `RUNNING` with `authorizeEffect`; creation fence/tombstone; second F07 call; EP hard-TTL "dispatch time" = `dispatchedAt`.
- **SPEC 012:** claim mapping (authenticated principal ≡ token); FR-201(c)(3) "neither terminal nor `RUNNING`" → `PLANNED` only; FR-195 (:416) and E14 :43-44 resume branches and ordering (`PROCEED → ADMITTED → proofs`); 4.10F case 2 wording (inert child possible; lease reclaim ≈ 90 s not 30 s); extend the global lock order with `BudgetCounter`; unclaimed refusal not written when a stop is pending.
- **Owner:** whole-text approval; accept the §13 UNPROVEN/UNVERIFIED rows as stated limitations; the Q1 dates; Q4–Q9.
**Standing dependencies:** AR-13 (DB boundary), AR-19 (release surface), AR-22 (hosting-failure backstop), AR-18 item 5 (single finalization authority).
**Approval blockers:** SPEC 008 stop-state/lock-order decisions or explicit residual acceptance; SPEC 010 §10; SPEC 011 confirmations; no approval is inferred for any item.

## 15. SPEC 009 change list (after approval only)
`spec.md` FR-014 + host-claim and effect-authorization requirements; `data-model.md` (:53-65 comments; `ExecutionUnitHostClaim`; authorization-record convention); `plan.md` (:253-261 diagram; claim, §7 and §8 text); `execution-runtime-contract.md` (§3 sequence, pickup-ignore, start gate, `claimUnitHost`, CAS form); `execution-unit-contract.md` rules 6–7; `runtime-finalization-contract.md` (:19; claim token for host finalization; reason recomputation for unclaimed step-0; `onUnitExpired` consults authorizations); `scan-deadline-contract.md` (:113-128, :177-200, :199; §7 precedence replaces :188 prose; limitations); `tasks.md` (T-U1-4/7/9; new tasks for claim, `authorizeEffect`, loop, race/crash adverse tests — numbered by RM-F1 work); `research.md` pointer.

## 16. Validation criteria after application
One definition per status; every edge in diagram, data model, unit contract and Appendix A; no text places F07 before the claim, proofs before `ADMITTED`, a resource/credential/work order before `RUNNING`, or an effect without `authorizeEffect`; §7 used verbatim by every writer; Class L/N predicates present; lock order stated once; §12/§13 present once; no `[OPEN]`/`[PROPOSED]` markers in applied text; re-grep of 008/010/011/012 references.

---

# Appendix A — Corrected transition / cause matrix (self-contained)

Writers: **OWNER** (claim token), **SWEEP** (orchestrator authority), **ANY** (database-verified step-0 reasons only, and only when no stop is pending). Classes: L (lease) / N (no lease). Engine-specific rows are marked **[012]**, **[010]**, **[011]**.

| Edge | Cause | Writer | Preconditions | Lease | Child/resource | Crash outcome |
|---|---|---|---|---|---|---|
| `PLANNED→ADMITTED` | F07 `PROCEED` | OWNER | status + claim; Class L renewable lease | held (L) | none | before: `PLANNED`+claim(+lease); no resume; SWEEP |
| `ADMITTED→DISPATCHED` | proofs ok, §7 clear | OWNER | status + claim; L renewable | held (L) | none | after: `DISPATCHED`, no child; SWEEP |
| `DISPATCHED→RUNNING` | child forked, inert | OWNER | status + claim; L renewable | held (L) | inert child | after: inert child exits (new rule); SWEEP after hook |
| `PLANNED→REFUSED` | §7 cause 3–5 at claim/pickup | ANY/OWNER | no stop pending | none | none | idempotent |
| `PLANNED→REFUSED` | stop pending (admission `STOP`, or §7 cause 2) | OWNER (or SWEEP) | claim | none | none | SWEEP |
| `PLANNED→REFUSED` | engine guard refusal **[012]** | OWNER | claim | none | none | SWEEP |
| `PLANNED→REFUSED` | plan/scan end | SWEEP | – | transient lease possible (R5) | none | – |
| `ADMITTED→REFUSED` | engine proof refusal **[012]** | OWNER | claim | released by finalization (AR-19) | none | SWEEP |
| `ADMITTED→REFUSED` | **F07 `STOP` from periodic checkpoint** (REVOKED/EXPIRED/OUT_OF_SCOPE/ENVIRONMENT…/KILL_SWITCH_PENDING) | OWNER | claim, lease not lost | released by finalization | none | SWEEP |
| `ADMITTED→REFUSED` | §7 re-check / loop-observed end | OWNER or SWEEP | lease not lost for OWNER | as above | none | – |
| `DISPATCHED→REFUSED` | **F07 `STOP` from periodic checkpoint**; §7 causes | OWNER or SWEEP | as above | as above | inert child terminated by host or by its exit rule | child: UNPROVEN |
| `ADMITTED` indefinitely | engine-local capacity wait **[010]** | – | – | held (L) | possible forked child | **contradicts §3 step 3 — §10 open** |
| `RUNNING→COMPLETED/FAILED/CANCELLED/KILLED` | per HEAD/U-1; `STOP` from checkpoint → existing mapping | OWNER; SWEEP after hook | claim | released by finalization | confirmed by hook; no unconfirmed authorized effect | AR-22 |
| lease lost, any pre-`RUNNING` status | zero-row renewal | host stops; **no finalize** | – | gone | child killed by host | SWEEP at plan deadline |
Status/cause combinations that are **impossible under the generic contract**: `KILLED`, `FAILED`, `COMPLETED` from any pre-`RUNNING` status (except `TELEMETRY`); `RUNNING` without a claim; a second claim; `DISPATCHED→RUNNING` for a unit whose gate was already released; engine-guard or proof refusal after `RUNNING`. **Possible (not impossible):** F07 `STOP` after admission; refusals by non-012 engines after `ADMITTED`; an `ADMITTED` unit without a lease (Class N); a lease for a terminal unit (pre-F07 race).

# Appendix B — Internal adversarial traces

Legend: DB = database-enforced [PG] (only for statements that follow the mandated form); CONF = relies on worker conformance; Gap/Owner.

| # | Interleaving | Expected DB state | Process/resource state | Protection supported by repository | Remaining gap / owner |
|---|---|---|---|---|---|
| 1 | Host wins `DISPATCHED→RUNNING`; sweep terminalizes (hook: nothing to destroy); host resumes and tries to release the gate | terminal | inert child | §6.2: `authorizeEffect` fails ⇒ host must not release; `onUnitExpired` consults authorizations (proposed). Repo today: **none** for the gate | host skipping `authorizeEffect` (CONF); in-flight authorized effect; 011 creation fence UNVERIFIED — owners 009/011/010 |
| 2 | Stop requested and deadline expired at once | claim/loop/sweep all choose `KILL_SWITCH_PENDING` (§7) | – | 008 admission checks stop first (REPO); §7 proposed for 009 writers | 012 tier-U cannot write the stop reason (follow-up); acknowledgement path 008 open |
| 3 | Lease lost and stop pending, same iteration | unit non-terminal until sweep | child killed | §8: no finalization after lease loss (U-1/008 FR-006a REPO); acknowledge-only proposed | stale-holder acknowledge UNVERIFIED (008) |
| 4 | Class N (no concurrency lease) | CAS = status + claim only | – | §5.3 | engine consumption policies UNVERIFIED; liveness only via loop |
| 5 | Host paused after claim; sweep terminalizes; host resumes, calls F07 | terminal + lease row for a terminal unit | none | §5.2 pre-F07 re-read narrows it; CAS fails | TOCTOU between separate transactions until AR-19; lease persists until release/reclaim |
| 6 | Browser context ceiling reached while `ADMITTED` **[010]** | `ADMITTED`, lease held, child forked | browser pool in child | none (conflict) | §10 alternatives — SPEC 010 owner |
| 7 | Host crashes after finalization before `recordStopped` | terminal; stop `ACKNOWLEDGED` | – | none | 008 decision (§9) |
| 8 | Paused-but-live host resumes after expiry, before reclaim | `ADMITTED`; lease revived by renewal | – | 008 renewal rule has no expiry test (REPO); CAS passes (renewable) | no bound on authority; reclaim ≈ 90 s applies to crashed holders only (§12) |
| 9 | Non-conforming worker bypasses the CAS | arbitrary | arbitrary | **none** — shared `DATABASE_URL` role; `holderToken` in clear | AR-13 (not claimed) |
| 10 | 011 provisioning races terminalization | terminal | Guest may exist | proposed `authorizeEffect(PROVISION)` + hook; EP dead-man/TTL (REPO text, unbuilt) | creation fence UNVERIFIED; AG1 — 011 owner |
| 11 | Reclaim/reconciliation vs finalization + release | terminal; counters corrected | – | unit→lease order for host/finalize (REPO 012 4.10C) | reclaim/reconcile lock order UNVERIFIED — 008 owner; 012 order lacks `BudgetCounter` |
