# Engine Contracts Summary

One line per engine: what it owns, what it explicitly does not own, and which product domains
consume it (Constitution Principle VIII — domains consume engines, never own one privately).

| Engine | Owns | Does NOT own | Consuming domains |
|---|---|---|---|
| Passive HTTP Engine | Guarded single-request/response measurement | Rendering, crawling, authentication | Security, Performance, Frontend, SEO, Testing (today, as-is) |
| Browser/Probe Engine | Real browser rendering, screenshots, DOM/accessibility trees | HTTP-only measurement (Passive HTTP owns that), crawling across pages | Performance, Frontend, Accessibility, SEO (once deployed) |
| Crawler Engine | Multi-page discovery, site topology | Per-page measurement depth (delegates each page to Passive HTTP/Browser) | SEO, Functional/Workflow Testing |
| Static Source Analysis Engine | Read-only source inspection (regex today, AST/SAST in future capabilities within this engine) | Executing source (Source Execution Engine owns that) | Security, Source Quality |
| Untrusted Source Execution Engine | Running the customer's own install/build/lint/test, in container/VM-grade isolation | Trusted-capability execution (existing sandbox-runner keeps that) | Source Quality (future capabilities) |
| Active Security Engine | Sending adversarial payloads within a granted Scope, under budget | Authorization/Scope decisions (Safety & Authorization context owns that) | Security (future capabilities) |
| Authenticated Workflow Engine | Multi-step, session-bound, role-aware test execution | Raw credential storage (Credentials/Sessions context owns that) | Security, Functional/Workflow Testing |
| Load/Capacity Engine | Generating load, measuring percentiles/throughput/error rate | Billing math (Billing/Metering context owns that, consuming this engine's `ResourceUsage` output) | Performance (future capabilities) |
| Telemetry Integration Engine | Ingesting and normalizing customer-pushed/pulled observability data | Any execution against the target (ingestion only, never testing) | Performance (future capabilities) |

Every engine row above is a placeholder contract boundary, not an implementation. The engine's own
future child spec fills in its `execution-class-contract-template.md` instance and designs its
actual interface.
