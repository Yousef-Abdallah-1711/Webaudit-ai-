# Data Model — Production Hardening

**Specification only. No migration is created or run by this document.** Every change below is a
task in `tasks.md`, each producing its own reviewed, reversible Prisma migration at implementation
time — following this repository's existing convention (`apps/api/prisma/migrations/`), never a
hand-edited production schema.

---

## 1. Payments (Paymob)

### 1.1 `PendingPayment` — EXISTS, no structural change required

```prisma
model PendingPayment {
  id                String   @id @default(cuid())
  userId            String
  kind              String
  providerReference String   @unique
  amountMicros      Int
  status            String   @default("PENDING")
  metadata          Json
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, status])
}
```

**Finding:** this model already carries everything FR-P01/FR-P03/FR-P06/FR-P07 need. `status` is
a free-text column (`"PENDING"`/`"COMPLETED"` observed in code), not a Prisma enum — **Decision
needed at implementation time**: promote `status` to a real enum (`PENDING | SUCCEEDED | FAILED |
CANCELLED | EXPIRED`, matching FR-P07's terminal-outcome requirement) versus keeping it a string
and validating it in application code only. Recommendation: promote to an enum — the value set is
now known and stable (this spec fixes it), and an enum is a schema-enforced guarantee a string
column is not; the migration is additive (new column type) and low-risk with a one-time backfill
of existing `"PENDING"`/`"COMPLETED"` rows into the new enum's matching values.

**No new columns are required for Paymob specifically** — `providerReference` already carries
whatever Paymob's own order/transaction id resolves to (one string; if Paymob's flow genuinely
produces two distinct ids that must both be retained — an order id AND a separate transaction id —
that is confirmed in `research.md`'s EduFlow findings and, if needed, add exactly one nullable
`providerSecondaryReference String?` column here rather than a new table).

### 1.2 `BillingEvent` — EXISTS, no change required

Already the correct idempotency primitive (provider event id as primary key, `appliedAt` gate).
Nothing about Paymob specifically requires a change here.

### 1.3 `Receipt` — EXISTS, no change required

Already keyed uniquely on `billingEventId`; a Paymob payment produces a receipt through the exact
same path a stub payment does today.

### 1.4 New: nothing else persisted for payments

**Explicit decision:** no new payment-specific table is added. The three existing models above are
sufficient for Paymob exactly as they are sufficient for the stub provider — that is the entire
point of the `PaymentProvider` seam (FR-P01). A "PaymobTransaction" table mirroring Paymob's own
webhook payload is deliberately NOT added; `BillingEvent.payload` already stores the verified raw
payload for reconciliation, matching this repository's existing pattern (its own module note:
"the verified payload, for an operator reconciling a disputed charge").

---

## 2. Email

**No schema change identified.** `EmailToken` (verification/reset) is unaffected by which mail
transport sends the message it references — the transport is a runtime seam
(`apps/api/src/services/email/mailer.ts`), not a persisted concept. If FR-E06's OTP decision (in
`research.md`) concludes OTP is genuinely needed, it would require a new model at that point —
this document does not speculatively add one for a capability not yet decided to exist. If it is
decided against, no schema follows and this line is the record of that decision having been
considered, not skipped.

---

## 3. AI Cost-Runaway Protection

### 3.1 Decision: mostly computed, not persisted

FR-C01 already has its data source (`AiInvocation`, real, per-invocation, already indexed on
`[provider, createdAt]` and joined to `scanId`/`executionId`). A rolling per-user/global spend
figure is a `groupBy` query over a time window — exactly the shape `apps/api/src/services/admin/
margin.service.ts` already uses. **No new table is required to compute the figure.**

### 3.2 New, minimal: `CostAlertThreshold` (configuration, not derived state)

A small, admin-editable configuration table — thresholds are a product/ops decision, not a
constant baked into code (matching this repo's existing preference for admin-editable operational
config, e.g. `ProviderChainEntry`, `Plan`).

```prisma
model CostAlertThreshold {
  id             String   @id @default(cuid())
  /// "PER_USER" or "GLOBAL". Two rows minimum at seed time; more only if a
  /// future need for per-plan thresholds is demonstrated (do not add speculatively).
  scope          String
  windowMinutes  Int
  thresholdMicros Int
  isEnabled      Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@unique([scope])
}
```

### 3.3 New, minimal: `CostAlertEvent` (a record that an alert fired, for dedup + audit)

Without this, a sustained spend spike would re-alert on every check interval — this table's
purpose is exclusively to make alerting **idempotent per breach window**, not to duplicate
anything `AiInvocation` already records.

```prisma
model CostAlertEvent {
  id           String   @id @default(cuid())
  scope        String   // "PER_USER" or "GLOBAL"
  userId       String?  // null for GLOBAL
  windowStart  DateTime
  windowEnd    DateTime
  observedMicros Int
  thresholdMicros Int
  notifiedAt   DateTime @default(now())
  @@index([scope, userId, windowEnd])
}
```

**Explicit non-goal:** this table records that an alert fired; it is not a second ledger. It never
participates in a credit computation, and `FR-C03`'s "credit ledger remains sole authoritative
record" is enforced by this table having no relationship to `CreditTransaction` at all.

---

## 4. Queue Backpressure

**Decision: no new table.** BullMQ already exposes queue depth/position introspection
(`Queue.getWaitingCount()`, `Queue.getJob(id).getState()`, and a job's position can be derived from
`Queue.getJobs('waiting')`'s ordering). FR-B03's "real position/estimated-wait" requirement is
served by querying BullMQ directly at request time, not by duplicating queue state into Postgres —
duplicating it would create exactly the kind of second, driftable source of truth this
repository's engineering principles (Constitution: PostgreSQL is the record; Redis is queue/cache
state, never a system of record for anything Postgres already owns — but queue *position* has no
Postgres analog to begin with, so this is Redis being the correct, sole source for a fact that is
inherently about the queue) argue against.

If, during implementation, BullMQ's introspection proves too slow to call per-request at expected
scale, a task may introduce a cheap denormalized counter — but that is an optimization to add only
if measured, not designed here speculatively.

---

## 5. Data Archival

### 5.1 Decision: partition-and-archive, never delete, for financial/audit tables

`CreditTransaction`, `CreditAllocation`, `BillingEvent`, `Receipt` — **no deletion, ever, by
default** (FR-A02). If a real legal/operational retention limit is confirmed at implementation
time (a product/legal decision this planning pass cannot make), the mechanism is table
partitioning by `createdAt` with older partitions moved to cheaper storage, not row deletion —
this preserves query-ability for reconciliation without deleting the record.

### 5.2 `AiInvocation` / `CapabilityExecution` — MAY be pruned after a defined window

These are operational telemetry, not financial records (FR-A03). Proposed: add a partition
boundary (native Postgres partitioning by `createdAt`, monthly) so an old partition can simply be
detached and archived (e.g., exported to cold object storage, matching how `Scan`/report artifacts
already use R2) rather than a slow row-by-row `DELETE`. **No new column is required** on these
tables themselves; partitioning is a physical storage decision layered under the existing schema,
which Prisma's schema can represent as an unmanaged/raw-SQL migration (Prisma does not natively
model partitioned tables — this MUST be a raw-SQL migration, flagged explicitly as such in
`tasks.md`, exactly as this repo's credit-debit raw-SQL query already is for a different reason).

### 5.3 Explicit non-goal

No new "archive" table mirroring the live schema is introduced. Partitioning + detach is preferred
over a manual copy-then-delete pattern because it has no window where a row exists in neither
place (a copy-then-delete pattern always has a failure mode where a crash between the copy and the
delete either loses or duplicates the row).

---

## 6. Infrastructure Scaling Items (T295-T298) — no data-model impact

A connection pooler, a read replica, an isolated cache layer, and CDN/signed URLs are
deployment/configuration changes, not schema changes. Nothing in this document specifies schema
for them. The read replica specifically requires zero schema change — it requires only that
`apps/api/src/services/admin/margin.service.ts` and any other reporting-only read path be able to
route to a replica connection string, which is an application-wiring task, not a data-model one.
