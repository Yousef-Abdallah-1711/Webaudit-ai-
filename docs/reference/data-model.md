# Data Model

> **Generated file — do not edit.** Regenerate with `$docs-update`.
> Everything below is read from the project source; edits here are lost on the next run.

Persisted models, their fields, relations, and indexes.

### AiInvocation

Source: `apps/api/prisma/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| executionId | `String` | yes | — |
| scanId | `String` | yes | — |
| provider | `String` | no | — |
| model | `String` | no | — |
| chainPosition | `Int` | no | — |
| promptTokens | `Int` | no | — |
| outputTokens | `Int` | no | — |
| latencyMs | `Int` | no | — |
| costMicros | `Int` | no | — |
| outcome | `AiOutcome` | no | — |
| promptVersion | `String` | yes | — |
| createdAt | `DateTime` | no | @default(now() |
| execution | `CapabilityExecution` | yes | @relation(fields: [executionId], references: [id], onDelete: Cascade) |
| scan | `Scan` | yes | @relation(fields: [scanId], references: [id], onDelete: Cascade) |


**Relations:** `outcome -> AiOutcome`, `execution -> CapabilityExecution`, `scan -> Scan`

**Indexes:** `@@index(scanId)`, `@@index(executionId)`, `@@index(provider, createdAt)`

### AiOutcome

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| SUCCESS | `enum` | no | — |
| SCHEMA_INVALID | `enum` | no | — |
| RATE_LIMITED | `enum` | no | — |
| TIMEOUT | `enum` | no | — |
| ERROR | `enum` | no | — |

### Attribution

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| MEASURED | `enum` | no | — |
| AI_JUDGMENT | `enum` | no | — |

### AuditLogEntry

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| actorId | `String` | no | — |
| action | `String` | no | — |
| subjectType | `String` | no | — |
| subjectId | `String` | yes | — |
| before | `Json` | yes | — |
| after | `Json` | yes | — |
| createdAt | `DateTime` | no | @default(now() |


**Indexes:** `@@index(actorId, createdAt)`, `@@index(subjectType, subjectId)`

### BillingEvent

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id |
| type | `String` | no | — |
| receivedAt | `DateTime` | no | @default(now() |
| appliedAt | `DateTime` | yes | — |
| payload | `Json` | yes | — |


**Indexes:** `@@index(type, receivedAt)`

### Capability

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id |
| name | `String` | no | — |
| version | `String` | no | — |
| module | `ModuleType` | no | — |
| layer | `CapabilityLayer` | no | — |
| trust | `TrustLevel` | no | — |
| originalSource | `String` | yes | — |
| license | `String` | yes | — |
| requiresCode | `Boolean` | no | @default(false) |
| requiresScreenshot | `Boolean` | no | @default(false) |
| requiredControlLevel | `ControlLevel` | no | @default(NONE) |
| estimatedTokens | `Int` | no | @default(0) |
| isEnabled | `Boolean` | no | @default(true) |
| vendoredAt | `DateTime` | yes | — |
| installedAt | `DateTime` | yes | — |
| updatedAt | `DateTime` | no | @updatedAt |
| plans | `CapabilityPlan[]` | no | — |
| executions | `CapabilityExecution[]` | no | — |


**Relations:** `module -> ModuleType`, `layer -> CapabilityLayer`, `trust -> TrustLevel`, `requiredControlLevel -> ControlLevel`, `plans -> CapabilityPlan`, `executions -> CapabilityExecution`

**Indexes:** `@@index(module, layer, isEnabled)`, `@@index(trust)`

### CapabilityExecution

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| scanId | `String` | no | — |
| capabilityId | `String` | no | — |
| module | `ModuleType` | no | — |
| succeeded | `Boolean` | no | — |
| skippedReason | `String` | yes | — |
| findingCount | `Int` | no | @default(0) |
| durationMs | `Int` | no | — |
| costMicros | `Int` | no | @default(0) |
| errorMessage | `String` | yes | — |
| createdAt | `DateTime` | no | @default(now() |
| scan | `Scan` | no | @relation(fields: [scanId], references: [id], onDelete: Cascade) |
| capability | `Capability` | no | @relation(fields: [capabilityId], references: [id]) |
| invocations | `AiInvocation[]` | no | — |


**Relations:** `module -> ModuleType`, `scan -> Scan`, `capability -> Capability`, `invocations -> AiInvocation`

**Indexes:** `@@index(scanId)`, `@@index(capabilityId, createdAt)`

### CapabilityLayer

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| CODE | `enum` | no | — |
| AI | `enum` | no | — |
| BOTH | `enum` | no | — |

### CapabilityPlan

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| capabilityId | `String` | no | — |
| planId | `String` | no | — |
| capability | `Capability` | no | @relation(fields: [capabilityId], references: [id], onDelete: Cascade) |
| plan | `Plan` | no | @relation(fields: [planId], references: [id], onDelete: Cascade) |


**Relations:** `capability -> Capability`, `plan -> Plan`

**Indexes:** `@@index(planId)`

### ControlLevel

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| NONE | `enum` | no | — |
| ATTESTED | `enum` | no | — |
| VERIFIED | `enum` | no | — |

### CreditAllocation

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| transactionId | `String` | no | — |
| lotId | `String` | no | — |
| amount | `Int` | no | — |
| transaction | `CreditTransaction` | no | @relation(fields: [transactionId], references: [id], onDelete: Cascade) |
| lot | `CreditLot` | no | @relation(fields: [lotId], references: [id]) |


**Relations:** `transaction -> CreditTransaction`, `lot -> CreditLot`

**Indexes:** `@@unique(transactionId, lotId)`, `@@index(lotId)`

### CreditKind

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| PLAN | `enum` | no | — |
| PURCHASED | `enum` | no | — |

### CreditLot

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| userId | `String` | no | — |
| kind | `CreditKind` | no | — |
| source | `LotSource` | no | — |
| amountGranted | `Int` | no | — |
| amountRemaining | `Int` | no | — |
| expiresAt | `DateTime` | yes | — |
| createdAt | `DateTime` | no | @default(now() |
| user | `User` | no | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| allocations | `CreditAllocation[]` | no | — |


**Relations:** `kind -> CreditKind`, `source -> LotSource`, `user -> User`, `allocations -> CreditAllocation`

**Indexes:** `@@index(userId, expiresAt, createdAt)`, `@@index(userId, kind)`

### CreditTransaction

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| userId | `String` | no | — |
| type | `TxType` | no | — |
| amount | `Int` | no | — |
| reason | `String` | no | — |
| scanId | `String` | yes | — |
| issueId | `String` | yes | — |
| reversesId | `String` | yes | @unique |
| billingEventId | `String` | yes | @unique |
| createdAt | `DateTime` | no | @default(now() |
| user | `User` | no | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| allocations | `CreditAllocation[]` | no | — |
| reverses | `CreditTransaction` | yes | @relation("TxReversal", fields: [reversesId], references: [id], onDelete: SetNull) |
| reversedBy | `CreditTransaction` | yes | @relation("TxReversal") |


**Relations:** `type -> TxType`, `user -> User`, `allocations -> CreditAllocation`, `reverses -> CreditTransaction`, `reversedBy -> CreditTransaction`

**Indexes:** `@@index(userId, createdAt)`, `@@index(scanId)`, `@@index(issueId)`

### DesignIntent

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| scanId | `String` | no | @unique |
| source | `IntentSource` | no | — |
| audience | `String` | yes | — |
| stylePreference | `String` | yes | — |
| admiredReferences | `String[]` | no | — |
| brandColors | `String[]` | no | — |
| answeredAt | `DateTime` | yes | — |
| scan | `Scan` | no | @relation(fields: [scanId], references: [id], onDelete: Cascade) |


**Relations:** `source -> IntentSource`, `scan -> Scan`

### EmailToken

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| userId | `String` | no | — |
| purpose | `String` | no | — |
| tokenHash | `String` | no | @unique |
| expiresAt | `DateTime` | no | — |
| usedAt | `DateTime` | yes | — |
| createdAt | `DateTime` | no | @default(now() |
| user | `User` | no | @relation(fields: [userId], references: [id], onDelete: Cascade) |


**Relations:** `user -> User`

**Indexes:** `@@index(userId, purpose)`, `@@index(expiresAt)`

### InputType

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| URL | `enum` | no | — |
| REPOSITORY | `enum` | no | — |
| ARCHIVE | `enum` | no | — |

### IntentSource

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| SUPPLIED | `enum` | no | — |
| SKIPPED | `enum` | no | — |
| DEFAULTED | `enum` | no | — |

### Issue

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| scanId | `String` | no | — |
| moduleResultId | `String` | no | — |
| fingerprint | `String` | no | — |
| checkId | `String` | no | — |
| severity | `Severity` | no | — |
| title | `String` | no | — |
| explanation | `String` | no | — |
| consequence | `String` | no | — |
| location | `String` | yes | — |
| evidence | `Json` | yes | — |
| attribution | `Attribution` | no | — |
| fixPrompt | `String` | no | — |
| state | `IssueState` | no | @default(OPEN) |
| requiredControlLevel | `ControlLevel` | no | @default(NONE) |
| assertedFixedAt | `DateTime` | yes | — |
| resolvedAt | `DateTime` | yes | — |
| reopenedAt | `DateTime` | yes | — |
| previouslyResolved | `Boolean` | no | @default(false) |
| createdAt | `DateTime` | no | @default(now() |
| updatedAt | `DateTime` | no | @updatedAt |
| scan | `Scan` | no | @relation(fields: [scanId], references: [id], onDelete: Cascade) |
| moduleResult | `ModuleResult` | no | @relation(fields: [moduleResultId], references: [id], onDelete: Cascade) |
| attempts | `VerificationAttempt[]` | no | — |


**Relations:** `severity -> Severity`, `attribution -> Attribution`, `state -> IssueState`, `requiredControlLevel -> ControlLevel`, `scan -> Scan`, `moduleResult -> ModuleResult`, `attempts -> VerificationAttempt`

**Indexes:** `@@unique(scanId, fingerprint)`, `@@index(scanId, severity, state)`, `@@index(fingerprint)`, `@@index(moduleResultId)`

### IssueState

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| OPEN | `enum` | no | — |
| ASSERTED_FIXED | `enum` | no | — |
| RESOLVED | `enum` | no | — |
| UNVERIFIABLE | `enum` | no | — |
| REOPENED | `enum` | no | — |

### LotSource

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| FREE_GRANT | `enum` | no | — |
| PLAN_RENEWAL | `enum` | no | — |
| PURCHASE | `enum` | no | — |
| REFUND | `enum` | no | — |
| PROMOTIONAL | `enum` | no | — |
| ADMIN_GRANT | `enum` | no | — |

### ModuleResult

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| scanId | `String` | no | — |
| module | `ModuleType` | no | — |
| state | `ModuleState` | no | @default(PENDING) |
| score | `Int` | yes | — |
| summary | `String` | yes | — |
| skippedReason | `String` | yes | — |
| degradedReason | `String` | yes | — |
| startedAt | `DateTime` | yes | — |
| completedAt | `DateTime` | yes | — |
| scan | `Scan` | no | @relation(fields: [scanId], references: [id], onDelete: Cascade) |
| issues | `Issue[]` | no | — |


**Relations:** `module -> ModuleType`, `state -> ModuleState`, `scan -> Scan`, `issues -> Issue`

**Indexes:** `@@unique(scanId, module)`

### ModuleState

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| PENDING | `enum` | no | — |
| RUNNING | `enum` | no | — |
| COMPLETE | `enum` | no | — |
| DEGRADED | `enum` | no | — |
| FAILED | `enum` | no | — |
| NOT_APPLICABLE | `enum` | no | — |

### ModuleType

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| PERFORMANCE | `enum` | no | — |
| SECURITY | `enum` | no | — |
| UI | `enum` | no | — |
| TESTING | `enum` | no | — |
| SEO | `enum` | no | — |

### OAuthIdentity

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| userId | `String` | no | — |
| provider | `String` | no | — |
| providerUserId | `String` | no | — |
| user | `User` | no | @relation(fields: [userId], references: [id], onDelete: Cascade) |


**Relations:** `user -> User`

**Indexes:** `@@unique(provider, providerUserId)`, `@@index(userId)`

### PendingPayment

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| userId | `String` | no | — |
| kind | `String` | no | — |
| providerReference | `String` | no | @unique |
| amountMicros | `Int` | no | — |
| status | `String` | no | @default("PENDING") |
| metadata | `Json` | no | — |
| createdAt | `DateTime` | no | @default(now() |
| updatedAt | `DateTime` | no | @updatedAt |
| user | `User` | no | @relation(fields: [userId], references: [id], onDelete: Cascade) |


**Relations:** `user -> User`

**Indexes:** `@@index(userId, status)`

### Plan

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id |
| name | `String` | no | — |
| monthlyCredits | `Int` | no | — |
| creditsRecur | `Boolean` | no | — |
| allowedInputTypes | `InputType[]` | no | — |
| allowLoadGeneration | `Boolean` | no | — |
| allowReadinessPass | `Boolean` | no | — |
| allowCreditPurchase | `Boolean` | no | — |
| allowCustomCapability | `Boolean` | no | — |
| concurrentScanLimit | `Int` | no | — |
| queuePriority | `Int` | no | — |
| retentionDays | `Int` | no | — |
| isActive | `Boolean` | no | @default(true) |
| createdAt | `DateTime` | no | @default(now() |
| updatedAt | `DateTime` | no | @updatedAt |
| subscriptions | `Subscription[]` | no | — |
| capabilities | `CapabilityPlan[]` | no | — |


**Relations:** `allowedInputTypes -> InputType`, `subscriptions -> Subscription`, `capabilities -> CapabilityPlan`

### ProviderChainEntry

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| vendor | `String` | no | — |
| model | `String` | no | — |
| position | `Int` | no | @unique |
| isEnabled | `Boolean` | no | @default(true) |
| createdAt | `DateTime` | no | @default(now() |
| updatedAt | `DateTime` | no | @updatedAt |


**Indexes:** `@@index(vendor)`

### ReadinessVerdict

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| scanId | `String` | no | @unique |
| baselineScanId | `String` | no | — |
| isReady | `Boolean` | no | — |
| overallScore | `Int` | no | — |
| baselineScore | `Int` | no | — |
| moduleOutcomes | `Json` | no | — |
| regressions | `Json` | no | — |
| improvements | `Json` | no | — |
| blockers | `String[]` | no | — |
| certificateKey | `String` | yes | — |
| certificateEmailSentAt | `DateTime` | yes | — |
| createdAt | `DateTime` | no | @default(now() |
| scan | `Scan` | no | @relation(fields: [scanId], references: [id], onDelete: Cascade) |


**Relations:** `scan -> Scan`

**Indexes:** `@@index(baselineScanId)`

### Receipt

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| userId | `String` | no | — |
| billingEventId | `String` | no | @unique |
| providerReference | `String` | no | — |
| kind | `String` | no | — |
| amountMicros | `Int` | no | — |
| html | `String` | no | — |
| createdAt | `DateTime` | no | @default(now() |
| user | `User` | no | @relation(fields: [userId], references: [id], onDelete: Cascade) |


**Relations:** `user -> User`

**Indexes:** `@@index(userId, createdAt)`

### RefreshToken

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| userId | `String` | no | — |
| tokenHash | `String` | no | @unique |
| expiresAt | `DateTime` | no | — |
| revokedAt | `DateTime` | yes | — |
| createdAt | `DateTime` | no | @default(now() |
| user | `User` | no | @relation(fields: [userId], references: [id], onDelete: Cascade) |


**Relations:** `user -> User`

**Indexes:** `@@index(userId)`, `@@index(expiresAt)`

### Scan

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| userId | `String` | no | — |
| targetId | `String` | no | — |
| kind | `ScanKind` | no | @default(INITIAL) |
| state | `ScanState` | no | @default(QUEUED) |
| requestedModules | `ModuleType[]` | no | — |
| capabilitySnapshot | `Json` | no | — |
| quotedCredits | `Int` | no | — |
| chargedCredits | `Int` | no | @default(0) |
| overallScore | `Int` | yes | — |
| summary | `String` | yes | — |
| baselineScanId | `String` | yes | — |
| questionnaireDeadline | `DateTime` | yes | — |
| startedAt | `DateTime` | yes | — |
| completedAt | `DateTime` | yes | — |
| failureReason | `String` | yes | — |
| retentionWarningSentAt | `DateTime` | yes | — |
| reportRemovedAt | `DateTime` | yes | — |
| workspacePath | `String` | yes | — |
| createdAt | `DateTime` | no | @default(now() |
| updatedAt | `DateTime` | no | @updatedAt |
| user | `User` | no | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| target | `Target` | no | @relation(fields: [targetId], references: [id], onDelete: Cascade) |
| baseline | `Scan` | yes | @relation("ScanBaseline", fields: [baselineScanId], references: [id], onDelete: SetNull) |
| derivedScans | `Scan[]` | no | @relation("ScanBaseline") |
| moduleResults | `ModuleResult[]` | no | — |
| issues | `Issue[]` | no | — |
| executions | `CapabilityExecution[]` | no | — |
| invocations | `AiInvocation[]` | no | — |
| designIntent | `DesignIntent` | yes | — |
| verdict | `ReadinessVerdict` | yes | — |


**Relations:** `kind -> ScanKind`, `state -> ScanState`, `requestedModules -> ModuleType`, `user -> User`, `target -> Target`, `baseline -> Scan`, `derivedScans -> Scan`, `moduleResults -> ModuleResult`, `issues -> Issue`, `executions -> CapabilityExecution`, `invocations -> AiInvocation`, `designIntent -> DesignIntent`, `verdict -> ReadinessVerdict`

**Indexes:** `@@index(userId, createdAt)`, `@@index(state)`, `@@index(targetId, kind, completedAt)`, `@@index(baselineScanId)`

### ScanKind

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| INITIAL | `enum` | no | — |
| READINESS | `enum` | no | — |

### ScanState

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| QUEUED | `enum` | no | — |
| RUNNING_PHASE_1 // performance, security, seo | `enum` | no | — |
| AWAITING_QUESTIONNAIRE // R4: no worker slot is held here | `enum` | no | — |
| RUNNING_PHASE_2 // ui | `enum` | no | — |
| RUNNING_PHASE_3 // testing | `enum` | no | — |
| RUNNING_MASTER // cross-module synthesis | `enum` | no | — |
| RUNNING_DOCS | `enum` | no | — |
| COMPLETED | `enum` | no | — |
| FAILED | `enum` | no | — |
| CANCELLED | `enum` | no | — |
| TIMED_OUT | `enum` | no | — |

### Severity

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| CRITICAL | `enum` | no | — |
| HIGH | `enum` | no | — |
| MEDIUM | `enum` | no | — |
| LOW | `enum` | no | — |
| INFO | `enum` | no | — |

### Subscription

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| userId | `String` | no | @unique |
| planId | `String` | no | — |
| status | `SubscriptionStatus` | no | — |
| periodStart | `DateTime` | no | — |
| periodEnd | `DateTime` | no | — |
| cancelAtPeriodEnd | `Boolean` | no | @default(false) |
| externalCustomerId | `String` | yes | — |
| externalSubscriptionId | `String` | yes | — |
| renewalWarningSentAt | `DateTime` | yes | — |
| createdAt | `DateTime` | no | @default(now() |
| updatedAt | `DateTime` | no | @updatedAt |
| user | `User` | no | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| plan | `Plan` | no | @relation(fields: [planId], references: [id]) |


**Relations:** `status -> SubscriptionStatus`, `user -> User`, `plan -> Plan`

**Indexes:** `@@index(status, periodEnd)`, `@@index(planId)`

### SubscriptionStatus

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| ACTIVE | `enum` | no | — |
| PAST_DUE | `enum` | no | — |
| CANCELLED | `enum` | no | — |
| EXPIRED | `enum` | no | — |

### Target

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| userId | `String` | no | — |
| inputType | `InputType` | no | — |
| canonicalValue | `String` | no | — |
| displayName | `String` | no | — |
| controlLevel | `ControlLevel` | no | @default(NONE) |
| attestedAt | `DateTime` | yes | — |
| attestedBy | `String` | yes | — |
| createdAt | `DateTime` | no | @default(now() |
| updatedAt | `DateTime` | no | @updatedAt |
| user | `User` | no | @relation(fields: [userId], references: [id], onDelete: Cascade) |
| verifications | `TargetVerification[]` | no | — |
| scans | `Scan[]` | no | — |


**Relations:** `inputType -> InputType`, `controlLevel -> ControlLevel`, `user -> User`, `verifications -> TargetVerification`, `scans -> Scan`

**Indexes:** `@@unique(userId, inputType, canonicalValue)`, `@@index(userId)`

### TargetVerification

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| targetId | `String` | no | — |
| method | `VerificationMethod` | no | — |
| token | `String` | no | — |
| issuedAt | `DateTime` | no | @default(now() |
| confirmedAt | `DateTime` | yes | — |
| lastCheckedAt | `DateTime` | yes | — |
| revokedAt | `DateTime` | yes | — |
| target | `Target` | no | @relation(fields: [targetId], references: [id], onDelete: Cascade) |


**Relations:** `method -> VerificationMethod`, `target -> Target`

**Indexes:** `@@index(targetId, confirmedAt)`

### TrustLevel

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| VENDORED | `enum` | no | — |
| INSTALLED | `enum` | no | — |

### TxType

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| GRANT | `enum` | no | — |
| DEBIT | `enum` | no | — |
| REFUND | `enum` | no | — |
| EXPIRE | `enum` | no | — |

### User

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| email | `String` | no | @unique |
| name | `String` | yes | — |
| passwordHash | `String` | yes | — |
| emailVerifiedAt | `DateTime` | yes | — |
| isOperator | `Boolean` | no | @default(false) |
| githubTokenEnc | `Bytes` | yes | — |
| githubTokenIv | `Bytes` | yes | — |
| githubLogin | `String` | yes | — |
| createdAt | `DateTime` | no | @default(now() |
| updatedAt | `DateTime` | no | @updatedAt |
| identities | `OAuthIdentity[]` | no | — |
| emailTokens | `EmailToken[]` | no | — |
| refreshTokens | `RefreshToken[]` | no | — |
| subscription | `Subscription` | yes | — |
| pendingPayments | `PendingPayment[]` | no | — |
| receipts | `Receipt[]` | no | — |
| lots | `CreditLot[]` | no | — |
| transactions | `CreditTransaction[]` | no | — |
| targets | `Target[]` | no | — |
| scans | `Scan[]` | no | — |


**Relations:** `identities -> OAuthIdentity`, `emailTokens -> EmailToken`, `refreshTokens -> RefreshToken`, `subscription -> Subscription`, `pendingPayments -> PendingPayment`, `receipts -> Receipt`, `lots -> CreditLot`, `transactions -> CreditTransaction`, `targets -> Target`, `scans -> Scan`

### VerificationAttempt

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| id | `String` | no | @id @default(cuid() |
| issueId | `String` | no | — |
| outcome | `VerificationOutcome` | no | — |
| evidence | `Json` | yes | — |
| creditsCharged | `Int` | no | — |
| durationMs | `Int` | no | — |
| createdAt | `DateTime` | no | @default(now() |
| issue | `Issue` | no | @relation(fields: [issueId], references: [id], onDelete: Cascade) |


**Relations:** `outcome -> VerificationOutcome`, `issue -> Issue`

**Indexes:** `@@index(issueId, createdAt)`

### VerificationMethod

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| FILE | `enum` | no | — |
| DNS | `enum` | no | — |

### VerificationOutcome

Source: `apps/api/prisma/generated/client/schema.prisma`

| Field | Type | Optional | Attributes |
| --- | --- | --- | --- |
| PASSED | `enum` | no | — |
| FAILED | `enum` | no | — |
| UNVERIFIABLE | `enum` | no | — |
| ERRORED | `enum` | no | — |
