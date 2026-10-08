# Current Performance Capabilities

Read-only audit, 2026-10-07.

## Full scanner inventory — PERFORMANCE module (4 capabilities, all `layer: CODE`)

| Capability | Mechanism | Measures | Browser-dependent half operative? |
|---|---|---|---|
| `lighthouse-analyzer` | `ctx.fetch` (always works) + `ctx.withPage` (currently dead) | Working: Content-Encoding header absent (no compression); no Cache-Control/Expires header. Dead: render-blocking `<script>` count in `<head>`; total page weight from `page.requests()` | No — catches the `withPage` rejection, still runs the header half |
| `cwv-analyzer` | `ctx.withPage` only, no fallback | LCP > 2500ms, FCP > 3000ms, CLS > 0.25 via `performance.getEntriesByType` in a real navigation | **No — returns `[]` unconditionally today**, the capability's own module comment states this plainly |
| `network-inspector` | `ctx.fetch` + bounded same-origin sub-resource sample (<=15) | Redirect-chain length > 3; broken sub-resources (status 0 or >=400); uncompressed script/stylesheet; duplicate resource references | No (HTTP-only by design) |
| `bundle-analyzer` | Source only (build-output directories: `dist`,`build`,`out`,`.next`,`.output`,`public`,`static`,`assets`) | Oversize built JS (>512KB warn / >1.5MB high, from file-listing size metadata, zero I/O cost); unminified output (average-line-length heuristic on a 64KB head slice); published source maps (tail-slice search for `sourceMappingURL` + confirms the `.map` file is actually present in the same build output) | N/A — source-only |

## Performance capability matrix

| Category | Status | Evidence | Confidence |
|---|---|---|---|
| TTFB / compression / Cache-Control headers | IMPLEMENTED | `lighthouse-analyzer` | HIGH |
| HTTP/2 or /3 version detection | NOT IMPLEMENTED | not read from `SafeResponse` anywhere | HIGH |
| Render-blocking resources, third-party scripts, fonts | PARTIAL/dead | written in `lighthouse-analyzer` but gated on the inoperative browser pool | HIGH |
| Image/bundle size | PARTIAL — bundle size yes (source-only, build output), served-image weight no | `bundle-analyzer`; no equivalent for runtime image payload | HIGH |
| Core Web Vitals (LCP/INP/CLS/FCP/TBT/Speed Index) | SPECIFIED, NOT OPERATIVE — lab-only by design, zero field/CrUX/RUM data anywhere in the codebase | `cwv-analyzer` | HIGH |
| Backend performance (API latency, DB query analysis, N+1, cache hit rate) | NOT IMPLEMENTED, and structurally impossible from an external URL-only audit without customer telemetry access | no APM/OpenTelemetry/Prometheus ingestion for customer targets exists anywhere | HIGH |
| Load testing (customer target) | NOT IMPLEMENTED as a scan capability | — | HIGH |
| Stress / spike / soak testing (customer target) | NOT IMPLEMENTED | — | HIGH |
| p50/p95/p99 latency measurement | NOT IMPLEMENTED for customer targets | — | HIGH |
| Infrastructure metrics (autoscaling, container limits, queue depth, DB connections) | NOT IMPLEMENTED, requires infra access Fahes does not have | — | HIGH |

## The `load-testing/` directory — internal tool, not a scan capability

`load-testing/RUNBOOK.md`, `load-testing/scripts/golden-path.js`, `load-testing/seed-test-user.ts` form a k6-via-Docker harness that is unambiguously **internal capacity testing of Fahes's own API**, not a customer-facing feature:
- Requires `AI_MODE=fixtures` set locally (checked prerequisite, explicitly never real provider credentials).
- Seeds 65 dedicated test users (`loadtest-1@webaudit-loadtest.local` ... `loadtest-65@...`) against the platform's **own** `/auth/login` and scan-creation endpoints.
- Invoked manually per the runbook, with no `ModuleType`, no credit cost, no `/scan` UI presence, and no `capability.manifest.json`.

CONFIDENCE: HIGH. This directly falsifies any assumption that load/stress/spike/soak testing could be enabled for a customer target by a configuration change — the harness is wired to Fahes's own internal auth/seed data model from the ground up.

## Performance observability

No architecture exists for ingesting APM, OpenTelemetry, Prometheus, server/Docker/Kubernetes/database metrics, slow-query logs, RUM, or CrUX for **customer** targets — confirmed by targeted search across the repository. Findings that are therefore structurally impossible to derive reliably from an external URL-only audit: backend latency breakdown, DB query performance, N+1 queries, missing indexes, cache hit rate, memory leaks, CPU/queue saturation, autoscaling behavior. All of these require either customer-side telemetry integration (an opt-in the product does not currently offer) or direct infrastructure access (which an external audit, by definition, does not have).

## Marketing label vs. actual capability

**CURRENTLY SUPPORTS**: response-header-based delivery hygiene (compression, caching), a small bounded same-origin sub-resource integrity sample, and source-level build-output size/minification/source-map heuristics.

**DOES NOT CURRENTLY SUPPORT**: Core Web Vitals in practice (specified but dead), any backend/infrastructure performance measurement, and any form of load/stress/spike/soak testing against a customer target.

**Performance maturity: Level 1-2** (structured, deterministic, but shallow; the genuinely valuable rendering-dependent half is specified in code and inert in every current deployment).
