# Tasks: Scan Audit Follow-Through

The audit documents describe the current product and the target gaps. This list orders the
implementation and planning work that follows from that evidence. Feature-level contracts and
detailed implementation checklists remain in the linked `specs/` packages.

## Phase 1: Safety foundations

- [ ] T001 Implement target environment, authorization, and scope enforcement from
  [spec 007](../../../specs/007-foundation-target-authorization-scope/tasks.md) (42 detailed tasks).
  Preserve the existing ownership control gate and require explicit grants for every classified
  execution class.
- [ ] T002 After T001, implement admission budgets, kill switches, and execution audit records from
  [spec 008](../../../specs/008-safety-killswitch-budget-audit/tasks.md) (36 detailed tasks). Keep
  active or disruptive execution blocked until the stop path and audit trail work end to end.

## Phase 2: Shared scan platform

- [ ] T003 Generate a separate, dependency-ordered implementation task list for
  [spec 009](../../../specs/009-core-scan-execution-platform/). Its current `tasks.md` records the
  specification and review work; it does not yet break the implementation requirements into code
  tasks. Start after T001 and T002 so its task dependencies reference implemented foundations.
- [ ] T004 Implement the shared scan profile, immutable execution plan, typed evidence/artifact,
  execution runtime, progress, cancellation, and finalization contracts in spec 009 after T001 and
  T002. Reuse the existing queue, credit, capability, report, and readiness mechanisms where the
  spec says extension is sufficient.
- [ ] T005 Plan and implement roadmap foundation F05 (credential/session lifecycle) after T001.
- [ ] T006 Plan and implement roadmap foundation F06 (metered resource budgets) after T004 defines
  scan profiles and execution plans.

## Phase 3: Web and customer-target checks

- [ ] T007 Generate a separate implementation task list for
  [spec 010](../../../specs/010-web-testing-platform/). Its current `tasks.md` records specification
  closure; it does not yet break implementation of the registry, browser execution, crawler,
  accessibility, functional, visual-baseline, and SEO contracts into code tasks.
- [ ] T008 After T004 provides evidence/runtime contracts, plan and deploy roadmap engine E10
  (Browser/Probe), then wire `apps/probe-pool` into worker execution with existing SSRF and
  tenant-boundary guarantees.
- [ ] T009 Plan and implement roadmap engine E11 (bounded crawler) against the shared contracts.
  Keep crawl limits and request budgets explicit.
- [ ] T010 Plan and implement roadmap engine E12 (static source analysis extension) against the
  shared contracts. Preserve the no-customer-code-execution guarantee.
- [ ] T011 Implement spec 010 after T004 and T007-T009, beginning with browser/crawl safety,
  coverage honesty, customer-tenant evidence isolation, and deterministic functional,
  accessibility, visual-baseline, and SEO checks.

## Phase 4: Higher-risk and data-ingestion engines

- [ ] T012 Plan roadmap engine E13 (untrusted source execution) only after T001, T002, and the
  runtime contract in T004. Select and prove a separate container/VM-grade isolation boundary;
  do not extend the trusted-capability sandbox to run customer code.
- [ ] T013 Plan roadmap engine E14 (active security) after T001, T002, and T005. Enforce explicit
  per-class scope, budgets, redaction, emergency stop, and audit evidence before dispatch.
- [ ] T014 Plan roadmap engine E15 (authenticated workflows) after T001, T002, and T005. Enforce
  per-scan credential/session lifecycle and isolation before dispatch.
- [ ] T015 Plan roadmap engine E16 (customer load/capacity testing) after T002 and T006. Keep
  customer-target load generation separate from the internal platform load-testing harness.
- [ ] T016 Plan roadmap engine E17 (telemetry integration) after T004 defines typed evidence
  ingestion and
  tenant-scoped retention.

## Phase 5: Domain and product surfaces

- [ ] T017 Plan domain evolutions D20-D27 in the dependency order in
  [roadmap 006](../../../specs/006-scan-architecture-v2/roadmap.md), only after the engines they
  consume have contracts and implementation evidence.
- [ ] T018 Plan product experiences U30-U34 after their target, execution, evidence, and readiness
  contracts are real; keep `/scan`, progress, evidence, reverify, and readiness UX tied to those
  contracts.
- [ ] T019 As each source boundary or test entry point changes, update `PROJECT_MAP.md`,
  `docs/agent-domain-rules.md`, and the relevant feature `tasks.md`/`PROGRESS.md` handoff. Keep the
  audit's current-state claims clearly dated and re-verify them against source before relying on
  them for a release decision.
