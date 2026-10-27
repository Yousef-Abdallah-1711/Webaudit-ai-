# SPEC 012 — Master Repair Matrix

**SELF-REVIEW, NOT INDEPENDENT.** Date 2026-10-16. Planning documents only; no application code, migration, commit, push, deployment or freeze occurred. No pending owner decision was approved and no upstream amendment was approved or implemented.

Counts after this pass: **201 FRs**, **506 tasks** (Phase 22 T829 to T836 from the seventh repair, Phase 23 T837 to T851 new), **83 reason codes** (unchanged), **20 planned tables** (unchanged; one column added to `MutationIntent`), 19 contracts, 19 diagrams, **220 checklist items** (195 checked, 25 open).

| ID | Repair performed (normative location) | Files | Tasks / tests | Checklist | Remaining |
|---|---|---|---|---|---|
| **MA-01** | Every worker-callable broker operation (issue, reserve, mark, resolve, release, status, confirm) is authorized in its own transaction against the claim owner (`UnitDispatchRecord` principal), unit status, identity membership in the verified binding and the lease or reservation row; failure is `SEC_BROKER_DENIED`, no state change, integrity denial (R4 class). Residual restated. | `credential-broker-contract.md` (invariant 12, consolidated item 12, failure table, FR trace); `spec.md` FR-173, FR-191, FR-201(f) | T837, T838; `broker.op-foreign-unit-denied`, `broker.reserve-foreign-identity-denied`, `broker.confirm-destroyed-foreign-lease-denied-no-state-change` and 10 more | CHK040 | none |
| **MA-02** | `RESPONSE_DERIVED` is a token slot only (`tokenClass` required, never a path position, never an identifier); `HOP_MATCHED` always carries a closed plan-known `values[]` (fixture identifiers or the originating step's own value) so a `Location` can select only among authorized identifiers | `spec.md` FR-092, FR-200(d)(e)(h); `data-model.md` 4.9L; `active-security-execution-contract.md`; `test-identity-contract.md` | T839, T840 | CHK038 | none |
| **MA-03** | `credentialBindings` list `[{testIdentityId, credentialReferenceId}]` with `credentialBindingRef` = SHA-256 of its canonical JSON (MAC-covered); identity set equals `identityRefs`; the broker resolves the reference only from the list and denies a requested identity outside it | `credential-broker-contract.md` steps 6 and 7; `spec.md` FR-032; `data-model.md` 4.3; `auth-workflow-execution-contract.md` | T837, T838 | CHK040 | none |
| **MA-04** | Tier-C reasons now include the complete F01/F07 passthrough sets and `SEC_ENVIRONMENT_COOLOFF`; the list is parity-checked against the contracts | `data-model.md` 4.10B | T845, T846 (with T830) | (CHK036) | none |
| **MA-05** | Owner, operator and API vault state changes go through six `vault_*` security-definer functions; API and operators have no direct write; operator row lists revoke, disable and revoke-all (dual control for tenant and KEK scope) | `data-model.md` 4.10A, 4.2, M012-7, P-12; `secrets-management-contract.md`; `plan.md` D2; `tasks.md` | T841, T842 | CHK041 | none |
| **MA-06** | `MutationIntent.mutationOrdinal` with unique `(scanPlanId, fixtureResourceId, mutationOrdinal)` and CHECK 1..3 makes the per-fixture cap atomic; `ABANDONED` keeps its ordinal | `data-model.md` 4.6, 4.8, I-13; `mutation-cleanup-contract.md`; `spec.md` FR-125 | T843, T844 | CHK039 | none |
| **MA-07** | Write-surface residual stated in FR-173, FR-201(a), the 4.10A note and AR-13; owner decision OD-4 recorded with two options and a conservative default (Option B, accepted residual with SG10 review) | `spec.md`; `data-model.md`; `plan.md` OD-4; `upstream-amendment-requests.md` AR-13 | T847, T848 (conditional) | CHK034 (open) | Owner decision OD-4 |
| MA-08 | FR-037 aligned with `RUNNING`-only issuance | `spec.md` | covered by T056/T814 | none | none |
| MA-09 | `readOnlyDeclared` replaced by `ApiOperationDeclaration` | `spec.md`, scope and api-security-check contracts | none | none | none |
| MA-10 | One write-ahead order (PROCEED, INTENDED, SENT, send) in data-model 4.8, 8.3 and FR-190 | `data-model.md`, `spec.md` | T845 | CHK039 | none |
| MA-11 | Mutation diagrams use `PENDING` (a `cleanupState`) instead of the single-column spelling | `plan.md` D8, `data-model.md` 8.3 | none | none | none |
| MA-12 | Teardown proof is the parent-observed exit only | `auth-session-contract.md` | T794 (existing) | none | none |
| MA-13 | FR-032 lists roles; stale open item closed | `spec.md`, broker contract | none | none | none |
| MA-14 | `identity.no-enumeration` text no longer allows a response-derived id | `test-identity-contract.md` | T839 | none | none |
| MA-15 | Stale statements corrected: E15 refusal sentence, plan D3, plan FR mapping to FR-201, reference states, lease wording, spec header status, vault "insert-only" mentions | several | none | none | none |
| MA-16 | Revoked advisory snapshot: affected findings annotated at read time, never auto-resolved; `advisory.revoke` audit lists the count | `advisory-matching-contract.md`, `data-model.md` audit vocabulary | T850, T851 | none | none |

Also done: `traceability` table regenerated with the range-aware validator (506 tasks, 0 differences); supersession notices added to the seventh pass documents; the seventh pass remains valid except as amended above.

Files changed this pass (all under `specs/012-security-auth-api-testing-platform/`; existing files keep CRLF): `spec.md`, `plan.md`, `data-model.md`, `tasks.md`, `upstream-amendment-requests.md`, `contracts/credential-broker-contract.md`, `auth-session-contract.md`, `auth-workflow-execution-contract.md`, `active-security-execution-contract.md`, `mutation-cleanup-contract.md`, `secrets-management-contract.md`, `test-identity-contract.md`, `security-scope-contract.md`, `api-security-check-contract.md`, `advisory-matching-contract.md`, the four checklists `active-probe-safety.md`, `secrets-session-isolation.md`, `requirements-completeness.md`, `upstream-integration.md`; new: the seven `master-*.md` documents; notices in `seventh-repair-matrix.md` and `seventh-review-handoff.md`.


---

## Final-pass repairs (same session)

Counts: **201 FRs, 519 tasks** (Phase 24 T852 to T864; T847 and T848 rewritten for OD-4), 83 reason codes, 20 models, 19 contracts, 19 diagrams (all parse), **223 checklist items (197 checked, 26 open, each classified)**.

| ID | Repair | Files | Tasks | Remaining |
|---|---|---|---|---|
| MA-07 (revised) | Claim-scoped worker functions, `fahes_sec_derive`, `ModuleResult` trigger, CS1, `servedTenantIds`, evaluator service; replaces the accepted-residual default | `spec.md` FR-173, FR-201(a)(b)(i)(j); `data-model.md` 4.9H, 4.9K, 4.10A, 4.10D; `plan.md` OD-4 and SG3; `upstream-amendment-requests.md` AR-13, AR-20, AR-21; registry contract | T852, T853, T856 to T859, T862, T863, T847, T848 | Owner chooses Mode S or P (OD-4); shared-pool claim reach is a stated residual |
| MA-17 | Worker read confinement | `data-model.md` 4.10A, 4.10D; `spec.md` FR-201(j), FR-195 step 1; active-security, auth-workflow contracts | T854, T855 | none |
| MA-18 | Claim-bound 008 wrappers and the full 008 integration contract; AR-19 | `data-model.md` 4.10C; `upstream-amendment-requests.md` AR-19 | T860, T861 | 008 owner (AR-19) |
| MA-19 | Three Mermaid label errors fixed; real parser validation | `plan.md`, `data-model.md` | validation only | none |
| Classification | All 26 open checklist items labelled (owner decision, upstream dependency, implementation, activation gate, independent-certification gate); stale review items consolidated under CHK039; new CHK042, CHK043, CHK035 | `checklists/*` | none | see `final-closure-readiness.md` |
| Purge | `tenant.purge_012` removes the tenant id from `WorkerPrincipal.servedTenantIds` | `spec.md` FR-167, `data-model.md` 4.9K | T798 scope | none |

New documents: `final-security-boundary-design.md`, `final-owner-approval-package.md`, `final-closure-readiness.md`.
