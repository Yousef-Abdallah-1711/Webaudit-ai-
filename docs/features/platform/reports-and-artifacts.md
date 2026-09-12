# Reports, Scoring, and Artifacts

## Overview

Completed audit evidence is scored, persisted, rendered as reports, and exported as supported artifacts. A customer sees measured and AI-judgment material through report UI and APIs.

## Source and flow

Routes are `apps/api/src/routes/reports.routes.ts`; storage/report services live in `apps/api/src/services/storage/`; master synthesis is `apps/worker/src/orchestrator/master-report.ts`; scoring is in `packages/scoring/`. UI is under `apps/web/app/(dashboard)/reports/` and `apps/web/components/report/`. Primary data includes `Scan`, `ModuleResult`, and `Issue`.

## Verification

Use report/export/scoring tests and the report UI tests. Failure states must remain visible in reports rather than being mistaken for successful, empty results.
