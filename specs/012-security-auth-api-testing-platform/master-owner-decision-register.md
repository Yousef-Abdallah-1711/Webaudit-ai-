# SPEC 012 — Master Owner Decision Register

**SELF-REVIEW, NOT INDEPENDENT.** Date 2026-10-16. **No decision in this register was approved, selected or inferred by the repair author.** Every pending item keeps its fail-closed default.

## 1. Approved by the owner (2026-10-11), unchanged

P1 (customer test accounts mandatory), P2 (stateful testing non-production, default OFF, per-class consent), P3 (MFA-exempt accounts or pre-established sessions), P7 (passive-first), P10 / AR-3 (web targets cover APIs, no 007 amendment), P13 (`DEGRADED` never a readiness PASS), P15 (charge only for executed billable work, principle only).

## 2. Pending (not approved); defaults preserved

| Decision | Default until approved |
|---|---|
| P4 offline advisory matching | provisional yes, offline snapshot only |
| P5 customer invariants | provisional yes, declarative only |
| P6 initial API types | OpenAPI 3.0/3.1 REST/JSON |
| P8 authenticated browser testing | no |
| P9 private-network targets | no |
| P12 credential lifetime and lease caps | 90 d max, 30 d default, lease at most min(unit time, 30 min) |
| P14 reverify billing and refund of customer-side `INCONCLUSIVE` | legacy `REVERIFY_COST` semantics |
| P16 Destination Authorization Policy | **refused for every destination** |
| P17 class-level billing | not approved; default `AREA_COUNT`; active and authenticated work not purchasable |
| P18 private-CA, plain-HTTP, non-default ports | unsupported |
| P11 KMS provider and broker hosting | **deferred** to credential-broker activation (SG3) |

## 3. Open decisions (OD)

| ID | Question | Options preserved | Default |
|---|---|---|---|
| OD-1 | `SecuritySettlement` retention period and anonymization | owner defines the period and whether the row is anonymized on account deletion | handled with the credit ledger, not purged by `tenant.purge_012` (relevant only under OD-3 Option 2) |
| OD-2 | Who schedules the AR-13 database privilege boundary with the 007/008/009 implementation owners | owner assigns owner and date | unscheduled; broker refuses issuance and active engines stay disabled |
| **OD-3** | P15 conflict: the default `AREA_COUNT` bills and refunds a partially covered passive SECURITY area as today (`DEGRADED` counts as delivered; `refundForUndelivered` is equal-share; both verified in code), which conflicts with the approved P15 principle. **Not solved.** | **Option 1**: a temporary, explicit, time-boxed P15 exception while retaining `AREA_COUNT`. **Option 2**: approve P17 class-level settlement **and** the ADR-005 amendment AR-17, plus the F06 price table (AR-15) and the SG1 implementation gates | `AREA_COUNT` unchanged; the conflict stays stated in FR-189 and plan OD-3 |
| OD-4 (new) | Worker write-surface confinement: the worker's evidence, finding, module-result, mutation-intent and non-host claim writes carry no row-level tenant or claim predicate (data-model 4.10A note, FR-173) | **Option A**: row-level policy keyed to the writer's `UnitDispatchRecord` plus a dedicated finalizer role for parent-derived kinds (cross-owner with 009, adds T847/T848). **Option B**: accept the residual with the SG10 external review and alerting | Option B, stated as a residual; neither selected |

## 4. Provenance decisions

| ID | Question | Status |
|---|---|---|
| AR-8 | Commit or confirm the 009 U-1 working-tree text (committed HEAD `e425773` lacks `PLANNED->REFUSED` and `DISPATCHED->REFUSED`) | open |
| AR-9 | Commit or confirm SPEC 011 (untracked) | open |

## 5. Upstream clarification requests recorded but not approved

AR-12 (no attestation interface), AR-13 (privilege boundary, REQUIRED FOR ACTIVATION), AR-15 (F06 pricing), AR-17 (ADR-005), AR-18 items 1 to 6 (including the 009 single-authority rule and the 008 transactional release capability). Recording them is not approval and not implementation.


---

## Final-pass update (same session)

OD-4 is restated: the confinement design is technical and needs no owner approval; the owner chooses the isolation **mode** (Mode S tenant-scoped principals with per-tenant routing, or Mode P shared pool with rule CS1). The earlier "accept the write-surface residual" default is withdrawn. The complete package (decision, current state, options, consequences, recommendation, approval required, what stays disabled) is `final-owner-approval-package.md` (D1 OD-3, D2 OD-4, D3 OD-2 with AR-19, D4 P16, D5 AR-8 and AR-9, D6 batch confirmation of P4, P5, P6, P8, P9, P12 and P18, D7 P14, D8 P11 deferred, D9 OD-1). Recommendations are the repair author's; **no decision was approved or selected.**
