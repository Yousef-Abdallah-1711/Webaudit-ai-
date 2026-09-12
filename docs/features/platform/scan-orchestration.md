# Scan Phases, Cancellation, and Timeouts

## Overview

A scan is a durable, phased worker workflow rather than an HTTP request. Individual audit modules may complete, degrade, fail, or be not applicable without erasing other measured results.

## Source and flow

Worker orchestration is in `apps/worker/src/orchestrator/`, module execution in `apps/worker/src/module-runner/`, and BullMQ consumers in `apps/worker/src/queue/`. API scan routes/services use `apps/api/src/routes/scans.routes.ts` and `apps/api/src/services/queue/`. Queue and cancellation contracts are in `packages/config/src/queues.ts` and `cancellation.ts`; durable models include `Scan`, `ModuleResult`, and `CapabilityExecution`.

## Failure behavior

Cancellation, phase timeout, worker failure, and terminal cleanup have explicit paths; credit/refund behavior must remain tied to lifecycle state. Worker integration/adverse tests cover phase ordering, cancellation, timeout, and terminal refund behavior.
