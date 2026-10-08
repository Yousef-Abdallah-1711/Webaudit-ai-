# Current Scan Architecture

Read-only architecture audit, 2026-10-07. Evidence standard: every claim cites a file path and
symbol. `UNKNOWN - NOT PROVEN FROM CURRENT REPOSITORY` where the repo does not settle a question.
Produced by direct source reading plus one independent cross-check (OpenAI Codex, `gpt-6-luna`,
`--sandbox read-only`, same questions, no shared context) — agreement is called out explicitly;
the one place it added a correction is marked.

## 1. What "Fahes" / WebAudit AI actually is

Turborepo monorepo, Node >=22, pnpm 9, TypeScript. Five deployable units:

| Unit | Entry | Role |
|---|---|---|
| `apps/web` | `app/layout.tsx` | Next.js 15/React 19 frontend, port 3000 |
| `apps/api` | `src/index.ts` -> `src/app.ts` | Express API, port 3001 |
| `apps/worker` | `src/index.ts` | BullMQ consumers; all audit/readiness/reverify execution; no HTTP port |
| `apps/probe-pool` | `src/browser/pool.ts` | Isolated Chromium provisioning. `createBrowserPool` exists but the worker's `contextFactory` (`apps/worker/src/orchestrator/orchestrator.ts`) never supplies a `pageProvider`, so `createCodeLayerContext.withPage` (`packages/capability-sdk/src/context.ts`) always rejects with "No browser pool is configured." CONFIDENCE: HIGH (confirmed independently by both reads). |
| `apps/sandbox-runner` | `src/host/server.ts` | HTTP host that forks a locked-down Node child to run Fahes's own **operator-installed** capability code (not customer code) against attached source/URL; port 3003 |

## 2. End-to-end execution graph

```
USER -> /scan (ScanForm + InputTabs) -> target created/staged
     -> POST /scans/quote (quoteFor -> quoteAreas, no charge)
     -> POST /scans (createScan: balance check, control-gate re-confirm, Scan row, debit)
     -> enqueue webaudit-scan-phase job (RUNNING_PHASE_1)
     -> worker dispatch -> createPhaseHandler
        Phase 1: requested modules except UI (PERFORMANCE/SECURITY/SEO/TESTING)
        AWAITING_QUESTIONNAIRE gate (design intent, R4)
        Phase 2: UI (code layer + impeccable AI layer)
     -> runModule per module: resolveApplicable -> code-layer checks (concurrent)
        -> merge findings -> runAiLayer (one call per module, redacted) -> attribute
     -> persistModuleResult: ModuleResult, Issue, CapabilityExecution, AiInvocation rows
     -> RUNNING_MASTER -> runMasterSynthesis (overallScore, summary)
     -> RUNNING_DOCS -> COMPLETED
     -> report API builds response from Scan + ModuleResult + Issue (no separate Report row)
     -> fix loop: assert-fixed -> 3cr reverify (one check only, issue-triggered, not automatic)
     -> readiness pass: fresh audit vs baselineScanId -> diff + verdict
     -> retention sweep removes expired report data + scan-prefixed artifacts;
        terminal teardown removes the scan workspace on completion/failure/timeout/cancel
```

EVIDENCE: `apps/web/components/scan/ScanForm.tsx:resolveTargetId,onSubmit`; `apps/web/components/scan/InputTabs.tsx`; `apps/api/src/routes/targets.routes.ts`; `apps/api/src/routes/scans.routes.ts`; `apps/api/src/services/intake/create-scan.ts:createScan`; `apps/api/src/services/intake/quote.ts:quoteFor`; `packages/config/src/pricing.ts:quoteAreas`; `apps/api/src/services/credits/debit.ts:debit`; `apps/api/src/services/queue/scan-phase-producer.ts:enqueueFirstPhase`; `packages/config/src/queues.ts:QUEUE_NAMES`; `packages/config/src/phase-modules.ts:modulesForPhase`; `apps/worker/src/queue/workers.ts:dispatch,createWorkers`; `apps/worker/src/orchestrator/orchestrator.ts:createPhaseHandler`; `apps/worker/src/orchestrator/capability-loader.ts:loadCapabilities`; `apps/worker/src/module-runner/index.ts:runModule`; `apps/worker/src/module-runner/ai-layer.ts:runAiLayer`; `apps/worker/src/module-runner/persist.ts:persistModuleResult`; `apps/worker/src/orchestrator/master-report.ts:runMasterSynthesis`; `apps/api/src/routes/reports.routes.ts`; `apps/worker/src/reverify/runner.ts:runReverification`; `apps/api/src/services/storage/retention.ts:enforceRetention`; `apps/worker/src/workspace/teardown.ts:installTerminalTeardown`. `apps/api/prisma/schema.prisma` models `Target`, `Scan`, `ModuleResult`, `Issue`, `CapabilityExecution`, `AiInvocation`, `ReadinessVerdict`. `ScanState` enum: `QUEUED -> RUNNING_PHASE_1 -> AWAITING_QUESTIONNAIRE -> RUNNING_PHASE_2 -> RUNNING_PHASE_3 -> RUNNING_MASTER -> RUNNING_DOCS -> COMPLETED`. CONFIDENCE: HIGH throughout (independently corroborated).

## 3. Website URL input mode

- **Validation/normalization**: UI prefixes `https://` if missing; API's `validateUrl` (`packages/safe-net/src/validate-url.ts`) accepts only HTTP(S), rejects embedded credentials, refuses empty/internal hostnames. `Target.canonicalValue` stores the origin only — path/query are not retained as the scan target.
- **SSRF protection** (platform's own outbound fetch, four layers, one shared classifier): `classifyHostAddress` (`packages/safe-net/src/address-rules.ts`) covers all RFC1918 ranges, loopback, link-local, cloud-metadata IPs for AWS/GCP/Azure/DigitalOcean/Hetzner/Alibaba/Oracle (IPv4 and IPv6), and six IPv4-in-IPv6 transition-tunnel formats (mapped, translated/RFC2765, NAT64/RFC6052 across all 6 legal prefixes, 6to4, Teredo). `assertResolvedAddressesAllowed` re-checks every DNS answer; the connect guard re-checks the socket's actual peer address (defeats DNS-rebinding between resolve and connect); `guardedFetch` disables automatic redirect-following and revalidates every redirect hop individually.
- **Crawl scope**: no site-wide crawler exists. Each capability fetches the one target URL once via guarded `ctx.fetch`. Two capabilities sample a small, bounded set of same-page references: `playwright-runner` (up to 15 same-origin links, one hop, no recursion) and `network-inspector` (up to 15 referenced sub-resources). Neither is a crawl.
- **Browser rendering**: not operative in any current deployment (see §1). Browser-dependent capabilities catch the `withPage` rejection and fall back to whatever HTTP-only check they also have, or return no findings.
- **Timeouts/redirects/retries**: `safeFetch` defaults (`packages/safe-net/src/policy.ts`) — 30s whole-chain timeout, 5 redirects max, 10 MiB response cap, no retry loop. GitHub zipball retrieval uses a separate 120s timeout (`apps/worker/src/intake/repo-clone.ts`). A module's outer timeout is derived from AI-provider-chain length plus a 15s margin; provider attempts are capped at 60s each (`packages/ai-executor/src/executor.ts:AI_PROVIDER_ATTEMPT_TIMEOUT_MS`).

CONFIDENCE: HIGH (independently corroborated, exact numeric values added by the Codex cross-check).

## 4. Repository input mode

- **Provider**: GitHub only. OAuth sign-in supports Google and GitHub; `GET /repos` requires a connected GitHub token, retrieved encrypted-at-rest via `apps/api/src/services/auth/token-vault.ts:seal,open`.
- **Fetch mechanism — correction to an earlier draft of this document**: the worker does **not** `git clone`. `materialiseRepository` (`apps/worker/src/intake/repo-clone.ts`) requests a **GitHub zipball**, not a git checkout. It accepts an optional ref parameter, but the current call site (`materialiseSource`, `apps/worker/src/intake/materialise.ts`) never supplies one — so every scan today fetches the repository's **default branch at fetch time**, with no commit-SHA pinning. The repository picker lists one page of up to 100 repos (a UI/picker limit, not a scan file limit).
- **Workspace**: the extracted tree lands in a per-scan worker filesystem workspace (`apps/worker/src/workspace/create.ts:createScanWorkspace`), **not** inside sandbox-runner. Capabilities read it through a confined context (`ctx.readFile`/`ctx.glob`, `packages/capability-sdk/src/context.ts`) — never a raw filesystem call.
- **Analysis depth**: manifest/regex/text-metric only. `dependency-scanner` parses `package.json` with plain `JSON.parse`; no AST parser dependency exists anywhere in `packages/capabilities-vendored`.
- **Limits**: file listing stops at 20,000 files (`MAX_LISTED_FILES`, `apps/worker/src/intake/materialise.ts`), skipping `.git`, `node_modules`, `.next/cache`. The zipball itself is subject to the same archive limits as an uploaded ZIP (`ARCHIVE_LIMITS`, `packages/config/src/constants.ts`).
- **Cleanup**: terminal teardown removes the workspace on completion/failure/timeout; cancellation routes through a maintenance-queue teardown job.

CONFIDENCE: HIGH. The git-zipball-not-clone fact and the "no ref is ever passed" fact were supplied by the Codex cross-check and are flagged here as corrections to assumption, not independent re-derivation on my part.

## 5. Uploaded archive (ZIP) input mode

- **Accepted format**: ZIP only, detected by signature (`packages/safe-archive/src/zip.ts:looksLikeZip`), not by filename extension or declared MIME type.
- **Size/limits (exact, from `packages/config/src/constants.ts:ARCHIVE_LIMITS`)**: upload cap 52,428,800 bytes (50 MiB); uncompressed ceiling 536,870,912 bytes (512 MiB); expansion ratio cap 100x; entry-count cap 20,000. The effective budget is `min(archiveBytes x maxRatio, maxUncompressedBytes)` — both rules apply, not just one.
- **Protections** (`packages/safe-archive/src/guard.ts`, read in full): path traversal (`normaliseEntryPath` rejects absolute paths and `..` after backslash normalization) -> `PATH_ESCAPES_ROOT`; symlinks/devices/sockets/FIFOs refused outright, never dereferenced (`assertRegular` -> `NON_REGULAR_ENTRY`); decompression-bomb defense enforced **twice** — once from central-directory metadata before any byte is written, once streamed byte-by-byte during extraction via a `ByteBudget` transform that aborts mid-write (`DECLARED_SIZE_MISMATCH`/`EXPANSION_RATIO_EXCEEDED`); two members normalizing to the same path refused (`MALFORMED_ARCHIVE`); unsupported compression methods and Zip64 refused. Nested archives are not recursively extracted — they are just inert files inside the outer ZIP.
- **Order of operations**: `inspectArchive` runs unconditionally before `extractArchive` and before any credit is charged — refusing a hostile archive is free.
- **Storage**: validated bytes are staged in R2 under a user-scoped, content-addressed key (`uploads/<userId>/<sha256>.zip`, `apps/api/src/services/storage/uploads.ts:uploadKeyFor`). At scan execution the worker extracts into the same per-scan workspace repository mode uses.
- **Retention gap (open question, not resolved by this audit)**: `UploadStorage` exposes a `remove` method, but no application call site invoking it was found anywhere under `apps/api/src` or `apps/worker/src`. The scan **workspace** is provably cleaned up (terminal teardown); whether the **staged ZIP object in R2** is ever deleted or expires is `UNKNOWN - NOT PROVEN FROM CURRENT REPOSITORY`. CONFIDENCE: MEDIUM — absence of a call site is good evidence of absence but not proof across the whole deployment (e.g. a bucket lifecycle policy configured outside the repo would not appear here).

CONFIDENCE: HIGH except the retention gap (MEDIUM, explicitly flagged).

## 6. Sandboxing reality check

**Customer-supplied code is never executed.** No scan path runs repository or ZIP contents as code. `materialiseSource` only lists/reads files; `dependency-scanner` only parses manifests. `apps/sandbox-runner`'s dispatch path is for **operator-installed capabilities** (`makeSandboxedCapability`, `apps/worker/src/orchestrator/capability-loader.ts`) — it runs Fahes's own (reviewed-once-then-updated, per the `INSTALLED` trust level) TypeScript harness, bundled once at host startup (`apps/sandbox-runner/src/host/build-harness.ts`: esbuild-bundles `child-harness/harness.ts` into a dependency-free `.js` because `tsx`'s own bootstrap needs a worker thread the sandbox's `--permission` flags forbid). The customer's source is data that harness reads, never code it runs.

Isolation enforced for that sandboxed dispatch, exact configured values:
- Fresh child process per dispatch, empty environment.
- `node --permission`: no network, no filesystem write, no child-process spawn, no worker-thread permission; filesystem read narrowed to harness/runtime paths only.
- Wall-clock timeout: parent arms an unconditional `SIGKILL` via `setTimeout` (`apps/sandbox-runner/src/limits/timeout.ts:armTimeout`) — uncatchable by the child, immune to a tight-loop or a custom signal handler. Configured value: **30,000 ms**.
- Memory: V8 heap ceiling via `--max-old-space-size` (`apps/sandbox-runner/src/limits/memory.ts:memoryExecArgv`), layered under a deployment-level cgroup limit described in `infrastructure/sandbox-runner.md` as defense-in-depth against a native allocation bomb that wouldn't trip V8's own OOM. Configured value: **256 MiB**.

**Not established in process code** (per the Codex cross-check, which I did not independently re-verify): no explicit CPU quota or child-process-count limit in the sandbox's own source; actual network-egress enforcement and Docker-socket/cloud-metadata-specific controls are described in the deployment runbook (`infrastructure/sandbox-runner.md`) but not verifiable from a static checkout alone — `UNKNOWN - NOT PROVEN FROM CURRENT REPOSITORY` for whether that runbook description matches the real deployed configuration. CONFIDENCE: HIGH for the timeout/memory/permission mechanism; MEDIUM for deployment-level network/CPU enforcement.

## 7. Queue / worker architecture

BullMQ + Redis, four named queues (`packages/config/src/queues.ts:QUEUE_NAMES`): `webaudit-scan-phase`, `webaudit-reverify`, `webaudit-maintenance`, `webaudit-email-notification`. Worker concurrency per queue (`apps/worker/src/queue/queues.ts:CONCURRENCY`): scan-phase **4**, reverify **8**, maintenance **1**, email **4**. Priority bands (`PRIORITY`): `REVERIFICATION=5` (highest) `< BUSINESS=10 < PRO=20 < STARTER=30 < FREE=40 < MAINTENANCE=50`.

Retries: `DEFAULT_JOB_OPTIONS.attempts = 1` (no blind retry on a scan-phase job — it may have already charged credits and called a paid AI provider; `SCAN_PHASE_MAX_STALLED_COUNT = 0` makes a stalled phase fail immediately rather than silently reprocess). `REVERIFY_JOB_OPTIONS` (reverify + email) gets `attempts: 3`, exponential backoff starting at 2,000 ms — safe because reverify is idempotent by construction. Shared lock duration 5 minutes, stalled-check interval 30 seconds. No separate dead-letter queue; failed jobs are retained per BullMQ's own removal settings and alerted via `captureAlert`.

Timeout/cancellation: `SCAN_TIMEOUT_MS` defaults to **15 minutes** (`apps/worker/src/orchestrator/timeout-scheduler.ts`), with a repeatable sweep every 60 seconds that fails and refunds stale scans. Cancellation is an API state transition that blocks future phases and refunds undelivered work; in-flight capability work is not forcibly interrupted at the moment of cancellation (it runs to its own timeout/completion).

**Can the current model support 30s-to-multi-hour jobs without architectural change?** No. The scan-wide default (15 min), the module-level timeout (AI-chain-length-derived, provider attempts capped at 60s), and the "one attempt, refund on failure" philosophy are all tuned for short, bounded, mostly-deterministic work. A genuinely long-running job (e.g. a future load test) would need its own queue (matching the established "own queue so X can't starve" pattern), its own timeout constant, and a different failure/recovery model than "the phase already failed, refund it" — additive plumbing, not a BullMQ rewrite, but not a config flip either. CONFIDENCE: HIGH for current numbers; the extrapolation to future work is reasoned inference, flagged as such.

## 8. Credit system

Prices, exact (`packages/config/src/pricing.ts`): `AREA_COST = { PERFORMANCE:20, SECURITY:20, UI:25, TESTING:20, SEO:10 }`; `FULL_AUDIT_COST=80` (bundle, vs 95 summed individually); `REVERIFY_COST=3`; `READINESS_PASS_COST=60`. `quoteAreas` applies the bundle price only when all five areas are selected, never lets selecting everything cost more than the bundle.

Mechanism: a **direct debit at scan creation** against locked credit lots (`apps/api/src/services/credits/debit.ts:debit`), with allocation records (`CreditAllocation`) tying each debit to the lots it drew from — not a separate two-phase reserve-then-capture ledger. Failed enqueue after debit triggers a full refund and marks the scan `FAILED`. Terminal failure/cancellation uses a proportional undelivered-module refund (`packages/config/src/refund.ts:refundForUndelivered`, `apps/api/src/services/credits/refund.ts:refundPartial`).

Pricing is **hardcoded TypeScript constants**, not DB-priced, not duration/resource-scaled. The metering primitive for variable cost already exists (`CapabilityExecution.costMicros`, integer micros, currently populated only for AI spend) but the pricing *function* does not consume it. A new fixed-price operation (e.g. a new scanner domain at a flat per-area cost) fits the existing debit/refund ledger directly. A genuinely usage-based operation (cost scaling with duration or compute, e.g. a load test) would need new code to compute that cost — no such mechanism exists today. CONFIDENCE: HIGH.

## 9. Production readiness engine

A readiness pass is a fresh `READINESS`-kind `Scan` tied to a completed `INITIAL` baseline via `baselineScanId`. **Creation precondition** (not previously documented): `createReadinessScan` refuses to start if the user does not own the baseline, if the plan disallows readiness, or **if the baseline still has outstanding CRITICAL/HIGH issues** (`countOutstandingBlocking`, `apps/api/src/services/readiness/create.ts`).

Verdict algorithm (`apps/worker/src/readiness/verdict.ts:computeVerdict`, `diff.ts:diffAgainstBaseline`): per-module thresholds are config constants (`READINESS_THRESHOLDS = { PERFORMANCE:80, SECURITY:80, UI:70, TESTING:75, SEO:70 }`, `packages/config/src/constants.ts`). A module passes iff `score !== null && score >= threshold`. Three named regression kinds: (1) an area's score fell >=3 points (`AREA_REGRESSION_MIN`) or its `ModuleState` degraded rank; (2) a fingerprint `RESOLVED` in the baseline reappears in the fresh issue list; (3) a fresh CRITICAL/HIGH issue whose fingerprint is absent from the baseline entirely — this is genuinely open-ended, not limited to a fixed enum of known categories, because it keys on fingerprint presence, not finding type. `isReady = blockers.length === 0`. `overallScore` is never null for a verdict — "could not measure" becomes 0 plus an explicit blocker.

**Extending to new scanner domains**: the aggregation itself is map-based and generic; the threshold table and verdict iteration are keyed by the existing closed `ModuleType` union (`packages/types/src/domain.ts:16`, currently `PERFORMANCE | SECURITY | UI | TESTING | SEO`). A new domain fits the *model* but requires edits to shared types, `READINESS_THRESHOLDS`, and `phase-modules.ts:modulesForPhase` before it contributes to readiness — mechanical, touches ~5 files by name, not a rewrite. CONFIDENCE: HIGH.

## 10. Reverification ("3-credit issue reverify")

The assert-fixed route charges 3 credits and enqueues **one issue**. `runReverification` (`apps/worker/src/reverify/runner.ts`) resolves the single capability that owns the issue's `checkId` namespace (`resolve-check.ts:resolveReverifyCapability`) and calls **only that capability's `reverify()`** — never the full module, never a full scan. Issue identity is the R3 fingerprint (`packages/scoring/src/fingerprint.ts:fingerprintOf`), stable across re-audits. The check receives the stored `checkId`, `location`, and `evidence`; a `PASSED` outcome is the only route to `RESOLVED`; `FAILED` requires evidence and is a real delivered verdict (stays charged); `ERRORED`/`UNVERIFIABLE` refund the 3-credit charge, because "we couldn't tell" is a platform gap, not a service rendered.

Fit for deeper future checks: a capability's `reverify` runs under the same `CodeLayerContext` (guarded fetch, confined read, abort signal) as the code layer, with a **30-second default timeout** (`DEFAULT_TIMEOUT_MS`) and **no attached source workspace** (source is destroyed at scan end, `FR-090`, cited by name in three separate capabilities' own `reverify` comments as why they return `UNVERIFIABLE` rather than re-reading). A future check that needs more than 30 seconds, or needs the original source reattached, or needs multi-step/stateful verification, does not fit this model without new plumbing — the dispatch pattern (resolve-one-check-by-ID) generalizes, the timeout and statelessness assumptions do not. CONFIDENCE: HIGH.

## 11. Multi-tenancy / data isolation

`Target` and `Scan` carry `userId` directly; lookups at scan creation, report retrieval, and issue access are scoped to the authenticated user through the scan relation. Staged archive keys are user-scoped and content-addressed (`uploads/<userId>/<sha256>.zip`). Workspace paths are scan-ID-derived (`workspacePathFor`, `packages/capability-sdk/src/context.ts`); report object keys are scan-scoped (`scans/<scanId>/<key>`), not separately user-prefixed — ownership is still enforced at the route layer before retrieval, not by the storage key alone. Scan workspace cleanup (terminal teardown) is proven; staged-ZIP-object cleanup is the same open question flagged in §5. CONFIDENCE: HIGH except the retention gap (MEDIUM).

## 12. AI usage in the pipeline (mechanics only — full inventory in CURRENT_SECURITY/PERFORMANCE/... and the AI section of the gap matrix)

AI runs strictly after deterministic code-layer checks finish and findings are merged (`runModule`, `apps/worker/src/module-runner/index.ts`). `runAiLayer` assembles one redacted prompt per module from the measured findings plus each AI-layer capability's labelled-segment contribution (never appended to the system prompt itself — defeats prompt injection from an unreviewed `INSTALLED` capability or from the audited page's own markup). The model's output supplies interpretation/remediation insight and **can also add its own "judgment findings"** layered on top of (never replacing) the code-layer findings — this is a real nuance: AI involvement is not purely narrative text, though scoring itself remains deterministic (`packages/scoring/src/aggregate.ts:overallScore`) and is never computed by the model. `AI_MODE=disabled` is an explicit, intentionally-supported mode (`ai-layer.ts`'s own comment: "an intentionally disabled AI layer... is neither an outage nor a surprise") — findings degrade to "what was measured directly, without interpretation," not a crash or a skipped area. Only the UI/Design module has an AI-layer capability (`impeccable`) among the 16 vendored capabilities read for this audit; SECURITY/PERFORMANCE/TESTING/SEO get zero AI interpretation today under the vendored set. CONFIDENCE: HIGH.
