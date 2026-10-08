# Shared Platform Contracts (conceptual)

Per FR-011/FR-012 and Constitution Principle VIII, every execution engine and product domain
MUST consume these contracts rather than defining a parallel version. These are architectural
boundaries, described at the shape/responsibility level — not finalized TypeScript interfaces or
database schemas; that finalization belongs to the owning foundation child spec.

| Contract | Extends existing | Responsibility | Who consumes it |
|---|---|---|---|
| Target Identity | `Target` model | Identify what Fahes is authorized to inspect | Every execution class |
| Environment | NEW (`TargetEnvironment`) | Classify a Target (production/staging/development), never granting permission by itself | Authorization checks; never engines directly |
| Ownership | `TargetVerification`/`ControlLevel` | Prove control of a Target | Authorization checks (as a prerequisite, never a substitute) |
| Authorization | NEW (`TargetAuthorization`) | Grant permission for specific execution classes, scoped and budgeted | Every non-passive execution class |
| Scope | NEW (`ScopeDefinition`) | Bound what an Authorization grant covers | Active/authenticated/load execution classes |
| Scan Profile | NEW (`ScanProfile`) | Name a reusable scan configuration | Scan Planning (API layer) |
| Execution Plan | NEW (`ScanPlan`), extends `Scan.capabilitySnapshot`'s intent | Resolve the immutable "what will run" graph | Execution Runtime |
| Execution Unit | `CapabilityExecution`, extended | Represent one engine invocation | Every engine |
| Progress Event | Extends existing `ModuleResult`/`ScanState` event shape | Report what an execution is doing, at the granularity FR-021 defines | Web UI, Observability |
| Cancellation Signal | Extends existing scan-cancellation API | Distinguish user/emergency/kill-switch stop (FR-022) | Execution Runtime, every engine |
| Finding | `CapabilityFinding`/`Issue`, unchanged shape | Represent one measured or AI-judged observation | Every engine, Readiness, Reverify |
| Evidence | NEW, typed (`data-model.md`) | Carry reproducible proof for a Finding | Every engine, Report |
| Artifact | NEW | Store large binary evidence outside the primary database | Evidence contract, Report |
| Fingerprint | Existing `fingerprintParts`/`fingerprintOf` mechanism, unchanged | Give every Finding a stable cross-scan identity | Readiness, Reverify, every engine |
| Severity | Existing `Severity` enum, unchanged | Rank a Finding's importance | Readiness, Report |
| Issue Lifecycle State | Existing `IssueState` enum, evaluated for future states per FR-017 (not changed by this plan) | Track a Finding's resolution status | Fix loop, Reverify |
| Cost / Metering Record | Existing `CapabilityExecution.costMicros`/`AiInvocation`, extended per FR-020 | Record what an execution actually cost | Credits/Metering |
| Retention Policy | Existing report-retention sweep, extended to Artifacts per the 2026-10-07 Clarifications | Define when evidence/artifacts are removed | Evidence & Artifacts |
| Credential Binding | NEW | Scope a target-testing credential to one Authorization grant | Authenticated Workflow, future authenticated classes |
| Session Binding | NEW | Isolate one execution's authenticated session state | Authenticated Workflow |
| Observability Event | NEW, per-engine | Report engine health/duration/cost without exposing secrets | Operators |
| Audit Trail Entry | NEW (`ExecutionAuditEvent`), distinct from existing `AuditLogEntry` | Record what a scan execution did against a third-party target | Safety/Authorization context |

## Non-negotiable boundary rules (carried over from the constitution amendment, restated here for
engine authors who may read this file without reading the constitution directly)

1. An engine or domain MUST NOT read `TargetEnvironment` as if it were `TargetAuthorization`.
   Checking environment and checking authorization are two separate calls, and both MUST pass.
2. An engine MUST NOT invent its own finding-identity scheme. Fingerprint computation follows the
   existing `fingerprintParts`-based mechanism for every engine.
3. An engine MUST NOT let its own code declare a Finding's attribution (`MEASURED` vs.
   `AI_JUDGMENT`). Attribution is assigned by the runner, exactly as today.
4. An engine that stores evidence larger than is reasonable to inline MUST reference an `Artifact`
   row rather than growing the inline JSON payload unboundedly.
