# SPEC 012 — Final Security Boundary Design (MA-07 resolved at the design level)

**SELF-REVIEW, NOT INDEPENDENT CERTIFICATION.** Date 2026-10-16. Planning document: nothing here is implemented, migrated, deployed or tested. The normative text is `spec.md` FR-173 and FR-201(c), (j); `data-model.md` 4.9K, 4.10A to 4.10D; `upstream-amendment-requests.md` AR-13, AR-19 to AR-21. This document explains the design and states what it does **not** achieve.

## 1. Outcome for MA-07 and the findings it exposed

| Question | Answer |
|---|---|
| Is the earlier default (accept cross-tenant worker write authority) still the plan? | **No.** It is replaced by claim-scoped, database-enforced capabilities. |
| Does the worker still reach across tenants? | **Only through a claim.** In a shared pool a claim is not tenant-scoped, so a compromised principal can still claim, and then act on, any live unit of its served classes. Tenant isolation under worker compromise is claimed **only** for principals registered with `servedTenantIds` and routed to those tenants' jobs (Mode S). |
| Is a design decision needed from the owner? | Yes, one: the isolation mode (OD-4). Everything else in this document is a technical design. |
| New findings from this pass | MA-17 (workers could read every tenant's identities, fixtures, consent, declarations and unit configuration), MA-18 (worker EXECUTE on 008 admission took caller-supplied target, tenant, execution id and clock), MA-19 (three Mermaid syntax errors that earlier structural counts missed). |

## 2. Threat model

A compromised `fahes_worker_exec` login (per-instance). It holds a valid database session and mTLS identity, can call any function granted to it with arbitrary arguments, can read its own process memory (including leased secrets), and controls the engine parent and child. It cannot read the KEK, the MAC key, or other principals' sessions. Out of scope: compromise of the orchestrator, broker, evaluator service or API control plane (trusted components, reviewed under SG10).

## 3. Options evaluated

| Model | Binds writes to | Decision |
|---|---|---|
| A. Tenant-scoped write authority | tenant | Necessary for isolation, insufficient alone; offered as **Mode S** through `WorkerPrincipal.servedTenantIds`. Needs per-tenant job routing (AR-20, a 009 queue-topology and operations change). |
| B. Execution-unit-scoped authority | claimed unit | **Adopted.** |
| C. Claim-scoped database capabilities | live `UnitDispatchRecord` of the session principal | **Adopted** as the mechanism: every worker function derives context from the claim. |
| D. Dedicated privileged writer | validated immutable context | **Adopted for parent-derived records** (`fahes_sec_derive`, evaluator service). Not used on the per-request hot path. It is also the AR-13 alternative if the 007/008/009 owners reject SQL functions. |

## 4. The design in one page

1. **No direct DML or SELECT** for the worker role on evidence, artifacts, findings, module results, mutation intents, `sec-*` claims, progress, the 012 tenant tables, other tenants' unit, plan, scan, grant and scope rows, the kill-switch table and the lease and budget tables (4.10A).
2. **One context derivation** `sec_ctx` in every worker function: principal from `session_user`, non-revoked and non-quarantined; the live `UnitDispatchRecord` of the unit owned by that principal; class in `servedClasses`; tenant, plan, target and grants read from the unit and plan rows; allowed unit status; plan and scan live before the database-clock deadline; no pending kill switch; a live `AdmissionLease` where budget is consumed. No function takes a tenant, scan, plan, target, grant, status or record owner as an argument; every accepted identifier must be a member of the unit's MAC-covered configuration or manifest.
3. **Closed record types and edges** per function (evidence kinds a unit may produce, mutation edges, claim tuples), each in one transaction with fence first, claim second, write third, idempotent on keys the function builds.
4. **Parent-derived records** (check results, API surface, advisory matches, residual manifests, findings, module result, reverify state) only by `fahes_sec_derive` through `sec_derive_*`, deriving tenant and plan from the `ScanPlan` row and requiring producing units terminal; the worker hook is a registered no-op for 012 classes and only trusted components enqueue the plan-level job (F4). A trigger blocks worker updates of `ModuleResult(SECURITY)` after the `coverageComplete` marker.
5. **Claim-bound 008 wrappers** (4.10C): grant, tenant, unit, clock and idempotency key are derived, never supplied.
6. **Claim-spread rule CS1** and the optional `servedTenantIds` bound inside `sec_claim_unit_host`.

## 5. Lifecycle ownership (009 edges only; no status or edge added)

| Transition or event | Owner function | Callable by | Database guard | AdmissionLease | Crash or retry |
|---|---|---|---|---|---|
| `[*]` to `PLANNED`, `PLANNED` to `SKIPPED` | plan resolution | `fahes_api_planner` | at resolution | none | n/a |
| Claim (no status change) | `sec_claim_unit_host` | registered worker principal | class in `servedClasses`, tenant bound, CS1, not quarantined, plan and scan live, no earlier record for `(unit, attempt)` | none yet | claim never stale-reclaimed; second host denied and must not finalize |
| `PLANNED` to `ADMITTED` | `sec_transition_unit` | claim owner | live lease acquired by `sec_f07_checkpoint` `PROCEED` | held | host crash leaves the claim; sweep finishes |
| `ADMITTED` to `DISPATCHED`, `DISPATCHED` to `RUNNING` | `sec_transition_unit` | claim owner | status CAS | held, renewed by `sec_f07_liveness` at most every 5 s | sweep |
| `PLANNED` to `REFUSED` without a claim | `sec_refuse_unclaimed_unit` | registered principal of the class | unit `PLANNED`, no claim, no lease, one of four step-0 reasons whose predicate is true now | none | denial leaves `PLANNED` |
| `PLANNED`/`ADMITTED`/`DISPATCHED` to `REFUSED` with a claim | `sec_finalize_unit` | claim owner | closed reason matrix (4.10B), verified where a predicate exists | released inside the transaction | retry with the same key |
| `RUNNING` to `COMPLETED`/`FAILED`/`CANCELLED`/`KILLED` | `sec_finalize_unit` | claim owner | `RUNNING` edge only | released inside the transaction | after the SIGKILL deadline and termination confirmation, the sweep (crash matrix: data-model 4.10F) |
| Any non-terminal unit on deadline, scan end or kill switch | `sec_sweep_finalize_unit` | `fahes_orchestrator` only | cause derived from database state; no caller outcome or reason | released inside the transaction | idempotent |
| `PLANNED` to `BLOCKED` | step 5 of the finalize body | via any entry point | direct dependents, same plan and tenant, still `PLANNED` | n/a | inside the same transaction |
| Kill switch | predicate inside every function and `sec_stop_pending` | n/a | pending stop denies writes and admission; unit ends per the 009 matrix | released at finalize | n/a |

**Single terminal authority**: the three finalize entry points call one internal body that reproduces 009 `finalizeExecutionUnit` rules 1 to 5 (idempotency, lease release, guarded edge, snapshot, one-level `BLOCKED`) in one transaction. 009 rule 1 ("only code path") is therefore read as one logical authority with a database implementation; 009's own sweep must route 012 classes through the sweep entry point. This reading is **not approved** by 009 (AR-18 item 5).

## 6. SPEC 008 integration

`data-model.md` 4.10C is the concrete contract: input identifiers (derived, never supplied), authorization context (after `sec_ctx`, direct EXECUTE revoked), transaction ownership (the calling function; no autonomous transactions), fencing (`holderToken` for renewal, release by authority by `executionId`), idempotency (008 FR-007, counter correction), failure and rollback (whole transaction, lease expires in 30 s), sweep and recovery, and same-transaction audit. The frozen 008 contract does **not** provide this (its identifiers and clock are caller-supplied, `releaseLease` is unspecified, no unit-keyed release exists); the required amendment is AR-19, recorded and **not approved**. `AdmissionLease` already carries `executionId` and an index on it, so a unit-keyed release is feasible without a new column.

## 7. Compromised worker walkthrough

See the outcome table in `data-model.md` 4.10D. Summary: no write, squat or read outside a claimed unit; no forged check result, finding or module result; no cross-tenant admission; cross-tenant reach exists only through claims, bounded by CS1 in a shared pool and eliminated only in Mode S. The earlier broker findings (MA-01, MA-03) already bind every broker operation to the same claim.

## 8. What is not claimed

- Tenant isolation under worker compromise in a shared pool.
- Confinement of units of non-012 classes and the legacy SECURITY capabilities (AR-21), whose evidence feeds passive checks.
- Object-store confinement unless upload and download use grants or prefix-scoped credentials (T862, activation gate).
- Any measured threshold (CS1, R1 to R7 values are starting values for T523).
- Feasibility: the functions, the 008 surface and the evaluator service are unproven until implemented and tested; written tests are not executed tests.

## 9. Dependencies

AR-13 (privilege boundary, with the 007/008/009 owners), AR-19 (008 surface, required for activation), AR-20 (only for Mode S), AR-21 (recommended). Passive-first release (P7) can ship the evaluator service and `sec_derive_*` functions without AR-13; the REVOKEs that make them exclusive wait for AR-13.


## 10. Certification-finding additions (IC-1 to IC-7)

**SELF-REVIEW, NOT INDEPENDENT.** Normative text: `spec.md` FR-201(k), (l), FR-173 residual (4), FR-196(d), FR-188; `data-model.md` 4.10D and 4.10E.

- **Definer hardening (IC-1)**: twelve requirements in 4.10E: fixed trusted `search_path` with `pg_temp` last, qualified references, PUBLIC execute revoked, minimal role-specific grants checked by a catalog diff, NOLOGIN non-superuser NOBYPASSRLS owners per family, NOINHERIT worker logins that copy grants from a template role, no unsafe dynamic SQL, argument validation, no worker CREATE or TEMP, no escalation, closed error codes. Unproven until T865 and T866 run in the target deployment; if the managed database cannot offer the owner roles, FR-201 is not deployed and the AR-13 alternative applies.
- **Pre-claim boundary (IC-2)**: `sec_peek_unit`, `sec_claim_unit_host` and `sec_refuse_unclaimed_unit` derive the tenant from the unit row and apply principal, class and `servedTenantIds` checks first; a denial is indistinguishable from a nonexistent unit, mutates nothing, touches no F07 state and is audited only at platform scope. Timing equality is a tested bound, not a proof.
- **Evidence truthfulness (IC-3)**: claim-scoped access gives provenance, not truth. A compromised claimant can cause false findings and false `NO_ISSUE_DETECTED` for the units it claims. Captions are mandatory on every surface; SG10 must record the limitation.
- **Evaluator queue (IC-4)**: closed id-only schema, trusted producers only (workers cannot publish, F4), a single consumer identity, dedupe, a queue-depth cap, bounded retry and overflow audit, sweep decided by the database, database revalidation before every derived write; Redis carries a wake-up only.
- **Consistency (IC-5)**: one fixed claim check order in FR-201(c); quarantine denies issues and claims.
- **Legacy `Issue` writes (IC-6)**: 012 adds no control over legacy inserts after the marker (AR-21); late rows are counted and captioned at read time.
- **Claim liveness (IC-7, corrected by F1)**: no takeover exists or is invented. The parent is not the only enforcer, but the broker lease expiry, the child-side deadline and the SPEC 009 / SPEC 011 orphan reconciler are needed to bound a crashed parent, and the last two are an unapproved upstream dependency (AR-22) that blocks E14 and E15 activation; the status row ends only through an existing sweep cause (remaining plan deadline, 6 h ceiling, plus a sweep interval). Mitigation is alerts and the existing cancel path.


## 11. Delta-review additions (F1 to F7)

**SELF-REVIEW, NOT INDEPENDENT.** Normative text: `spec.md` FR-052, FR-201(k), (l), (m); `data-model.md` 4.9H, 4.9K, 4.10D, 4.10E.1, 4.10E.2, 4.10F; AR-22.

- **Parent crash (F1)**: three independent enforcers besides the parent: the broker lease expiry, a child-side absolute deadline and the execution-plane orphan reconciler. The reconciler and the absolute hard TTL belong to SPEC 009 and SPEC 011 and are unapproved (AR-22), so E14 and E15 activation is blocked. The seven-case matrix states only bounds that a non-parent component enforces; the status row still ends only through an existing sweep cause.
- **Denial semantics and audit (F2, F3)**: denials are returned results with one shape; the audit row is in the same transaction; emission is bounded by durable per-principal counters; no unit id, hash or tenant is written; probing quarantines only the offender. A caller that rolls back erases its own audit row and learns nothing (named limit).
- **Evaluator queue (F4)**: workers cannot publish; the orchestrator and the evaluator are the only producers; the cap that exists is per plan, and no per-principal cap is claimed.
- **Privileges and pooling (F5, F6)**: explicit CREATE and TEMP revocation verified on effective privilege; identity from `session_user` only; transaction pooling only with per-login pools; a shared-credential proxy is unsupported; fail closed.
