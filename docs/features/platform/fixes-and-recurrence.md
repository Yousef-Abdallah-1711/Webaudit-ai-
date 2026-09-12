# Fix Loop and Recurrence

## Overview

Customers can assert that an issue was fixed; the system schedules narrow re-verification and tracks repeat occurrences rather than accepting an assertion as resolution.

## Source and flow

API work is in `apps/api/src/services/issues/` and `apps/api/src/routes/issues.routes.ts`; re-verification runs under `apps/worker/src/reverify/`. The interface uses `apps/web/components/fixes/` and `apps/web/app/(dashboard)/fixes/`. `Issue` and `VerificationAttempt` are the durable workflow records.

## Constraints and verification

Only a passing narrow check resolves an issue. Tests cover verification evidence, reverify, recurrence, cost, and the fixes-board E2E flow.
