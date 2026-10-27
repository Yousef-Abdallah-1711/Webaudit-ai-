# U-1b v3 — Final Adversarial Design Review

2026-10-25. **Review only. Nothing is approved or applied; no existing SPEC 008/009/011/012 or implementation file was edited; nothing staged or committed; no dates inferred.** Reviewed: `PROPOSED_SPEC009_AMENDMENT_U1B_v3.md` (unchanged), `U1B_REVIEW_FINDINGS_R2.md`, `U1B_RACE_CRASH_MATRIX.md`, against SPEC 008 (`data-model.md`, `research.md`, `spec.md`, kill-switch / admission / checkpoint contracts), SPEC 009 working tree (data model, runtime/finalization/unit/deadline contracts), SPEC 011 (`spec.md` FR-048…FR-052, `plan.md:211`, `contracts/untrusted-execution-contract.md`), SPEC 012 (`spec.md` FR-183/195/201, `data-model.md` 4.9I/4.10B-F, E14 contract).
Labels: **FACT** (cited file) · **PG** (documented PostgreSQL behaviour, general knowledge, **not a repo file and not re-verified here**) · **INFERENCE** · **UNVERIFIED**.
Companion outputs: `U1B_RACE_CRASH_MATRIX_v2.md` (corrected matrix), `PROPOSED_SPEC009_AMENDMENT_U1B_v4.md` (revised draft; v3 untouched).

## Recommendation: **NOT READY — SPECIFICATION REPAIRS REQUIRED** (and three cross-spec confirmations; see §9)

## 1. Prioritized blockers

| # | Blocker | Evidence | Needed |
|---|---|---|---|
| **B1** | **v3 contradicts itself on ordering of proofs vs `ADMITTED`.** v3 §5 runs engine proofs and the deadline re-check (step 7) *before* the `PLANNED→ADMITTED` CAS (step 8), but its own matrix says a proof refusal is `ADMITTED→REFUSED`, and 012 does CAS first then proofs "from the status held" (`active-security-execution-contract.md:43`). | v3 §5 steps 7–8 vs §7 matrix row G | v4 fixes order: `PROCEED → ADMITTED → proofs → re-check → DISPATCHED` |
| **B2** | **v3 step 9(ii) permits an "inert Guest shell" before `RUNNING` while §6(c) forbids pre-`RUNNING` external resources.** A SPEC 011 Guest is an Execution-Plane resource. | v3 §5 step 9, §6 | v4: no external resource, credential or work order before `RUNNING` |
| **B3** | **SPEC 011 never states which 009 status provisioning, the EP credential and the F07 dispatch call run under.** Phase 4 provisions the Guest (`untrusted-execution-contract.md:143`, lifecycle table from `:133`); the supervisor "child" holds the EP mTLS credential (invariant 15, `:129`) and "calls `safetyCheckpoint` once at dispatch via IPC" (`011/spec.md:207`, `plan.md:211`); phase 1 lists "REFUSED/KILLED, no Guest". HEAD 009 runs F07 before fork. Under v3 the child exists only after F07 and gets nothing before `RUNNING`. **UNVERIFIED** whether 011 conforms; likely requires 011 wording changes (EP credential delivered after `RUNNING`; no second F07 call). | files cited | 011-owner confirmation |
| **B4** | **Lease timing claims in v3/matrix/R2 are wrong.** "Lease frees within 30 s" ignores the reclaim sweep: worst case ~90 s (30 s expiry + 60 s sweep, `008/research.md:95-96`). Renewal succeeds on an expired-but-unreclaimed lease because its predicate has no expiry test (`008/data-model.md:66-70`; `spec.md:264`). 012 4.10F case 2 repeats the 30 s claim. | cited | correct all text; "lease-lost" = zero-row renewal, not "expired" |
| **B5** | **Without the AR-19 release surface, finalization cannot release the lease atomically**, so a stale-but-live host can keep renewing a terminal unit's lease until its loop reads the terminal status (≤ 5 s after resuming) and a non-conforming host indefinitely; finalize and release are not one transaction (`runtime-finalization-contract.md` rules 2–3 require it; 008 `releaseLease` unspecified, `safety-checkpoint-contract.md:37`). | cited | state as AR-19-dependent; no atomicity claim |
| **B6** | **R-10 kill-switch rows can strand** (details §5); extends to a host that finalizes then crashes before `recordStopped`, not only host-less units. v3 loop acknowledges but never records `STOPPED`. | `kill-switch-contract.md:45-66`; v3 §5 step 6 | one question to the 008 owner (§8) |
| **B7** | **012 contradictions with the no-resume rule remain** (`spec.md:423` FR-201(c)(3) "neither terminal nor `RUNNING`"; FR-195 :416; E14 :43-44) and 012's lease/recovery wording (30 s). | cited | 012 follow-up list (v4 §11) |
| **B8** | **Start-gate guarantee unproven** (§3). | — | per-engine conformance + AR-22 |
| B9 | Claim enforcement is application-level; cross-transaction F07 calls are not atomic with claim checks. | §2 | AR-13/AR-19 stated limits |

## 2. Host-claim enforcement trace (task 1)

PG facts used: a single `UPDATE … WHERE …` is atomic per row; concurrent updates of the same row wait on the row lock and re-evaluate the predicate on the updated row only; subqueries against other tables use the statement snapshot; `now()` is the transaction start time (use `clock_timestamp()` for long transactions); a unique index admits one inserter; `SELECT … FOR SHARE` blocks a concurrent `UPDATE` of that row. All **PG**, not repo-verified.

| Operation | Validation | Atomic with write? | Class |
|---|---|---|---|
| `claimUnitHost` insert | unit row locked; unique `(unit, attempt)`; step-0 predicate evaluated in the same txn | yes (one txn) | **database-enforced** (uniqueness, row lock); *who may call it* is application-level; a bypassing worker is **AR-13** |
| Step-0 refusal without a claim | finalize must recompute the database predicate | only if `finalizeExecutionUnit` is changed to verify the reason (today it accepts a caller string, `runtime-finalization-contract.md:19`) | **conforming-worker rule** in 009; DB-enforced only by 012's `sec_refuse_unclaimed_unit` |
| Host status CAS (3 edges) and host refusals | single `UPDATE … WHERE id AND status = from AND EXISTS(claim with token hash and `hostInstanceId`)`; claim row is immutable so the subquery cannot go stale | yes | **database-enforced if the contract mandates this single-statement form** (v3 does not state the SQL shape) → **implementation-dependent**; token held by a non-conforming worker [X] |
| Lease-live predicate in the CAS | `EXISTS` on the F07 row | **no** — statement snapshot, no lock; the lease can be reclaimed/renewed between predicate and commit unless the txn holds `FOR SHARE` on the lease row | **implementation-dependent** (lock order unit → lease must be validated against 008's order — UNVERIFIED) |
| Host finalization | token + status CAS in the finalize txn | finalize + F07 release: **not specified** (AR-19) | status CAS database-enforced; release **AR-19** |
| F07 calls (admission, renewal, stop sub-check, `acknowledgeStop`, `recordStopped`) | claim validated before the call | **no** — separate transaction and tables; F07 takes only `executionId` and cannot check a claim | **conforming-worker rule**; atomicity needs AR-19/AR-13 |
| Loop reads (unit status, scan, deadline) | read-only | decisions after the read are non-atomic | bounded TOCTOU ≤ one loop interval |
| Child control: fork, kill, deliver work order, release start gate, arm hard stop | none in the database | n/a (process actions) | **conforming-worker rule**; gate ordering is host code |

**Pause → lose lease → resume → write.** Host pauses (VM freeze/GC) at any point after P1:
- Lease expires at +30 s; reclaim happens ≤ 60 s later (`research.md:95-96`). If the host resumes **before reclaim**, renewal succeeds (no expiry predicate) and the host continues as if nothing happened; the budget was never freed, so no over-admission. If it resumes **after reclaim**, renewal returns zero rows ⇒ stop (008 FR-006a).
- Its status CAS: still guarded by claim + status; with the proposed lease predicate it fails when the lease is reclaimed. If the sweep finalized the unit meanwhile, every CAS fails on the status.
- Its F07 call after the sweep finalized the unit (e.g. a `PLANNED` host paused between claim and F07) can create a lease for a terminal unit (F07 does not know unit status): the host's CAS then fails; it must release itself (needs AR-19) or the lease lingers until reclaim (≤ ~90 s).
- Its child-control actions have no database fencing at all.
**Conclusion: neither a claim token, a heartbeat, a status CAS nor a lease-live read gives complete fencing.** Fencing is the conjunction (unique claim, token-guarded single-statement CAS, locked lease predicate, terminal-status check in the loop, start gate, AR-19 release), and the conjunction is complete only for conforming workers.

## 3. Start gate and external resources (task 2)

Order under v3/v4: claim → F07 `PROCEED` → CAS `ADMITTED` → proofs → deadline re-check → CAS `DISPATCHED` → fork child (inert) → CAS `RUNNING` → deliver work order/credentials → arm parent hard stop → engine creates external resources (e.g. Guest) → … → finalize + release.

| Operation | 009 status in v4 | Where the source documents establish it |
|---|---|---|
| F07 admission, lease creation | `PLANNED` (transient) | 009 runtime step 3 (HEAD) |
| engine proofs (VAB/DAP) | `ADMITTED` | 012 E14 :43 |
| fork of the child/supervisor | `DISPATCHED` | 009 step 4 (HEAD) |
| work order / configuration / credentials | `RUNNING` | v4 rule; **011: UNVERIFIED** (EP mTLS credential held by the supervisor child, invariant 15; 011 never maps phases to 009 statuses) |
| parent-armed hard stop | armed after `RUNNING`, before any action | 009 step 5 |
| external resource creation (011 phase 4 provisioning, `ep-run-start` claim, presigned URL) | `RUNNING` | v4 rule; **011: UNVERIFIED** |
| broker credential lease (012) | `RUNNING` only | `credential-broker-contract.md:52`, FR-032 |
| finalization/lease release | terminal | 009 rules 2–3 |

**Crash windows — can an inert child or resource remain after `DISPATCHED → REFUSED`?**
- *Inert OS child, host dead:* yes, possible. Current contracts: HEAD arms the kill timer in the parent after `RUNNING`, so none exists pre-`RUNNING`; only 012 states "child exits on parent loss" (B2, `data-model.md` 4.10F). Generic 009/010/011 contracts do **not** require parent-loss exit or a start-gate timeout; v3/v4 add them as new requirements (**not yet in any contract**).
- *External resource (Guest):* none if provisioning is after `RUNNING` (v4 rule). If 011 provisions under `DISPATCHED` the sweep's immediate finalization skips teardown confirmation (U-1 `scan-deadline-contract.md:199` "nothing to terminate") and a Guest can remain until the EP dead-man (15 s without heartbeat) / hard TTL / reconciler (011 FR-052 — FACT, but EP and vendor are unbuilt/unresolved, AG1). **Required teardown confirmation**: `onUnitExpired` (011 registers it, `untrusted-execution-contract.md:201`) currently applies only to `RUNNING` units; the current contracts do **not** require it for `DISPATCHED`.
**The start gate is not proven.** It would be only if every safety-sensitive and resource-producing path is gated; the contracts cover 012 (child has no network path; credentials after `RUNNING`; requests via parent gate — FACT per 012) but do not establish it for 010 (browser contexts), 011 (supervisor/EP credential, provisioning) or E12 children. Required: per-engine conformance declaration + test, 011 confirmation, orphan cleanup (AR-22).

## 4. Lease/CAS races (task 3) — summary (full table in `U1B_RACE_CRASH_MATRIX_v2.md` §5)
| Guarantee | Basis |
|---|---|
| One status CAS winner per edge | PG row-lock semantics (**PG**) + single-statement form (**implementation-dependent** until the contract mandates it) |
| One claim per `(unit, attempt)` | PG unique index (**PG**) |
| Reclaim cannot race the lease-live check | only with `FOR SHARE` on the lease row; lock-order vs 008 **UNVERIFIED**; otherwise TOCTOU ≤ 30 s |
| Lease freed within X after crash | **~90 s worst case** (FACT `research.md:95-96`); not 30 s |
| Prompt release on finalization | **AR-19** |
| Stale-host renewals stop | host loop terminal-status read (≤ 5 s) for conforming hosts; DB-level stop = AR-19 release + AR-13 |
| Kill-switch vs host resume | stop is read by the loop/F07 call (≤ 5 s, 008 FR-013 for hosted units); host-less units: §5 |
| Concurrency over-admission after reclaim while a stale host still works | inherited 008 window (reclaim at expiry frees the slot while the old holder may still renew until it notices) — **UNPROVEN to be zero** |

## 5. Kill-switch `REQUESTED` trace (task 4)
Facts: one `KillSwitchState` row per `(scope, scopeId)` (`008/data-model.md:125-141`); admission step 1 refuses on `REQUESTED` or `ACKNOWLEDGED`, and unconditionally on `STOPPED` for `(EXECUTION, id)` (`safety-admission-contract.md` step 1; `kill-switch-contract.md:72-76`); `acknowledgeStop`/`recordStopped` are called by the execution's own checkpoint (`:45-56`); the 5 s escalation is the hosting process's (`:58-66`); a checkpoint `STOP` aborts the signal but calls no acknowledge (`safety-checkpoint-contract.md:32-36`); `expirePlanUnits` writes no F07 table (`scan-deadline-contract.md:173`); how a broad-scope row reaches `STOPPED` when several executions are in scope is not defined (**UNVERIFIED** — no aggregation rule found).

| Case | Outcome (INFERENCE from the facts) |
|---|---|
| Live host, stop before F07 | admission refuses `KILL_SWITCH_PENDING` → `REFUSED`; **no acknowledge** is made on the STOP path ⇒ row stays `REQUESTED` |
| Live host after F07 (`ADMITTED`/`DISPATCHED`) | loop sees the stop ≤ 5 s → `acknowledgeStop` → abort → kill child → finalize `REFUSED(KILL_SWITCH_PENDING)` → **`recordStopped` is required after the lease is released** (v3 omitted it); a crash between finalize and `recordStopped` leaves `ACKNOWLEDGED` with no owner |
| Host lost before F07 | unit `PLANNED`+claim until the sweep; row `REQUESTED` |
| Host lost after F07, before `RUNNING` | same, lease held until reclaim (≤ ~90 s) |
| Sweep-finalized unit | `REFUSED(KILL_SWITCH_PENDING)`; no acknowledge/record ⇒ row unchanged |
| Repeated admission attempts | each refused at step 1 (safe); audit volume per refusal **UNVERIFIED** |
| Broader scopes (GRANT/TARGET/TENANT/PLATFORM) | with no live in-scope execution able to acknowledge/record, the shared row can stay `REQUESTED` and block all admission in scope indefinitely; clearing path **UNVERIFIED** |
Effect on escalation: none is possible without a host; the risk is **availability/audit completeness**, not unsafe execution.

## 6. Cross-spec consistency (task 5)
| Item | Result |
|---|---|
| 012 FR-201(c)(3) claim of "neither terminal nor `RUNNING`" | **contradicts** no-resume (B7) |
| FR-195 "nothing when already `ADMITTED`/`DISPATCHED`", E14 :43-44 "skipped when already `DISPATCHED`" | contradict no-resume |
| `UnitDispatchRecord` as the generic claim | not 1:1: 012 authority is the authenticated DB principal (`hostInstanceId = principalId`, no bearer token), generic claim uses a token; mapping must say "claim token ≡ authenticated principal" for 012; 012 also keeps a redundant `IdempotentClaim{sec-unit-host}` |
| `REFUSED` semantics | consistent with 012 4.10B ("only status any refusal path writes"); 009 `runtime-finalization-contract.md:19` and `spec.md:385-388` need rewording |
| Guest provisioning order | B3 (UNVERIFIED) |
| 011 "REFUSED/KILLED, no Guest" in phase 1 | `KILLED` is valid only if phase 1 runs after `RUNNING`; consistent with v4 rule, **to be confirmed by 011** |
| AR-18 items 1–4 | closed by the amendment text if approved; item 5 (single finalization authority) open; item 6 = AR-19 open |
| 012 4.10F case 2 "no process exists" and "lease expires within 30 s" | both inaccurate (inert child possible; reclaim ≤ ~90 s) |
**Contradictions introduced by v3 itself:** B1, B2, B4 (30 s), missing `recordStopped` (B6), lease-lost defined by predicate failure while renewal can still succeed, claim "evaluates step 0 with `now()`" (transaction-start time; use the statement/clock timestamp).
**Status/cause combinations that cannot occur under the ordering** (INFERENCE): F07 `STOP` at admission or engine-guard refusal from `ADMITTED`/`DISPATCHED`/`RUNNING`; proof refusal from `PLANNED`; `KILLED`, `FAILED` or `COMPLETED` from any pre-`RUNNING` status; `RUNNING` without a successful claim; a second claim; `ADMITTED` without a lease having been granted; `DISPATCHED → RUNNING` for a unit whose gate was released earlier.

## 7. Guarantee classification (task 6.3)
| Guarantee | Class |
|---|---|
| Exactly one winner per status edge | PROVEN BY TEXT (single-statement CAS under PG semantics) — *only once the contract mandates the single-statement form*; today IMPLEMENTATION-DEPENDENT |
| At most one conforming host calls F07 per `(unit, attempt)` | CONDITIONAL ON CONFORMANCE (+ PG unique index) |
| No terminal unit re-dispatched | PROVEN BY TEXT (009 rule 4 + pickup-ignore) |
| Pre-`RUNNING` stop yields `REFUSED`, never `KILLED` | PROVEN BY TEXT |
| No lease held while `PLANNED` at rest | PROVEN BY TEXT (a lease can exist transiently between `PROCEED` and the CAS) |
| Plan deadline immutable and DB-clock enforced | PROVEN BY TEXT (U-1, unchanged) |
| Host-initiated writes fail after the unit is terminal | CONDITIONAL ON CONFORMANCE / IMPLEMENTATION-DEPENDENT (single-statement form) |
| Lease-renewal authority confined to the claim owner | CONDITIONAL ON CONFORMANCE; DB-level = AR-13 |
| Lease-live check atomic with the CAS | IMPLEMENTATION-DEPENDENT (`FOR SHARE`, lock order UNVERIFIED) |
| Prompt lease release on finalization | UNPROVEN — AR-19 |
| Concurrency freed ≤ ~90 s after a host crash | PROVEN BY TEXT (008 research) for crashed hosts; UNPROVEN for stale-but-live hosts |
| No safety-sensitive action before `RUNNING` | UNPROVEN (CONDITIONAL ON CONFORMANCE per engine; 011 UNVERIFIED) |
| Orphan inert child/resource cleanup | UNPROVEN — AR-22; EP dead-man (011) unbuilt |
| Stop acknowledgement for host-less units | UNPROVEN — open with 008 |
| Recovery faster than plan deadline + sweep interval | UNPROVEN — not claimed |
| Resistance to a compromised worker | UNPROVEN — AR-13 |

## 8. Smallest decisions required
**Owner (with the relevant spec owners):**
1. Adopt the rule "**no external resource, credential, work order or configuration before `RUNNING`**" for every non-passive engine (needs 011 and 010 owners to confirm or amend; 012 already compatible).
2. Accept the corrected recovery statements: concurrency slot freed ≤ ~90 s after a crash (not 30 s); status ends at plan deadline + sweep interval.
3. Approve the lease-predicate form: single-statement CAS with `EXISTS` on the claim, plus `FOR SHARE` on the unit's lease row (renewable = unreleased and unreclaimed), subject to the 008 lock-order check.
**SPEC 008 owner (one question, no policy chosen here):** "When a kill-switch stop is requested and no live execution hosts the affected unit — refused at admission, finalized pre-`RUNNING` by a sweep, host lost, or host finalized then crashed before `recordStopped` — who advances the `KillSwitchState` from `REQUESTED` to `ACKNOWLEDGED`/`STOPPED`, how does a broad-scope row with no live in-scope execution leave `REQUESTED`, and what is the aggregation rule when several executions share a row? (a) the finalizer may call `acknowledgeStop`/`recordStopped` by authority; (b) a reconciler advances rows with no live in-scope executions; (c) accepted and alerted."
**SPEC 011 owner:** confirm under which 009 status the supervisor child is created, when it receives the EP credential, when provisioning starts, and whether phase 1 calls F07 again.
**SPEC 012 owner:** confirm the claim mapping (principal ≡ token), FR-201(c)(3) → `PLANNED` only, and the wording corrections in v4 §11.

## 9. Verdict
Not ready for explicit approval: v3 has internal contradictions (B1, B2, B4, B6) that v4 corrects, and the amendment depends on three cross-spec confirmations (011 provisioning order, 008 stop-state ownership, 012 mapping) plus two guarantees that cannot be established by 009 text (start gate; recovery). After v4 is reviewed and those confirmations exist it could be presented for approval, with the unproven guarantees listed in §7 stated as limitations rather than claims.
