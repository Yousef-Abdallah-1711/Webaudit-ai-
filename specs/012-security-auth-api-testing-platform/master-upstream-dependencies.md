# SPEC 012 — Master Upstream Dependency Register

**SELF-REVIEW, NOT INDEPENDENT.** Date 2026-10-16. Repository HEAD `e425773`. No frozen document was edited. No item below is approved or implemented by this register. Classification keys: **PB** planning blocker, **OC** owner closure decision, **AO** activation-only gate, **ID** implementation dependency.

| Dependency | Status verified now | Classification | What 012 does meanwhile |
|---|---|---|---|
| SPEC 009 U-1 text (deadlines, `PLANNED->REFUSED`, `DISPATCHED->REFUSED`) | Working-tree only: 10 files modified (169 insertions, 4 deletions) and `scan-deadline-contract.md` untracked; committed HEAD has only `ADMITTED->REFUSED` | OC (AR-8: commit or confirm before freeze) and AO (SG1 transition-policy equality) | Plans against the working-tree text; the dependency is recorded, not hidden (research R0). Not a planning blocker. |
| SPEC 011 | Entire `specs/011-source-backend-database-testing-platform/` untracked | OC (AR-9) | Read-only consumption; `source-*` inputs `NOT_TESTED` if absent. |
| 009 lifecycle edges used by 012 | All exist in the 009 diagram or status-by-cause matrix (working tree) | AO (SG1 equality test T814, `ExecutionUnitTransitionPolicy`) | 012 adds no status and no edge. |
| 009 single terminal-finalization authority (`runtime-finalization-contract.md` rule 1) vs `sec_finalize_unit`, `sec_refuse_unclaimed_unit`, `sec_sweep_finalize_unit` | Rule 1 says `finalizeExecutionUnit` "MUST be the only code path" to a terminal status | AO; clarification request AR-18 item 5, **not approved** | One internal body reproduces rules 1 to 5; 009's own sweep must route 012 classes through the sweep entry point. |
| 008 transactional, unit-keyed, holder-token-free lease release (data-model 4.10C) | 008 names `releaseLease` as a companion operation without signature, transaction contract or unit-keyed variant; its operations are application-level | AO (SG1, CHK032, T835); AR-18 item 6, **not approved** | 012 refuses to release a lease outside the finalizing transaction; without the capability (or the AR-13 alternative) FR-201 cannot be deployed. |
| 008 admission operations as SQL-callable surface for the worker role | Not defined by 008 | AO and ID (AR-13) | Same gate as above. |
| AR-13 database role isolation (FR-201) | Required for activation of the broker and every active/authenticated engine | AO and OC (OD-2 scheduling) | Broker refuses issuance and the engines stay disabled until deployed and tested (SG3, SG10). |
| Worker write-surface confinement | Table-level grants only (OD-4) | OC | Accepted residual (Option B default), stated in FR-173. |
| AR-15 F06 per-component pricing and refund for unexecuted work | Not defined (F06 is a future spec) | AO (SG1 purchase gate) | Active and authenticated work is not purchasable; default `AREA_COUNT` unchanged. |
| AR-17 006 ADR-005 amendment | ADR-005 (verified in `006-scan-architecture-v2/decisions.md`) says `ACTIVE_SECURITY` and `AUTHENTICATED_WORKFLOW` stay flat-priced | OC and AO (needed before `CLASS_LEVEL`; in practice before any active purchase, since P15 for active work needs class-level pricing) | No 006 edit; OD-3 states both options. |
| AR-18 items 1 to 4 (009 `ADMITTED`/`DISPATCHED`/pre-run `KILLED`/`REFUSED` wording) | Recorded | AO (clarification) | 012 reads the pickup status and uses only existing edges. |
| AR-12 no 009 attestation interface | Recorded | AO (CI status of T-U1-1..10 and the T-U1-10 suite) | SG1 and T380 use CI status. |
| AR-10, AR-14, AR-1 | Recorded (RECOMMENDED or OPTIONAL) | none required | Local mitigations in place. |
| Existing code: `packages/config/src/refund.ts`, `packages/types/src/domain.ts` (`MODULE_STATES_SCORED = COMPLETE, DEGRADED`), `apps/api/prisma/schema.prisma` (`ScanState`, `Severity.INFO`) | Verified | none | Cited facts match. |
| Other 007/008/010 contracts | No diff in the working tree | none | Consumed unchanged. |
| SpecKit Analyze | Not run: `.specify/feature.json` points at `specs/011-source-backend-database-testing-platform` and the skill's prerequisite step persists that file | AO (run after the file can be repointed deliberately) | Mechanical validators in `master-validation-results.md` stand in and are not official Analyze. |

Planning blockers (PB): none. Every item above is an owner closure decision, an activation-only gate or an implementation dependency; none was labelled complete.


---

## Final-pass classification (same session)

The four-way classification (planning closure, owner approval, before implementation, before activation) with evidence for every row, including the new AR-19 (008 transactional admission and release surface), AR-20 (per-tenant job routing, Mode S only) and AR-21 (non-012 class write confinement), is in `final-closure-readiness.md` section 2. **No dependency is required for planning closure; none is marked approved or complete.** AR-19 supersedes the detail of AR-18 item 6; the frozen 008 contract was read again and its caller-supplied identifiers and clock, and the unspecified `releaseLease`, are the evidence.


---

## Certification-repair note (IC-7)

Faster recovery of an orphaned claim would need a new cause in 009's status-by-cause matrix. It is **not requested**, nothing in 012 depends on it, and 012 invents no takeover or retry. Worst-case delays are documented in `data-model.md` 4.10D. AR-21 now also records the legacy `Issue` write exposure after the coverage marker (IC-6).


---

## F1 note (AR-22)

AR-22 (absolute hard TTL, execution-plane dead-man switch and orphan reconciler for E14 and E15) is **REQUIRED FOR ACTIVATION** and **not approved**; it restates a 009 obligation (`scan-deadline-contract.md` rule 3) and edits no frozen file. 012 plans the child-side deadline and broker lease expiry, claims no bound it cannot enforce, and requests no takeover, retry or new 009 status cause.
