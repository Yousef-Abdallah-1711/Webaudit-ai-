# Phase 1 Data Model: WebAudit AI — MVP Baseline

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Date**: 2026-08-23

Resolves the constitution's `TODO(DATA_MODEL)`. The specification's 15 conceptual entities map to
the physical model below. Where the physical model adds a table the spec did not name, the reason is
stated.

---

## Entity map

| Spec entity | Tables |
| --- | --- |
| User | `User`, `OAuthIdentity`, `EmailToken`, `RefreshToken` |
| Plan | `Plan` |
| Subscription | `Subscription` |
| Credit Movement | `CreditLot`, `CreditTransaction`, `CreditAllocation` |
| Target | `Target`, `TargetVerification` |
| Audit | `Scan` |
| Area Result | `ModuleResult` |
| Issue | `Issue` |
| Verification Attempt | `VerificationAttempt` |
| Capability | `Capability` |
| Capability Execution | `CapabilityExecution` |
| AI Interaction | `AiInvocation` |
| Design Intent | `DesignIntent` |
| Readiness Verdict | `ReadinessVerdict` |
| Operator Action | `AuditLogEntry` |

Added beyond the spec's list, with justification:

- **`OAuthIdentity`**, **`EmailToken`**, **`RefreshToken`** — FR-003, FR-004 (identity joining),
  FR-002 (confirmation), FR-005 (reset), FR-006 (session ending) each need their own lifecycle.
  Folding these into `User` makes multiple providers per user impossible.
- **`TargetVerification`** — R11 requires a verification *history*, because a token can be issued,
  confirmed, then removed. A single column on `Target` cannot express "verified, then demoted".
- **`CreditLot` / `CreditTransaction` / `CreditAllocation`** — three tables for one conceptual
  entity. See R2: two credit lifetimes plus correct refunds cannot be modelled with less.

---

## Schema

Written as Prisma. Enums first, then tables grouped by concern.

### Enums

```prisma
enum ModuleType        { PERFORMANCE SECURITY UI TESTING SEO }
enum CapabilityLayer   { CODE AI BOTH }
enum TrustLevel        { VENDORED INSTALLED }        // never self-declared — see R10
enum InputType         { URL REPOSITORY ARCHIVE }
enum ControlLevel      { NONE ATTESTED VERIFIED }
enum VerificationMethod { FILE DNS }

enum ScanKind          { INITIAL READINESS }
enum ScanState {
  QUEUED
  RUNNING_PHASE_1                                     // performance, security, seo
  AWAITING_QUESTIONNAIRE                              // R4: no worker is held here
  RUNNING_PHASE_2                                     // ui
  RUNNING_PHASE_3                                     // testing
  RUNNING_MASTER                                      // cross-module synthesis
  RUNNING_DOCS
  COMPLETED
  FAILED
  CANCELLED
  TIMED_OUT
}

enum ModuleState       { PENDING RUNNING COMPLETE DEGRADED FAILED NOT_APPLICABLE }
enum Severity          { CRITICAL HIGH MEDIUM LOW INFO }
enum Attribution       { MEASURED AI_JUDGMENT }       // assigned by runner, not by capability
enum IssueState        { OPEN ASSERTED_FIXED RESOLVED UNVERIFIABLE REOPENED }
enum VerificationOutcome { PASSED FAILED UNVERIFIABLE ERRORED }

enum CreditKind        { PLAN PURCHASED }
enum LotSource         { FREE_GRANT PLAN_RENEWAL PURCHASE REFUND PROMOTIONAL }
enum TxType            { GRANT DEBIT REFUND EXPIRE }

enum SubscriptionStatus { ACTIVE PAST_DUE CANCELLED EXPIRED }
enum AiOutcome         { SUCCESS SCHEMA_INVALID RATE_LIMITED TIMEOUT ERROR }
enum IntentSource      { SUPPLIED SKIPPED DEFAULTED }
```

### Identity and access

```prisma
model User {
  id                String    @id @default(cuid())
  email             String    @unique
  passwordHash      String?                           // null when social-only
  emailVerifiedAt   DateTime?
  isOperator        Boolean   @default(false)          // FR-008 enforced server-side
  githubTokenEnc    Bytes?                             // FR-091: encrypted at rest
  githubTokenIv     Bytes?
  githubLogin       String?
  createdAt         DateTime  @default(now())
  // No deletedAt: FR-009 says destroy. A soft-deleted row would hold the
  // unique email forever, permanently blocking re-registration.

  identities        OAuthIdentity[]
  subscription      Subscription?
  lots              CreditLot[]
  transactions      CreditTransaction[]
  targets           Target[]
  scans             Scan[]

}

model OAuthIdentity {
  id             String  @id @default(cuid())
  userId         String
  provider       String                                // "google" | "github"
  providerUserId String
  user           User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerUserId])                 // FR-004: joins, never duplicates
  @@index([userId])
}

model EmailToken {
  id        String   @id @default(cuid())
  userId    String
  purpose   String                                     // "verify" | "reset"
  tokenHash String   @unique                           // hash, never the token itself
  expiresAt DateTime
  usedAt    DateTime?

  @@index([userId, purpose])
}

model RefreshToken {
  id         String   @id @default(cuid())
  userId     String
  tokenHash  String   @unique
  expiresAt  DateTime
  revokedAt  DateTime?
  @@index([userId])
}
```

### Plans, subscriptions, credits

```prisma
model Plan {
  id                    String   @id                   // "free" | "starter" | "pro" | "business"
  name                  String
  monthlyCredits        Int                            // 50 / 300 / 1200 / 4000
  creditsRecur          Boolean                        // false for free — one-time grant
  allowedInputTypes     InputType[]
  allowLoadGeneration   Boolean
  allowReadinessPass    Boolean
  allowCreditPurchase   Boolean                        // FR-078: false on free
  allowCustomCapability Boolean
  concurrentScanLimit   Int
  queuePriority         Int                            // lower value = sooner
  retentionDays         Int                            // 7 / 30 / 365 / 730
  isActive              Boolean  @default(true)

  subscriptions Subscription[]
  capabilities  CapabilityPlan[]
}

model Subscription {
  id                 String             @id @default(cuid())
  userId             String             @unique
  planId             String
  status             SubscriptionStatus
  periodStart        DateTime
  periodEnd          DateTime                          // renewal boundary for lot expiry
  cancelAtPeriodEnd  Boolean            @default(false)
  externalCustomerId String?
  user               User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  plan               Plan               @relation(fields: [planId], references: [id])

  @@index([status, periodEnd])                         // renewal + expiry sweep
}
```

The credit tables are the heart of R2. `amountRemaining` is the only mutable field, and it moves
only inside the debit/refund transaction described below.

```prisma
model CreditLot {
  id              String     @id @default(cuid())
  userId          String
  kind            CreditKind
  source          LotSource
  amountGranted   Int
  amountRemaining Int
  expiresAt       DateTime?                            // null => never expires (PURCHASED)
  createdAt       DateTime   @default(now())

  user            User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  allocations     CreditAllocation[]

  // Consumption order (FR-078): expiring first, nulls last.
  @@index([userId, expiresAt, createdAt])
  @@index([userId, kind])
}

model CreditTransaction {
  id          String   @id @default(cuid())
  userId      String
  type        TxType
  amount      Int                                      // always positive; type gives direction
  reason      String                                   // "scan:full_audit", "reverify:issue", ...
  scanId      String?
  issueId     String?
  reversesId  String?  @unique                         // REFUND -> the DEBIT it reverses
  createdAt   DateTime @default(now())

  user        User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  allocations CreditAllocation[]

  @@index([userId, createdAt])                         // FR-076: user-visible history
  @@index([scanId])
}

model CreditAllocation {
  id            String @id @default(cuid())
  transactionId String
  lotId         String
  amount        Int

  transaction CreditTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  lot         CreditLot         @relation(fields: [lotId], references: [id])

  @@index([lotId])
  @@unique([transactionId, lotId])
}
```

**Debit algorithm** (one serializable transaction; this is what makes SC-022 hold):

1. Select the user's lots where `amountRemaining > 0` and (`expiresAt` is null or `> now()`),
   ordered by `expiresAt` ascending nulls last, then `createdAt` ascending, `FOR UPDATE`.
2. If the sum is short, abort — nothing is written, and FR-074 reports the shortfall.
3. Decrement lots in order; insert one `CreditTransaction` (`DEBIT`) plus one `CreditAllocation`
   per lot touched.

**Refund** reads the original debit's allocations and returns each amount to its originating lot,
capped at `amountGranted`. If a lot has since expired, the refund lands in a fresh
`LotSource.REFUND` lot preserving the original `kind` — a user is never refunded into credits that
died while we held them.

**Expiry sweep** at `periodEnd` zeroes `amountRemaining` on expired `PLAN` lots and writes an
`EXPIRE` transaction. Purchased lots have `expiresAt = null` and are never selected, which is
SC-022's first half by construction.

### Targets and verification

```prisma
model Target {
  id             String       @id @default(cuid())
  userId         String
  inputType      InputType
  canonicalValue String                                // normalized URL origin, repo full name, or archive key
  displayName    String
  controlLevel   ControlLevel @default(NONE)
  attestedAt     DateTime?
  attestedBy     String?
  createdAt      DateTime     @default(now())

  user          User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  verifications TargetVerification[]
  scans         Scan[]

  @@unique([userId, inputType, canonicalValue])        // FR-018: one target per user per thing
  @@index([userId])
}

model TargetVerification {
  id            String             @id @default(cuid())
  targetId      String
  method        VerificationMethod
  token         String                                 // system-issued
  issuedAt      DateTime           @default(now())
  confirmedAt   DateTime?
  lastCheckedAt DateTime?
  revokedAt     DateTime?                              // token removed => demotion (R11)

  target Target @relation(fields: [targetId], references: [id], onDelete: Cascade)

  @@index([targetId, confirmedAt])
}
```

A target is `VERIFIED` only while it has a `TargetVerification` with `confirmedAt` set and
`revokedAt` null. R11 re-confirms immediately before each Level 2 check, which is what defeats
SC-021's third case.

### Scans and results

```prisma
model Scan {
  id              String    @id @default(cuid())
  userId          String
  targetId        String
  kind            ScanKind  @default(INITIAL)
  state           ScanState @default(QUEUED)
  requestedModules ModuleType[]
  capabilitySnapshot Json                              // R10: resolved once, held for the scan
  quotedCredits   Int
  chargedCredits  Int       @default(0)
  overallScore    Int?
  summary         String?
  baselineScanId  String?                              // READINESS -> the INITIAL it compares against
  questionnaireDeadline DateTime?                      // R4
  startedAt       DateTime?
  completedAt     DateTime?
  failureReason   String?
  workspacePath   String?                              // FR-090: cleanup owner reads this
  createdAt       DateTime  @default(now())

  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  target        Target        @relation(fields: [targetId], references: [id], onDelete: Cascade)
  moduleResults ModuleResult[]
  issues        Issue[]
  executions    CapabilityExecution[]
  designIntent  DesignIntent?
  verdict       ReadinessVerdict?

  @@index([userId, createdAt])
  @@index([state])                                     // queue + timeout sweep
  @@index([targetId, kind, completedAt])               // regression comparison
}

model ModuleResult {
  id            String      @id @default(cuid())
  scanId        String
  module        ModuleType
  state         ModuleState @default(PENDING)
  score         Int?                                   // null unless COMPLETE or DEGRADED
  summary       String?
  skippedReason String?                                // FR-021: why NOT_APPLICABLE
  degradedReason String?                               // FR-035: e.g. provider chain exhausted
  startedAt     DateTime?
  completedAt   DateTime?

  scan   Scan    @relation(fields: [scanId], references: [id], onDelete: Cascade)
  issues Issue[]

  @@unique([scanId, module])
}
```

`ModuleResult.score` is null unless the area completed. FR-053 is enforced at read time: overall
score averages only non-null scores, so an incomplete area cannot inflate or deflate the total.

```prisma
model Issue {
  id           String      @id @default(cuid())
  scanId       String
  moduleResultId String
  fingerprint  String                                  // R3: stable across audits
  checkId      String                                  // which check owns re-verification
  severity     Severity
  title        String
  explanation  String
  consequence  String
  location     String?
  evidence     Json?
  attribution  Attribution                             // FR-032 / SC-006
  fixPrompt    String
  state        IssueState  @default(OPEN)
  requiredControlLevel ControlLevel @default(NONE)
  assertedFixedAt DateTime?
  resolvedAt   DateTime?
  reopenedAt   DateTime?                               // FR-064 keeps the history
  previouslyResolved Boolean @default(false)
  createdAt    DateTime    @default(now())

  scan         Scan          @relation(fields: [scanId], references: [id], onDelete: Cascade)
  moduleResult ModuleResult  @relation(fields: [moduleResultId], references: [id], onDelete: Cascade)
  attempts     VerificationAttempt[]

  @@unique([scanId, fingerprint])                      // one row per problem per scan
  @@index([scanId, severity, state])                   // the fixes board query
  @@index([fingerprint])                               // cross-scan recurrence + regression
}

model VerificationAttempt {
  id        String              @id @default(cuid())
  issueId   String
  outcome   VerificationOutcome
  evidence  Json?                                      // FR-061: failing evidence, not just a verdict
  creditsCharged Int
  durationMs Int
  createdAt DateTime            @default(now())

  issue Issue @relation(fields: [issueId], references: [id], onDelete: Cascade)

  @@index([issueId, createdAt])
}
```

**Issue state machine.** `RESOLVED` has exactly one inbound edge, and its only trigger is a
`VerificationAttempt` with `outcome = PASSED`. No user action writes `RESOLVED`. This is SC-007
expressed as a schema constraint rather than a rule to remember.

```text
OPEN ──user asserts──▶ ASSERTED_FIXED ──attempt PASSED────▶ RESOLVED
                             │                                  │
                             ├──attempt FAILED──▶ OPEN           │
                             └──no entry point──▶ UNVERIFIABLE   │
                                                                 │
REOPENED ◀────────── later scan finds same fingerprint ──────────┘
```

### Capabilities and cost

```prisma
model Capability {
  id              String          @id                  // manifest id, e.g. "headers-checker"
  name            String
  version         String
  module          ModuleType
  layer           CapabilityLayer
  trust           TrustLevel                           // from discovery root — R10
  originalSource  String?
  license         String?
  requiresCode    Boolean         @default(false)
  requiresScreenshot Boolean      @default(false)
  requiredControlLevel ControlLevel @default(NONE)     // R11: gates load generation
  estimatedTokens Int             @default(0)          // FR-082
  isEnabled       Boolean         @default(true)
  vendoredAt      DateTime?
  installedAt     DateTime?

  plans      CapabilityPlan[]
  executions CapabilityExecution[]

  @@index([module, layer, isEnabled])
}

model CapabilityPlan {                                 // FR-026: restrict to tiers
  capabilityId String
  planId       String
  capability   Capability @relation(fields: [capabilityId], references: [id], onDelete: Cascade)
  plan         Plan       @relation(fields: [planId], references: [id], onDelete: Cascade)
  @@id([capabilityId, planId])
}

model CapabilityExecution {
  id            String   @id @default(cuid())
  scanId        String
  capabilityId  String
  module        ModuleType
  succeeded     Boolean
  skippedReason String?
  findingCount  Int      @default(0)
  durationMs    Int
  costMicros    Int      @default(0)                   // attributable cost — Principle VI
  errorMessage  String?
  createdAt     DateTime @default(now())

  scan        Scan          @relation(fields: [scanId], references: [id], onDelete: Cascade)
  capability  Capability    @relation(fields: [capabilityId], references: [id])
  invocations AiInvocation[]

  @@index([scanId])
  @@index([capabilityId, createdAt])                   // FR-082: estimate vs actual drift
}

model AiInvocation {
  id            String    @id @default(cuid())
  executionId   String?
  scanId        String?
  provider      String
  model         String
  chainPosition Int                                    // 0 = primary — FR-034
  promptTokens  Int
  outputTokens  Int
  latencyMs     Int
  costMicros    Int
  outcome       AiOutcome
  createdAt     DateTime  @default(now())

  execution CapabilityExecution? @relation(fields: [executionId], references: [id], onDelete: Cascade)

  @@index([scanId])
  @@index([provider, createdAt])                       // provider health + spend
}
```

Cost in integer micros, never floats. Money and rounding do not mix, and FR-081's reconciliation
requires exactness.

### Design intent, verdicts, audit log

```prisma
model DesignIntent {
  id          String       @id @default(cuid())
  scanId      String       @unique
  source      IntentSource                             // FR-041 records DEFAULTED explicitly
  audience    String?
  stylePreference String?
  admiredReferences String[]
  brandColors String[]
  answeredAt  DateTime?

  scan Scan @relation(fields: [scanId], references: [id], onDelete: Cascade)
}

model ReadinessVerdict {
  id             String   @id @default(cuid())
  scanId         String   @unique
  baselineScanId String
  isReady        Boolean
  overallScore   Int
  baselineScore  Int
  moduleOutcomes Json                                  // per-area score, threshold, pass/fail
  regressions    Json                                  // FR-069: named, not merely counted
  improvements   Json
  blockers       String[]                              // FR-070
  certificateKey String?                               // FR-072
  createdAt      DateTime @default(now())

  scan Scan @relation(fields: [scanId], references: [id], onDelete: Cascade)
}

model AuditLogEntry {
  id         String   @id @default(cuid())
  actorId    String
  action     String
  subjectType String
  subjectId  String?
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([actorId, createdAt])
  @@index([subjectType, subjectId])
}
```

---

## Validation rules carried from requirements

| Rule | Source | Where enforced |
| --- | --- | --- |
| A balance is never a stored column | Principle VI | No balance field exists; derived from lots |
| Expiring credits consumed first | FR-078 | Debit ordering + `@@index([userId, expiresAt, createdAt])` |
| Refund returns to originating lot | FR-075 | `CreditAllocation` reverse walk |
| Purchased credits never expire | FR-078, SC-022 | `expiresAt` null, excluded from sweep |
| No purchase on free tier | FR-078 | `Plan.allowCreditPurchase` |
| `RESOLVED` requires a passing check | FR-060, SC-007 | Single inbound state edge |
| Unverifiable, never resolved | FR-063 | Distinct terminal state |
| Every finding is attributed | FR-032, SC-006 | `Attribution` non-null, set by runner |
| Incomplete area cannot skew score | FR-053 | Nullable `score`, averaged over non-null |
| Trust is not self-declared | R10, FR-027 | `TrustLevel` from discovery root |
| Load generation needs verified control | FR-017, SC-021 | `requiredControlLevel` re-checked at execution |
| One target row per user per thing | FR-018 | `@@unique([userId, inputType, canonicalValue])` |
| Source destroyed on every exit path | FR-090, SC-015 | `Scan.workspacePath` owned by a cleanup handler |
| Third-party tokens encrypted | FR-091 | `Bytes` ciphertext + IV, no plaintext column exists |
| Deletion destroys, never hides | FR-009 | Hard delete; no `deletedAt` column exists |

---

## Migration notes

- Seed `Plan` from the spec's tier table. Plans are data, not code, so FR-084 needs no deploy.
- Seed `Capability` rows on registry reconciliation at startup; discovery is the source of truth for
  existence and trust, the database for enablement and tier restriction.
- `capabilitySnapshot` on `Scan` is denormalised deliberately: it must record what actually ran, and
  must not change if an operator toggles a capability mid-scan.
