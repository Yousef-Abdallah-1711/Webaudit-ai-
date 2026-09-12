# Request Flow

## Intake to report

1. A signed-in user submits a URL, repository, or ZIP through the web app. API routes in `apps/api/src/routes/` validate the request; control-gate services verify the required proof of target control.
2. Intake quotes the scan and debits credit lots atomically before `create-scan.ts` creates the scan. If enqueueing fails, the credit/refund lifecycle compensates the debit.
3. The API writes scan state to PostgreSQL and enqueues named BullMQ phase jobs. The worker consumes them from `apps/worker/src/queue/`.
4. The worker runs registered deterministic capabilities in the relevant module. Their restricted context enforces safe network, browser, and workspace access. Installed bundles dispatch to `sandbox-runner`.
5. The module AI layer assembles redacted, labelled context and calls `@webaudit/ai-executor`. Provider attempts are timeout-bounded, schema-validated, metered, and fall back through a configured chain; exhaustion produces a degraded module rather than destroying measured findings.
6. Results, executions, invocation records, scores, and artifacts are persisted before progress is published. The master-report step synthesizes completed module results; the API streams authorized progress to subscribers.

## Cancellation, timeout, and recovery

Cancellation is cooperative and reaches queued/work-in-progress work through the cancellation schema. Phase and AI timeouts are explicit; a platform failure invokes refund handling and workspace/artifact cleanup paths. A completed or degraded module remains distinguishable from failed and not-applicable states, so the final report can expose incomplete areas rather than treating them as clean.

## Related

- [Overview](overview.md)
- [Worker and queues guide](../guides/worker-and-queues.md)
- [Security boundaries](../guides/security-boundaries.md)
