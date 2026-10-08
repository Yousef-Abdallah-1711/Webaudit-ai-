# Execution Audit Contract

Per FR-020/FR-022/FR-023/FR-024. The one write path for `ExecutionAuditEvent` — no other code may insert
a row into this table.

## `recordExecutionAuditEvent`

```text
recordExecutionAuditEvent(
  eventType: ExecutionAuditEventType,
  actorId: string,                     // userId or "SYSTEM"
  context: {
    targetId?: string,
    targetAuthorizationId?: string,
    scopeId?: string,
    environmentAtEvent?: TargetEnvironmentClassification,
    scanId?: string,
    executionId?: string,
    executionClass?: ExecutionClass,
  },
  outcome: string,
  payload?: unknown,                    // raw, pre-redaction — this function redacts it, callers never do
) -> ExecutionAuditEvent
```

## Required behavior

1. If `payload` is present, pass it through `@webaudit/redaction` before constructing the row to persist —
   unconditionally, with no caller-supplied bypass flag or "trusted caller" exception (FR-024). The redacted
   result, not the raw input, is what gets written to the `payload` column.
2. Write the row inside the same transaction as whatever state change the event describes (an admission
   decision, a budget mutation, a kill-switch transition) wherever that state change is itself transactional
   — an audit event for a transactional operation MUST NOT be written outside that transaction, so a crash
   between the state change and the audit write cannot leave one without the other (mirroring the existing
   platform's own "module result + audit-adjacent rows in one `$transaction`" precedent,
   `apps/worker/src/orchestrator/orchestrator.ts` ~lines 468-486).
2a. **Escalation is the one named exception to rule 2 (found during this spec's own independent adversarial
   review)** — escalation's actual safety action (aborting the composed `AbortSignal`, sending `SIGKILL` to
   a sandboxed child) is a process-level side effect that cannot itself be part of a database transaction,
   and unlike an admission/budget decision, **escalation MUST proceed even if the accompanying audit write
   fails or the database is unreachable** — this is the one place fail-closed-toward-safety and
   fail-closed-toward-the-kill-switch's-own-audit-durability would conflict, and the kill itself wins: a
   failed or delayed `ESCALATED` audit write is a (recoverable, reconciled per note below) observability
   gap, whereas a kill that silently does not happen because its own audit write failed would be a safety
   failure in the one mechanism this entire spec exists to make trustworthy. An implementation MUST retry
   or reconcile a failed `ESCALATED` write asynchronously (e.g., the same maintenance-sweep pattern FR-006a's
   lease reclamation already uses can detect a `KillSwitchState.escalatedAt` set with no matching audit row
   and backfill it) rather than treating a failed audit write as a reason to have skipped escalating in the
   first place.
3. `eventType` MUST be one of the bounded `ExecutionAuditEventType` enum values (`data-model.md`) — never
   a free-text action string, unlike `AuditLogEntry`'s own deliberately open-ended `action: String` (that
   looseness is acceptable for a low-volume, human-reviewed admin log; it is not acceptable for a
   potentially high-volume, machine-reconstructed execution trail this spec's own User Story 3 depends on
   being completely enumerable).
4. An admission refusal (FR-023) MUST call this function even though no `CapabilityExecution`-equivalent
   row, and potentially no `executionId` at all, exists yet — `context.executionId` is nullable
   specifically for this case.

## Non-negotiable boundary rules

1. This is the only write path to `ExecutionAuditEvent` — the Safety Admission contract, the Kill-Switch
   contract, and any future engine's own safety-relevant event all call this function rather than writing
   the table directly, so the redaction pass (rule 1) can never be bypassed by a new call site forgetting
   to apply it.
2. This function MUST NOT silently drop an event on a redaction failure (e.g., the redaction library itself
   throwing), and MUST NOT ever write the unredacted original. **The one mandated behavior (resolved, not
   left to implementation discretion)**: on a redaction failure, the row is still written, with `payload`
   replaced by the fixed sentinel value `{"_redactionFailed": true}` and `eventType`/`outcome` recorded
   normally — the audit event's *existence* and its structural metadata (who, what, when, why) are never
   lost even when its free-text content could not be safely redacted; a caller never receives a silently
   missing audit trail as the price of a redaction-library bug.
3. Querying `ExecutionAuditEvent` for a reconstruction (User Story 3) MUST be tenant-scoped exactly like
   every other lookup in this spec's package — a caller re-derives tenant ownership through
   `targetAuthorizationId`'s owning grant's `userId`, never exposing a bare cross-tenant query path.
