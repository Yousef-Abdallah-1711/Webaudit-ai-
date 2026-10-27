# Owner Decisions Required — Phase 1

**Nothing in this file is approved.** No approval is invented: where repository evidence already records an owner approval it is cited as such; every other item is open. Each question can be answered by filling the `Answer:` line (or replying with the question id and option). Until answered, the fail-closed default named in the question stays in force.

Already-approved items (DOC, 2026-10-11, `012/master-owner-decision-register.md` §1; **not independently corroborated outside 012 documents**): P1, P2, P3, P7, P10/AR-3, P13, P15 (principle only). They are not re-asked.

Priority legend: **1** blocks starting any implementation · **2** blocks 008/009 design · **3** blocks 012 freeze or activation.

---

## Q1 (priority 1) — Status of SPEC 006 and the meaning of "frozen"

**Facts**: `006/spec.md:7` says `Draft`. 008/010 call 006 "frozen" (`008/spec.md:25`, `010/spec.md:46,807`). 006 `decisions.md` records ADR-004…007 "Decided (product-confirmed 2026-10-07)", ADR-008 "Decided and implemented"; constitution v1.2.0 was amended 2026-10-07 to add principles VIII–XIV. No document records an owner act freezing the 006 *spec*.
**Question**: Which statements are true for SPEC 006? (a) ADRs decided; (b) master spec approved by the owner (date?); (c) contract frozen for downstream specs; (d) none beyond (a).
**Candidate header wording (if you choose (a)+(c))**: "Planning status: complete. Authority: ADR-001…009 decided and product-confirmed 2026-10-07; constitution v1.2.0. Contract freeze: FROZEN for downstream specs as of <date you state>. Implementation: none. Activation: n/a."
**Consequence**: until answered, audits and agents must write "006: Draft header; ADRs decided" and not "frozen".
**Evidence to consider**: `006/decisions.md` §ADR status lines; `.specify/memory/constitution.md` sync-impact report.
Answer: ____

## Q2 (priority 1) — U-1 pickup/dispatch ordering (SPEC 009)

Options A, B, C in `U1_PICKUP_ORDERING_OPTIONS.md`.
**Question**: Which sequence is intended? Sub-questions: (i) F07 admission before or after queue creation? (ii) lease held during queue wait? (iii) is `DISPATCHED→REFUSED` required? (iv) recorded as a 009 amendment with its own approval?
**Consequence**: affects 009 contracts, U-1 text, 011 AG2, 012 FR-195/SG1/T814 wording and the 009 task list. Until answered, do not commit U-1 or write 009 implementation tasks.
Answer: ____

## Q3 (priority 1) — Provenance of U-1 and SPEC 011/012 (AR-8, AR-9)

**Facts**: U-1 is in the working tree only (10 modified files +169/−4, plus untracked `scan-deadline-contract.md`); HEAD lacks `PLANNED→REFUSED`/`DISPATCHED→REFUSED`. 011 (37 files) and 012 (64 files) are untracked. `showcase-*` directories and `apps/web` edits are unrelated and must not be staged with them.
**Question**: (a) Commit U-1 as its own docs-only change set — before or after Q2 is decided? (b) Commit 011 afterward? (c) Commit 012 now (unfrozen) or only after freeze? (d) Who executes the commits (this project's convention: Claude commits after review)?
**Consequence**: until answered nothing is committed; the specs exist only on this disk.
Answer: ____

## Q4 (priority 3) — OD-3: billing for partially covered work (P15 vs ADR-005 vs current behaviour)

**Exact conflict (VERIFIED where marked)**
- *Approved principle P15 (DOC)*: a customer is charged only for billable work actually executed; checks that end `BLOCKED`, `NOT_TESTED`, `UNSUPPORTED` or refused are never billed (`012/spec.md:410` FR-189).
- *ADR-005 (DOC, `006/decisions.md:63-76`)*: only `LOAD_CAPACITY` and `SOURCE_EXECUTION` are metered; every other class, including `ACTIVE_SECURITY` and `AUTHENTICATED_WORKFLOW`, is flat-priced per domain.
- *Current code (VERIFIED)*: a scan is charged up front per area (`AREA_COST`, `packages/config/src/pricing.ts:13`); `MODULE_STATES_SCORED = ['COMPLETE','DEGRADED']` (`packages/types/src/domain.ts:84`), so a `DEGRADED` area counts as delivered (`timeout.ts: isDelivered`); `refundForUndelivered` refunds `floor(charged × undelivered ÷ requested)` by area **count** (equal share), full refund only if nothing delivered (`packages/config/src/refund.ts:15-25`).
- *012 default (DOC)*: `x012.settlementMode = AREA_COUNT` = today's behaviour; P15's principle therefore is **not** applied to a partially covered passive SECURITY area.
- *Semantic caution (VERIFIED)*: legacy `DEGRADED` means "missing interpretation, not measurement" (`packages/scoring/src/aggregate.ts:19-21`); 012 also uses it for partial coverage with `coverageComplete:false`. Equating the two would change what customers are charged.

**Documented options (not chosen)**
| | Option 1 | Option 2 |
|---|---|---|
| What | A temporary, explicit, time-boxed exception to P15 while keeping `AREA_COUNT` | Approve P17 class-level settlement **and** ADR-005 amendment AR-17, the F06 price table (AR-15), and implementation gates (SG1) |
| Specs affected | 012 FR-189/plan OD-3 (time box, owner, expiry date) | 006 ADR-005; 012 FR-189/198, data-model `SecuritySettlement`; F06 (not yet specified); 009 evidence/coverage consumption |
| Code areas affected if later implemented | none now | `apps/api/src/services/intake/create-scan.ts`, `packages/config/src/{pricing,refund}.ts`, `apps/api/src/services/credits/refund.ts`, `apps/worker/src/orchestrator/{terminal-refund,timeout}.ts`, `apps/api/src/routes/scans.routes.ts`, `apps/api/src/services/admin/margin.service.ts`, scoring/readiness consumers (FR-186), new settlement table |
| Customer effect | Partially covered security area still billed/refunded as today | Billing follows executed work; active/authenticated work becomes purchasable only after F06 pricing |
| Risk | Principle violated until expiry | Larger scope; ADR-005 reopened; needs F06 |

**Question**: choose Option 1 (with the expiry date and owner) or Option 2, or state a different approach. Also: does legacy `DEGRADED` keep its present billing meaning independent of 012's partial-coverage marker?
**Evidence to consider**: the three code files above and `012/final-owner-approval-package.md` D1.
Answer: ____

## Q5 (priority 3) — OD-4: worker isolation mode (Mode S vs Mode P)

| | Mode S: tenant-scoped principals | Mode P: shared pool |
|---|---|---|
| Mechanism | each worker principal registered with `servedTenantIds`; per-tenant job routing | one pool; claim-spread rule CS1 and quarantine bound the tenants a principal can reach |
| Trust boundary | a compromised worker cannot claim another tenant's units | a compromised worker can reach claimable units of every tenant, bounded by CS1 |
| Isolation claim | holds (after AR-13/AR-19/AR-20 exist) | **not achieved** |
| Required changes | AR-20: 009 queue topology change (per-tenant routing); one pool/partition per tenant or group | none beyond the design |
| Cost | lower utilisation, more deployments | lowest |
| Verification | per-tenant claim tests, role grants on the target database | CS1 behaviour, alerting; SG10 external review |

012's recommendation (DOC, author's, not approved): Mode P for an allow-listed pilot, Mode S before general availability. **Question**: which mode for the pilot, and what concrete trigger moves to Mode S?
Note: `012/master-owner-decision-register.md:32` still shows the superseded Option A/B wording; the later `final-owner-approval-package.md` D2 governs.
Answer: ____

## Q6 (priority 2) — AR-13 / AR-19 / AR-22 / OD-2 (database boundary and recovery)

**Facts**: AR-13 (worker least-privilege roles and `sec_*` functions), AR-19 (008 `requestAdmission`/`safetyCheckpoint` take caller-supplied `targetId`, `userId`, `executionId`, `now`; `releaseLease` unspecified — `008/contracts/safety-admission-contract.md:12-20`, `safety-checkpoint-contract.md:37`), AR-22 (hard TTL, dead-man switch, orphan reconciler) are all "REQUIRED FOR ACTIVATION" and unapproved. Current code has no DB roles or RLS (VERIFIED: none in `apps/api/prisma`, `infrastructure`; worker uses plain `DATABASE_URL`).
**Questions**: (a) Name the owner and date for the AR-13 role design with the 007/008/009 owners (OD-2). (b) 008: is `requestAdmission` a trusted-caller-only API, or must identity/clock be derived from context (AR-19)? (c) Does 009's "`finalizeExecutionUnit` is the only code path" (rule 1) mean one logical function with a database implementation (AR-18 item 5)? (d) Is AR-22 an obligation on E14/E15 engines as 009 rule 3 states?
**Note**: the Redis admission gate (`apps/api/src/services/queue/admission-gate.ts`) is a queue-capacity guard, not F07, and does not satisfy any of these.
Answer: ____

## Q7 (priority 3) — Remaining SPEC 012 items

| ID | Question | Default until answered |
|---|---|---|
| OD-1 | Retention period for `SecuritySettlement`; anonymize on account deletion? (only relevant under Q4 Option 2) | handled with the credit ledger |
| P14 | Reverify billing and refund of customer-side `INCONCLUSIVE` | legacy `REVERIFY_COST` |
| P16 | Destination Authorization Policy | refuse every destination |
| P17 | Class-level billing | not approved; `AREA_COUNT` |
| D6 batch | Confirm P4 (offline advisory matching), P5 (declarative customer invariants), P6 (OpenAPI 3.0/3.1 REST/JSON), P8 (authenticated browser testing: no), P9 (private-network targets: no), P12 (credential lifetime 90 d max / 30 d default; lease ≤ min(unit time, 30 min)), P18 (private-CA, plain-HTTP, non-default ports unsupported) | provisional defaults |
| P11 | KMS provider/broker hosting | deferred to SG3 |
| 011 P1–P8 | Confirm or amend (note: different list from 012's P1–P18) | defaults (AG8) |
Answer (per row): ____

## Q8 (priority 2) — Cross-spec obligations of U-1 on SPEC 010

U-1 obliges BROWSER/CRAWLER engines to declare `hardStopMarginMs`, a hosting-failure backstop, `onUnitExpired` and a module-result finalizer (`scan-deadline-contract.md:291-301`) while 010's frozen text is silent. **Question**: implementation obligation only, or a formal amendment of 010 requiring its own approval?
Answer: ____

## Q9 (priority 3) — Independent review standard

Reviews labelled independent are AI sessions whose independence is self-declared; most later ones are not stored. **Question**: what counts as independent for freezing 012 (a stored review by a separate session with no authorship of the repairs? a human reviewer? an external reviewer)? Must the review be stored in the repository?
Answer: ____

## Q10 (priority 1) — Editing policy for Phase 2

**Question**: may Phase 2 apply the "safe candidate" documentation repairs listed in `REMEDIATION_MATRIX.md` (RM-A4, RM-B4, RM-B6, RM-C9, RM-E9) directly to the uncommitted spec files, accepting that they will mix with U-1/011/012 provenance, or should they wait until after the Q3 commits? Also: adopt spec-prefixed identifiers (`012-P16`, `011-P4`) for all new documents?
Answer: ____
