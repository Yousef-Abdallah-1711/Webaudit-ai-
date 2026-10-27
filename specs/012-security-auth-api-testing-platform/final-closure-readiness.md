# SPEC 012 — Final Closure Readiness

**SELF-REVIEW, NOT INDEPENDENT CERTIFICATION.** Date 2026-10-16. No code, migration, commit, push, deployment or freeze occurred; SPEC 012 is not frozen and no owner decision or upstream amendment is approved.

## 1. Baseline and final counts

| Check | Start of this pass | Final |
|---|---|---|
| FRs, contiguous and unique | 201 | 201 |
| Tasks, unique, linked (range-aware traceability, 0 differences) | 506 | **538** (Phase 24 T852 to T864, Phase 25 T865 to T875 and Phase 26 T876 to T883 added; T847 and T848 rewritten) |
| Reason codes | 83 | 83 (no new code; new details are closed denial strings) |
| Planned models | 20 | 20 (columns added: `WorkerPrincipal.servedTenantIds`, `MutationIntent.mutationOrdinal`) |
| Contracts | 19 | 19 |
| Mermaid blocks | 19 | 19, **parsed with the real Mermaid 10.9.1 parser: 0 failures** after fixing three syntax errors (semicolons inside labels) that earlier block counts could not see; syntax parsed, not rendered to images |
| Checklist items | 220 (195 checked, 25 open) | **237 (207 checked, 30 open); every open item carries a class label** |
| Master findings | MA-01 to MA-16 | MA-01 to MA-19, plus certification findings IC-1 to IC-7 and delta-review findings F1 to F7 (repaired, `final-certification-repair.md`) |

## 2. Upstream dependency classification (evidence-based)

| Dependency | Planning closure | Owner approval (freeze) | Before implementation | Before activation | Evidence |
|---|---|---|---|---|---|
| AR-8 SPEC 009 U-1 provenance | No | **Yes** | Yes (edges 012 uses) | Yes (SG1 equality test) | Committed HEAD lacks `PLANNED->REFUSED` and `DISPATCHED->REFUSED`; 10 files and `scan-deadline-contract.md` uncommitted |
| AR-9 SPEC 011 provenance | No | **Yes** | Only for 011-derived checks | Only for those checks | `specs/011-*` untracked |
| AR-13 database privilege isolation (FR-201, 4.10A, 4.10D) | No | Scheduling is OD-2 | **Yes** (needs the 007/008/009 owners) | **Yes** (SG3, SG10) | grants on 007/008/009-owned tables; worker functions replace direct DML |
| AR-15 F06 per-component pricing | No | Only with D1 Option 2 | No | **Yes** (before any active or authenticated purchase) | F06 is a future spec; ADR-005 flat pricing |
| AR-17 ADR-005 amendment | No | Only with D1 Option 2 | Only with Option 2 | Only before `CLASS_LEVEL` | ADR-005 names both active classes flat-priced |
| AR-18 items 1 to 4 (009 wording) | No | No | No | **Yes** (clarification, SG1) | 009 diagram, runtime steps, deadline matrix |
| AR-18 item 5 (009 single-authority rule) | No | No | **Yes** (before building the finalize functions) | Yes | `runtime-finalization-contract.md` rule 1 |
| AR-19 SPEC 008 transactional admission and release surface (supersedes AR-18 item 6 detail) | No | No | **Yes** (the wrappers cannot be built without it or the alternative) | **Yes** | 008 admission and checkpoint signatures take caller-supplied identifiers and `now`; `releaseLease` unspecified |
| AR-20 per-tenant job routing | No | Only with OD-4 Mode S | Only with Mode S | Only with Mode S | 009 per-class queues, payload `{executionUnitId}` |
| AR-21 non-012 class write confinement | No | No | No | No (recommended hardening) | 009/010/011 workers and legacy capabilities write unconfined |
| AR-22 hosting-failure backstop for E14 and E15 (absolute hard TTL, execution-plane dead-man switch, orphan reconciler; F1) | No | No | Only for the engine hosting wiring | **Yes** (E14 and E15 stay blocked) | 009 `scan-deadline-contract.md` rule 3 requires it; 012 cannot enforce a bound without it; SPEC 009 U-1 uncommitted (AR-8) |
| AR-12 no 009 attestation interface | No | No | No | Yes (CI status of T-U1-1..10) | AR-12 |

**Planning blockers: none.** Every row is an owner decision, an implementation dependency or an activation gate; none is marked complete or approved.

## 3. Open checklist items (30) and their class

| Item | Class |
|---|---|
| active-probe-safety CHK020, CHK021 | implementation task and activation gate (SG5, T650) |
| active-probe-safety CHK024 | owner decision (D4, P16) |
| auth-api-business CHK020 | upstream amendment dependency (011 typed `DEPENDENCY` payload) |
| evidence-coverage-honesty CHK021, CHK022; requirements CHK015, CHK019, CHK032, CHK037, CHK038, CHK039 | independent-certification gate (these earlier "re-review" items are now one gate, CHK039) |
| requirements CHK018 | owner decision (D6 and D7) |
| secrets CHK025, CHK026, CHK027, CHK033, CHK038, CHK043, CHK045, CHK049 | activation-only gates (KMS P11, external review, FR-201 deployment, calibration, confinement, hardening, pre-claim, evaluator-queue and claim-liveness suites) |
| secrets CHK052 | upstream amendment dependency (AR-22) and activation-only gate |
| secrets CHK057 | activation-only gate (F1 to F6 suites in the target deployment) |
| tenant-privacy CHK015, CHK016 | activation gate SG9 and owner and legal decision |
| upstream-integration CHK020, CHK021, CHK022 | owner decisions (D5) |
| upstream-integration CHK032 | upstream amendment dependency (AR-19) and activation gate SG1 |
| upstream-integration CHK034 | owner decision (D2) |

No open item is a planning defect: the genuine defects found in this pass were repaired, and no implementation or activation check was marked complete because a test was written.

## 4. Readiness statement

| Stage | Status |
|---|---|
| Technical planning | Complete in the sense that no known repairable planning defect remains and every unresolved item is classified. This is the author's view, not independent. |
| Independent certification | **Required** and not performed (CHK039). |
| Owner approval and freeze | Needs D5 (provenance) and D1, D2, D3, D4, D6, D7 decisions (`final-owner-approval-package.md`). |
| Implementation | Passive-first work can start after freeze; FR-201 functions need AR-13, AR-19 and the AR-18 item 5 reading. |
| Activation | Gated by SG1 to SG10; active and authenticated execution stay disabled, in particular until FR-201 is deployed and tested. |

## 5. Exact next actions

1. Independent reviewer: certify or fail the package against `master-independent-review-handoff.md`, including the new confinement design (4.10A, 4.10C, 4.10D).
2. Owner: decide D5 (commit or confirm 009 U-1 and SPEC 011), then D1, D2, D3, D4, D6 and D7; approve nothing implicitly.
3. 008, 009 owners: respond to AR-19 and AR-18 items 5 and 6.
4. After freeze: start the passive-first task phases; schedule AR-13 and AR-19 (D3).
