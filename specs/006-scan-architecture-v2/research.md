# Phase 0 Research: Fahes Scan Platform Architecture v2

No `NEEDS CLARIFICATION` markers remained in `spec.md`'s Technical Context after the Clarify phase
(4 questions asked/answered 2026-10-07; see `spec.md`'s Clarifications section). This document
records the research that grounds this plan's decisions, rather than resolving open unknowns.

## R1: What does the platform actually do today?

- **Decision**: treat `docs/reviews/scan-audit-2026-10-07/` (12 documents, produced by direct
  source reading plus one independent cross-check via a separate model instance with no shared
  context) as the settled current-state evidentiary baseline for this entire planning pass.
- **Rationale**: re-deriving every current-architecture fact a second time inside this plan would
  duplicate ~20 file-reads' worth of evidence-gathering already completed and independently
  corroborated in the same engagement, for no additional confidence — the audit's claims are
  file-and-line cited, not inferred.
- **Alternatives considered**: re-verify every claim from scratch inside this plan (rejected — no
  new evidence would be produced, only duplicated effort); trust older documents like
  `WebAuditAI_ARCHITECTURE.md` or the original constitution's TODOs (rejected — `PROJECT_MAP.md`
  and the constitution itself both flag these as stale in places, superseded by current code).

## R2: Is the existing capability-SDK contract (`AuditCapability`) salvageable for new execution
classes, or does it need replacement?

- **Decision**: extend, not replace. The core shape (`id`, `module`, `layer`, `canRun`,
  `runCodeLayer`) generalizes cleanly to any bounded, stateless-per-call execution; what it lacks
  (a long-lived session concept, a credential lifecycle, streaming progress, a multi-step test
  plan) are additive fields/hooks a new execution class's own child spec can add without breaking
  the contract for existing capabilities.
- **Rationale**: 16 existing capabilities, all vendored and reviewed, already implement the
  current contract; a breaking replacement would force a rewrite of all 16 for zero behavioral
  gain, violating FR-024/FR-025's additive-extension requirement.
- **Alternatives considered**: a parallel "v2 contract" for new execution classes only (rejected —
  violates Constitution Principle VIII's "shared contracts before domain-specific duplication";
  would also require every future consumer, e.g. the capability loader, to branch on contract
  version); a full rewrite (rejected — no repository evidence that extension is insufficient, and
  Constitution Principle VIII requires that evidence before a rewrite is justified).

## R3: Is the existing `apps/probe-pool` library a usable foundation for the Browser/Probe Engine,
or does it need to be rebuilt?

- **Decision**: usable foundation; the gap is deployment/wiring, not the library's own design.
  `createBrowserPool` exists and is exercised by `apps/probe-pool`'s own tests; what is missing is
  (a) a cross-process transport so the worker can reach a pool running in a separate process/
  service, and (b) the worker's `contextFactory` actually supplying a `pageProvider` to
  `createCodeLayerContext`.
- **Rationale**: four capabilities (`cwv-analyzer`, `lighthouse-analyzer`'s page half,
  `screenshot-capture`'s page half, `playwright-runner`'s hypothetical future browser half) are
  already written against `ctx.withPage` and already degrade gracefully when it is absent — this
  is strong evidence the *consuming* side of the contract is correct and the *providing* side is
  the only gap.
- **Alternatives considered**: a wholly new browser-automation layer (rejected — no evidence the
  existing library's API shape is wrong, only that it's undeployed); a third-party managed browser
  service (not rejected outright, but deferred — this is exactly the kind of technology choice the
  triggering instruction says belongs to the engine's own future child spec, not this master plan;
  note this is a vendor/infra-lock-in question distinct from Constitution Principle II, which
  governs vendoring *capability/skill code* rather than infrastructure services — E10's own plan
  should evaluate it on its own merits, including Principle IV's multi-vendor-fallback spirit if
  the service becomes a single point of failure for every browser-dependent capability).

## R4: Can the existing sandbox-runner be hardened into an untrusted-code-execution environment,
or is a new system unavoidable?

- **Decision**: new system unavoidable, now codified as Constitution Principle XI. The existing
  sandbox's `node --permission` boundary is a process-level permission model proven against one
  threat model (trusted code, untrusted *data*); running the customer's *own code* (arbitrary
  install/build/test scripts) is a materially different threat model that process-level permissions
  alone do not credibly contain (no CPU quota or process-count limit exists in the sandbox's own
  source per the audit's finding; the isolation primitive itself — `--permission` flags on a bare
  Node child process — has no track record as a boundary against arbitrary adversarial code the way
  a container or microVM does).
- **Rationale**: this is a safety-critical judgment, not a style preference; the constitution
  amendment (Principle XI) makes it a governance requirement specifically so no future child spec
  can quietly reuse the existing sandbox "because it's already there."
- **Alternatives considered**: harden the existing sandbox with additional `--permission` flags and
  resource limits (rejected as insufficient — the underlying primitive's trust model doesn't change
  no matter how many flags are added; it was never designed as an adversarial-code boundary);
  defer the isolation-mechanism choice itself (gVisor, Firecracker, a managed container platform)
  to this master plan (rejected — correctly identified in the constitution's own
  `TODO(UNTRUSTED_EXECUTION_MECHANISM)` as a `/speckit-plan`-level decision for that specific future
  child spec, not a master-architecture-level choice).

## R5: Does extending the credit ledger for metered pricing risk the existing ledger's
reconciliation guarantees?

- **Decision**: no new risk, because the existing per-execution cost-metering field
  (`CapabilityExecution.costMicros`) already exists and is already populated (for AI spend) without
  any reconciliation defect reported against it; narrow-scope metered pricing (FR-020, per the
  2026-10-07 Clarifications) only extends *which* execution classes populate and price from that
  field, not the field's own mechanics.
- **Rationale**: Constitution Principle VI's "every operation... MUST be checked before execution,
  and MUST be reconciled against actual cost afterward" is already satisfied structurally by the
  existing `costMicros` + debit/refund pattern; no new reconciliation mechanism needs inventing.
- **Alternatives considered**: a wholly separate metered-billing subsystem outside the existing
  credit ledger (rejected — would duplicate reconciliation logic the existing ledger already
  provides, and would violate the "extend, don't replace" instruction from the triggering
  specification).
