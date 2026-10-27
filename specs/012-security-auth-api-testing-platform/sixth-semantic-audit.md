# SPEC 012 — Sixth Pass: Semantic Contradiction Audit

> **Superseded in part by `seventh-repair-matrix.md` (2026-10-16)**: counts are now 491 tasks (Phase 22), 214 checklist items (191 checked, 23 open) and AR-18 lists six items; finalization has one internal body with three entry points (`sec_finalize_unit` for the claim owner only, `sec_refuse_unclaimed_unit`, the orchestrator-only `sec_sweep_finalize_unit`); R7 is a tenant quota; the broker signature is `issueCredentialLease(executionUnitId, purpose, attempt, testIdentityId)`. Statements below that conflict with the seventh matrix are historical.

**SELF-REVIEW, NOT INDEPENDENT.** Written by the repair author after the repairs. It is evidence for the next independent reviewer, not certification. A planned test that is named here has **not** been executed.

**Method**: all 19 contracts were read in full in this session (every body, not only the consolidated sections); the changed parts of `spec.md` (FR-032, 059, 081, 173, 195, 199, 200, 201), `plan.md` (§18, SG1, OD register, D8, D12), `data-model.md` (4.8, 4.9H–4.9L, 4.10A, M012 table), `tasks.md` (Phases 19–21, dependencies, traceability), `upstream-amendment-requests.md` and the checklists were re-read; the frozen 009 lifecycle diagram, `execution-runtime-contract.md`, `runtime-finalization-contract.md`, `scan-deadline-contract.md`, `execution-unit-contract.md` and 006 ADR-005 were re-read; semantic greps were run over every normative file.

## 1. Contradictions found and repaired

| # | Contradiction | Where | Repair |
|---|---|---|---|
| 1 | `REDIRECT_LOCATION` slot versus planned-hop model | contract item 11, T756 | removed; FR-200(e) only |
| 2 | Child decides redirects (FR-199) versus parent-only (FR-200e) | spec FR-199 | reworded |
| 3 | "in-scope hops re-checked" versus "planned hops only" | FR-081, FR-070, security-scope, api-security-check 13, mutation-cleanup 6, active-security 7/79/194, probe-family (2), authorization (1), auth-workflow (1), plan limits, CHK020, T025 | all say planned same-origin hops |
| 4 | Charset-only path slot versus "can never introduce an unplanned request" | FR-200(d)(e) | closed shapes, operation identity |
| 5 | Pre-run `KILLED` | FR-195(4), FR-201(d), FR-059, active-security 4/13/130/166, E15 failure table, plan §18 | `REFUSED` before `RUNNING` |
| 6 | Pre-run refusal as bare CAS versus 009 finalize | FR-195, FR-201(c), contracts | `sec_finalize_unit` |
| 7 | `PLANNED->ADMITTED` unowned | FR-201(d) | owner and guard named |
| 8 | Broker `DISPATCHED` or `RUNNING` | broker 2, 136, FR-032, T056 | `RUNNING` only |
| 9 | E15 requested leases before fork (before `RUNNING`) and refused the unit on broker failure | E15 dispatch 2–3 and failure rows, broker row, auth-session row, E14 row | leases after `RUNNING`; `COMPLETED` with `BLOCKED` checks |
| 10 | Broker `requesterIdentity` argument and "queue class" authentication versus authenticated principals | broker Inputs | argument removed; registry `servedClasses` |
| 11 | "per-class queues bound claims" versus no database enforcement | FR-173, broker item 7 | class check in `sec_claim_unit_host`, residual restated |
| 12 | R1–R6 where R7 exists; undefined "consecutive breached windows"; R6 without a sample floor; "about twice the legitimate maximum" | FR-173, 4.9H, T536/T537, research J, AR table, CHK029 | R1–R7, durable streak, floor, unmeasured-values statement |
| 13 | `P13 PROVISIONAL` after approval | research L1 | OWNER-APPROVED |
| 14 | AR-13 role list omitted `fahes_orchestrator`, referred to a deny-list | AR doc | positive-grant description |
| 15 | Mutation state machine (single column with `REVERTED`/`RESIDUAL`) versus `state` + `cleanupState` | mutation-cleanup, business-logic, authorization-testing, security-evidence, T300, data-model I-11 (`NOT_APPLICABLE`) | one two-column vocabulary |
| 16 | `api-security-check` invariant 3 and inputs (`readOnlyDeclared`, GET exempt) versus `ApiOperationDeclaration` and "undeclared = mutating for every method" | api-security-check | body aligned |
| 17 | Registry "none REQUIRED" versus AR-13 / AR-18 | registry item 5 | corrected |
| 18 | Refused reverify plan "Issue UNVERIFIABLE" versus "Issue unchanged" | reverify failure rows | aligned to Consolidated item 2 |
| 19 | "75 codes", "AR-3 pending", header "FR-161..FR-199" (19 files), tasks dependency item 5 | advisory, discovery, all contracts, tasks | corrected |
| 20 | "Open for closure" items already decided in the same file's consolidated section | api-security-check, auth-session, auth-workflow, authorization-testing, mutation-cleanup, probe-family, secrets, registry, reverify, scope, test-identity, active-security | closed or trimmed; remaining items are genuine owner questions |

## 2. Area-by-area results

| Area | Result |
|---|---|
| Requirements versus contracts | FR-032/059/081/173/195/199/200/201 agree with the active-security, E15, broker, secrets, scope, evidence and registry contracts after the repairs |
| Contracts versus data model | `servedClasses`, breach counters, `operationRef`, `shape`, `TEST_ROLE` kind, per-kind columns, function list and grant matrix are in 4.9H/4.9K/4.9L/4.10A/M012-7 |
| Contracts versus tasks | every new normative test name is in a task (T810, T812, T814, T820–T827); T536/T537/T731/T756/T761/T781/T815–T817 updated |
| Tasks versus checklists | CHK033–CHK038 and CHK031/CHK032 point to T820–T827 / SG1 / SG3; open items are labelled |
| Status transitions | only edges of the 009 diagram or matrix are used (`PLANNED->ADMITTED`, `ADMITTED->DISPATCHED`, `DISPATCHED->RUNNING`, `PLANNED|ADMITTED|DISPATCHED->REFUSED`, `RUNNING->COMPLETED|FAILED|CANCELLED|KILLED`); `KILLED` only from `RUNNING` |
| Dispatch and checkpoint order | claim, inputs, checkpoint, `ADMITTED`, VAB/DAP, `DISPATCHED`, fork, `RUNNING`, broker lease; a `DISPATCHED` pickup status is handled |
| Broker issue conditions | `RUNNING` only; dispatch facts; principal from the connection; R1–R7 under the fixed lock order |
| Redirect and request authority | one model (FR-200); no document allows a child-chosen or unplanned redirect |
| Signed inputs | manifest kinds, columns and `rootDigest` consistent across FR-200, FR-173, 4.9L, api-security-check, broker item 7, T810/T811/T826/T827 |
| F01/F07 rules | unchanged; refusal after `PROCEED` now releases the F07 lease through finalize |
| Tenant and credential isolation | unchanged; class scoping added; the claim is stated as not tenant-scoped |
| Billing and readiness | `AREA_COUNT` default unchanged; OD-3 states the P15 conflict; coverage gate unchanged |
| Retention and deletion | no new tenant data (`WorkerPrincipal` and breach counters hold no tenant data); purge list unchanged |
| AR-1 … AR-18 | all 18 present in the summary table; AR-13, AR-17, AR-18 classifications consistent between table, body and overall statement |
| Owner decisions | none approved or selected |

## 3. Known remaining items (not contradictions)

Genuine "Open for closure" owner or upstream questions remain in advisory-matching (5), api-discovery (3), business-logic (4), credential-broker (1), security-coverage (2), security-evidence (3), security-finding (4), probe-family (1), security-reverify (4) and active-security (2); they are owner or closure items, none claims a decision. `test-identity-contract` Outputs keep the documented aliases (`label`, `privilegeRankHint`, `roleId`, `ownerIdentityId`) next to the data-model names, as its Consolidated item 1 states.

## 4. Mechanical validation (reproduced by `validate.py`, a scratch script outside the repository; it is not official SpecKit Analyze)

| Check | Result |
|---|---|
| FRs | 201 unique, contiguous 1–201 |
| Tasks | 483 unique ids; 0 FRs without a task; 0 tasks without an FR |
| Traceability table | 201 rows regenerated from the task lines; 0 mismatches; 0 dangling task ids; every `T…` reference in task bodies has a row |
| Reason codes | 83 registered; every one appears in a contract; 0 unregistered tokens (prefix patterns such as `SEC_BUDGET_` excluded; T013 must tolerate them) |
| Prisma models | 20 |
| Migration ids | M012-0 (prerequisite), 1, 2, 3, 4, 5, 5b, 5c, 5d, 5e, 6, 7; no duplicate; exactly one M012-7 row |
| Diagrams | 19 mermaid blocks, 0 structural problems (type keyword and bracket balance only; not rendered) |
| Checklists | 8 files, 209 items (187 checked, 22 open, each open item labelled), no duplicate ids per file |
| AR coverage | AR-1 … AR-18 all in the summary table |

**SpecKit Analyze was not run**: `.specify/feature.json` points at SPEC 011 and the skill's prerequisite call persists that file; editing it would modify unrelated repository state. No planned test case has been executed or claimed as passing.

## 5. Semantic greps over normative files (all empty except intended negative statements)

`REDIRECT_LOCATION` (only "there is no such slot" statements and the CHK036/T820 negative checks), `sec_sweep_transition_unit`, `R1-R6`, `P13 PROVISIONAL`, `DISPATCHED or RUNNING`, `75 codes`, `FR-161..FR-199`, `QUEUED`, `inputEvidenceDigests`, `claim_unit_for_dispatch`, `NOT_APPLICABLE` as a cleanup state, `in-scope hops`.

## 6. Git state

`git status --short` lists the same 34 entries as at the start of the session (24 modified, 10 untracked); `git diff --stat -- specs/009-core-scan-execution-platform` is still 10 files, 169 insertions, 4 deletions (the pre-existing U-1 edits); `git diff --stat` over 006, 007, 008, 010, 011 is empty; no commit, push, migration or deployment was made.
