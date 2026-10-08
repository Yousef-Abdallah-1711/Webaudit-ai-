# Analyze Inputs: Cross-Reference Table

Prepared for `/speckit-analyze` (not a substitute for running it) — lets that phase check
consistency mechanically against this index rather than re-reading full prose on its first pass.

## Functional Requirements -> Constitution Principle -> Plan Artifact

| FR | Constitution Principle(s) | Plan.md artifact | Data-model/Contracts artifact |
|---|---|---|---|
| FR-001 Target | VIII | Reuse/Extend/New Matrix (Target row) | `Target` (extension) |
| FR-002 Environment | X | Safety & Authorization Model | `TargetEnvironment` |
| FR-003 Ownership Verification | X | Safety & Authorization Model | `TargetVerification` (existing) |
| FR-004 Authorization | X | Safety & Authorization Model, Authorization/safety decision flow diagram | `TargetAuthorization` |
| FR-005 Scope | X | Safety & Authorization Model | `ScopeDefinition` |
| FR-006 Scan Profile | VIII | Bounded Contexts (Scan Planning) | `ScanProfile` |
| FR-007 Scan Plan | VIII, IX | Bounded Contexts, Migration Strategy | `ScanPlan` |
| FR-008 Execution Classes | VIII, XIV | Execution-Class Matrix | contracts/execution-class-contract-template.md |
| FR-009 Per-class contract fields | XIV | Execution-Class Matrix | contracts/execution-class-contract-template.md |
| FR-010 PASSIVE_HTTP baseline | VIII | Execution-Class Matrix (row 1) | — |
| FR-011/012 Shared contracts | VIII | Target Architecture diagram | contracts/shared-platform-contracts.md |
| FR-013 Future engines | VIII | Target Architecture, Reuse/Extend/New Matrix | contracts/engine-contracts-summary.md |
| FR-014 Domains consume engines | VIII | Target Architecture diagram | contracts/engine-contracts-summary.md |
| FR-015 Evidence model | IX | Finding/evidence lifecycle diagram | `Evidence`, `Artifact` |
| FR-016 Fingerprint identity | IX | Finding/evidence lifecycle diagram | existing `fingerprintParts` mechanism |
| FR-017 Issue lifecycle future states | III (extended) | — (deferred to F03) | `Issue` (existing, unchanged) |
| FR-018 Reverify classes | VII, XII | Execution-Class Matrix (Reverify column) | — |
| FR-019 Readiness normalization | VIII, IX | Bounded Contexts (Readiness) | — |
| FR-020 Cost/metering (narrow scope) | VI | Reuse/Extend/New Matrix (pricing row) | `ResourceUsage` |
| FR-021 Progress model | XII | Execution-plan lifecycle diagram | `Execution`/`ExecutionStep` |
| FR-022 Three-way stop | X, XII | Authorization/safety decision flow, Execution-plan lifecycle diagram | `Execution.cancelledBy` |
| FR-023 Observability | — (new, no direct existing principle) | — | `SafetyEvent`/`ExecutionAuditEvent` |
| FR-024 Strict parallel-run | VIII (additive) | Migration Strategy | — |
| FR-025 Additive-extension test | VIII | Migration Strategy | — |
| FR-026 Compatibility adapters | VIII | Migration Strategy | — |

## Constitution Principle -> First Consuming Child Spec

| Principle | First child spec that must satisfy it in detail |
|---|---|
| VIII (Engines serve domains) | F02 (Execution Planning) |
| IX (Evidence reproducible) | F03 (Evidence/Findings/Artifacts) |
| X (Authorization is not ownership) | F01 (Target/Environment/Ownership/Authorization/Scope) |
| XI (Untrusted code isolation) | E13 (Untrusted Source Execution Engine) |
| XII (Long-running work) | F04 (Execution Runtime/Queue/Progress/Cancellation) |
| XIII (Tenant boundaries) | F01 and every subsequent spec with a new entity |
| XIV (Capability contract) | every engine spec, enforced via contracts/execution-class-contract-template.md |

## Checklist Item -> Spec/Plan Section Already Cross-Referenced

See `checklists/architecture-quality.md` itself — every CHK item already carries its own
`[Spec §...]`/`[Plan §...]`/`[Data-Model §...]` reference inline; this table does not duplicate
those 46 references, only the FR/Principle/Artifact index above, which the checklist does not
provide in table form.
