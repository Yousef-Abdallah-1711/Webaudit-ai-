# Current Scan Infrastructure

Read-only audit, 2026-10-07. (Full pipeline context: `CURRENT_SCAN_ARCHITECTURE.md` SS6-SS8, SS11.)

## Queue / worker

BullMQ + Redis. Four named queues (`packages/config/src/queues.ts:QUEUE_NAMES`):
`webaudit-scan-phase`, `webaudit-reverify`, `webaudit-maintenance`, `webaudit-email-notification`.
Worker concurrency per queue (`apps/worker/src/queue/queues.ts:CONCURRENCY`): scan-phase **4**,
reverify **8**, maintenance **1**, email **4**. Priority bands lower-runs-sooner:
`REVERIFICATION=5 < BUSINESS=10 < PRO=20 < STARTER=30 < FREE=40 < MAINTENANCE=50` — a human watching
a reverify always outranks a queued audit, and a plan's own `queuePriority` is clamped into its tier
band so an operator misconfiguration can't let a customer outrank re-verification or fall behind
maintenance forever.

Retries: scan-phase jobs get `attempts: 1` (no blind retry — a phase may have already debited
credits and called a paid AI provider; `SCAN_PHASE_MAX_STALLED_COUNT = 0` makes a stalled phase fail
immediately rather than silently reprocess, which would double-charge AI spend). Reverify/email jobs
get `attempts: 3` with exponential backoff from 2,000ms — safe because reverify is idempotent by
construction. Shared lock duration 5 minutes, stalled-check interval 30 seconds. No separate
dead-letter queue; failures are retained per BullMQ's own removal policy and surfaced via
`captureAlert`.

Scan-wide timeout: `SCAN_TIMEOUT_MS` defaults to **15 minutes**, with a repeatable sweep every 60
seconds (`apps/worker/src/orchestrator/timeout-scheduler.ts`) that fails and refunds stale scans.
Module-level timeout is derived from AI-provider-chain length plus a 15-second margin; individual
provider attempts are capped at 60 seconds each. Cancellation is an API state transition — it blocks
future phases and refunds undelivered work, but does not forcibly interrupt in-flight capability
execution at the moment of cancellation (that work runs to its own timeout or completion, then the
cancellation state takes effect).

**Can this support 30-second-to-multi-hour jobs without architectural change? No.** Every
timeout/retry number above is tuned for short, bounded, mostly-deterministic work, and the "one
attempt, refund on failure, recovery is a decision not a default" philosophy is explicit in the
queue config's own comments. A genuinely long-running future job needs its own queue (matching the
established "give it its own queue so an audit backlog can't starve it" pattern already used for
reverify), its own timeout constant, and a different failure/recovery model. Additive, not a BullMQ
rewrite — but real new plumbing, not a config flip.

## Sandboxing

Customer-supplied code (repository or archive) is **never executed**. `apps/sandbox-runner`'s
dispatch path exists for **operator-installed capabilities** (Fahes's own, reviewed-once-then-
updated TypeScript, run against customer *data*) — never for the customer's own scripts, builds, or
test suites. The harness is pre-bundled once at host startup (`build-harness.ts`, esbuild, because
the sandbox's `node --permission` flags forbid the worker-thread `tsx`/esbuild-transform bootstrap
the rest of the monorepo relies on) into a dependency-free flat file, so each forked child needs no
loader, no compiler, nothing further to resolve.

Isolation for that dispatch, exact configured values:
- Fresh child process per call, empty environment.
- `node --permission`: denies network, filesystem write, child-process spawn, and worker-thread
  permissions; filesystem read narrowed to harness/runtime paths.
- Timeout: parent-armed, unconditional `SIGKILL` (`armTimeout`), **30,000 ms**, immune to a
  tight-looping or signal-catching child.
- Memory: V8 heap ceiling via `--max-old-space-size`, **256 MiB**, layered under a deployment-level
  cgroup limit (defense-in-depth against a native allocation bomb that would not trip V8's own OOM
  signature).

Not established in process-level source: an explicit CPU quota or child-process-count limit.
Deployment-level network-egress enforcement (no-egress network policy, Docker-socket/cloud-metadata
blocking) is described in `infrastructure/sandbox-runner.md` but not independently verifiable from a
static checkout. `UNKNOWN - NOT PROVEN FROM CURRENT REPOSITORY` for whether the deployed
configuration matches that runbook description.

## Multi-tenancy / data isolation

`Target`/`Scan` carry `userId` directly; report, issue, and target lookups are scoped to the
authenticated user through the scan relation. Staged archive objects use a user-scoped,
content-addressed R2 key (`uploads/<userId>/<sha256>.zip`). Workspace paths are scan-ID-derived.
Report object keys are scan-scoped (`scans/<scanId>/<key>`) rather than separately user-prefixed —
ownership is enforced at the route layer before any retrieval, not by the storage key alone.

**Cleanup — proven vs. open**: the per-scan filesystem workspace is reliably removed on
completion/failure/timeout/cancellation (terminal teardown + maintenance-queue teardown job).
Report artifacts are removed by the retention sweep on schedule. **Open question**: `UploadStorage`
exposes a `remove` method but no call site invoking it was found anywhere in `apps/api/src` or
`apps/worker/src` — whether a staged ZIP upload in R2 is ever deleted or expires is `UNKNOWN - NOT
PROVEN FROM CURRENT REPOSITORY`. CONFIDENCE: MEDIUM (absence of a call site is strong evidence, not
proof, since a bucket lifecycle policy configured outside the repository would not appear here).

## Credits (infrastructure angle — pricing numbers live in CURRENT_SCAN_ARCHITECTURE.md SS8)

Direct debit at scan creation against locked credit lots, with allocation records tying each debit
to its source lots — not a two-phase reserve/capture ledger. A per-execution cost-metering primitive
already exists (`CapabilityExecution.costMicros`, integer micros) but is populated only for AI spend
today; the pricing function itself is a flat constant table and does not consume that metering field.
A future expensive operation (browser matrix, load test, SAST, authenticated pentest, long soak test)
could reuse the debit/refund ledger mechanics directly for a flat price; a genuinely usage-scaled
price would need new code written against the existing metering primitive, which does not exist yet.
