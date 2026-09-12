# Questionnaire and Realtime Progress

## Overview

The UI questionnaire collects design intent without blocking the audit indefinitely. Authorized realtime events expose durable scan progress to the customer.

## Source and flow

Questionnaire service: `apps/api/src/services/scans/questionnaire.service.ts`; worker timeout handler: `apps/worker/src/orchestrator/questionnaire-timeout-handler.ts`; UI: `apps/web/components/scan/UIQuestionnaire.tsx`. Realtime is implemented by `apps/api/src/services/realtime/`, worker `orchestrator/emit.ts`, and `apps/web/lib/realtime.ts`/`components/scan/ScanProgress.tsx`.

## Constraints and verification

Progress is persisted before publication, and subscription access is authorized. Questionnaire races/timeouts and realtime upgrade/stream tests provide coverage.
