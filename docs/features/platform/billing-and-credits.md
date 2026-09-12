# Plans, Billing, Credits, and Refunds

## Overview

Plans and purchases fund audit credits. Credits are lot-based financial records, not a mutable balance; platform failures are refunded to originating lots.

## Source and flow

Customer APIs are in `apps/api/src/routes/billing.routes.ts` and webhook processing in `webhooks.routes.ts`; services are under `apps/api/src/services/billing/` and `services/credits/`. `apps/api/src/services/intake/create-scan.ts` quotes and debits before scan creation. Relevant models are `Plan`, `Subscription`, `BillingEvent`, `CreditLot`, `CreditTransaction`, and `CreditAllocation`; UI pages are dashboard billing and usage.

## Constraints and verification

Debit locks eligible lots and records allocations, so refunding is targeted. Billing webhooks must be idempotent. Run credit/refund/enqueue/cancellation and billing contract/integration tests, plus `pnpm credits:check`.
