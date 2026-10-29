# Decision Amendment 2026-10-29 — SPEC 009 owner approvals (DEC-047, DEC-051, DEC-066)

**Type**: dated amendment. The historical rows of `DECISION_REGISTER.md` (DEC-047, DEC-051: *RECOMMENDED — OWNER APPROVAL REQUIRED*; DEC-066: *OWNER DECISION REQUIRED*) and `remediation/PROPOSED_SPEC009_AMENDMENT_U1B*.md` (v1–v5) are **not rewritten**. Where they differ, this amendment governs from its date.

**Approval source**: the project owner's explicit message in the 2026-10-29 SPEC 009 session ("OWNER DECISION APPROVAL + FULL AUTONOMOUS IMPLEMENTATION CONTINUATION"), answering `docs/audits/spec-009-implementation/DECISION_PACKET.md`. Recorded as approved **by the owner through that message**. No other approval is inferred.

| ID | Selected | Exact scope of the approval | Conditions stated by the owner |
|---|---|---|---|
| DEC-047 | **A** | One *logical* `finalizeExecutionUnit` with a database implementation; SPEC 012's entry points call one shared body; `runtime-finalization-contract.md` rule 1 is amended to say so; equivalence proven by a transition-policy equality test | none beyond the general: no unrelated business-policy change |
| DEC-051 | **A** | A SPEC 009 effect-authorization ledger *contract* (`authorizeEffect`); engines keep conforming ledgers; generic table for engines without one. Guarantee is limited to "no *new* authorization after terminalization" | none |
| DEC-066 | **A, in principle** | Assistant drafts the complete U-1b **v6**, compares it to SPEC 006/007/008/009, resolves *technical* inconsistencies without changing approved business policy, preserves history, then implements once the consistency review passes | v6 text must be drafted and validated **before** it enters the implementation contracts |

## Disclosure required by the owner's condition (material items in Option A not stated in my recommendation)
1. **Schema beyond "eight models".** Option A of DEC-051 adds a generic ledger table, and v5/v6 §4 (OD-A "generic host claim before F07", an *owner direction* recorded in v5) adds a host-claim table. The migration therefore contains the eight data-model tables **plus** `ExecutionUnitHostClaim` and `EffectAuthorization` (both additive, scalars-only, no relation into a frozen model). The data-model's "zero `@relation` into frozen models" rule is preserved. This is disclosed here, not a new business policy; the owner's "eight-model foundation" wording is read as "the eight data-model.md models plus the tables the approved options require".
2. **DEC-047 changes an existing frozen contract sentence** (rule 1 "only code path"). Done through this amendment and `specs/009-.../amendments/`, not by silent edit.
3. **No business, pricing, legal or retention policy change** is part of Option A in the repository text. The "provisional constants" (`startGateTimeoutMs`, gate/loop cadences) are technical defaults, labelled so.

## Technical decisions made under the owner's "resolve technical inconsistencies" instruction
These are **not owner answers**; they are engineering decisions inside the approved DEC-066 Option A, recorded so they can be reviewed: DEC-056 (claim-token mechanics), DEC-057 (single-statement CAS + `FOR SHARE` lease check), DEC-058 (stop-first cause precedence), DEC-064 (`DISPATCHED → REFUSED` by the sweep only while the start gate is unreleased, i.e. no effect authorized). Where v6 makes a choice that differs from v5 it says so in §0.

## Still not decided / not approved here
SPEC 010/011/012 engine decisions (DEC-052/053, creation fences, FR-201 wording), D-1, DEC-032/062 (billing of unconfirmed effects), DEC-060 timing calibration. Unchanged.

## Contract / migration / test impact
- Contracts amended through `specs/009-core-scan-execution-platform/amendments/AMENDMENT-U1B-v6.md` (applied text) — historical files stay.
- Migration: three additive migrations (see `IMPLEMENTATION_BACKLOG.md` P9-A10); tested fresh / upgrade / rollback on isolated PostgreSQL before the dev database.
- Tests: transition-policy equality (DEC-047), ledger lifecycle and post-terminal fencing (DEC-051), AC-1…AC-20, v6 §10 race matrix.
