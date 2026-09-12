# Readiness and Certificates

## Overview

Readiness runs a fresh audit and compares it with a baseline rather than reusing stale report state. Certificates/verdicts communicate whether the target meets the recorded readiness decision.

## Source and flow

API routes/services are `apps/api/src/routes/readiness.routes.ts` and `apps/api/src/services/readiness/`; worker processing is `apps/worker/src/readiness/`; UI is `apps/web/app/(dashboard)/readiness/`. `ReadinessVerdict` is linked to baseline scan information.

## Verification

Readiness fresh/regression/verdict tests, certificate guards, and readiness E2E coverage validate baseline comparison and lifecycle behavior.
