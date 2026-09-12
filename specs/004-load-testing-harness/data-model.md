# Phase 1 Data Model: Load-Testing Harness and Concurrency Verification

No product schema change. This feature's "data model" is the shape of the measurements it produces,
plus the one seeded fixture it depends on.

## Seeded fixtures (in the product's real database, created once by `seed-test-user.ts`)

**65 distinct users, one dedicated user per VU** (research.md Decision 2, revised after a real curl
smoke test found target canonicalization strips path/query to the bare origin — so VUs sharing a user
would collide on `Scan_one_active_per_target`, not just on `concurrentScanLimit`):

| Field | Value | Why |
|---|---|---|
| `User.email` | 65 fixed load-testing addresses (`loadtest-1@...` … `loadtest-65@...`) | Idempotent upsert per user — re-running the seed script is safe. Margin above the 60-VU top stage for a clean 1:1 VU→user mapping. |
| `User.emailVerifiedAt` | set at seed time, for all 65 | Bypasses the real email-confirmation round trip — a load test has no inbox. |
| `Subscription` | `business` tier (`concurrentScanLimit: 6`) for all 65 | The highest real tier. Each VU uses exactly one dedicated account (1 concurrent scan per account), so this ceiling is never approached — confirmed moot by design, not by luck. |
| `CreditLot` | a large, non-expiring grant per user | So credit exhaustion never becomes a confound partway through a stage. |

## Per-iteration entities (created for real, by real product code, once per VU per stage)

- **Target**: one per VU's dedicated user, at the fixed URL `https://example.com/` (research.md
  Decision 4, revised) — always classified `NONE` control level, always SSRF-allowed (a real public
  address). No per-VU query-string suffix: canonicalization discards it anyway, and per-user scoping
  of `Scan_one_active_per_target` already keeps every VU's target independent.
- **Scan**: one per VU per stage run, `kind: INITIAL`, created via the real `POST /scans` flow (quote →
  accept → create), tracked through to a terminal state by polling.
- **ModuleResult/Issue/CapabilityExecution/AiInvocation**: whatever the real orchestrator produces for
  that scan — not fabricated, not inspected in detail by this harness beyond confirming the scan reached
  a terminal state (spec.md's own scope: measuring the workflow, not re-auditing report correctness,
  which every other test in this repo already covers).

## Measurement entities (produced by this feature, not the product)

### StageResult (one per concurrency level actually run)

| Field | Type | Source |
|---|---|---|
| `concurrency` | int (1/5/10/20/40/60) | Which stage this is. |
| `httpLatency` | `{ p50, p95, p99 }` per step (login, quote, create, poll) | k6's built-in `http_req_duration`, tagged per request. |
| `timeToFirstProgress` | `{ p50, p95, p99 }` | Custom `Trend` metric (research.md Decision 6). |
| `timeToTerminal` | `{ p50, p95, p99 }` | Custom `Trend` metric. |
| `throughput` | completions / wall-clock stage duration | Derived from k6's iteration count and stage duration. |
| `errorRate` | proportion of iterations that errored or never reached terminal within the k6-side timeout | Custom `Rate` metric. |
| `rawSummaryPath` | `load-testing/results/stage-<n>/summary.json` | k6's own `--summary-export`/handleSummary output — the traceable evidence FR-010 requires. |

### LoadTestReport (`load-testing/REPORT.md`)

One row per `StageResult` actually produced, plus one row per stage marked UNVERIFIED with a stated
reason (contention found, not attempted, or a real product limit hit — research.md/plan.md's own
"report, don't patch" rule), plus one final verdict line comparing the above against this project's
stated ~5-minute/~60-concurrent/~99%-delivery targets.
