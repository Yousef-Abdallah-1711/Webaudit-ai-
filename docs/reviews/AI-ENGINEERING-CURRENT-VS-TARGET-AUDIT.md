# AI Engineering — Current State vs Target State Audit

**Date:** 2026-09-12
**Scope:** Every AI-engineering capability in the WebAudit AI codebase — gateway, prompts,
context, routing, agents/workflows, tools, MCP, memory, RAG, structured output, evaluation,
observability, cost, credits, security, performance, reliability, configuration, regression.
**Method:** Direct source inspection (no sub-agents used, per instruction). Every claim below
cites a real path; nothing is inferred from documentation alone — `PRODUCTION-READINESS-MASTER-PLAN.md`,
`FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md`, `AUTH_AND_SCALE_AUDIT.md`, and the
constitution were read for context, then re-verified against `packages/ai-executor`,
`packages/redaction`, `packages/capability-sdk`, `apps/worker/src/prompts`,
`apps/worker/src/module-runner`, `apps/api/src/services/credits`, `apps/api/src/services/admin`,
and `apps/api/prisma/schema.prisma`.
**Relationship to other plans:** This document is additive to
[PRODUCTION-READINESS-MASTER-PLAN.md](PRODUCTION-READINESS-MASTER-PLAN.md) (T256-T306, mostly
payments/UI/infra) and root `PLAN.md`/`TASKS.md` (credit-ledger hardening only). It does not
repeat their findings. New tasks in the companion file start at **T307** (T306 is the highest
task ID in the repo as of this audit).

---

## Part 1 — What this product's AI architecture actually is

Before the capability-by-capability audit, the one fact that reframes several of the "AI
engineering" categories below: **this is not a chat product and not an autonomous-agent
product.** Every LLM call is a single-shot, stateless, schema-validated classification/explanation
step over data a deterministic code layer already measured (Constitution Principle III,
`packages/ai-executor`, `apps/worker/src/module-runner/ai-layer.ts`). There are exactly **two**
call sites for the AI executor in the entire codebase:

1. `apps/worker/src/module-runner/ai-layer.ts` — one call per audit module (SECURITY, SEO,
   PERFORMANCE, TESTING, UI), given that module's measured findings plus each applicable
   capability's prompt contribution.
2. `apps/worker/src/orchestrator/master-report.ts` — one call to synthesize the final report
   across all modules' results.

That is the whole AI surface. There is no chatbot, no multi-turn conversation, no tool-calling
loop, no autonomous planning, and no vector search anywhere in the product. Several of the
categories in the standard "AI engineering capability" checklist (Agent Engine in the
LLM-tool-loop sense, AI Memory, RAG, MCP) are **absent by deliberate design**, not by omission —
see each section's verdict below for why that is the right call for this product, not a gap to
fill.

---

## Part 2 — Capability-by-capability audit

### A. AI Gateway

- **Exists:** YES.
- **Where:** `packages/ai-executor/src/executor.ts` (`createExecutor`/`AiExecutor.run`),
  `chain.ts` (`buildChain`), `provider.ts` (the `Provider` interface + `costMicrosOf`),
  `from-env.ts` (`createExecutorFromEnv`), `pricing.ts`, `record.ts`, `validate.ts`, `degrade.ts`.
- **How it works:** One function, `AiExecutor.run<T>(request)`, is the only path to a model.
  It walks a configured, ordered provider chain (`chain.ts`); each attempt has its own timeout
  (`AbortSignal.timeout`, race against an outer cancellation signal); every attempt — success
  *and* failure — is turned into an `AiInvocationRecord` (provider, model, chain position, real
  token counts, latency, cost, outcome) and persisted via `recordInvocations` (`record.ts`) to
  the `AiInvocation` table. A schema failure is treated as a provider failure and advances the
  chain (`validate.ts`). Chain exhaustion returns a typed `{ ok: false, reason:
  'CHAIN_EXHAUSTED' }` — it never throws — and `degrade.ts` turns that into a `DEGRADED` module
  result that still ships the code layer's measured findings.
- **Centralized:** YES, architecturally. Constitution Principle IV states "Direct provider SDK
  calls from module, skill, route, or orchestrator code are forbidden," and in practice there
  are only the two call sites named in Part 1. There is **no automated lint/dependency-boundary
  rule** enforcing this (no `dependency-cruiser`/custom ESLint rule restricting who may import
  `@anthropic-ai/sdk`/`openai`/`@google/generative-ai`) — the guarantee currently rests on code
  review and the small number of call sites, not on a build-time check.
- **Production ready:** YES for the executor itself; two-vendor minimum enforced at *boot*
  (`ChainConfigurationError`), not first-call, so a misconfigured deploy fails immediately.
- **Tested:** YES — `packages/ai-executor/tests/{chain-validation,schema-failure,
  free-tier-chain,pricing-free-tier}.test.ts`, `tests/unit/cost-and-drift.test.ts`,
  `tests/adverse/billing-integrity.test.ts`; consumer-side: `apps/worker/tests/adverse/
  {provider-exhaustion,module-timeout-vs-ai-fallback}.test.ts`.
- **Problems:**
  1. `ProviderChainEntry` (admin-configurable chain, `apps/api/src/services/admin/
     providers.service.ts`) is real and validated at write time, but **no running process reads
     it** — the worker still boots its executor once from `AI_CHAIN`/env vars
     (`apps/worker/src/index.ts` → `createExecutorFromEnv`). An operator reordering providers in
     the admin UI has zero live effect until redeploy. This is already documented in the schema
     comment and flagged in `PRODUCTION-READINESS-MASTER-PLAN.md` T268 as a known, intentionally
     deferred gap.
  2. No static enforcement of the "only ai-executor calls a provider" rule.
  3. One global chain for every module and for master-report — see Model Router (D) below.
- **Action:** **KEEP** the executor design; **IMPROVE** by (a) adding a lightweight
  dependency-boundary lint rule, (b) deciding whether live chain reload is worth building (see
  T307 in the companion tasks file).

### B. Prompt Engine

- **Exists:** PARTIAL — real engineering, not "a pile of string constants," but missing the
  version/rollback/traceability layer a full prompt engine implies.
- **Where:** `apps/worker/src/prompts/{shared.ts,security.ts,seo.ts,performance.ts,testing.ts,
  ui.ts,master-report.ts,index.ts}`.
- **How it works:** `modulePromptFor(module, body, estimatedTokens)` (`shared.ts`) is a real
  prompt *builder*: it prepends a `SHARED_PREAMBLE` (the invariant rules every module prompt
  must obey — no new findings, empty response is valid, redaction-token handling, audience) to
  a module-specific body, and pairs the result with a Zod `moduleInsightSchema` and a declared
  `estimatedTokens` used for drift detection (see N). Each module file
  (`security.ts`/`seo.ts`/etc.) supplies only its specific body — this is composition, not
  duplication. A capability can extend the prompt at runtime via `getSystemPromptAddition()`/
  `getContextData()`, but its text is injected as a labelled, untrusted *segment*, never
  concatenated into the trusted `instructions` string (`ai-layer.ts`, `assemblePrompt` — see
  Context Engine). `apps/worker/tests/unit/prompts.test.ts` asserts structural invariants (every
  module has exactly one prompt, task ids are unique, the shared rules appear verbatim, no
  prompt invites new findings).
- **Centralized:** YES — one module (`prompts/index.ts`) is the only registry; nothing outside
  it builds a system prompt for an audit module or the master report.
- **Production ready:** YES for what it does.
- **Tested:** PARTIAL — structural/contract tests only ("every prompt has these properties"),
  not prose-quality or output-quality tests (the test file's own module note says exactly this:
  "A prompt cannot be unit-tested for quality").
- **Problems:**
  1. No prompt **version** is recorded anywhere. `AiInvocation` has no `promptVersion`/
     `promptHash` column, so after a prompt wording change ships, there is no way to tell, from
     the database, which literal prompt text produced a historical invocation — only "this ran
     after commit X" via git history.
  2. No rollback mechanism independent of a code deploy (prompts are code, so "rollback" today
     means "revert the commit and redeploy"). For a single-deploy monorepo with no per-tenant
     prompt variation and no live A/B testing requirement, this is very likely the right amount
     of machinery — see the target-state recommendation below before assuming more is needed.
  3. No prompt evaluation/optimization tooling (see L, AI Evaluation).
- **Action:** **IMPROVE** — stamp a `promptVersion` (a short hash of the assembled system prompt
  text, computed at call time, zero new infrastructure) onto every `AiInvocation` row, so a
  future evaluation system has something to group by. **KEEP** the composition architecture
  as-is; do **NOT** build a database-backed prompt registry/rollback UI — nothing about this
  single-deployment, code-reviewed product justifies runtime-editable prompts, and Principle
  III/IV's whole design intent is that prompts are reviewed like any other code.

### C. Context Engineering

- **Exists:** YES, and centralized through one function.
- **Where:** `packages/redaction/src/assemble.ts` (`assemblePrompt`),
  `apps/worker/src/module-runner/ai-layer.ts` (`renderMeasured`, segment construction).
- **How it works:** Context for a module's AI call is built from exactly two kinds of material:
  (1) the code layer's own measured findings for that module, rendered as a structured list
  (`renderMeasured`), and (2) each applicable capability's own prompt contribution, collected
  with a per-contribution timeout via `containCapabilityCall` so one hanging/throwing capability
  cannot break prompt assembly for the whole module. Everything that did not originate as the
  platform's own instructions is passed as a labelled `segment`, never appended to
  `instructions` — this is the single most important architectural decision in the whole AI
  surface (see the module note in `ai-layer.ts`): it is what prevents a capability's own text
  (including an INSTALLED, unreviewed capability's text) from being read by the model as an
  authoritative instruction, i.e. it is the primary prompt-injection defense (see Q, AI
  Security). Every segment is redacted for secrets before it reaches the model
  (`detectSecrets`/`assemblePrompt`), and only secrets found in *target-supplied* segments (not
  a capability's own notes) are reported to the customer as findings — a subtle and correct
  distinction the code explicitly reasons about.
- **Token budgeting:** segments are clipped to `DEFAULT_MAX_SEGMENT_CHARS` (24,000 **characters**
  per segment, applied after redaction) — a character budget, not a token budget, and it is
  per-segment rather than a whole-prompt ceiling. There is no whole-prompt token counter, no
  summarization/compression step for a large site's findings, and no explicit token-budget
  reconciliation against `maxOutputTokens`/model context windows before a call is made — the
  system relies on `DEFAULT_MAX_OUTPUT_TOKENS` (16,000) and per-segment clipping being generous
  enough in practice, backed by the fact that each call only ever carries one module's own
  findings plus a handful of capability notes, not an open-ended amount of material.
- **Excessive/duplicated/stale context:** Not observed. Each call is single-shot and stateless;
  there is no conversation history to accumulate staleness, and `priorModuleResults` passed to
  capabilities is a small, explicitly-typed summary (state/score/count/worstSeverity), not raw
  data from other modules.
- **Centralized:** YES — `assemblePrompt` is the only path from raw material to a `RedactedPrompt`,
  and `ai-executor` refuses (throws `UnredactedPromptError`) anything that did not pass through it.
- **Production ready / Tested:** YES — `packages/redaction` has its own adverse suite proving no
  planted credential ever survives into a serialized prompt.
- **Problems:** character-based (not token-based) budgeting is an approximation; no compression/
  summarization strategy if a future module measures orders of magnitude more findings than
  today's modules do.
- **Action:** **KEEP** the segment/instruction separation as the non-negotiable core design.
  **IMPROVE** only if real-world prompts are ever observed approaching truncation — do **NOT**
  preemptively build token-aware compression for a problem that has not been shown to occur;
  add a cheap guard first (log when a segment is actually clipped) before investing in
  summarization.

### D. Model Router

- **Exists:** NO.
- **Where it would be:** would sit in `packages/ai-executor` or `from-env.ts`.
- **How the system actually decides which model to use:** it doesn't, per call. Every module
  (SECURITY, SEO, PERFORMANCE, TESTING, UI) and the master-report synthesis all share **one**
  process-wide chain, built once at boot (`createExecutorFromEnv`) from `AI_CHAIN`/per-vendor
  env vars. There is no task classification, no cost-aware/latency-aware/quality-aware routing,
  and no per-module model override. **All tasks currently use the same model chain.**
- **Centralized / Production ready / Tested:** N/A — nothing exists to rate.
- **Is this a real gap?** Partially. The chain does provide vendor-level fallback (a genuine
  reliability feature), and a cheaper/faster model for the master-report's larger prompt vs. a
  stronger model for security explanation would be a legitimate cost optimization — but building
  a general-purpose router is unjustified complexity for five fixed task types known at compile
  time. A **static, config-declared per-task model override** (e.g., an optional `AI_CHAIN_MASTER_REPORT`
  env var, or a `chain-for(task)` lookup with the current chain as the default) would capture the
  realistic benefit without building an actual "router" (classification, scoring, dynamic
  selection).
- **Action:** **CREATE**, narrowly. Do not build a general model router. Add task-scoped chain
  overrides (see T308) so a future cost-optimization pass has a lever to pull without a
  redesign. Full dynamic/quality-aware routing is **NOT NEEDED** — there is no product signal
  (todo, complaint, or measured cost problem) that justifies it, and it would add a decision
  surface with no current failure mode to fix.

### E. Agent / Workflow Engine

- **Autonomous, tool-calling "agent" in the LLM sense:** **DOES NOT EXIST, AND IS NOT NEEDED.**
  This is a deliberate architectural choice, not a gap: Constitution Principle III ("Deterministic
  Before Probabistic") forbids the AI layer from taking any action or deciding what to measure —
  it only explains what a deterministic code layer already measured. Giving the model tool-calling
  authority would be a direct violation of the product's core promise (a report the AI could not
  have hallucinated its way into). Do not build this.
- **Deterministic workflow / orchestration engine:** **EXISTS, YES**, and is production-grade.
  **Where:** `apps/worker/src/orchestrator/` (`orchestrator.ts`, `master-report.ts`),
  `apps/worker/src/module-runner/` (`index.ts`, `code-layer.ts`, `ai-layer.ts`, `attribute.ts`,
  `persist.ts`, `resolve.ts`, `state.ts`), `apps/worker/src/queue/`, BullMQ on Redis.
  **How:** a scan is a state machine over named phases; modules run **concurrently**
  (`Promise.all` in `orchestrator.ts`, confirmed at the call sites building per-module results
  and the master-report gate) with each module itself running its code layer, then its AI layer,
  then attribution/scoring/persistence. Failure handling is per-module (a module degrades; the
  scan does not fail), with explicit states including `DEGRADED`. Cancellation is cooperative
  and tested (`cancel-mid-flight-no-charge.test.ts`, `master-synthesis-cancel-mid-flight.test.ts`).
  Timeouts are explicit and derived (T256, `module-timeout-vs-ai-fallback.test.ts`).
  **Persistence/credits/tests:** every module writes to Postgres before publishing progress
  (per AGENTS.md's own rule), credit debit/refund is wired to the same lifecycle, and the
  adverse suite (`apps/worker/tests/adverse/`) is extensive.
- **Centralized / Production ready / Tested:** YES across the board for the deterministic
  orchestration engine.
- **Action:** **KEEP.** This is one of the strongest parts of the codebase. Do not introduce an
  agent framework; it would work against, not with, this architecture.

### F. Tool Registry

- **Exists:** YES, under the name "capability," not "tool" — and it is the load-bearing registry
  for the entire product, not just for AI.
- **Where:** `packages/capability-sdk/src/{contract.ts,manifest.ts,discover.ts,contain.ts,
  capability-context.ts,context.ts,conformance/suite.ts}`, `packages/capabilities-vendored/`,
  `apps/worker/src/orchestrator/capability-loader.ts`, `apps/api/src/services/admin/
  capability-upload.service.ts`.
- **How it works:** `AuditCapability` (`contract.ts`) is the one and only coupling point between
  core orchestration code and any individual audit check — core never imports or names a
  concrete capability (Constitution Principle I). Each capability self-declares its module,
  layer (CODE/AI/BOTH), input needs, and `estimatedTokens` via a `capability.manifest.json`
  validated by `manifestSchema` (`manifest.ts`) — including a cross-field rule that a CODE-layer
  capability declaring nonzero tokens is a validation error, and an AI-layer capability
  declaring zero tokens is too. Trust (VENDORED vs. INSTALLED) is **never self-declared** —
  `manifestSchema` is non-strict so a manifest claiming `"trust": "VENDORED"` is silently
  stripped, and trust is instead assigned by `discover.ts` from which directory the manifest was
  found in. Every capability call (code layer, prompt contribution) is wrapped in
  `containCapabilityCall` with a timeout, so a throwing/hanging capability cannot take down its
  module. `conformance/suite.ts` gives every capability a real, runnable test harness for
  contract compliance, exercised before an INSTALLED bundle's first execution (dispatched
  through `sandbox-runner`, T253).
- **Centralized / Production ready / Tested:** YES on all three.
- **Problems:** none rising to the level of the Gateway's live-reload gap. The registry is real
  and load-bearing, not decorative.
- **Action:** **KEEP.**

### G. MCP (Model Context Protocol)

- **Exists:** NO. A repo-wide search found no MCP server, client, tool, resource, or prompt
  definition anywhere in `apps/`, `packages/`, `docs/`, or `specs/`. (The Claude Code *harness*
  running this audit has MCP plugins configured for the operator's own tooling — Context7,
  Playwright, Figma, etc. — but those are developer-tooling integrations for working on this
  repo, not part of the shipped product's architecture, and are out of scope for this audit.)
- **Action:** Per instruction, do not recommend adding MCP without a real architectural reason.
  **No such reason exists.** This product's capability registry (F) already solves "pluggable,
  self-describing units of work with a declared contract" for its actual domain (audit checks),
  and MCP would add a second, redundant plugin protocol with no consumer. **NOT NEEDED.**

### H. AI Memory

- **Exists:** NO, and this is correct for the product.
- **What exists instead:** each AI call is single-shot and stateless. The closest thing to
  "memory" is `CapabilityInput.priorModuleResults` (a small, typed summary another module
  already produced in the *same* scan) and the database itself, which is the durable record of
  everything a scan ever measured — there is no need for a separate memory subsystem when
  Postgres already is the system of record and no call is ever a second turn in a conversation.
- **Action:** **NOT NEEDED.** There is no multi-turn interaction, no assistant persona, and no
  user-facing chat surface anywhere in this product to justify conversation memory, user memory,
  or agent state.

### I. RAG / Retrieval

- **Exists:** NO. No embeddings, vector database, chunking, ranking, or reranking anywhere in
  the codebase (confirmed by search — the only "retriev-" hits are inside a generated Prisma
  client's unrelated internals and an SSRF test's prose).
- **Action:** **NOT NEEDED.** This product's "knowledge" is the audited target itself, measured
  directly by the code layer on every scan (Principle III) — there is no static knowledge base
  to retrieve from, and no product requirement (e.g., "answer questions about past scans," "cite
  a knowledge-base article") that would justify one. Recommending RAG here would be architecture
  for its own sake.

### J. Structured Output

- **Exists:** YES, and this is one of the best-engineered parts of the AI surface.
- **Where:** `packages/ai-executor/src/validate.ts`, every prompt's paired Zod schema
  (`moduleInsightSchema` in `apps/worker/src/prompts/shared.ts`, `masterReportSchema` in
  `master-report.ts`).
- **How it works:** every provider response is parsed as JSON (with exactly one accommodation —
  unwrapping a whole-response markdown code fence, `unwrapFence`) and validated against the
  task's Zod schema. **A schema failure is treated as a provider failure and advances the
  chain** — there is no partial-accept, no field-level repair, no "extract the first `{...}`"
  heuristic. This is a deliberate, well-reasoned design (see the module note in `validate.ts`):
  a response that fails validation is thrown away whole, not salvaged, because a salvaged
  response is an untraceable guess.
- **Centralized / Production ready / Tested:** YES — `packages/ai-executor/tests/
  schema-failure.test.ts` and the structural prompt tests exercise this directly.
- **Action:** **KEEP.** No changes recommended.

### K. AI Test Harness

- **Exists:** PARTIAL — strong on contract/property/adverse coverage, absent on output-quality
  evaluation.
- **What exists:**
  - **Prompt/schema tests:** `apps/worker/tests/unit/prompts.test.ts` (structural invariants
    for every module prompt), `packages/ai-executor/tests/schema-failure.test.ts` (validation
    behavior).
  - **Executor/chain tests:** `chain-validation.test.ts`, `free-tier-chain.test.ts`,
    `pricing-free-tier.test.ts`, `unit/cost-and-drift.test.ts`.
  - **Failure/adversarial tests:** `apps/worker/tests/adverse/{provider-exhaustion,
    module-timeout-vs-ai-fallback,hostile-capability-output,capability-failure,
    installed-capability-failure,process-crash-containment,attribution.property}.test.ts` — this
    is a genuinely adversarial suite: hostile capability output, process crashes, timeout
    races, and property-based attribution tests all have real coverage.
  - **Regression-shaped tests:** `apps/worker/tests/integration/readiness.regression.test.ts`
    (a full re-audit compared against a baseline scan — this is the product's actual
    "regression" feature, FR-066 to FR-072, not a prompt-regression harness).
- **What is missing:** no golden-dataset evaluation (a fixed set of known inputs with expected
  or human-graded outputs), no deterministic grader or LLM-judge scoring output quality/
  relevance/hallucination rate, no prompt-injection-specific test corpus beyond
  `hostile-capability-output.test.ts` (which is about a misbehaving capability's *code*, not
  specifically an adversarial prompt payload designed to hijack the model).
- **How reliable is what exists:** highly reliable for what it tests — contract compliance,
  failure containment, cost/drift accounting. It answers "does the system behave correctly when
  things go wrong," not "is the AI's explanation actually good."
- **Action:** **IMPROVE.** Add a small, narrowly-scoped adversarial prompt-injection test (a
  capability whose `getSystemPromptAddition()` contains an explicit injection attempt, asserting
  the model's response cannot be shown to have obeyed it and that the injected text still gets
  redacted/labelled) — this directly tests the Context Engineering design's central claim rather
  than assuming it. Full golden-dataset evaluation is a **CREATE** decision, addressed in L.

### L. AI Evaluation System

- **Exists:** NO.
- **What the system can and cannot measure today:** it can measure (from `AiInvocation`)
  provider, model, tokens, latency, cost, and outcome (SUCCESS/ERROR/TIMEOUT/SCHEMA_INVALID) per
  call — real operational telemetry. It **cannot** measure correctness, relevance, hallucination
  rate, or whether one prompt wording produces better explanations than another. There is no
  mechanism today to safely evaluate a prompt or model change before it ships, beyond "does the
  schema still validate" (which `prompts.test.ts` already checks) and manual judgment during
  code review.
- **Is this a real gap for this product?** Genuinely, yes — but a narrow one, because the
  product's AI surface is small (five module prompts + one synthesis prompt) and low-risk by
  design (Principle III means the AI can only misjudge/mis-prioritize measured facts, never
  fabricate a finding that reaches the report unattributed — see J and Q). A full LLM-judge
  evaluation pipeline is more machinery than five prompts justify today. What is missing and
  *is* justified: a way to notice, before merge, that a prompt-wording change silently produces
  materially different `insights`/`priorityOrder` output for the same measured input — i.e., a
  snapshot/regression check, not a quality-scoring system.
- **Action:** **CREATE**, narrowly (see T309). Build a small fixture-based snapshot test per
  module prompt: run the real prompt against the `AI_MODE=fixtures` provider (already exists,
  zero cost, deterministic) with a fixed set of representative measured findings, and assert the
  output shape/priority ordering is stable across a documented set of cases. This gives PR
  reviewers a real signal ("this prompt change altered output for case X") without building an
  LLM-judge or a golden human-graded dataset that nothing in this product's current scale
  justifies. **Do not build a full evaluation harness** (deterministic graders scoring
  correctness against a rubric, human-graded golden sets, LLM-as-judge) until real evidence of a
  quality regression in production motivates it — that is over-engineering for a five-prompt
  surface with no user-reported quality complaints on record.

### M. AI Observability

- **Exists:** PARTIAL.
- **What exists:** every AI call's provider/model/tokens/latency/cost/outcome is durably
  recorded per capability execution and per scan (`AiInvocation`, linked to
  `CapabilityExecution.executionId` and `Scan.scanId`) — this is real, queryable, per-operation
  observability, and it is what powers the admin margin report (N) and the drift detector.
  Structured JSON logging exists (`packages/config/src/logger.ts`) with mandatory redaction of
  every field before it is written, wired into the three real process entrypoints (API, worker,
  sandbox-runner).
- **What is missing:** the chain the audit template asks about — User → Request → Workflow →
  Agent → Prompt → Prompt Version → Context → Model → Tool → Tokens → Latency → Retry → Credits
  → Cost → Result → Error — is **not a single traceable chain today**. There is no
  correlation/request/trace ID that threads a single scan's HTTP request, through its BullMQ
  jobs, through its module executions, through its `AiInvocation` rows, and back out through the
  logs written at each stage. Each piece is independently recorded (the DB rows carry `scanId`/
  `executionId` foreign keys, which *is* a correlation key, just not one propagated into the log
  lines themselves) but there is no APM/tracing product wired in — this is already tracked as
  **T299** in the production-readiness master plan ("Pick and wire a real APM/error-tracking/
  monitoring service"), not duplicated here.
- **Action:** **IMPROVE**, and explicitly **do not duplicate T299** — that task already owns
  "pick and wire a real APM." The AI-specific addition this audit recommends (T310) is smaller
  and cheaper: thread `scanId` into every `Logger` call already made from
  `apps/worker/src/module-runner/*` and `orchestrator/*`, so that even before an APM is chosen,
  `grep`-ing structured logs by `scanId` reconstructs a request's AI-relevant timeline. This is
  useful on its own and makes T299's eventual APM integration strictly better (every log line
  already carries the join key).

### N. AI Cost Engine

- **Exists:** YES, and it is precise.
- **Where:** `packages/ai-executor/src/provider.ts` (`costMicrosOf`), `pricing.ts`
  (`pricingFrom`, `dollarsPerMillionToMicros` — implemented as digit-shuffling specifically to
  avoid float error in a money column), `record.ts` (`totalCostMicros`, `totalTokens`),
  `apps/api/src/services/admin/margin.service.ts` (`getMarginReport` — per-scan, per-area,
  per-capability cost aggregation via real Postgres `groupBy`, not JS summation).
- **How it works:** cost is computed from the token counts a provider actually reports (never a
  guess), in integer micros, per invocation; a provider with no configured price **refuses to
  boot** (`PricingNotConfiguredError`) rather than silently recording zero — a genuinely free
  tier must say so explicitly (`freeTier: true`). Margin reporting deliberately does **not**
  compute a dollar-margin figure, because no credit-to-dollar conversion rate exists anywhere in
  the product (an intentional, documented gap pending a product pricing decision) — the service
  reports real cost (micros) and real revenue (credits) side by side rather than fabricating a
  rate.
- **Centralized / Production ready / Tested:** YES.
- **Problems:** no automated cost-runaway alerting (already tracked as **T300**, not duplicated
  here); no credit-to-dollar rate (a product decision, not an engineering gap — see the module's
  own `NOTE` constant, which states this to API consumers directly).
- **Action:** **KEEP.** The design (refuse-to-boot-unpriced, integer micros throughout, real
  per-operation attribution) is exactly right and should not be changed.

### O. Credit Engine

- **Exists:** YES, and it is a real financial ledger, not a balance counter.
- **Where:** `apps/api/src/services/credits/{debit.ts,refund.ts,grant.ts,adjust.ts,balance.ts,
  expiry.ts}`, `apps/api/prisma/schema.prisma` (`CreditLot`, `CreditTransaction`,
  `CreditAllocation`).
- **How it works:** there is no balance column anywhere — balance is always the live sum of
  unexpired lots. `debit.ts` runs inside a single serializable-enough transaction with
  `SELECT ... FOR UPDATE` row locks on the candidate lots (deliberately READ COMMITTED, not
  SERIALIZABLE, with a documented reason: the row lock alone prevents overselling, and
  SERIALIZABLE would only add abort/retry overhead). Consumption order is spelled out precisely
  (expiring-soonest first, PLAN before PURCHASED as an explicit tiebreak, oldest-first as a final
  tiebreak) and each debit records a `CreditAllocation` per lot it drew from, which is what makes
  a later targeted refund correct (refunding to the *originating* lot, not just crediting the
  balance). Insufficient balance is reported before any write happens (`InsufficientCreditsError`
  thrown before any mutation).
- **Centralized / Production ready / Tested:** YES — this is corroborated by an extensive
  adverse suite already documented in the production-readiness master plan (enqueue-failure
  refund, cancel-mid-flight-no-charge, timeout-refund-staleness) and by the constitution's
  Principle VI, which this implementation satisfies point for point.
- **Can credits be bypassed?** No mechanism was found. Every debit path goes through this module;
  quote-then-debit is enforced before scan creation (`apps/api/src/services/intake/
  create-scan.ts`, per the map).
- **Problems:** `FREE_ALLOCATION` (50) < `FULL_AUDIT_COST` (80) is a known, deliberately-closed
  finding (T258 in the master plan — an intentional product decision, not a bug); real Paymob
  integration is blocked on credentials (T267), not an engineering gap.
- **Action:** **KEEP.** This is the strongest-engineered subsystem in the codebase.

### P. AI Credit Accounting (authorize → reserve → execute → measure → finalize → debit/refund)

- **Exists:** YES, matching the requested shape closely, though not under those literal names.
- **How it maps:** *Authorize* = the quote step before scan creation. *Reserve/Execute* = credits
  are debited atomically at scan creation (not "reserved then captured" as a separate two-phase
  step — debit happens up front). *Measure* = `AiInvocation`/`CapabilityExecution` record real
  consumption per attempt regardless of outcome. *Finalize/Debit-or-Refund* = failure paths
  (enqueue failure, cancellation, timeout, worker crash) all route to `refund.ts`, each covered
  by a named adverse test (`enqueue-failure-refund.test.ts`, `cancel-mid-flight-no-charge.test.ts`,
  `timeout-refund-staleness.test.ts`, `process-crash-containment.test.ts`).
- **What about retry, duplicate request, provider failure, fallback model, partial output?**
  Provider failure and fallback are handled entirely inside the AI executor and never touch
  credits directly — a module's overall cost is the sum of whatever the chain actually spent,
  successes and failures alike (see A, N), and a `CHAIN_EXHAUSTED` module still delivers its
  measured findings (degraded, not refunded, because the code-layer work the user paid for did
  happen — this is the correct behavior, not a gap). Duplicate requests are guarded by
  idempotency at the billing-webhook layer (a different, already-covered area — see the master
  plan's T265).
- **Action:** **KEEP.** No changes recommended; this is a mature, well-tested subsystem.

### Q. AI Security

- **Exists:** YES, and it is the best-reasoned part of the AI surface.
- **Prompt injection (direct and indirect):** mitigated architecturally, not just by a filter.
  `assemblePrompt` (`packages/redaction/src/assemble.ts`) and its caller
  (`apps/worker/src/module-runner/ai-layer.ts`) enforce a hard separation between `instructions`
  (the platform's own trusted text) and `segments` (everything else — measured findings, and
  every capability's own prompt contribution, including an INSTALLED, unreviewed capability's
  text). A capability cannot become an instruction no matter what it writes; it is always material
  the model reads and reasons about, labelled as such. This is a real defense against exactly the
  attack the audit template asks about — a malicious/compromised capability trying to command
  the model — and it is defended in the code's own module notes with the specific failure mode
  it closes.
- **Data leakage / secret leakage:** `packages/redaction` detects secrets before any text becomes
  part of a prompt or a log line (`detect.ts`, `assemble.ts`, `logger.ts`'s mandatory redaction
  pass); a secret found in *target-supplied* material becomes a reported finding, while a secret
  found in a capability's own notes is suppressed from the customer-facing report and logged as
  a capability defect instead — a subtlety that prevents an unreviewed capability from forging
  fake credential findings about a customer's site.
- **Privilege escalation / tool authorization:** capabilities have no tools to escalate with —
  `CodeLayerContext` (a narrowed, SSRF-guarded fetch, a narrowed browser page interface, a
  workspace-confined file reader) is the entire surface a capability can touch, and untrusted
  (INSTALLED) capability code executes in `sandbox-runner`, isolated from the API/worker process,
  network, filesystem, and environment (Constitution Principle V; `apps/sandbox-runner/`).
- **Resource/token/credit exhaustion:** per-attempt timeouts, chain-position-bounded retries
  (never unbounded), and drift detection (N) all bound AI resource consumption; credit
  exhaustion is checked before work starts (O).
- **Tenant isolation / SSRF:** out of the AI surface's direct scope but enforced adjacently
  (`packages/safe-net`, already the subject of `specs/003-fix-browser-pool-ssrf/`).
- **Action:** **KEEP.** No AI-security gap was found that rises above what is already tracked
  elsewhere in the repo's security specs. The one addition recommended is the adversarial
  prompt-injection *test* named in K, to prove the design's claim rather than only reason about
  it in comments.

### R. AI Performance

- **Exists:** YES, reasonably well-optimized for the product's shape.
- **Findings:** modules run **concurrently** (`Promise.all` in `apps/worker/src/orchestrator/
  orchestrator.ts`), not sequentially — confirmed at the source. Each module makes exactly **one**
  AI call regardless of how many capabilities contribute to it (batched, not per-capability),
  which bounds both latency and cost predictably; the master report is a second, single call
  after all modules finish. There is no caching of AI responses across scans, but this is
  correct rather than a gap: each scan measures a live target's *current* state, so caching a
  prior scan's AI interpretation for a different (or even the same, later) point in time would
  produce a stale, potentially wrong explanation — the one case caching would be safe (identical
  input, back-to-back) is not a realistic usage pattern for this product.
- **Action:** **KEEP.** No performance issue was identified that a caching layer would
  legitimately fix; do not add AI response caching.

### S. AI Reliability

- **Exists:** YES.
- **What exists:** ordered fallback across ≥2 vendors, per-attempt timeout via `AbortSignal`,
  typed (never thrown) exhaustion, graceful per-module degradation that still ships measured
  findings, cancellation propagated via `AbortSignal` from the orchestrator down through the
  executor. There is no explicit circuit breaker (e.g., "stop calling vendor X for 5 minutes
  after 10 consecutive failures") — each scan's chain walk is independent and does not remember
  a prior scan's failures.
- **Is a circuit breaker missing, or unnecessary?** For a two-or-three-vendor chain walked once
  per module per scan, a circuit breaker would mainly save the cost of a doomed attempt during a
  known vendor outage — a real but modest optimization, not a correctness gap (the chain already
  fails over to the next vendor within the same call). Given the recorded `AiInvocation` history
  already contains everything needed to detect "this vendor has failed N times in a row," this
  is a legitimate, cheap addition once cost data shows it matters.
- **Action:** **IMPROVE**, low priority. Not recommended as an immediate task — flag as a future
  candidate only if `AiInvocation` data ever shows a vendor with sustained outages being retried
  needlessly across many scans (see T300's cost-runaway detection, which would surface this).

### T. AI Configuration

- **Exists:** YES, centralized.
- **Where:** `.env.example`, `packages/ai-executor/src/from-env.ts`, `pricing.ts`,
  `packages/config/src/{constants.ts,queues.ts,phase-modules.ts,plans.ts}`.
- **How it works:** models, timeouts, token limits, and pricing are all environment-declared and
  validated at boot (fail-closed on missing/malformed values), not scattered across call sites.
  Feature flags are minimal and explicit (`AI_MODE=fixtures`, itself guarded against accidental
  production use by `FixtureModeInProductionError`).
- **Problems:** the one configuration surface that is *not* fully centralized in practice is the
  admin-editable `ProviderChainEntry` table, which is real and validated but not live-read by
  any process (same finding as A).
- **Action:** **KEEP** the env-based boot-time validation model; **IMPROVE** per A/T307 if live
  chain reconfiguration is decided to be worth building.

### U. AI Regression Protection

- **Exists:** PARTIAL.
- **What exists today:**
  1. **Cost/consumption drift** (`packages/ai-executor/src/drift.ts`) — detects when a
     capability's real median token consumption has drifted from its manifest's declared
     estimate, with a minimum-sample gate and median (not mean) to avoid one outlier scan
     triggering a false alarm. This is real, tested (`unit/cost-and-drift.test.ts`), and
     genuinely useful regression protection for **cost**, not for output quality.
  2. **Readiness/baseline regression** (`apps/worker/tests/integration/readiness.regression.test.ts`,
     backed by the product's own readiness-certificate feature, FR-066-072) — a full re-audit
     compared against a prior baseline scan, detecting when a *target site* has regressed. This
     is a product feature (the readiness certificate), not an internal AI-quality regression
     harness, but it demonstrates the same "compare against a known-good baseline" pattern this
     audit recommends applying to prompts (see L/T309).
  3. **Property-based attribution tests** (`attribution.property.test.ts`) protect the
     MEASURED-vs-AI_JUDGMENT distinction from silently breaking as code changes.
- **What is missing:** nothing detects whether a prompt-wording change or a model swap silently
  changes the *character* of AI output (tone, priority ordering, which findings get flagged) for
  the same measured input — see L/T309, the one recommended addition, kept intentionally small.
- **Action:** **IMPROVE**, via the fixture-based prompt snapshot test in T309. Do not build a
  general-purpose "AI regression" product beyond that; the existing drift/readiness/attribution
  mechanisms already cover the categories of regression that have a demonstrated cost of getting
  wrong.

### V. Security / Adversarial AI Testing

Already covered in detail under K and Q. Summary: prompt-injection defense is architectural and
reasoned about explicitly in code, but not yet proven by a dedicated adversarial test case (the
one gap, addressed by T311). Malformed tool/capability output, process crashes, and concurrency/
timeout races all have real adverse tests already. Credit-abuse and repeated-request abuse are
covered by the credit engine's atomicity (O) and are outside the AI surface specifically.

### W. Module Architecture

Out of this audit's primary scope (it is a whole-codebase architecture question, not specifically
an AI-engineering one), but worth stating briefly because it bears directly on how safely the
target-state recommendations below can be implemented: the AI surface is cleanly layered
(`packages/ai-executor` has no dependency on `apps/worker` or `apps/api`; `apps/worker` depends
on `packages/ai-executor`/`packages/capability-sdk`/`packages/redaction`, never the reverse) and
each package's boundary is enforced by pnpm workspace dependency declarations, not just
convention. No circular dependency was observed among the AI-related packages during this audit.

### X. Documentation / Architecture Mapping

Existing documentation is unusually thorough for the AI surface specifically: the constitution
(`.specify/memory/constitution.md`) states the AI architecture's governing principles precisely
(Principles III, IV, VI, VII map almost one-to-one onto Context Engineering, AI Gateway, Cost
Engine, and the readiness/reverify feature respectively), and the source code itself carries
extensive module-level design-rationale comments (not implementation-what comments — genuine
why-this-and-not-that reasoning, e.g. `validate.ts`'s explanation of why malformed output is
never repaired). This audit found the in-code documentation to be **more reliable than the
prose docs** in several places (e.g., the `ProviderChainEntry` module note in `schema.prisma` is
the most accurate description of the live-reload gap found anywhere in the repo) — consistent
with `PROJECT_MAP.md`'s own warning that "the implementation is the source of truth."

---

## Part 3 — Scorecard

| Capability | Exists | Quality | Centralized | Tested | Prod-Ready | Action |
| --- | --- | --- | --- | --- | --- | --- |
| AI Gateway | YES | High | Yes | Yes | Yes | IMPROVE |
| Prompt Engine | PARTIAL | High | Yes | Partial | Yes | IMPROVE |
| Context Engine | YES | High | Yes | Yes | Yes | KEEP |
| Model Router | NO | — | — | — | — | CREATE (narrow) |
| Agent Engine (autonomous/tool-calling) | NO | — | — | — | — | NOT NEEDED |
| Workflow/Orchestration Engine (deterministic) | YES | High | Yes | Yes | Yes | KEEP |
| Tool/Capability Registry | YES | High | Yes | Yes | Yes | KEEP |
| MCP | NO | — | — | — | — | NOT NEEDED |
| AI Memory | NO | — | — | — | — | NOT NEEDED |
| RAG / Retrieval | NO | — | — | — | — | NOT NEEDED |
| Structured Output | YES | High | Yes | Yes | Yes | KEEP |
| AI Test Harness | PARTIAL | High | Yes | Partial | Yes | IMPROVE |
| AI Evaluation | NO | — | — | No | No | CREATE (narrow) |
| AI Observability | PARTIAL | Medium-High | Partial | Yes (DB) | Partial | IMPROVE (feeds T299) |
| AI Cost Engine | YES | High | Yes | Yes | Yes | KEEP |
| Credit Engine | YES | High | Yes | Yes | Yes | KEEP |
| AI Credit Accounting | YES | High | Yes | Yes | Yes | KEEP |
| AI Security | YES | High | Yes | Partial | Yes | KEEP + 1 test |
| AI Performance | YES | High | Yes | Yes | Yes | KEEP |
| AI Reliability | YES | High | Yes | Yes | Yes | KEEP |
| AI Configuration | YES | High | Partial | Yes | Yes | IMPROVE |
| AI Regression Protection | PARTIAL | Medium | Partial | Partial | Partial | IMPROVE (narrow) |

---

## Part 4 — Target architecture

**Verdict: no architectural overhaul is warranted.** The target architecture is the current
architecture, with the specific, narrow additions identified above and enumerated as tasks in
the companion file. Restating it as the flow the audit brief proposed, annotated with what
actually exists vs. what this audit adds:

```text
Application (API routes, worker orchestrator)
    v
AI Gateway                  [EXISTS — packages/ai-executor]
    v
Context Engine              [EXISTS — packages/redaction assemblePrompt + ai-layer.ts]
    v
Prompt Engine                [EXISTS — apps/worker/src/prompts, + T307 promptVersion stamp]
    v
Model selection              [T308 — static per-task chain override; NOT a general router]
    v
Deterministic Workflow       [EXISTS — apps/worker/src/orchestrator, module-runner]
  (capabilities = "tools",   [EXISTS — packages/capability-sdk]
   never autonomous agents)
    v
Structured Validation        [EXISTS — packages/ai-executor/src/validate.ts]
    v
Business Validation          [EXISTS — attribution.ts, scoring]
    v
Cost/Credit Engine            [EXISTS — packages/ai-executor cost + apps/api/services/credits]
    v
Persistence                   [EXISTS — Postgres via Prisma]
    v
Observability                 [PARTIAL — T310 scanId log correlation; T299 owns real APM]
    v
Regression/Evaluation         [T309 — fixture-based prompt snapshot tests, narrow]
```

Everything in this flow that the original brief lists but that does not appear above — a general
Model Router, an autonomous Agent Engine, MCP, Memory, RAG, a full Evaluation harness with
LLM-judges and golden datasets — was evaluated and explicitly rejected for this product at its
current scale, for the reasons given in each capability's section. Building them now would be
architecture built for a product this is not.

---

## Part 5 — Cost optimization target (Phase 8 of the audit brief)

| Optimization | Current cost problem | Proposed solution | Expected benefit | Risk | Testing required |
| --- | --- | --- | --- | --- | --- |
| Task-scoped model chain | One chain/model for every task regardless of prompt size/complexity | T308: optional per-task chain override, defaulting to today's chain | Room to route the larger master-report call to a cheaper/faster model if warranted, without a router | Low — additive, defaults preserve current behavior | Unit test: override falls back to default when unset; contract test on `from-env.ts` |
| Prompt-version stamping | Cannot correlate a historical `AiInvocation` to the exact prompt text that produced it | T307: hash the assembled system prompt at call time, store on `AiInvocation` | Enables any future cost/quality investigation to group by prompt version cheaply | Very low — one new column, no behavior change | Migration test; assert hash changes when prompt body changes |
| Cost-runaway alerting | No automated signal when spend spikes (already tracked) | See T300 in the master plan | (not duplicated here) | — | — |
| Deterministic-first | Already the architecture (Principle III) | N/A — already optimal | Already realized: code layer costs zero tokens | — | — |
| Batching (one call per module, not per capability) | Already the architecture | N/A — already optimal | Already realized | — | — |
| Context compression | Character-based clipping only | Do not build proactively (see C) | N/A until evidence of real truncation | Building unused machinery | Add a log-only guard first (near-zero cost) before any real work |
| Caching AI responses | None exists | Do not build (see R) — each scan measures live state | N/A | Caching would produce stale/wrong explanations | N/A |

---

## Part 6 — Testing target (Phase 9 of the audit brief)

The existing testing pyramid for the AI surface is already close to right-sized:

```text
Unit (validate.ts, pricing.ts, drift.ts, chain.ts)             EXISTS
  v
Contract (capability conformance suite, prompt structural)     EXISTS
  v
Integration (module-runner + ai-layer + executor wiring)       EXISTS
  v
Adverse/adversarial (provider-exhaustion, hostile-capability-
  output, process-crash-containment, cancel/timeout races)     EXISTS, strong
  v
Regression (readiness baseline compare; cost/token drift)      EXISTS (product + cost only)
  v
[NEW, narrow] Prompt-injection adversarial test                 T311
  v
[NEW, narrow] Fixture-based prompt output-stability snapshot    T309
```

Not recommended: a dedicated "AI evaluation" test layer with human-graded golden datasets or
LLM-as-judge scoring. Five prompts, each producing a schema-validated, narrowly-scoped
explanation over already-measured facts, do not carry the blast radius that would justify that
investment; the fixture-snapshot test (T309) gives reviewers a real regression signal at a
fraction of the cost.

---

## Part 7 — Architecture decisions log

For each material recommendation above, in the requested WHY / CURRENT PROBLEM / PROPOSED
SOLUTION / ALTERNATIVES CONSIDERED / WHY THIS WINS shape:

### Decision 1 — Add `promptVersion` to `AiInvocation` (T307)

- **Why:** every other dimension of an AI call is already recorded (provider, model, tokens,
  cost, outcome) except the one thing that changes on every prompt-wording PR.
- **Current problem:** no way to answer "which invocations used the old wording" after a prompt
  change ships, short of correlating against git commit timestamps.
- **Proposed solution:** compute a short hash of the fully-assembled system prompt at call time
  (already available in `ai-layer.ts` before the executor call) and pass it through
  `AiRequest`/`AiInvocationRecord` to `record.ts`.
- **Alternatives considered:** a full versioned prompt registry in the database (rejected —
  unjustified complexity for a single-deploy, code-reviewed prompt surface); tagging by git SHA
  at deploy time (rejected — couples an AI-specific record to deploy tooling, and does not
  survive a hotfix that touches unrelated files).
- **Why this wins:** one column, computed from data already in hand, zero new infrastructure,
  and it is the one prerequisite T309's snapshot tests and any future evaluation work would need.

### Decision 2 — Task-scoped chain override (T308)

- **Why:** the master-report synthesis prompt is materially larger and different in kind from a
  module's insight prompt; treating them identically forecloses an easy, low-risk cost lever.
- **Current problem:** `AI_CHAIN` is one process-wide setting; there is no way to run
  master-report synthesis on a different model without changing every module's chain too.
- **Proposed solution:** an optional `chainFor(task)` lookup in `from-env.ts` that falls back to
  the existing single chain when no task-specific override is configured.
- **Alternatives considered:** a full model router with cost/latency/quality scoring (rejected —
  no evidence a dynamic decision is needed over a static, reviewed config value); per-capability
  model selection (rejected — capabilities do not call the executor directly; only module-runner
  and master-report do, and preserving that remains correct per Principle IV).
- **Why this wins:** captures the realistic benefit (route the two known task shapes
  differently) without adding a runtime decision surface that has to be tested for correctness
  under every input.

### Decision 3 — Fixture-based prompt output-stability snapshot (T309)

- **Why:** the one AI-quality question with no answer today is "did this prompt change alter
  behavior for the same input," and it is answerable cheaply using infrastructure that already
  exists (`AI_MODE=fixtures`).
- **Current problem:** `prompts.test.ts` only proves structural invariants; nothing catches a
  wording change that alters tone, omits a rule, or changes priority ordering for a fixed input.
- **Proposed solution:** for each module prompt, a fixed set of representative `CapabilityFinding`
  inputs run through the real prompt-assembly path against the deterministic fixture provider,
  with the resulting request snapshotted (not scored) so a diff shows up in code review.
- **Alternatives considered:** a full LLM-judge evaluation pipeline scoring real model output
  against a rubric (rejected — no real-provider spend should be required to pass a test suite,
  per AGENTS.md's own testing rule, and judged scoring introduces its own nondeterminism); a
  human-graded golden dataset (rejected — disproportionate to five prompts with no reported
  quality incidents).
- **Why this wins:** zero real-provider spend, deterministic, catches the actual failure mode
  (silent behavioral drift) without inventing a quality metric nobody has asked for.

### Decision 4 — `scanId`-correlated structured logs (T310)

- **Why:** T299 will eventually pick a real APM, but every log line written between now and then
  is a missed opportunity to make that integration immediately useful.
- **Current problem:** `createLogger` calls throughout the worker do not consistently include
  `scanId`, so reconstructing one scan's timeline from logs requires cross-referencing timestamps
  by hand.
- **Proposed solution:** thread `scanId` (already available at every call site inside
  `module-runner`/`orchestrator`) into the `fields` argument of every relevant log call.
- **Alternatives considered:** waiting for T299's APM to provide tracing (rejected — T299 has no
  committed timeline, and this costs nothing to do now); building a custom tracing library
  (rejected — that is exactly what T299 is for; duplicating it here would conflict).
- **Why this wins:** cheap, immediately useful, and strictly additive to whatever T299 eventually
  wires in.

### Decision 5 — Adversarial prompt-injection test (T311)

- **Why:** the segment/instruction separation is the single most load-bearing security decision
  in the AI surface, and it is currently proven only by code-review reasoning, not by a test that
  would fail if the separation were accidentally removed.
- **Current problem:** no test constructs a capability whose contribution contains an explicit
  injection payload and asserts the resulting prompt still labels it as untrusted material.
- **Proposed solution:** an adverse test in `apps/worker/tests/adverse/` extending the existing
  `hostile-capability-output.test.ts` pattern, asserting (a) the injection text is present only
  inside a labelled segment, never concatenated into `instructions`, and (b) redaction still
  applies to it like any other segment content.
- **Alternatives considered:** none seriously — this is a straightforward gap-closing test with
  no reasonable alternative.
- **Why this wins:** directly protects the exact property this audit identified as the AI
  surface's primary security control.

---

## Part 8 — Migration, compatibility, rollout, risks, dependencies

- **Migration:** T307 requires one additive, nullable Prisma migration (`AiInvocation.promptVersion`).
  No backfill is meaningful (historical rows predate any prompt hash) — leave existing rows null.
- **Compatibility:** all five tasks (T307-T311) are additive; none change an existing public
  contract, route, or schema field's meaning. No rollback plan beyond a standard migration
  revert is needed.
- **Rollout:** no phased/flagged rollout needed — these are internal engineering-quality
  improvements with no user-facing behavior change.
- **Risks:** the only genuine risk is scope creep — turning T309's narrow snapshot test into an
  attempted full evaluation harness, or T308's static override into an attempted general router.
  Both are explicitly scoped against in the task descriptions in the companion tasks file.
- **Dependencies:** T309 depends on T307 (useful, not strictly required — a prompt hash makes the
  snapshot test's failure messages more informative, but the test can be written without it).
  T310 has no dependencies. T308 has no dependencies. T311 has no dependencies.

---

## Part 9 — Second-pass review (2026-09-12): Evaluation, Observability, Cost Reconciliation,
## Idempotency/Retry Safety, Failure Handling

A follow-up review, again by direct source inspection only, covering six areas the first pass
touched on but did not exhaustively verify, plus a re-check of T307-T311 against the source
(not just against the first pass's own notes). One genuine, previously-unsurfaced gap was found
(see 9.5); everything else in this section confirms the first pass's conclusions or closes them
out as already complete.

### 9.1 Full AI Evaluation System

No change to the Part 2 §L verdict. Re-inspected `apps/worker/tests/unit/prompts.test.ts` and
`packages/ai-executor/src/providers/fixtures.provider.ts` directly (not just from memory of the
first pass): the fixture provider returns a fixed stub regardless of input, which is exactly why
T309 is scoped to snapshot the **assembled prompt text**, not model output — scoring a fixed
stub's "quality" would be meaningless. **Decision confirmed: T309 remains sufficient. No larger
evaluation architecture (golden datasets, LLM-judge, human-graded scoring) is justified** — five
prompts with no reported quality incidents do not carry the blast radius that would justify it.

### 9.2 AI Observability

No change to the Part 2 §M verdict, confirmed by re-reading `packages/config/src/logger.ts` and
`apps/worker/src/module-runner/persist.ts`/`ai-layer.ts` directly. `scanId` already flows into
every DB row that matters (`AiInvocation.scanId`, `CapabilityExecution.scanId` — confirmed in
`persist.ts`), so **DB-level correlation is real and was already correct**; it is specifically
the **log lines** (`Logger.debug/info/warn/error` calls) that do not consistently carry `scanId`
today. T310 remains correctly scoped as a log-content-only change. **T299 (real APM) is still
the right owner of distributed tracing; not duplicated here.**

### 9.3 AI Cost Optimization

No change to the Part 2 §N/§R verdicts. `apps/api/src/services/admin/margin.service.ts` (re-read
in full during this pass) already answers "which module/capability costs the most" via real
Postgres `groupBy` aggregation — this was correctly identified as mature in the first pass. It
cannot yet answer "which *prompt version* costs the most" because no prompt-version column exists
yet — this is precisely what T307 unblocks, and no separate cost-optimization task is needed
beyond T307/T308.

### 9.4 Credit ↔ AI Cost Reconciliation

**Verdict: mostly COMPLETE, one gap found and folded into 9.5 rather than duplicated.**
`margin.service.ts`'s `perScan` rows already report `chargedCredits` (revenue, from `Scan`) next
to `costMicros` (real spend, summed from `CapabilityExecution` via `groupBy`) — this **is** the
reconciliation view the brief asks for, already real and already tested. `debit.ts` (re-confirmed
this pass) debits once, atomically, at scan creation, under a `FOR UPDATE` row lock, and is
therefore never a source of duplicate customer charges regardless of what happens later in the
scan's lifecycle. The one real reconciliation risk found — a scan's *recorded cost* being
silently inflated by a duplicate AI-layer execution, with no corresponding change in
`chargedCredits` — is a consequence of the retry/idempotency gap in 9.5, not a separate defect in
the credit or margin code. No new credit-engine task is needed; **T312 (9.5) is the fix.**
Automated anomaly *alerting* on an inflated `costMicros` remains T300's scope (cost-runaway
detection), not duplicated here.

### 9.5 Idempotency and Retry Safety — one real gap found

This is the one place this second pass changed the picture. `packages/config/src/queues.ts`'s own
module comment on `DEFAULT_JOB_OPTIONS` (`attempts: 1`) is exactly right about the *intent*: "the
phase has already charged credits, already written `ModuleResult` rows, and may already have paid
a provider. A blind retry double-charges and double-writes... recovery is a decision, not a
default." This reasoning fully covers **explicit** job failure (a thrown error / rejected phase
handler): with `attempts: 1`, BullMQ will not automatically re-run a phase job that threw.

**What it does not cover, and what is not gated by `attempts` at all: BullMQ's stalled-job
recovery.** `apps/worker/src/queue/workers.ts` constructs every `Worker` with `lockDuration:
QUEUE_LOCK_DURATION_MS` (5 minutes) and `stalledInterval: QUEUE_STALLED_INTERVAL_MS` (30 seconds)
but does not set `maxStalledCount` and installs no `worker.on('stalled', ...)` handler. BullMQ's
default `maxStalledCount` is **1**, meaning: if a worker process dies (crash, OOM-kill, forced
restart) while holding a `scanPhase` job's lock — after it has already made a real, billed AI
provider call and before the job handler returns and persists — BullMQ detects the stall (via
`stalledInterval`) and **automatically moves the job back to `wait` and reprocesses it once, on
whatever worker picks it up next, independent of `attempts: 1`.** The reprocessed run repeats the
module's code layer (harmless — deterministic, zero-token, and `moduleResult.upsert` is
idempotent on `(scanId, module)`) **and repeats its AI layer** (a second, real, separately-billed
provider call), then writes a **second** `CapabilityExecution`/`AiInvocation` row for that module
via `create`/`createMany` (confirmed in `persist.ts` — neither is an upsert, unlike
`moduleResult`). No customer is double-charged (credits were debited once at scan creation, not
per phase), but **the platform pays a real provider twice for one module's AI interpretation, and
the ledger records it as if that were normal**, silently inflating that scan's true cost above
what `margin.service.ts` or `drift.ts` would otherwise expect for a scan of its shape. No existing
test (`process-crash-containment.test.ts` covers a capability's detached-callback crash, not a
worker-process-level stall/restart; `timeout-refund-staleness.test.ts` and
`cancel-mid-flight-no-charge.test.ts` cover cooperative cancellation/timeout, a different code
path from BullMQ's own stall-recovery) exercises this scenario. **This is a genuine, previously
unsurfaced gap.** See **T312** in the companion tasks file.

### 9.6 Failure Handling

**Verdict: COMPLETE. No task needed.** Confirmed directly from `packages/types/src/domain.ts`:
`MODULE_STATES = ['PENDING','RUNNING','COMPLETE','DEGRADED','FAILED','NOT_APPLICABLE']` — `FAILED`
is a distinct state from `NOT_APPLICABLE` (nothing to check) and from `DEGRADED` (measured, not
interpreted), so a failed module is never confusable with "no findings." Only `COMPLETE` and
`DEGRADED` are scored (`MODULE_STATES_SCORED`), so a `FAILED` area is correctly excluded from the
overall average rather than silently zeroed or silently ignored. Confirmed directly from
`apps/worker/src/orchestrator/master-report.ts`: master-report reads **every** module's
`state`/`score`/`summary`/`skippedReason` from the database (`db.moduleResult.findMany`) and
renders each one's state explicitly into its own prompt context — master-report unambiguously
knows when an area failed, degraded, or was not applicable, and reasons over that fact rather
than being blind to it. This closes Phase 7's central question with direct evidence rather than
inference.

### 9.7 Re-verification of T307-T311 against source (not just against the first pass's notes)

- **T307** (promptVersion): design decision (hash `instructions` only, not the full assembled
  per-scan prompt) re-confirmed correct after re-reading `ai-layer.ts` and `master-report.ts`
  directly this pass — both assemble `instructions` from a static prompt object
  (`MODULE_PROMPTS[module].systemPrompt` / `masterReportPrompt.systemPrompt`) before mixing in
  any per-scan segment, so hashing `instructions` before assembly is straightforward at both call
  sites. **No change to T307's scope.**
- **T308** (task-scoped chain, master-report only): re-confirmed there are still exactly two
  executor call sites and master-report is still the only one materially different in shape.
  **No change to T308's scope.**
- **T309** (snapshot tests): re-confirmed against the fixture provider's actual (input-independent)
  behavior — see 9.1. **No change to T309's scope.**
- **T310** (scanId in logs): re-confirmed the gap still exists — see 9.2. **Implemented and
  verified during this same audit session** (2026-09-12): a full sweep found only one AI-relevant
  log call site actually lacked `scanId` (`ai-layer.ts`'s `contributorSecrets` warning; every
  other candidate call site already interpolated it). Fixed and confirmed via a real test run.
  Status: **DONE** — see the companion tasks file's T310 section for the exact diff.
- **T311** (prompt-injection boundary test): re-confirmed no such test existed at the start of
  this pass. **Implemented and verified during this same audit session**: added
  `apps/worker/tests/adverse/prompt-injection-boundary.test.ts`, confirmed it passes against the
  real code, and confirmed (via a temporary, reverted edit to `ai-layer.ts`) that it fails if the
  segment/instruction boundary is broken. Status: **DONE** — see the companion tasks file's T311
  section for the full test source and verification transcript.

### 9.8 Explicit scope decisions (Phase 12 of the brief)

| Question | Answer |
| --- | --- |
| Full Model Router — exists? | No. Needed? No — five fixed task shapes, static config (T308) captures the real benefit. **DECISION: NOT NEEDED NOW.** |
| Prompt Registry (DB-backed, versioned, rollback-able) — exists? | No. Needed? No — single-deploy, code-reviewed prompts; T307's hash gives traceability without a registry. **DECISION: NOT NEEDED NOW.** |
| Full Evaluation Platform (LLM-judge, golden datasets) — exists? | No. Needed? No — see 9.1; T309's snapshot test is the right-sized substitute. **DECISION: NOT NEEDED NOW.** |
| Tracing Platform / APM — exists? | No (already tracked as T300 in the master plan, not this document's scope to re-decide). T310 is a cheap, complementary step, not a substitute. **DECISION: OWNED BY T299/T300, ALREADY PLANNED.** |
| Agent Framework (autonomous tool-calling) — exists? | No. Needed? No — would violate Constitution Principle III. **DECISION: NOT NEEDED, EVER, BY DESIGN.** |
| MCP — exists? | No. Needed? No consumer or architectural driver identified. **DECISION: NOT NEEDED NOW.** |
| RAG — exists? | No. Needed? No knowledge base exists to retrieve from. **DECISION: NOT NEEDED NOW.** |
| Memory — exists? | No (by design — every call is single-shot/stateless). Needed? No conversational surface exists. **DECISION: NOT NEEDED, EVER, BY DESIGN.** |

### 9.9 Updated task list

T307-T311 stand exactly as scoped in Part 7/the companion tasks file. One task is added:
**T312 — Prevent/detect duplicate AI-layer execution on BullMQ stalled-job recovery** (see the
companion tasks file). No other new tasks are justified by this pass.

**Execution status as of 2026-09-12 (end of this audit session):** T310 and T311 are implemented,
tested, and verified (see Part 9.7 above and the companion tasks file's status table). T307,
T308, T309, and T312 are fully specified — including literal code snippets, exact file paths, and
step-by-step instructions — in the companion tasks file, sequenced into execution phases, but
**deliberately not implemented in this session** so that the remaining, larger changes (a schema
migration, two executor-package edits, two new test files, a BullMQ configuration change with an
explicit behavioral trade-off) can be picked up and executed independently, task by task, against
the fully-detailed instructions in `docs/reviews/AI-ENGINEERING-TASKS.md`.

**Update (2026-09-12, later the same day): all six tasks are now implemented.** A follow-up
session executed T307, T308, T309 (including its master-report snapshot), and T312 against the
phase-kickoff prompts in `docs/reviews/AI-ENGINEERING-PHASE-PROMPTS.md`. A subsequent, independent
strict delta review re-verified every task against the real source (not against the prior
session's own claims) and re-ran the full test suite from a clean shell: whole-repo unit/contract/
integration project — 160 files / 1107 tests passed; whole-repo adverse project — 844/846 passed,
with the 2 non-passing traced to one pre-existing, unrelated, timing-sensitive test
(`control-gate-level1-rate-bound.test.ts`) confirmed flaky (fails only under a long, CPU-contended
combined run; passes 3/3 in isolation) rather than a regression from this initiative; `pnpm
typecheck` — 30/30; `pnpm lint` — clean; the new `AiInvocation.promptVersion` migration confirmed
applied to the real dev database. The only defects this review found were two documentation
gaps — per-task status lines/checkboxes in the tasks file not updated to match the real,
verified completion state, and T312's own required "confirm the timeout-sweep dependency"
step never actually having been performed — both fixed in place in the companion tasks file. No
code-level defect and no scope creep were found in the implementation itself. This cross-cutting
AI-engineering initiative (T307-T312) is complete.
