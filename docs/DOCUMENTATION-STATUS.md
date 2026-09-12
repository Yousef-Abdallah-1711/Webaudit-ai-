# Documentation Status

Generated reference snapshot: 2026-09-12. The extractor found 73 endpoints, 28 pages, 68 components, 45 data models, and 28 page-derived clusters, with no extractor warnings.

## Cluster review

The extractor is accurate for inventory but not for domain grouping. It creates ten separate `admin-*` clusters and separate page clusters for login, signup, password reset, report, reports, billing, usage, and progress. This run documents the following twelve source-map domains instead:

1. Authentication, sessions, and OAuth
2. Targets, control proof, and intake
3. Plans, billing, credits, and refunds
4. Scan phases, cancellation, and timeouts
5. Questionnaire and realtime progress
6. Capability registry and sandbox isolation
7. AI interpretation, redaction, and metering
8. Reports, scores, and artifacts
9. Fix loop and recurrence
10. Readiness and certificates
11. Operator console
12. Lifecycle cleanup, browser, and network security

This is a documentation-level consolidation only. The generated manifest remains extractor-owned and still records all 28 page-derived clusters; it was not hand-edited to avoid corrupting the source-derived reference data.

## Known extractor/documentation drift

- `docs/reference/file-map.md` and the architecture stack inventory include generated Prisma-client paths and `showcase-*` workspaces. They are not WebAudit source-documentation scope under `PROJECT_MAP.md`.
- The extractor-owned marker in `docs/README.md` uses `docs/...` links, which resolve incorrectly from `docs/README.md`. Do not hand-edit the marker; repair the wiring renderer in a documentation-tooling update.

## Resume here

The docs-creator workflow permits twelve feature clusters per run. A subsequent update run should split the twelve domain pages into the extractor's remaining page-level documents only where a separate user workflow warrants it, then reconcile the manifest grouping through the documentation tooling rather than manual generated-manifest edits. Re-run extraction, rendering, wiring, and `docs_check.py` after that work.
