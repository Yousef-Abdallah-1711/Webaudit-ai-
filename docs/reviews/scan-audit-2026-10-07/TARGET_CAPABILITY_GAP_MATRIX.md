# Target Capability Gap Matrix

Read-only audit, 2026-10-07. Master matrix: every capability area discussed across the companion
documents, current support vs. target vision, maturity (Level 0-5 scale, see
`EXECUTIVE_SCAN_AUDIT.md`), and architectural fit.

| Capability area | Current support | Maturity | Evidence engine | Target requirement | Architectural gap | Extend current engine? |
|---|---|---|---|---|---|---|
| Passive security headers/cookies | IMPLEMENTED | L2 | `ctx.fetch` capabilities | — | none | — |
| Active/injection security testing | NOT IMPLEMENTED | L0 | — | payload generation, response-diffing, payload safety classification | New engine: no `AuditCapability` today sends a crafted payload; the contract itself is not designed for it | New engine |
| Authenticated app security (IDOR/role testing) | NOT IMPLEMENTED | L0 | — | test-account/session/credential management | New engine: credential vault, session injection into `ctx.fetch`/browser, no scan-request field exists for credentials today | New engine |
| Dependency vulnerability scanning (live) | PARTIAL (8-entry static table) | L1 | `dependency-scanner` | live OSV/npm-audit feed | Replace static table with a live feed call | Extend |
| SAST | NOT IMPLEMENTED | L0 | — | AST/dataflow/taint analysis | New engine entirely — zero parser tooling exists today | New engine |
| Core Web Vitals / rendering-dependent perf checks | Specified, inert | L0 operative / L2 specified | `cwv-analyzer`, `lighthouse-analyzer`'s page half, `screenshot-capture`'s page half | cross-process browser pool | **Wire `apps/probe-pool` as a real deployed service** — lights up >=4 already-written capabilities with zero new capability code | Extend, once probe-pool exists |
| Backend/APM performance | NOT IMPLEMENTED, impossible from outside | L0 | — | customer telemetry ingestion + opt-in integration | New engine + new customer-facing integration surface | New engine |
| Load/stress/spike/soak testing | Internal-only (`load-testing/`) | N/A for customer use | k6 harness wired to Fahes's own auth model | customer-target load generation with authorization gating | New engine — current harness cannot be pointed at an arbitrary customer target without a rewrite | New engine |
| Visual regression (customer targets) | NOT IMPLEMENTED | L0 | — | baseline store + pixel/perceptual diff + viewport/browser/locale matrix | New engine, dependent on a working browser pool | New, dependent |
| Accessibility testing (customer targets) | NOT IMPLEMENTED | L0 | — | axe-core-class run against a rendered DOM | New engine, dependent on a working browser pool | New, dependent |
| Broken-link / audit-self-consistency "Testing" | IMPLEMENTED (narrow) | L1 | `playwright-runner`, `contradiction-detector` | real functional/E2E/workflow testing | New engine entirely — current one never clicks, submits, or navigates | New engine |
| Customer source execution (build/test/SAST tooling) | NOT IMPLEMENTED — sandbox runs Fahes's own code, never the customer's | L0 | sandbox-runner | safely execute untrusted customer code | New sandboxing model: current one is "trusted code, untrusted data" (process-level `--permission` + timeout + heap limit); needed is "untrusted code, contained execution" (container/VM-grade, egress-controlled) | New engine |
| Readiness aggregation | IMPLEMENTED, config-driven, fingerprint-based | L2 | `readiness/{verdict,diff}.ts` | aggregate arbitrary future domains | Add a `ModuleType` + threshold entry; touches ~5 files by name, not a rewrite | Extend |
| Reverify | IMPLEMENTED, single-check, idempotent, 30s timeout | L2 | `reverify/runner.ts` | reverify expensive/stateful/long-running checks | 30s default timeout and the stateless/no-source-workspace assumption both need revisiting for e.g. a load-test or multi-step reverify | Extend with care |
| Credit system | IMPLEMENTED, flat per-module constants; a per-execution cost-metering field exists but is unused by pricing | L2 | `pricing.ts`, `CapabilityExecution.costMicros` | cost scaling with duration/compute for expensive future operations | Pricing function needs to be rewritten to consume the metering primitive that already exists; the ledger/debit/refund mechanics underneath do not need to change | Extend |
| Authorization/scope/staging-vs-production/kill-switch concepts | NOT IMPLEMENTED | L0 | — | permission record, scope, environment classification, emergency stop, audit log of scan-execution actions against third parties | The closest existing primitive is `ControlLevel` (`NONE/ATTESTED/VERIFIED`) + `TargetVerification`, which proves **ownership**, not **environment classification** or **destructive-mode consent** — a related but distinct concept that would need its own data model | New data model + new engine |
| AI usage / interpretation layer | IMPLEMENTED, one AI call per module, labelled-segment prompt-injection defense, `AI_MODE=disabled` graceful degradation | L2 | `ai-layer.ts` | — | AI can contribute "judgment findings" layered on code-layer findings (confirmed by independent cross-check) — worth keeping that boundary explicit as new domains are added, so a future reader doesn't assume AI never produces findings | Reusable as-is |
| Multi-tenancy / data isolation | IMPLEMENTED for compute workspaces; open question for staged-upload retention | L2 (workspace) / UNKNOWN (upload retention) | Prisma `userId` scoping, workspace teardown | — | Staged-ZIP-object deletion has no proven call site; worth resolving before any feature that increases upload volume | Extend (close the gap) |

## Notes on severity of each "New engine" row

The five rows marked "New engine" (active/authenticated security, SAST, load/capacity generation,
visual-regression/accessibility pending probe-pool, untrusted-code execution) represent genuinely
separate execution systems with their own threat models, not deeper configuration of the existing
capability-SDK. The capability-SDK contract itself (`AuditCapability`) was rated extensibility
MEDIUM by an independent cross-check for exactly this reason: it has no concept of a long-lived
session, a credential lifecycle, a multi-step test plan, or streaming progress — `runCodeLayer`
returns a single completed findings array, which fits "fetch a page, check some things" far better
than it fits "run an authenticated multi-step workflow" or "generate load for 30 minutes."
