# SPEC 012 — Master Cross-Document Consistency Report

**SELF-REVIEW, NOT INDEPENDENT.** Date 2026-10-16. Obsolete text was corrected in the original normative paragraphs; no override paragraph was appended over an active obsolete instruction.

## 1. Reconciliations checked

| Pair | Result after this pass | Notes |
|---|---|---|
| FRs vs contracts | Consistent | FR-032 (roles), FR-037 (no `REFUSED` from `RUNNING`), FR-092 and FR-200 (identifiers), FR-125 (atomic cap), FR-173 and FR-201 (operation binding, write surface) match the broker, mutation, test-identity and active-security contracts. |
| Contracts vs data model | Consistent | `credentialBindings` in 4.3, `mutationOrdinal` in 4.8, `vault_*` and the refusal matrix in 4.10A and 4.10B, slot axes in 4.9L, `advisory.revoke` in 4.10. |
| Data model vs migration plan | Consistent | M012-4 gains `mutationOrdinal`; M012-1/M012-7 list the vault and `sec_*` functions; M012-5e unchanged; no new table. |
| Contracts vs tasks | Consistent | Every new normative test name is in T829 to T851; the traceability table (506 tasks, 201 FRs) regenerated with range expansion, 0 differences. |
| Tasks vs tests vs checklists | Consistent | New checklist items CHK038 to CHK041 (checked, each tied to tasks), CHK039 (requirements, open) and CHK034 (upstream, open); no checked item claims execution. |
| State machines vs authoritative 009 transitions | Consistent | Only 009 edges are used; pre-run refusal is `REFUSED`; `KILLED` only from `RUNNING`; broker denial is `RUNNING->COMPLETED`; dependents of a failed baseline are `BLOCKED`. `PLANNED->REFUSED` and `DISPATCHED->REFUSED` exist only in uncommitted 009 U-1 text (master-upstream-dependencies.md). |
| Signatures across documents | Consistent | `issueCredentialLease(executionUnitId, purpose, attempt, testIdentityId)` only; the other six broker operations are authorized by the same rule. |
| Reason-code registry vs contracts | Consistent | 83 codes, each in a contract; 0 unregistered tokens (prefix tokens excluded); no new `SEC_*` code (new details are `TENANT_QUOTA`, `FinalizeDenied(...)`, closed audit names). |
| Billing policy vs ADR-005 | Unchanged, consistent | Default `AREA_COUNT`; ADR-005 flat price for both active classes; active and authenticated work not purchasable; OD-3 states the P15 conflict openly. |
| Owner decisions vs defaults | Consistent | Every pending decision keeps its fail-closed default; OD-4 added with default Option B. |
| Activation gates vs implementation tasks | Consistent | SG1 names the 008 capability (4.10C, T835), SG3 and SG10 name FR-201 suites (T780 to T785, T816 to T817, T822 to T825, T829 to T830, T837 to T846) and the write-surface decision (T847, T848). |
| Plan FR mapping | Fixed | The context mapping now reaches FR-201. |
| Diagrams vs prose | Fixed | Lease only after `RUNNING` (D3); two-column mutation states (D8, 8.3); vault writes through `vault_*` functions (D2). |

## 2. Contradictions found and repaired in this pass

MA-04 (matrix omitted legitimate refusal reasons), MA-08, MA-09, MA-10, MA-11, MA-12, MA-13, MA-14, MA-15 (see `master-audit-findings.md`). Each was an obsolete statement beside a repaired normative paragraph; the original paragraph was edited.

## 3. Statements deliberately left in place

- Historical reports (`sixth-*`, `seventh-*`, earlier matrices) keep their original wording under a supersession notice.
- `contracts/mutation-cleanup-contract.md:61` still names `CLEANUP_PENDING` in a sentence that says the spelling is not used (a negative statement).
- `security-evidence-contract.md` and `security-finding-contract.md` were not changed.

## 4. Known remaining inconsistencies

None known that are repairable inside the approved architecture. Open items are owner decisions or upstream gates (see the two registers).


---

## Final-pass reconciliation (same session)

| Pair | Result |
|---|---|
| FR-201(a) worker grants vs 4.10A vs 4.10D vs registry contract | Consistent after rewriting the worker sentence of FR-201(a), the grant matrix, the registry consumer and safety paragraphs (the evaluator now runs as `fahes_sec_derive`; the worker hook enqueues ids only). |
| FR-195 step 1, E14 and E15 inputs vs `sec_peek_unit` and `sec_unit_context` | Aligned: no direct table read by the worker. |
| Evidence contract step 6 vs `sec_append_evidence` | Aligned: fence, claim and write are one function for 012 classes. |
| 008 integration vs frozen 008 | The frozen contract cannot provide the required surface; recorded as AR-19, not claimed. |
| 009 single-authority rule | One internal body with three entry points; reading not approved (AR-18 item 5). |
| Billing | Unchanged and unsolved (OD-3); `final-owner-approval-package.md` D1 carries both options. |
| Checklists vs tasks | Every new checked item names tasks; every open item is classed; no test is marked executed. |
| Diagrams | 19 of 19 parse with the real Mermaid parser. |


---

## Certification-repair reconciliation (IC-1 to IC-7)

FR-201(c) (claim check order), FR-173 (quarantine covers claims, CS1, `servedTenantIds`, residual (4)), FR-201(a) (the worker role is a provisioning template, not a runtime group), FR-201(k) and (l), data-model 4.9H, 4.10A to 4.10E, the audit vocabulary, the coverage contract (rendering rule 6), the registry contract (queue pointer), the secrets and broker contracts (hardening pointers), AR-21, plan.md (claim liveness), tasks T865 to T875 and CHK044 to CHK050 were reconciled. Stale statements corrected in place: the claim sentence of FR-201(c), the quarantine scope, and the "group role" wording.


---

## F1 to F7 reconciliation

FR-052, FR-201(k), (l), (m), data-model 4.9H, 4.9K, 4.10D (pre-claim, queue, claim liveness), 4.10E.1, 4.10E.2, 4.10F, the audit vocabulary, the registry and the E14 and E15 contracts, plan.md (claim liveness, SG3), tasks (T869, T870, T866, T868, T876 to T883), CHK048 and CHK051 to CHK057, AR-22 and the final documents were reconciled. Stale statements corrected in place: the claim-liveness bounds (IC-7), the uniform-denial SQLSTATE wording, the keyed-hash audit field, the worker enqueue hook and the per-principal enqueue cap. Earlier reports that say the worker hook enqueues ids are superseded by this entry.
