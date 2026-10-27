# SPEC 012 — Final Owner Approval Package

**SELF-REVIEW, NOT INDEPENDENT CERTIFICATION.** Date 2026-10-16. Nothing here is approved. Each decision states the approved state, the exact options, the consequences, the recommendation of the repair author (a recommendation, not a selection), the approval required and what stays disabled until then. Only decisions that change what can be built or enabled are listed.

## D1 — OD-3: billing for partially covered passive SECURITY work (P15 versus `AREA_COUNT`)

**Current approved state**: P15 approved as a principle (charge only for executed billable work). P17 (class-level settlement) not approved. Default `AREA_COUNT`: today's billing and refund semantics; `DEGRADED` counts as delivered and `refundForUndelivered` is an equal-share area-count function (both verified in `packages/types/src/domain.ts` and `packages/config/src/refund.ts`). This knowingly conflicts with P15 for partially covered passive SECURITY areas. **Not solved.**

| | Option 1: time-boxed exception to P15, keep `AREA_COUNT` | Option 2: approve P17 and AR-17 with F06 pricing and implementation gates |
|---|---|---|
| What you approve | An explicit exception for the passive SECURITY area until a named review point | Class-level, execution-backed settlement (FR-198) with legacy-capability weights, plus the ADR-005 amendment (AR-17) and an F06 class price table (AR-15) |
| Billing effect | None; partial passive coverage is billed and refunded as today | Partially executed passive work is refunded in proportion; active and authenticated classes priced per F06 |
| Security and honesty | Coverage reporting already states `coverageComplete:false`; customers are billed for an area the report calls incomplete | Billing follows executed weight; needs a trustworthy weight source (`CapabilityExecution` has only `succeeded` and `skippedReason`) |
| Migration | None | New scans only (mode snapshotted at scan creation); `SecuritySettlement` table (M012-5e); refund arithmetic and ledger idempotency work; existing scans stay `AREA_COUNT` |
| Risks | The principle stays knowingly unmet for the exception period | Larger change surface, three cross-owner approvals (006, F06, billing code), implementation gates T762, T763, T800, T801, SG1 |
| Active and authenticated work | Stay not purchasable | Purchasable only after F06 pricing exists |

**Recommended**: Option 1 now, with the review point set to the start of the F06 pricing spec and in any case before active or authenticated work is offered for sale. Reason: the approved release is passive-first (P7), active classes are not purchasable, and Option 2 is unavoidable before any active sale anyway because per-component pricing conflicts with ADR-005 as written.
**Approval required**: the owner chooses exactly one option and, for Option 1, names the review point.
**Disabled until approval**: nothing new is enabled; the conflict stays stated in FR-189 and plan OD-3. `CLASS_LEVEL` mode and any active or authenticated purchase stay disabled in every case until Option 2 and its gates are complete.

## D2 — OD-4: worker isolation mode

**Current approved state**: nothing approved. The design (claim-scoped functions, `fahes_sec_derive`, claim-bound 008 wrappers, rule CS1) is technical and needs no owner approval. What remains is the deployment mode.

| | Mode S: tenant-scoped principals | Mode P: shared pool |
|---|---|---|
| Mechanism | Each principal registered with `servedTenantIds`; jobs routed per tenant or tenant group | One pool; claim-spread rule CS1 bounds the tenants a principal can reach per 10 minutes |
| Security | Tenant isolation under worker compromise: another tenant's units cannot be claimed | Isolation **not** achieved: a compromised principal reaches the claimable units of every tenant, bounded by CS1 and quarantine |
| Operations | One pool or queue partition per tenant or group; needs AR-20 (009 topology change) | None beyond the design |
| Cost | Lower utilization, more deployments | Lowest |

**Recommended**: Mode P for the allow-listed pilot (the per-tenant allowlist of FR-158 already bounds the tenant set), and Mode S before general availability or any allowlist larger than the owner is prepared to expose to one compromised instance.
**Approval required**: the owner chooses the mode for the pilot and states the trigger for Mode S.
**Disabled until approval**: active and authenticated execution are disabled in any case until FR-201 is deployed and tested (SG3, SG10); no implementation of Mode S is started.

## D3 — OD-2: scheduling the AR-13 privilege boundary and the SPEC 008 surface (AR-19)

**Current state**: unscheduled. Both need the 007, 008 and 009 implementation owners; 008 has no transactional admission or release surface today.
**Options**: (a) schedule AR-13 and AR-19 as one cross-owner work item with named owners and a date; (b) adopt the AR-13 alternative (a separate dispatch and admission service) after an independent review.
**Recommended**: (a). Passive-first release does not wait for it.
**Approval required**: owners and a date, or approval of the alternative.
**Disabled until approval**: the credential broker, E14 and E15 and every credentialed check (they are disabled by SG3 and SG10 regardless).

## D4 — P16: Destination Authorization Policy

**Current state**: pending; default is refuse every destination for active and authenticated testing (`SEC_DESTINATION_AUTHORIZATION_UNMET`).
**Options**: approve the policy as drafted (FR-197: verified address binding, origin-ownership warranty, operator-reviewed `ActiveTestingEnablement`, containment controls); approve with amendments; keep refused.
**Security note**: no technical proof can show that the origin behind a front is the customer's (a tenant-controlled forwarder is undetectable); the policy gives accountability and a bounded blast radius only.
**Recommended**: approve as drafted. It takes effect only when the operator enablement process exists, so approval alone enables nothing.
**Disabled until approval**: all active and authenticated execution.

## D5 — AR-8 and AR-9: provenance of SPEC 009 U-1 and SPEC 011

**Current state**: the 009 U-1 edits (10 files) and `scan-deadline-contract.md` are uncommitted; committed HEAD lacks `PLANNED->REFUSED` and `DISPATCHED->REFUSED`, which 012 uses. SPEC 011 and SPEC 012 are untracked.
**Options**: commit or confirm U-1 and SPEC 011 as the frozen text; or declare them draft and re-base 012 on committed text.
**Recommended**: commit or confirm both before freezing 012 (the repair author did not commit anything).
**Disabled until approval**: freezing SPEC 012 and the SG1 transition-policy equality test.

## D6 — Confirm the provisional defaults (one batch approval)

P4 (offline advisory matching), P5 (declarative business invariants), P6 (OpenAPI 3.0/3.1 REST/JSON only), P8 (no authenticated browser testing), P9 (no private-network targets), P12 (credential lifetime 90 days maximum, 30 default, lease at most 30 minutes), P18 (no private-CA, plain-HTTP or non-default-port active testing). Each is already the fail-closed default and is implemented that way.
**Options**: approve all as stated; amend any.
**Recommended**: approve all as stated.
**Disabled until approval**: only the capability each default excludes (advisory matching, invariants, other API types) stays unreleased.

## D7 — P14: reverify billing

**Current**: legacy `REVERIFY_COST` semantics (charge at resolution; refund platform failure and refusal before execution).
**Options**: keep; also refund customer-side `INCONCLUSIVE` (expired credential, missing fixture).
**Recommended**: keep the legacy semantics until F06.
**Disabled until approval**: nothing.

## D8 — P11: KMS provider and broker hosting (deferred)

Deferred by the owner until credential-broker activation. Needed before SG3. **No decision requested now.**

## D9 — OD-1: `SecuritySettlement` retention

Relevant only if D1 Option 2 is chosen. **Recommended**: decide with D1; no decision requested otherwise.
